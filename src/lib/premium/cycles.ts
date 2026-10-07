import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { premiumCharges, premiumMemberships, auditLogs } from '@/db/schema';
import { cycleContinuityHours } from './settings';

/**
 * Ciclos do Premium — o único lugar que cria, encerra e arruma ciclos.
 *
 * Ciclo = período mensal EFETIVAMENTE pago. Quem chama (webhook do Asaas, ação
 * do admin) já está dentro de uma transação; tudo aqui usa o `tx` recebido e o
 * relógio do BANCO (`now()` em SQL), nunca o do servidor.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PremiumChargeRow = typeof premiumCharges.$inferSelect;

export type ActivationResult =
  | { created: true; cycleId: string; number: number; startsAt: Date; endsAt: Date }
  | { created: false; reason: 'sem_assinatura' | 'ja_ativado' | 'valor_diferente_do_combinado'; cycleId?: string };

/** Escreve no resumo da assinatura o ciclo mais recente (a verdade continua em `premium_cycles`). */
export async function refreshMembershipSummary(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE premium_memberships pm
       SET current_period_start = c.starts_at,
           current_period_end = c.ends_at,
           updated_at = now()
      FROM (SELECT starts_at, ends_at FROM premium_cycles WHERE user_id = ${userId}::uuid ORDER BY number DESC LIMIT 1) c
     WHERE pm.user_id = ${userId}::uuid
  `);
}

/**
 * Cobrança do Premium confirmada → cria o CICLO pago (idempotente: uma
 * cobrança gera no máximo um ciclo, por índice único e por esta conferência).
 *
 * Quando o ciclo começa:
 *   - primeira assinatura, ou renovação confirmada tarde demais: AGORA;
 *   - renovação confirmada antes do fim do ciclo anterior (ou até N horas
 *     depois — `premium.cycle_continuity_hours`): no fim do ciclo anterior, sem
 *     buraco e sem perder dia já pago.
 * Dura um mês de calendário. Os períodos de uma pessoa nunca se sobrepõem
 * (restrição de exclusão no banco). Uma concessão administrativa vigente cede
 * o lugar: o ciclo pago é o que dá direito aos benefícios financeiros.
 *
 * Valor: se a cobrança é da assinatura atual e veio MENOR que o preço
 * combinado, nada é ativado — fica registrado para o suporte (alguém mexeu na
 * assinatura no gateway). Dinheiro a mais ou de assinatura antiga não bloqueia.
 */
export async function activatePaidCycle(tx: Tx, charge: PremiumChargeRow): Promise<ActivationResult> {
  // Trava a assinatura da pessoa: duas confirmações ao mesmo tempo entram em fila.
  const [membership] = await tx
    .select()
    .from(premiumMemberships)
    .where(eq(premiumMemberships.userId, charge.userId))
    .for('update');
  if (!membership) return { created: false, reason: 'sem_assinatura' };

  const [ja] = (await tx.execute(
    sql`SELECT id FROM premium_cycles WHERE charge_id = ${charge.id}::uuid LIMIT 1`,
  )) as unknown as { id: string }[];
  if (ja) return { created: false, reason: 'ja_ativado', cycleId: ja.id };

  const mesmaAssinatura =
    charge.providerSubscriptionId != null && charge.providerSubscriptionId === membership.providerSubscriptionId;
  if (mesmaAssinatura && membership.planCents != null && charge.amountCents < membership.planCents) {
    await tx.insert(auditLogs).values({
      actorId: null,
      actorRole: 'system',
      action: 'premium.charge_amount_mismatch',
      entityType: 'premium_charge',
      entityId: charge.id,
      metadata: { userId: charge.userId, chargedCents: charge.amountCents, expectedCents: membership.planCents },
    });
    await tx
      .update(premiumCharges)
      .set({
        failureReason: 'Valor pago menor que o combinado na assinatura — precisa de revisão do suporte.',
        updatedAt: new Date(),
      })
      .where(eq(premiumCharges.id, charge.id));
    return { created: false, reason: 'valor_diferente_do_combinado' };
  }

  // A concessão administrativa vigente (modo teste/suporte) cede lugar ao ciclo pago.
  await tx.execute(sql`
    UPDATE premium_cycles
       SET ended_early_at = GREATEST(starts_at, LEAST(now(), ends_at)),
           ended_early_reason = 'substituido_por_assinatura'
     WHERE user_id = ${charge.userId}::uuid
       AND source::text = 'admin_grant'
       AND ended_early_at IS NULL
       AND ends_at > now()
  `);

  const horas = await cycleContinuityHours();
  const [novo] = (await tx.execute(sql`
    INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
    SELECT ${charge.userId}::uuid, COALESCE(n.max_number, 0) + 1, 'subscription', ${charge.id}::uuid,
           s.starts_at, s.starts_at + interval '1 month', true
      FROM (SELECT max(number) AS max_number FROM premium_cycles WHERE user_id = ${charge.userId}::uuid) n,
           LATERAL (
             SELECT CASE WHEN p.ends_at IS NOT NULL
                          AND p.ended_early_at IS NULL
                          AND now() <= p.ends_at + make_interval(hours => ${horas}::int)
                         THEN p.ends_at ELSE now() END AS starts_at
               FROM (SELECT 1) um
               LEFT JOIN LATERAL (
                 SELECT ends_at, ended_early_at FROM premium_cycles
                  WHERE user_id = ${charge.userId}::uuid AND source::text = 'subscription'
                  ORDER BY number DESC LIMIT 1
               ) p ON true
           ) s
    RETURNING id, number, starts_at, ends_at
  `)) as unknown as { id: string; number: number; starts_at: Date | string; ends_at: Date | string }[];
  if (!novo) throw new Error('ciclo do Premium não pôde ser criado');

  await tx
    .update(premiumMemberships)
    .set({
      status: 'active',
      source: 'subscription',
      financialTestEnabled: false,
      planCents: membership.planCents ?? charge.amountCents,
      currentPeriodStart: new Date(novo.starts_at),
      currentPeriodEnd: new Date(novo.ends_at),
      cancelledAt: null,
      cancelledBy: null,
      updatedAt: new Date(),
    })
    .where(eq(premiumMemberships.userId, charge.userId));

  await tx.insert(auditLogs).values({
    actorId: null,
    actorRole: 'system',
    action: 'premium.cycle_started',
    entityType: 'premium_cycle',
    entityId: novo.id,
    metadata: {
      userId: charge.userId,
      chargeId: charge.id,
      number: novo.number,
      startsAt: new Date(novo.starts_at).toISOString(),
      endsAt: new Date(novo.ends_at).toISOString(),
    },
  });

  return {
    created: true,
    cycleId: novo.id,
    number: novo.number,
    startsAt: new Date(novo.starts_at),
    endsAt: new Date(novo.ends_at),
  };
}

/**
 * Encerra ANTES DO FIM o ciclo gerado por uma cobrança que foi estornada ou
 * contestada: o dinheiro voltou, então o direito também. Cancela as
 * promoções que esse ciclo financiou (sem cobrança, sem benefício) e arruma o
 * resumo da assinatura. Devolve o id do ciclo, ou null se a cobrança nunca
 * chegou a gerar ciclo (ou o ciclo já tinha sido encerrado).
 */
export async function endCycleForCharge(tx: Tx, chargeId: string, reason: string): Promise<string | null> {
  const [ciclo] = (await tx.execute(sql`
    UPDATE premium_cycles
       SET ended_early_at = GREATEST(starts_at, LEAST(now(), ends_at)),
           ended_early_reason = ${reason}
     WHERE charge_id = ${chargeId}::uuid AND ended_early_at IS NULL
    RETURNING id, user_id
  `)) as unknown as { id: string; user_id: string }[];
  if (!ciclo) return null;

  await tx.execute(sql`
    UPDATE promotions
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
     WHERE premium_cycle_id = ${ciclo.id}::uuid AND status IN ('scheduled', 'active')
  `);
  await refreshMembershipSummary(tx, ciclo.user_id);
  return ciclo.id;
}

// ---------------------------------------------------------------------------
// Modo administrativo/teste
// ---------------------------------------------------------------------------

export type AdminGrantResult =
  | { ok: true; cycleId: string; endsAt: Date }
  | { ok: false; message: string };

/**
 * Concessão administrativa — modo TESTE/SUPORTE, nunca o caminho normal. Vale
 * por um número de dias, não tem cobrança e NÃO dá os benefícios financeiros
 * (taxa reduzida, primeiro mês) a menos que `financialTest` seja ligado de
 * propósito. Não substitui nem acumula com um Premium que já está valendo.
 */
export async function grantAdminPremium(
  tx: Tx,
  input: { userId: string; adminId: string; days: number; financialTest: boolean },
): Promise<AdminGrantResult> {
  const { userId, adminId, days, financialTest } = input;

  // Trava a assinatura da pessoa, se já existir (a linha é criada/atualizada no fim).
  await tx
    .select({ userId: premiumMemberships.userId })
    .from(premiumMemberships)
    .where(eq(premiumMemberships.userId, userId))
    .for('update');

  const [vigente] = (await tx.execute(sql`
    SELECT source::text AS source, COALESCE(ended_early_at, ends_at) AS ends_at
      FROM premium_cycles
     WHERE user_id = ${userId}::uuid AND starts_at <= now() AND now() < COALESCE(ended_early_at, ends_at)
     ORDER BY ends_at DESC LIMIT 1
  `)) as unknown as { source: string; ends_at: Date | string }[];
  if (vigente) {
    return {
      ok: false,
      message:
        vigente.source === 'subscription'
          ? 'Esta conta já é Premium por assinatura paga.'
          : 'Esta conta já tem uma concessão administrativa em vigor. Encerre-a antes de conceder outra.',
    };
  }

  const [ciclo] = (await tx.execute(sql`
    INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
    SELECT ${userId}::uuid, COALESCE(max(number), 0) + 1, 'admin_grant', NULL, now(),
           now() + make_interval(days => ${days}::int), ${financialTest}::boolean
      FROM premium_cycles WHERE user_id = ${userId}::uuid
    RETURNING id, starts_at, ends_at
  `)) as unknown as { id: string; starts_at: Date | string; ends_at: Date | string }[];
  if (!ciclo) throw new Error('ciclo administrativo não pôde ser criado');

  const resumo = {
    status: 'active' as const,
    source: 'admin_grant' as const,
    grantedBy: adminId,
    grantedAt: new Date(),
    financialTestEnabled: financialTest,
    currentPeriodStart: new Date(ciclo.starts_at),
    currentPeriodEnd: new Date(ciclo.ends_at),
    cancelAtPeriodEnd: false,
    cancelRequestedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    updatedAt: new Date(),
  };
  await tx
    .insert(premiumMemberships)
    .values({ userId, ...resumo })
    .onConflictDoUpdate({ target: premiumMemberships.userId, set: resumo });

  return { ok: true, cycleId: ciclo.id, endsAt: new Date(ciclo.ends_at) };
}

/**
 * Encerra o Premium AGORA (revogação pela administração): todos os ciclos
 * ainda por vir ou em andamento terminam neste instante. A recorrência no
 * gateway, se houver, é cancelada pelo agendador (a assinatura passa a
 * `cancelled` sem confirmação do gateway). Devolve quantos ciclos foram encerrados.
 */
export async function revokePremiumNow(tx: Tx, input: { userId: string; adminId: string }): Promise<number> {
  const { userId, adminId } = input;
  await tx
    .select({ userId: premiumMemberships.userId })
    .from(premiumMemberships)
    .where(eq(premiumMemberships.userId, userId))
    .for('update');

  const encerrados = (await tx.execute(sql`
    UPDATE premium_cycles
       SET ended_early_at = GREATEST(starts_at, LEAST(now(), ends_at)),
           ended_early_reason = 'revogado_pela_administracao'
     WHERE user_id = ${userId}::uuid AND ended_early_at IS NULL AND now() < ends_at
    RETURNING id
  `)) as unknown as { id: string }[];

  await tx
    .update(premiumMemberships)
    .set({ status: 'cancelled', cancelledBy: adminId, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(premiumMemberships.userId, userId));
  return encerrados.length;
}

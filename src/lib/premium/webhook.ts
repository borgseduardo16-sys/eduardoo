import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { premiumCharges, premiumMemberships, ledgerEntries, auditLogs } from '@/db/schema';
import { insertNotifications, type PushJob } from '@/lib/notifications/dispatch';
import { todayInSaoPaulo } from '@/lib/dates';
import { formatBrDate } from '@/lib/time';
import { activatePaidCycle, endCycleForCharge, type PremiumChargeRow, type Tx } from './cycles';

/**
 * Eventos do Asaas para cobranças do PREMIUM (a primeira e as renovações).
 *
 * Chamado de dentro da transação do webhook (src/lib/payments/webhook.ts),
 * depois que o evento foi reivindicado em `webhook_events` — então tudo aqui
 * roda uma vez só por evento, junto com a gravação do próprio evento.
 *
 * Premium = pagamento CONFIRMADO. Nada aqui ativa nada por "a pessoa voltou da
 * página de pagamento"; só o evento do gateway muda estado.
 *
 * Eventos que o código trata (nomes da documentação do Asaas, "Eventos para
 * cobranças" — mesma ressalva de src/lib/payments/asaas.ts: confirmados por
 * busca, não por leitura direta da página):
 *   PAYMENT_CREATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE,
 *   PAYMENT_REFUNDED, PAYMENT_DELETED, PAYMENT_REPROVED_BY_RISK_ANALYSIS,
 *   PAYMENT_CREDIT_CARD_CAPTURE_REFUSED  — já tratados para as locações;
 *   PAYMENT_CHARGEBACK_REQUESTED         — contestação (chargeback): o nome
 *     NÃO foi confirmado por leitura da documentação (ver docs/PAGAMENTOS.md);
 *     só o Premium o trata, e se o gateway usar outro nome o evento cai em
 *     "ignorado" sem efeito — o estorno manual continua funcionando.
 */

export type AsaasPremiumPayload = {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    netValue?: number;
    status?: string;
    subscription?: string;
    dueDate?: string;
    invoiceUrl?: string;
    billingType?: string;
  };
};

/** Eventos que SÓ o Premium trata (as locações os ignoram, como sempre fizeram). */
export const EVENTOS_SO_PREMIUM = new Set(['PAYMENT_CHARGEBACK_REQUESTED']);

const METODOS: Record<string, 'pix' | 'credit_card' | 'boleto'> = {
  PIX: 'pix',
  CREDIT_CARD: 'credit_card',
  BOLETO: 'boleto',
};

/** Acha de quem é a cobrança: uma cobrança nossa já gravada, ou a assinatura do Premium que a gerou. */
export async function findPremiumTarget(
  tx: Tx,
  providerPaymentId: string,
  providerSubscriptionId: string | null,
): Promise<{ charge: PremiumChargeRow | null; userId: string | null }> {
  const [cobranca] = await tx
    .select()
    .from(premiumCharges)
    .where(and(eq(premiumCharges.provider, 'asaas'), eq(premiumCharges.providerPaymentId, providerPaymentId)))
    .limit(1);
  if (cobranca) return { charge: cobranca, userId: cobranca.userId };

  if (!providerSubscriptionId) return { charge: null, userId: null };
  const [assinatura] = await tx
    .select({ userId: premiumMemberships.userId })
    .from(premiumMemberships)
    .where(
      and(eq(premiumMemberships.provider, 'asaas'), eq(premiumMemberships.providerSubscriptionId, providerSubscriptionId)),
    )
    .limit(1);
  return { charge: null, userId: assinatura?.userId ?? null };
}

/**
 * Renovação: a partir da 2ª cobrança quem cria é o próprio Asaas (a
 * assinatura), então ela chega sem linha nossa. Valor, vencimento e link
 * vêm do gateway (servidor a servidor, com o token do webhook) — nunca do
 * navegador. Idempotente pelo índice único (provider, provider_payment_id).
 */
async function registerCharge(
  tx: Tx,
  userId: string,
  providerPaymentId: string,
  payload: AsaasPremiumPayload,
): Promise<PremiumChargeRow> {
  const bruto = payload.payment?.value;
  const amountCents = typeof bruto === 'number' && Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto * 100) : null;
  if (amountCents === null) throw new Error(`cobranca ${providerPaymentId} do Premium sem valor valido`);
  const venc = payload.payment?.dueDate;
  const dueDate = typeof venc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : todayInSaoPaulo();
  const link = payload.payment?.invoiceUrl;
  const invoiceUrl = typeof link === 'string' && link.startsWith('https://') ? link.slice(0, 500) : null;
  const metodo = payload.payment?.billingType ? (METODOS[payload.payment.billingType] ?? null) : null;
  const idAssinatura = typeof payload.payment?.subscription === 'string' ? payload.payment.subscription : null;

  const [novo] = await tx
    .insert(premiumCharges)
    .values({
      userId,
      provider: 'asaas',
      providerPaymentId,
      providerSubscriptionId: idAssinatura,
      status: 'pending',
      method: metodo,
      amountCents,
      dueDate,
      invoiceUrl,
      providerPayload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [premiumCharges.provider, premiumCharges.providerPaymentId] })
    .returning();
  if (novo) {
    await tx.insert(auditLogs).values({
      actorId: null,
      actorRole: 'system',
      action: 'premium.charge_registered',
      entityType: 'premium_charge',
      entityId: novo.id,
      metadata: { userId, dueDate, amountCents, providerSubscriptionId: idAssinatura },
    });
    return novo;
  }
  const [existente] = await tx
    .select()
    .from(premiumCharges)
    .where(and(eq(premiumCharges.provider, 'asaas'), eq(premiumCharges.providerPaymentId, providerPaymentId)))
    .limit(1);
  if (!existente) throw new Error(`cobranca ${providerPaymentId} do Premium nao pôde ser registrada`);
  return existente;
}

/** Já existe ciclo pago desta pessoa? (A primeira cobrança não é "renovação": ninguém é avisado de nada ainda.) */
async function jaTeveCiclo(tx: Tx, userId: string): Promise<boolean> {
  const [r] = (await tx.execute(
    sql`SELECT EXISTS (SELECT 1 FROM premium_cycles WHERE user_id = ${userId}::uuid AND source::text = 'subscription') AS ok`,
  )) as unknown as { ok: boolean }[];
  return r?.ok === true;
}

function momento(d: Date): string {
  return formatBrDate(d);
}

export async function handlePremiumEvent(
  tx: Tx,
  event: string,
  providerPaymentId: string,
  alvo: { charge: PremiumChargeRow | null; userId: string | null },
  payload: AsaasPremiumPayload,
): Promise<PushJob[]> {
  if (!alvo.userId) return [];
  // Cobrança desconhecida que só foi excluída no gateway: não há o que registrar.
  if (!alvo.charge && event === 'PAYMENT_DELETED') return [];
  const charge = alvo.charge ?? (await registerCharge(tx, alvo.userId, providerPaymentId, payload));

  switch (event) {
    case 'PAYMENT_CREATED':
      return handleCreated(tx, charge, payload);
    case 'PAYMENT_CONFIRMED':
      return handleConfirmed(tx, charge, payload);
    case 'PAYMENT_RECEIVED':
      return handleReceived(tx, charge, payload);
    case 'PAYMENT_OVERDUE':
      return handleOverdue(tx, charge);
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return handleFailed(tx, charge, 'Recusado na análise de risco do gateway.');
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
      return handleFailed(tx, charge, 'Cartão recusado pela operadora.');
    case 'PAYMENT_REFUNDED':
      return handleReversal(tx, charge, 'refunded');
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      return handleReversal(tx, charge, 'chargeback');
    case 'PAYMENT_DELETED':
      await tx
        .update(premiumCharges)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(premiumCharges.id, charge.id), sql`${premiumCharges.status} IN ('pending', 'overdue')`));
      return [];
  }
  return [];
}

async function handleCreated(tx: Tx, charge: PremiumChargeRow, payload: AsaasPremiumPayload): Promise<PushJob[]> {
  const link = payload.payment?.invoiceUrl;
  if (!charge.invoiceUrl && typeof link === 'string' && link.startsWith('https://')) {
    await tx
      .update(premiumCharges)
      .set({ invoiceUrl: link.slice(0, 500), updatedAt: new Date() })
      .where(eq(premiumCharges.id, charge.id));
  }
  // Renovação por Pix: a pessoa precisa saber que há uma cobrança para pagar (no cartão a cobrança é automática).
  if (charge.method === 'credit_card' || !(await jaTeveCiclo(tx, charge.userId))) return [];
  return insertNotifications(tx, [
    {
      userId: charge.userId,
      type: 'premium_changed',
      title: 'Renove seu Premium',
      body: `A cobrança da renovação (vencimento em ${formatDueDate(charge.dueDate)}) está pronta. Pague pelo app para continuar Premium sem interrupção.`,
      linkPath: '/premium',
      data: { chargeId: charge.id },
      dedupeKey: `premium_renewal_created:${charge.id}`,
    },
  ]);
}

function formatDueDate(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Confirmação (cartão) ou primeiro aviso de pagamento (Pix — o Asaas manda
 * CREATED → RECEIVED, sem CONFIRMED): cria o ciclo pago. Nunca rebaixa uma
 * cobrança que já está à frente (evento fora de ordem), e uma cobrança já
 * estornada/contestada nunca volta a ativar nada.
 */
async function handleConfirmed(tx: Tx, charge: PremiumChargeRow, payload: AsaasPremiumPayload): Promise<PushJob[]> {
  if (charge.status === 'refunded' || charge.status === 'chargeback' || charge.status === 'cancelled') {
    await tx.insert(auditLogs).values({
      actorId: null,
      actorRole: 'system',
      action: 'premium.payment_after_reversal',
      entityType: 'premium_charge',
      entityId: charge.id,
      metadata: { userId: charge.userId, status: charge.status },
    });
    return [];
  }

  const metodo = payload.payment?.billingType ? (METODOS[payload.payment.billingType] ?? null) : null;
  await tx
    .update(premiumCharges)
    .set({
      status: sql`CASE WHEN ${premiumCharges.status} IN ('pending', 'overdue', 'failed') THEN 'confirmed'::payment_status ELSE ${premiumCharges.status} END`,
      paidAt: sql`COALESCE(${premiumCharges.paidAt}, now())`,
      ...(metodo ? { method: metodo } : {}),
      failureReason: null,
      providerPayload: payload as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(premiumCharges.id, charge.id));

  const [atual] = await tx.select().from(premiumCharges).where(eq(premiumCharges.id, charge.id)).limit(1);
  const ativacao = await activatePaidCycle(tx, atual ?? charge);
  if (!ativacao.created) return [];

  const renovacao = ativacao.number > 1;
  return insertNotifications(tx, [
    {
      userId: charge.userId,
      type: 'premium_changed',
      title: renovacao ? 'Premium renovado' : 'Premium ativado',
      body: `Pagamento confirmado. Você é Membro Premium até ${momento(ativacao.endsAt)}. Seus benefícios deste ciclo estão em Meu Premium.`,
      linkPath: '/premium',
      data: { chargeId: charge.id, cycleId: ativacao.cycleId },
      dedupeKey: `premium_cycle:${ativacao.cycleId}`,
    },
  ]);
}

/**
 * Dinheiro disponível (PAYMENT_RECEIVED): completa tarifa e valor líquido e
 * registra a receita no livro-razão. Para Pix é o primeiro aviso de pagamento,
 * então ativa o ciclo antes (como o CONFIRMED faria).
 */
async function handleReceived(tx: Tx, charge: PremiumChargeRow, payload: AsaasPremiumPayload): Promise<PushJob[]> {
  let jobs: PushJob[] = [];
  if (charge.status === 'pending' || charge.status === 'overdue' || charge.status === 'failed') {
    jobs = await handleConfirmed(tx, charge, payload);
  }
  const [atual] = await tx.select().from(premiumCharges).where(eq(premiumCharges.id, charge.id)).limit(1);
  const cobranca = atual ?? charge;
  const estornada = cobranca.status === 'refunded' || cobranca.status === 'chargeback' || cobranca.status === 'cancelled';

  const bruto = typeof payload.payment?.value === 'number' ? Math.round(payload.payment.value * 100) : cobranca.amountCents;
  const liquido = typeof payload.payment?.netValue === 'number' ? Math.round(payload.payment.netValue * 100) : null;
  const tarifa = liquido !== null ? bruto - liquido : null;

  await tx
    .update(premiumCharges)
    .set({
      ...(estornada ? {} : { status: 'received' as const }),
      creditedAt: new Date(),
      gatewayFeeCents: tarifa,
      netAmountCents: liquido,
      updatedAt: new Date(),
    })
    .where(eq(premiumCharges.id, charge.id));

  // Receita da plataforma (userId nulo = a própria plataforma), mesmo desenho das locações:
  // o que entrou e o que o gateway cobrou. Cobrança já devolvida não gera receita.
  if (tarifa !== null && !estornada) {
    await tx.insert(ledgerEntries).values([
      {
        type: 'charge_captured', premiumChargeId: charge.id, userId: null, amountCents: bruto,
        description: 'Premium — cobrança capturada', metadata: { kind: 'premium', payerId: charge.userId },
      },
      {
        type: 'gateway_fee', premiumChargeId: charge.id, userId: null, amountCents: -tarifa,
        description: 'Premium — tarifa do gateway (Asaas)', metadata: { kind: 'premium', payerId: charge.userId },
      },
    ]);
  }
  await tx.insert(auditLogs).values({
    actorId: null,
    actorRole: 'system',
    action: 'premium.payment_received',
    entityType: 'premium_charge',
    entityId: charge.id,
    metadata: { userId: charge.userId, gatewayFeeCents: tarifa, estornada },
  });
  return jobs;
}

async function handleOverdue(tx: Tx, charge: PremiumChargeRow): Promise<PushJob[]> {
  await tx
    .update(premiumCharges)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(eq(premiumCharges.id, charge.id), sql`${premiumCharges.status} IN ('pending', 'failed')`));
  if (!(await jaTeveCiclo(tx, charge.userId))) return []; // 1ª cobrança nunca paga: a varredura cuida
  return insertNotifications(tx, [
    {
      userId: charge.userId,
      type: 'premium_changed',
      title: 'Renovação do Premium em atraso',
      body: 'A cobrança da renovação venceu. Pague pelo app para não perder os benefícios quando o período atual terminar.',
      linkPath: '/premium',
      data: { chargeId: charge.id },
      dedupeKey: `premium_overdue:${charge.id}`,
    },
  ]);
}

async function handleFailed(tx: Tx, charge: PremiumChargeRow, motivo: string): Promise<PushJob[]> {
  await tx
    .update(premiumCharges)
    .set({ failureReason: motivo, updatedAt: new Date() })
    .where(eq(premiumCharges.id, charge.id));
  await tx.insert(auditLogs).values({
    actorId: null,
    actorRole: 'system',
    action: 'premium.payment_failed',
    entityType: 'premium_charge',
    entityId: charge.id,
    metadata: { userId: charge.userId, motivo },
  });
  return insertNotifications(tx, [
    {
      userId: charge.userId,
      type: 'premium_changed',
      title: 'Pagamento do Premium recusado',
      body: `${motivo} Tente outro cartão ou pague por Pix em Meu Premium.`,
      linkPath: '/premium',
      data: { chargeId: charge.id },
      dedupeKey: `premium_failed:${charge.id}`,
    },
  ]);
}

/**
 * Estorno ou contestação: o dinheiro voltou, o direito também. Encerra antes
 * do fim o ciclo que essa cobrança gerou (e cancela as promoções que ele
 * financiou). Lança a devolução no livro-razão.
 */
async function handleReversal(tx: Tx, charge: PremiumChargeRow, status: 'refunded' | 'chargeback'): Promise<PushJob[]> {
  if (charge.status === 'refunded' || charge.status === 'chargeback') return []; // já processado
  const eraRecebida = charge.status === 'received' || charge.status === 'confirmed';

  await tx
    .update(premiumCharges)
    .set({ status, refundedCents: charge.amountCents, updatedAt: new Date() })
    .where(eq(premiumCharges.id, charge.id));

  const cicloId = await endCycleForCharge(
    tx,
    charge.id,
    status === 'refunded' ? 'cobranca_estornada' : 'cobranca_contestada',
  );

  if (eraRecebida) {
    await tx.insert(ledgerEntries).values({
      type: status === 'refunded' ? 'refund' : 'chargeback',
      premiumChargeId: charge.id,
      userId: null,
      amountCents: -charge.amountCents,
      description: status === 'refunded' ? 'Premium — estorno' : 'Premium — contestação (chargeback)',
      metadata: { kind: 'premium', payerId: charge.userId, cycleId: cicloId },
    });
  }
  await tx.insert(auditLogs).values({
    actorId: null,
    actorRole: 'system',
    action: status === 'refunded' ? 'premium.charge_refunded' : 'premium.charge_chargeback',
    entityType: 'premium_charge',
    entityId: charge.id,
    metadata: { userId: charge.userId, cycleId: cicloId },
  });

  return insertNotifications(tx, [
    {
      userId: charge.userId,
      type: 'premium_changed',
      title: status === 'refunded' ? 'Pagamento do Premium estornado' : 'Pagamento do Premium contestado',
      body: cicloId
        ? 'O ciclo do Premium ligado a esse pagamento foi encerrado, e as promoções que ele financiou foram canceladas.'
        : 'Esse pagamento foi devolvido. Não havia um ciclo do Premium ativo ligado a ele.',
      linkPath: '/premium',
      data: { chargeId: charge.id },
      dedupeKey: `premium_reversal:${charge.id}`,
    },
  ]);
}

import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { premiumMemberships, premiumCycles, premiumCharges, promotions, renterBillingProfiles, profiles } from '@/db/schema';
import { cycleBenefitLimit } from './settings';

/**
 * Leitura do Premium.
 *
 * REGRA CENTRAL: "é Premium agora?" é ter um CICLO PAGO cujo período cobre o
 * momento atual, pelo relógio do BANCO (`premium_is_active`, migração 0034).
 * Nunca `status = 'active'` sozinho: depois do fim do período pago a linha da
 * assinatura pode continuar `active` até a varredura. Toda consulta SQL do app
 * que precisa dessa resposta usa `premiumActiveSql()`.
 */

/** Expressão SQL "o dono desta coluna é Premium agora?". `userIdSql` é uma coluna/expressão do Drizzle. */
export function premiumActiveSql(userIdSql: ReturnType<typeof sql> | string) {
  return typeof userIdSql === 'string'
    ? sql`public.premium_is_active(${userIdSql}::uuid)`
    : sql`public.premium_is_active(${userIdSql})`;
}

export type PremiumCycleInfo = {
  id: string;
  number: number;
  source: 'subscription' | 'admin_grant';
  startsAt: Date;
  /** Fim EFETIVO: o antecipado (estorno, contestação, revogação), se houve. */
  endsAt: Date;
  financialEligible: boolean;
};

type CycleRow = {
  id: string;
  number: number;
  source: 'subscription' | 'admin_grant';
  starts_at: Date | string;
  ends_at: Date | string;
  financial_eligible: boolean;
};

function toCycle(r: CycleRow): PremiumCycleInfo {
  return {
    id: r.id,
    number: r.number,
    source: r.source,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    financialEligible: r.financial_eligible,
  };
}

/** Ciclo vigente agora (relógio do banco), ou null. */
export async function getCurrentCycle(userId: string): Promise<PremiumCycleInfo | null> {
  const [row] = (await db.execute(sql`
    SELECT id, number, source::text AS source, starts_at,
           COALESCE(ended_early_at, ends_at) AS ends_at, financial_eligible
      FROM premium_cycles
     WHERE user_id = ${userId}
       AND starts_at <= now()
       AND now() < COALESCE(ended_early_at, ends_at)
     ORDER BY ends_at DESC
     LIMIT 1
  `)) as unknown as CycleRow[];
  return row ? toCycle(row) : null;
}

export async function isPremium(userId: string): Promise<boolean> {
  const [row] = (await db.execute(sql`SELECT ${premiumActiveSql(userId)} AS ok`)) as unknown as { ok: boolean }[];
  return row?.ok === true;
}

/** Premium que dá direito aos benefícios financeiros (taxa reduzida, primeiro mês). */
export async function isPremiumFinancial(userId: string): Promise<boolean> {
  const [row] = (await db.execute(sql`SELECT public.premium_financial_active(${userId}::uuid) AS ok`)) as unknown as {
    ok: boolean;
  }[];
  return row?.ok === true;
}

// ---------------------------------------------------------------------------
// Visão geral — a tela "Meu Premium"
// ---------------------------------------------------------------------------

export type PremiumState =
  /** Nunca assinou (ou abandonou a assinatura antes de pagar). */
  | 'none'
  /** Assinatura criada, primeiro pagamento ainda não confirmado — ainda NÃO é Premium. */
  | 'pending_payment'
  /** Premium vigente e renova no fim do período. */
  | 'active'
  /** Premium vigente, mas a pessoa cancelou a renovação: segue até o fim do período pago. */
  | 'active_not_renewing'
  /** Já foi Premium e o período pago acabou. */
  | 'ended';

export type OpenCharge = {
  invoiceUrl: string | null;
  dueDate: string;
  amountCents: number;
  status: 'pending' | 'overdue' | string;
};

export type PremiumOverview = {
  state: PremiumState;
  /** Premium AGORA (ciclo vigente). */
  isActive: boolean;
  source: 'subscription' | 'admin_grant' | null;
  /** Concessão administrativa (modo teste/suporte): sem cobrança, sem benefícios financeiros. */
  adminTest: boolean;
  /** Dá direito aos benefícios financeiros (taxa reduzida, primeiro mês)? */
  financialEligible: boolean;
  planCents: number | null;
  billingMethod: string | null;
  cycle: PremiumCycleInfo | null;
  cancelAtPeriodEnd: boolean;
  /** Cobrança em aberto: a primeira (aguardando pagamento) ou uma renovação a pagar. */
  openCharge: OpenCharge | null;
  /** Fim do último ciclo, quando já não é Premium. */
  lastEndedAt: Date | null;
};

export async function getPremiumOverview(userId: string): Promise<PremiumOverview> {
  const [membroLinhas, cycle, abertas, ultimos] = await Promise.all([
    db.select().from(premiumMemberships).where(eq(premiumMemberships.userId, userId)).limit(1),
    getCurrentCycle(userId),
    db
      .select({
        invoiceUrl: premiumCharges.invoiceUrl,
        dueDate: premiumCharges.dueDate,
        amountCents: premiumCharges.amountCents,
        status: premiumCharges.status,
      })
      .from(premiumCharges)
      .where(and(eq(premiumCharges.userId, userId), inArray(premiumCharges.status, ['pending', 'overdue'])))
      .orderBy(desc(premiumCharges.createdAt))
      .limit(1),
    db
      .select({ fim: sql<Date | string>`COALESCE(${premiumCycles.endedEarlyAt}, ${premiumCycles.endsAt})` })
      .from(premiumCycles)
      .where(eq(premiumCycles.userId, userId))
      .orderBy(desc(premiumCycles.number))
      .limit(1),
  ]);
  const membership = membroLinhas[0];
  const aberta = abertas[0];
  const ultimo = ultimos[0];

  const isActive = cycle !== null;
  const cancelAtPeriodEnd = membership?.cancelAtPeriodEnd ?? false;

  let state: PremiumState = 'none';
  if (isActive) state = cancelAtPeriodEnd ? 'active_not_renewing' : 'active';
  else if (membership?.status === 'pending_payment') state = 'pending_payment';
  else if (ultimo) state = 'ended';

  return {
    state,
    isActive,
    source: cycle?.source ?? membership?.source ?? null,
    adminTest: (cycle?.source ?? membership?.source) === 'admin_grant',
    financialEligible: cycle?.financialEligible ?? false,
    planCents: membership?.planCents ?? null,
    billingMethod: membership?.billingMethod ?? null,
    cycle,
    cancelAtPeriodEnd,
    openCharge: aberta ?? null,
    lastEndedAt: !isActive && ultimo ? new Date(ultimo.fim) : null,
  };
}

// ---------------------------------------------------------------------------
// Saldo de benefícios do ciclo (2 Destaques + 1 Turbo, não acumulam)
// ---------------------------------------------------------------------------

export type BenefitUsage = {
  /** Premium vigente agora. */
  premium: boolean;
  cycle: PremiumCycleInfo | null;
  /** Início/fim do ciclo vigente (null fora do Premium). */
  periodStart: Date | null;
  periodEnd: Date | null;
  destaque: { used: number; limit: number; remaining: number };
  turbo: { used: number; limit: number; remaining: number };
};

/**
 * Uso do benefício NO CICLO PAGO vigente, contado direto em `promotions`
 * (`premium_cycle_id`) — sem coluna de saldo à parte. Promoção cancelada
 * continua contando: o benefício usado não volta. Fora do Premium, o saldo é
 * zero (a tela mostra o convite, não um contador).
 */
export async function getBenefitUsage(ownerId: string): Promise<BenefitUsage> {
  const [cycle, destaqueLimit, turboLimit] = await Promise.all([
    getCurrentCycle(ownerId),
    cycleBenefitLimit('destaque'),
    cycleBenefitLimit('turbo'),
  ]);

  const contagens = cycle
    ? await db
        .select({ type: promotions.type, n: sql<number>`count(*)::int` })
        .from(promotions)
        .where(eq(promotions.premiumCycleId, cycle.id))
        .groupBy(promotions.type)
    : [];

  const destaqueUsed = contagens.find((c) => c.type === 'destaque')?.n ?? 0;
  const turboUsed = contagens.find((c) => c.type === 'turbo')?.n ?? 0;
  const saldo = (used: number, limit: number) => ({
    used,
    limit,
    remaining: cycle ? Math.max(0, limit - used) : 0,
  });

  return {
    premium: cycle !== null,
    cycle,
    periodStart: cycle?.startsAt ?? null,
    periodEnd: cycle?.endsAt ?? null,
    destaque: saldo(destaqueUsed, destaqueLimit),
    turbo: saldo(turboUsed, turboLimit),
  };
}

// ---------------------------------------------------------------------------
// Dicas do formulário de assinatura
// ---------------------------------------------------------------------------

/**
 * O formulário só pede o CPF se a conta ainda não tem cliente no gateway
 * (`renter_billing_profiles`) — e sugere o que já estiver no perfil.
 */
export async function getPremiumCheckoutHints(userId: string): Promise<{ needsCpf: boolean; cpfSuggested: string | null }> {
  const [cliente, perfil] = await Promise.all([
    db
      .select({ userId: renterBillingProfiles.userId })
      .from(renterBillingProfiles)
      .where(eq(renterBillingProfiles.userId, userId))
      .limit(1),
    db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, userId)).limit(1),
  ]);
  return { needsCpf: cliente.length === 0, cpfSuggested: perfil[0]?.cpfCnpj ?? null };
}

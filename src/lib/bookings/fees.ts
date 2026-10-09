import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs, bookings, platformSettings, subscriptions } from '@/db/schema';
import { isIntegrationConfigured } from '@/lib/env';
import { insertNotification } from '@/lib/notifications/dispatch';
import * as asaas from '@/lib/payments/asaas';
import {
  InvalidAmountError,
  computeBookingAmounts,
  decideOwnerFee,
  formatBps,
  formatBRL,
  splitFitsNet,
  type FeeConfig,
  type OwnerFeePolicy,
} from '@/lib/money';

/**
 * Taxas de uma locação — a ÚNICA decisão, centralizada no servidor.
 *
 * - Taxa do LOCATÁRIO: sempre a padrão (`fees.renter_fee_bps`, 3%).
 * - Taxa do PROPRIETÁRIO: a padrão (`fees.owner_fee_bps`, 3%) ou, com Premium
 *   PAGO e vigente e aluguel a partir do piso (R$ 50,00), a reduzida
 *   (`fees.owner_fee_bps_premium`, 2%).
 *
 * "Premium pago e vigente" = ciclo pago cujo período cobre agora
 * (`premium_financial_active`, migração 0034). Premium concedido pela
 * administração em modo teste NÃO conta, a menos que a concessão tenha a marca
 * de teste financeiro.
 *
 * A taxa é CONGELADA no aceite (a linha da locação guarda `owner_fee_bps`, e o
 * `terms_snapshot` guarda por quê); o banco confere (`bookings_guard_price_fee`,
 * migração 0035). O navegador nunca manda taxa.
 */

type Executor = Pick<typeof db, 'execute' | 'select'>;

export type FeePolicy = { renterFeeBps: number; owner: OwnerFeePolicy };

const KEYS = ['fees.renter_fee_bps', 'fees.owner_fee_bps', 'fees.owner_fee_bps_premium', 'fees.premium_min_rent_cents'] as const;

/** A política vigente, de `platform_settings` (uma consulta só). Chave ausente cai no padrão do produto. */
export async function loadFeePolicy(executor: Executor = db): Promise<FeePolicy> {
  const linhas = await executor
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(inArray(platformSettings.key, [...KEYS]));
  const valor = (chave: string, padrao: number) => {
    const n = Number(linhas.find((l) => l.key === chave)?.value);
    return Number.isFinite(n) ? n : padrao;
  };
  return {
    renterFeeBps: valor('fees.renter_fee_bps', 300),
    owner: {
      standardBps: valor('fees.owner_fee_bps', 300),
      premiumBps: valor('fees.owner_fee_bps_premium', 200),
      premiumMinRentCents: valor('fees.premium_min_rent_cents', 5000),
    },
  };
}

export type ResolvedFees = FeeConfig & {
  /** A taxa reduzida do Premium foi aplicada. */
  ownerFeeReduced: boolean;
  /** Tinha direito à taxa reduzida, mas o aluguel está abaixo do piso (vale a padrão). */
  ownerFeeBelowFloor: boolean;
  /** A taxa padrão do proprietário na hora da decisão (para o registro e a explicação). */
  standardOwnerFeeBps: number;
  /** Ciclo do Premium que justificou a redução (para a trilha de auditoria), quando houve. */
  premiumCycleId: string | null;
  policy: FeePolicy;
};

/**
 * Decide as taxas desta locação. Dentro de uma transação, passe o `tx` — a leitura
 * do Premium acontece junto do que vai ser gravado.
 */
export async function resolveBookingFees(opts: {
  ownerId: string;
  monthlyRentCents: number;
  executor?: Executor;
}): Promise<ResolvedFees> {
  const executor = opts.executor ?? db;
  const policy = await loadFeePolicy(executor);

  const [ciclo] = (await executor.execute(sql`
    SELECT id FROM premium_cycles
     WHERE id = public.premium_current_cycle_id(${opts.ownerId}::uuid) AND financial_eligible
  `)) as unknown as { id: string }[];
  const premiumFinancial = Boolean(ciclo);

  let decisao = decideOwnerFee(opts.monthlyRentCents, premiumFinancial, policy.owner);

  // Segunda trava: a taxa reduzida só vale se o líquido da cobrança ainda cobre o repasse
  // (senão o Asaas recusaria o split). Piso mal configurado nunca chega ao gateway.
  if (decisao.reduced) {
    const amounts = computeBookingAmounts(opts.monthlyRentCents, {
      renterFeeBps: policy.renterFeeBps,
      ownerFeeBps: decisao.bps,
    });
    if (!splitFitsNet(amounts)) {
      decisao = { bps: policy.owner.standardBps, reduced: false, belowFloor: true };
    }
  }

  return {
    renterFeeBps: policy.renterFeeBps,
    ownerFeeBps: decisao.bps,
    ownerFeeReduced: decisao.reduced,
    ownerFeeBelowFloor: decisao.belowFloor,
    standardOwnerFeeBps: policy.owner.standardBps,
    premiumCycleId: decisao.reduced && ciclo ? ciclo.id : null,
    policy,
  };
}

export { InvalidAmountError };

// ---------------------------------------------------------------------------
// A taxa SEGUE o Premium (decisão de 08/10/2026)
// ---------------------------------------------------------------------------

export type FeeSyncResult = { changed: number; splitsUpdated: number; splitsFailed: number };

/**
 * Recalcula a taxa do proprietário das locações vivas com o Premium dele COMO ESTÁ AGORA: o Premium
 * acabou → as próximas mensalidades voltam a 3%; voltou → 2% (respeitando o piso). Muda a linha da
 * locação (o banco confere) e avisa o proprietário; a recorrência no Asaas é acertada em seguida por
 * `syncSubscriptionSplits`. O valor do locatário nunca muda. Mensalidade já paga não é recalculada.
 */
export async function syncOwnerFeesWithPremium(): Promise<FeeSyncResult> {
  const vivas = await db
    .select({
      id: bookings.id, ownerId: bookings.ownerId, monthlyRentCents: bookings.monthlyRentCents,
      ownerFeeBps: bookings.ownerFeeBps, renterFeeBps: bookings.renterFeeBps, reference: bookings.reference,
    })
    .from(bookings)
    .where(inArray(bookings.status, ['approved', 'awaiting_payment', 'active', 'past_due']));

  const cache = new Map<string, ResolvedFees>();
  let changed = 0;
  for (const b of vivas) {
    const chave = `${b.ownerId}:${b.monthlyRentCents}`;
    let taxas = cache.get(chave);
    if (!taxas) {
      taxas = await resolveBookingFees({ ownerId: b.ownerId, monthlyRentCents: b.monthlyRentCents });
      cache.set(chave, taxas);
    }
    if (taxas.ownerFeeBps === b.ownerFeeBps) continue;
    const valores = computeBookingAmounts(b.monthlyRentCents, { renterFeeBps: b.renterFeeBps, ownerFeeBps: taxas.ownerFeeBps });
    const subiu = taxas.ownerFeeBps > b.ownerFeeBps;
    const mudou = await db.transaction(async (tx) => {
      const r = await tx
        .update(bookings)
        .set({ ownerFeeBps: valores.ownerFeeBps, ownerFeeCents: valores.ownerFeeCents, ownerPayoutCents: valores.ownerPayoutCents, updatedAt: new Date() })
        .where(and(eq(bookings.id, b.id), eq(bookings.ownerFeeBps, b.ownerFeeBps)))
        .returning({ id: bookings.id });
      if (r.length === 0) return false;
      await tx.insert(auditLogs).values({
        actorId: null, actorRole: 'system', action: 'booking.owner_fee_changed', entityType: 'booking', entityId: b.id,
        metadata: { fromBps: b.ownerFeeBps, toBps: valores.ownerFeeBps, reason: subiu ? 'premium_ended' : 'premium_active' },
      });
      await insertNotification(tx, {
        userId: b.ownerId, type: 'premium_changed',
        title: subiu ? 'Sua taxa voltou para a padrão' : 'Taxa reduzida do Premium aplicada',
        body: subiu
          ? `Sem o Premium ativo, as próximas mensalidades da locação ${b.reference} têm taxa de serviço de ${formatBps(valores.ownerFeeBps)}: você receberá ${formatBRL(valores.ownerPayoutCents)} por mês.`
          : `Com o Premium ativo, as próximas mensalidades da locação ${b.reference} têm taxa de serviço de ${formatBps(valores.ownerFeeBps)}: você receberá ${formatBRL(valores.ownerPayoutCents)} por mês.`,
        linkPath: `/reservas/${b.id}`,
        data: { bookingId: b.id, ownerFeeBps: valores.ownerFeeBps },
        dedupeKey: `owner_fee:${b.id}:${valores.ownerFeeBps}:${new Date().toISOString().slice(0, 10)}`,
      });
      return true;
    });
    if (mudou) changed++;
  }
  return { changed, splitsUpdated: 0, splitsFailed: 0 };
}

/**
 * Acerta o split da recorrência no Asaas quando o repasse da locação mudou (`gateway_owner_payout_cents`
 * diferente de `owner_payout_cents`). Idempotente: só grava o novo valor depois que o Asaas aceitou.
 */
export async function syncSubscriptionSplits(): Promise<{ updated: number; failed: number }> {
  if (!isIntegrationConfigured('payments')) return { updated: 0, failed: 0 };
  const pendentes = (await db.execute(sql`
    SELECT s.id, s.provider_subscription_id AS sub, b.owner_payout_cents AS payout, opa.provider_wallet_id AS wallet
      FROM subscriptions s
      JOIN bookings b ON b.id = s.booking_id
      LEFT JOIN owner_payout_accounts opa ON opa.owner_id = b.owner_id
     WHERE s.status IN ('pending_authorization', 'active', 'past_due')
       AND s.provider_subscription_id IS NOT NULL
       AND s.gateway_owner_payout_cents IS DISTINCT FROM b.owner_payout_cents
     LIMIT 50`)) as unknown as { id: string; sub: string; payout: number; wallet: string | null }[];
  let updated = 0;
  let failed = 0;
  for (const p of pendentes) {
    if (!p.wallet) { failed++; continue; }
    try {
      await asaas.updateSubscriptionSplit(p.sub, asaas.splitForOwner(p.wallet, p.payout));
      await db.update(subscriptions).set({ gatewayOwnerPayoutCents: p.payout, updatedAt: new Date() }).where(eq(subscriptions.id, p.id));
      updated++;
    } catch (err) {
      failed++;
      console.error('[taxa] não consegui atualizar o split no Asaas (tenta de novo no próximo minuto):', p.sub, err instanceof asaas.AsaasError ? err.body : err);
    }
  }
  return { updated, failed };
}

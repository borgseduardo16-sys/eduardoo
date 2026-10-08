import 'server-only';
import { createHmac } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ledgerEntries, platformTransfers, premiumBenefits } from '@/db/schema';
import { requireIntegration } from '@/lib/env';
import { computeFirstMonthBenefit, type FirstMonthBenefitResult } from '@/lib/money';
import * as asaas from '@/lib/payments/asaas';
import { settingInt } from '@/lib/settings';

/**
 * Benefício do primeiro mês do Premium (Etapa 2, Fase C).
 *
 * ATRÁS DE FEATURE FLAG (`premium.first_month_benefit_enabled`, padrão 0). Com a
 * flag desligada nada daqui toca o checkout, o gateway ou o dinheiro. A flag
 * também é conferida PELO BANCO (gatilho `guard_premium_benefit`).
 *
 * Nada deste fluxo foi validado contra o Asaas real: o que o código assume do
 * gateway está listado em docs/PREMIUM-BENEFICIO.md e é exercitado por
 * scripts/validar-asaas-beneficio.ts. Se o sandbox contradisser qualquer item,
 * a regra do projeto é PARAR e perguntar — não contornar.
 */

type Executor = Pick<typeof db, 'execute' | 'select' | 'insert' | 'update'>;

export async function isBenefitEnabled(): Promise<boolean> {
  return (await settingInt('premium.first_month_benefit_enabled', 0)) === 1;
}

/** Identidade = HMAC-SHA256 do documento (só dígitos). Exige o segredo; sem ele, falha explicitamente. */
export function identityHash(cpfCnpj: string): string {
  const { IDENTITY_HASH_SECRET } = requireIntegration('identityHash');
  const digits = cpfCnpj.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) throw new Error('Documento inválido para a identidade do benefício.');
  return createHmac('sha256', IDENTITY_HASH_SECRET).update(digits).digest('hex');
}

export type BenefitDecision =
  | { kind: 'off' }
  | { kind: 'not_eligible'; reason: 'no_premium_cycle' | 'already_used' | 'identity_used' }
  | { kind: 'not_applied'; reason: 'below_gateway_minimum' }
  | {
      kind: 'apply';
      cycleId: string;
      periodKey: string;
      maxCents: number;
      result: Extract<FirstMonthBenefitResult, { applied: true }>;
    };

/**
 * O que acontece com esta locação: tudo decidido no servidor, sem nada vindo do
 * navegador. `off` quando a flag está desligada (o checkout segue como sempre).
 */
export async function decideFirstMonthBenefit(opts: {
  renterId: string;
  cpfCnpj: string;
  monthlyRentCents: number;
  totalChargedCents: number;
  executor?: Executor;
}): Promise<BenefitDecision> {
  if (!(await isBenefitEnabled())) return { kind: 'off' };
  const ex = opts.executor ?? db;

  const [ciclo] = (await ex.execute(sql`
    SELECT public.premium_benefit_cycle_id(${opts.renterId}::uuid) AS id`)) as unknown as { id: string | null }[];
  if (!ciclo?.id) return { kind: 'not_eligible', reason: 'no_premium_cycle' };

  const [vivo] = await ex
    .select({ id: premiumBenefits.id })
    .from(premiumBenefits)
    .where(and(eq(premiumBenefits.cycleId, ciclo.id), sql`${premiumBenefits.status} <> 'cancelled'`))
    .limit(1);
  if (vivo) return { kind: 'not_eligible', reason: 'already_used' };

  const [periodo] = (await ex.execute(sql`
    SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS key FROM premium_cycles WHERE id = ${ciclo.id}`)) as unknown as { key: string }[];
  const periodKey = periodo!.key;

  const hash = identityHash(opts.cpfCnpj);
  const [mesmaIdentidade] = await ex
    .select({ id: premiumBenefits.id })
    .from(premiumBenefits)
    .where(and(eq(premiumBenefits.identityHash, hash), eq(premiumBenefits.periodKey, periodKey), sql`${premiumBenefits.status} <> 'cancelled'`))
    .limit(1);
  if (mesmaIdentidade) return { kind: 'not_eligible', reason: 'identity_used' };

  const [maxCents, minCents] = await Promise.all([
    settingInt('premium.first_month_benefit_max_cents', 10000),
    settingInt('premium.benefit_min_charge_cents', 500),
  ]);
  const result = computeFirstMonthBenefit({
    monthlyRentCents: opts.monthlyRentCents,
    totalChargedCents: opts.totalChargedCents,
    maxCents,
    gatewayMinChargeCents: minCents,
  });
  if (!result.applied) return { kind: 'not_applied', reason: result.reason };
  return { kind: 'apply', cycleId: ciclo.id, periodKey, maxCents, result };
}

/** Reserva o direito para a locação (o banco recusa se algo não confere). Devolve o id do benefício. */
export async function reserveBenefit(
  tx: Executor,
  opts: {
    decision: Extract<BenefitDecision, { kind: 'apply' }>;
    renterId: string;
    cpfCnpj: string;
    bookingId: string;
    totalChargedCents: number;
    ownerPayoutCents: number;
    providerPaymentId: string;
  },
): Promise<string> {
  const { decision } = opts;
  const [linha] = await tx
    .insert(premiumBenefits)
    .values({
      cycleId: decision.cycleId,
      userId: opts.renterId,
      identityHash: identityHash(opts.cpfCnpj),
      periodKey: decision.periodKey,
      bookingId: opts.bookingId,
      maxCents: decision.maxCents,
      benefitCents: decision.result.benefitCents,
      chargeTotalCents: opts.totalChargedCents,
      payerPaysCents: decision.result.payerPaysCents,
      ownerPayoutCents: opts.ownerPayoutCents,
      providerPaymentId: opts.providerPaymentId,
    })
    .returning({ id: premiumBenefits.id });
  return linha!.id;
}

/** Desfaz o direito antes de consumir (locação cancelada/expirada, cobrança não paga). Idempotente. */
export async function cancelBenefit(benefitId: string, reason: string, ex: Executor = db): Promise<void> {
  await ex
    .update(premiumBenefits)
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: reason })
    .where(and(eq(premiumBenefits.id, benefitId), eq(premiumBenefits.status, 'reserved')));
}

/**
 * Chamado quando a cobrança do benefício é RECEBIDA: consome o direito, enfileira
 * a transferência ao proprietário (idempotente: uma por benefício) e marca o
 * lançamento do repasse com o benefício que o financiou. Roda dentro da
 * transação do webhook.
 */
export async function consumeBenefitOnPayment(
  tx: Executor,
  opts: { providerPaymentId: string; destinationWalletId: string | null; ownerPayoutLedgerIds?: string[] },
): Promise<{ benefitId: string; transferQueued: boolean } | null> {
  const [b] = await tx
    .select()
    .from(premiumBenefits)
    .where(and(eq(premiumBenefits.providerPaymentId, opts.providerPaymentId), inArray(premiumBenefits.status, ['reserved', 'consumed'])))
    .limit(1);
  if (!b) return null;

  if (b.status === 'reserved') {
    await tx.update(premiumBenefits).set({ status: 'consumed', consumedAt: new Date() }).where(eq(premiumBenefits.id, b.id));
  }
  let transferQueued = false;
  if (opts.destinationWalletId) {
    const inserido = await tx
      .insert(platformTransfers)
      .values({ benefitId: b.id, bookingId: b.bookingId, destinationWalletId: opts.destinationWalletId, amountCents: b.ownerPayoutCents })
      .onConflictDoNothing({ target: platformTransfers.benefitId })
      .returning({ id: platformTransfers.id });
    transferQueued = inserido.length > 0;
  }
  return { benefitId: b.id, transferQueued };
}

/**
 * Esvazia a fila de transferências (cron por minuto). A chave `externalReference`
 * identifica a transferência no Asaas e no webhook de validação. Falha vira
 * `failed` com o motivo — nunca é "consertada" por tentativa em silêncio infinita.
 */
export async function processTransferOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!(await isBenefitEnabled())) return { sent: 0, failed: 0 };
  const fila = await db
    .select()
    .from(platformTransfers)
    .where(eq(platformTransfers.status, 'queued'))
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const t of fila) {
    // Trava otimista: só quem muda queued → sent envia (duas execuções simultâneas não duplicam).
    const [pega] = await db
      .update(platformTransfers)
      .set({ attempts: sql`${platformTransfers.attempts} + 1` })
      .where(and(eq(platformTransfers.id, t.id), eq(platformTransfers.status, 'queued')))
      .returning({ id: platformTransfers.id });
    if (!pega) continue;
    try {
      const r = await asaas.createTransferToWallet({
        walletId: t.destinationWalletId,
        valueCents: t.amountCents,
        externalReference: `benefit:${t.benefitId}`,
      });
      await db.transaction(async (tx) => {
        await tx
          .update(platformTransfers)
          .set({ status: 'sent', providerTransferId: r.id, sentAt: new Date(), lastError: null })
          .where(eq(platformTransfers.id, t.id));
        await tx.insert(ledgerEntries).values({
          type: 'premium_benefit_funded',
          bookingId: t.bookingId,
          premiumBenefitId: t.benefitId,
          userId: null,
          amountCents: -t.amountCents,
          description: 'Transferência da plataforma ao proprietário (benefício do primeiro mês do Premium)',
        });
      });
      sent++;
    } catch (err) {
      const msg = err instanceof asaas.AsaasError ? `${err.status}: ${err.message}` : String(err).slice(0, 300);
      await db
        .update(platformTransfers)
        .set({ status: 'failed', failedAt: new Date(), lastError: msg })
        .where(eq(platformTransfers.id, t.id));
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * Validação de transferência pedida pelo Asaas (webhook de operação crítica,
 * que o suporte precisa habilitar). Aprova SÓ o que está na nossa fila: mesma
 * referência, mesmo valor e mesma carteira. Qualquer divergência reprova.
 */
export async function validateTransferRequest(input: {
  externalReference?: string | null;
  valueCents: number;
  walletId?: string | null;
}): Promise<{ approved: boolean; reason?: string }> {
  const ref = input.externalReference ?? '';
  if (!ref.startsWith('benefit:')) return { approved: false, reason: 'transferência sem referência nossa' };
  const benefitId = ref.slice('benefit:'.length);
  const [t] = await db.select().from(platformTransfers).where(eq(platformTransfers.benefitId, benefitId)).limit(1);
  if (!t || !['queued', 'sent'].includes(t.status)) return { approved: false, reason: 'transferência não está na fila' };
  if (t.amountCents !== input.valueCents) return { approved: false, reason: 'valor diferente do combinado' };
  if (input.walletId && input.walletId !== t.destinationWalletId) return { approved: false, reason: 'destino diferente do combinado' };
  return { approved: true };
}

/** Painel administrativo: exposição máxima teórica × saldo da conta principal. O saldo vem do BACKEND. */
export async function getPremiumExposure(): Promise<{
  eligibleCycles: number;
  unusedCycles: number;
  maxExposureCents: number;
  committedCents: number;
  pendingTransferCents: number;
  balanceCents: number | null;
  balanceError: string | null;
}> {
  const [e] = (await db.execute(sql`SELECT * FROM public.premium_benefit_exposure()`)) as unknown as {
    eligible_cycles: number; unused_cycles: number; max_exposure_cents: string; committed_cents: string; pending_transfer_cents: string;
  }[];
  let balanceCents: number | null = null;
  let balanceError: string | null = null;
  try {
    balanceCents = await asaas.getBalanceCents();
  } catch (err) {
    balanceError = err instanceof Error ? err.message : 'Saldo indisponível.';
  }
  return {
    eligibleCycles: e!.eligible_cycles,
    unusedCycles: e!.unused_cycles,
    maxExposureCents: Number(e!.max_exposure_cents),
    committedCents: Number(e!.committed_cents),
    pendingTransferCents: Number(e!.pending_transfer_cents),
    balanceCents,
    balanceError,
  };
}

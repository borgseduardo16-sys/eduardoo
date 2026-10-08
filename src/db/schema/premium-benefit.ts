import { pgTable, pgEnum, uuid, text, integer, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './users';
import { bookings } from './bookings';
import { premiumCycles } from './premium';

/**
 * Benefício do primeiro mês (Etapa 2, Fase C) — ATRÁS DE FEATURE FLAG, desligada.
 *
 * O Premium PAGO e vigente dá, por ciclo, UM abatimento de até R$ 100,00 na
 * primeira cobrança de uma NOVA locação (a pessoa é o locatário). O proprietário
 * não perde nada: a diferença entre o que o locatário paga e o repasse devido é
 * financiada pela plataforma, por transferência da conta principal para a
 * subconta dele (`platform_transfers`).
 *
 * O banco é quem controla o direito: gatilho `guard_premium_benefit` (flag
 * ligada, ciclo elegível e fora da carência do cartão, teto, locação nova,
 * não é o próprio anúncio) e índices únicos (um por ciclo; um por identidade
 * por período). Não existe "carteira de R$ 100" por pessoa — é um direito
 * contado aqui, e o dinheiro é da plataforma.
 *
 * NADA aqui foi validado contra o Asaas real: ver docs/PREMIUM-BENEFICIO.md.
 */
export const premiumBenefitStatus = pgEnum('premium_benefit_status', [
  /** Direito reservado para uma locação; a cobrança ainda não foi paga. */
  'reserved',
  /** Cobrança paga com o abatimento; a transferência ao proprietário está na fila. */
  'consumed',
  /** Desfeito antes de ser consumido (locação cancelada/expirada, cobrança não paga). */
  'cancelled',
]);

export const premiumBenefits = pgTable(
  'premium_benefits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** O ciclo pago que financiou este benefício. */
    cycleId: uuid('cycle_id').notNull().references(() => premiumCycles.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'restrict' }),
    /** HMAC do CPF/CNPJ: a identidade, sem guardar o documento aqui. Trocar de conta não renova o direito. */
    identityHash: text('identity_hash').notNull(),
    /** AAAA-MM (Brasília) do início do ciclo: no máximo um benefício por identidade por período. */
    periodKey: text('period_key').notNull(),
    bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'restrict' }),
    status: premiumBenefitStatus('status').notNull().default('reserved'),
    /** Teto vigente na hora da reserva (R$ 100,00 = 10000). */
    maxCents: integer('max_cents').notNull(),
    /** Quanto foi abatido: min(teto, aluguel). Nunca aumenta para "completar" o mínimo do gateway. */
    benefitCents: integer('benefit_cents').notNull(),
    /** Total da primeira cobrança sem o benefício. */
    chargeTotalCents: integer('charge_total_cents').notNull(),
    /** O que o locatário paga de fato na primeira cobrança. */
    payerPaysCents: integer('payer_pays_cents').notNull(),
    /** Repasse devido ao proprietário nesta cobrança (o split cobre só até o líquido; o resto é transferência). */
    ownerPayoutCents: integer('owner_payout_cents').notNull(),
    providerPaymentId: text('provider_payment_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    uniqueIndex('premium_benefits_booking_key').on(t.bookingId),
    uniqueIndex('premium_benefits_cycle_live_key').on(t.cycleId).where(sql`${t.status} <> 'cancelled'`),
    uniqueIndex('premium_benefits_identity_period_live_key').on(t.identityHash, t.periodKey).where(sql`${t.status} <> 'cancelled'`),
    index('premium_benefits_user_idx').on(t.userId),
    check('premium_benefits_amount_positive', sql`${t.benefitCents} > 0`),
    check('premium_benefits_within_max', sql`${t.benefitCents} <= ${t.maxCents}`),
    check('premium_benefits_payer_pays', sql`${t.payerPaysCents} = ${t.chargeTotalCents} - ${t.benefitCents} AND ${t.payerPaysCents} > 0`),
    check('premium_benefits_cancel_has_timestamp', sql`${t.status}::text <> 'cancelled' OR ${t.cancelledAt} IS NOT NULL`),
    check('premium_benefits_consumed_has_timestamp', sql`${t.status}::text <> 'consumed' OR ${t.consumedAt} IS NOT NULL`),
  ],
);

export const platformTransferStatus = pgEnum('platform_transfer_status', [
  'queued',
  /** Enviada ao Asaas (o pedido de transferência foi aceito); falta a confirmação. */
  'sent',
  'confirmed',
  'failed',
  'cancelled',
]);

/**
 * Fila (outbox) das transferências da conta principal da plataforma para a
 * subconta do proprietário. Uma por benefício. Idempotente: a chave
 * `externalReference` vai ao Asaas e o webhook de validação só aprova o que
 * está aqui, com o mesmo valor e o mesmo destino.
 */
export const platformTransfers = pgTable(
  'platform_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    benefitId: uuid('benefit_id').notNull().references(() => premiumBenefits.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'restrict' }),
    destinationWalletId: text('destination_wallet_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: platformTransferStatus('status').notNull().default('queued'),
    providerTransferId: text('provider_transfer_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('platform_transfers_benefit_key').on(t.benefitId),
    uniqueIndex('platform_transfers_provider_key').on(t.providerTransferId).where(sql`${t.providerTransferId} IS NOT NULL`),
    index('platform_transfers_status_idx').on(t.status),
    check('platform_transfers_amount_positive', sql`${t.amountCents} > 0`),
  ],
);

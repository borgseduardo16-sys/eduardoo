import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  jsonb,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  paymentStatus,
  paymentMethod,
  subscriptionStatus,
  payoutStatus,
  ledgerEntryType,
  webhookStatus,
  depositReleaseStatus,
} from './enums';
import { profiles } from './users';
import { bookings } from './bookings';
import { reports } from './trust';
import { premiumCharges } from './premium';
import { premiumBenefits } from './premium-benefit';

/**
 * Assinatura mensal no gateway (a recorrencia de uma locacao).
 * Uma reserva ativa tem exatamente uma assinatura vigente.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),

    provider: text('provider').notNull().default('asaas'),
    providerSubscriptionId: text('provider_subscription_id'),

    status: subscriptionStatus('status').notNull().default('pending_authorization'),
    method: paymentMethod('method').notNull(),

    /** Valor cobrado por ciclo, congelado da reserva. */
    amountCents: integer('amount_cents').notNull(),
    /**
     * Repasse ao proprietário configurado HOJE no split da recorrência do gateway (0037). Quando a taxa
     * do proprietário muda (o Premium dele acabou ou voltou), a manutenção atualiza o split no Asaas e
     * grava o novo valor aqui; enquanto difere de `bookings.owner_payout_cents`, há atualização pendente.
     */
    gatewayOwnerPayoutCents: integer('gateway_owner_payout_cents'),
    /** Dia do vencimento (1..28 — evita meses curtos). */
    billingDay: integer('billing_day').notNull(),
    nextDueDate: date('next_due_date'),

    /** Ciclos seguidos com falha, para politica de suspensao. */
    failedCycles: integer('failed_cycles').notNull().default(0),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /**
     * Parte 12: quando o GATEWAY confirmou o cancelamento. Assinatura
     * `cancelled` sem isto = cancelamento ainda pendente no Asaas — o
     * agendador tenta de novo até confirmar (nada de cobrança depois do fim).
     */
    providerCancelledAt: timestamp('provider_cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_provider_id_key').on(t.provider, t.providerSubscriptionId),
    index('subscriptions_cancel_pending_idx').on(t.cancelledAt).where(sql`status = 'cancelled' AND provider_cancelled_at IS NULL`),
    index('subscriptions_booking_idx').on(t.bookingId),
    index('subscriptions_status_idx').on(t.status),
    index('subscriptions_next_due_idx').on(t.nextDueDate),
    check('subscriptions_billing_day_range', sql`${t.billingDay} BETWEEN 1 AND 28`),
    check('subscriptions_amount_positive', sql`${t.amountCents} > 0`),
    /** Uma assinatura viva por reserva. */
    uniqueIndex('subscriptions_one_live_per_booking')
      .on(t.bookingId)
      .where(sql`status IN ('pending_authorization','active','past_due','paused')`),
  ],
);

/**
 * Uma cobranca individual (um mes de aluguel).
 *
 * `providerPaymentId` e UNICO: e a chave de idempotencia contra webhooks
 * duplicados, que todo gateway reenvia.
 *
 * `status` so muda por evento do gateway. "O usuario voltou para a pagina de
 * sucesso" nunca confirma pagamento nenhum.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),

    provider: text('provider').notNull().default('asaas'),
    providerPaymentId: text('provider_payment_id').notNull(),

    status: paymentStatus('status').notNull().default('pending'),
    method: paymentMethod('method').notNull(),

    /** Bruto cobrado do locatario. */
    amountCents: integer('amount_cents').notNull(),
    /** Tarifa do gateway, informada por ele. NULL enquanto nao liquidou. */
    gatewayFeeCents: integer('gateway_fee_cents'),
    /** Liquido apos tarifa do gateway — base do split. */
    netAmountCents: integer('net_amount_cents'),
    /** Parte que fica com a plataforma, apos tarifa e repasse. */
    platformNetCents: integer('platform_net_cents'),
    refundedCents: integer('refunded_cents').notNull().default(0),

    dueDate: date('due_date').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    creditedAt: timestamp('credited_at', { withTimezone: true }),

    /** Link/QR para o locatario pagar (Pix copia-e-cola, boleto, checkout). */
    invoiceUrl: text('invoice_url'),

    failureReason: text('failure_reason'),
    /** Ultimo payload bruto do gateway, para auditoria e suporte. */
    providerPayload: jsonb('provider_payload').$type<Record<string, unknown>>(),

    // ---- Parte 12 ----
    /** Pix copia e cola e QR Code DO GATEWAY (GET /payments/{id}/pixQrCode), guardados para não pedir de novo a cada clique. */
    pixPayload: text('pix_payload'),
    pixQrImage: text('pix_qr_image'),
    pixExpiresAt: timestamp('pix_expires_at', { withTimezone: true }),
    /** A pessoa começou a pagar (escolheu Pix ou abriu a fatura): mostra "em processamento" até o gateway confirmar. */
    payerStartedAt: timestamp('payer_started_at', { withTimezone: true }),
    /** Estorno pedido (ex.: pagamento chegou depois do prazo). O agendador executa no gateway e repete até confirmar. */
    refundRequestedAt: timestamp('refund_requested_at', { withTimezone: true }),
    refundReason: text('refund_reason'),
    /** Cobrança que não deve mais ser paga (reserva expirou): excluir no gateway. */
    deleteRequestedAt: timestamp('delete_requested_at', { withTimezone: true }),
    providerDeletedAt: timestamp('provider_deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_provider_id_key').on(t.provider, t.providerPaymentId),
    index('payments_outbox_idx').on(t.updatedAt).where(sql`(refund_requested_at IS NOT NULL AND status NOT IN ('refunded','partially_refunded')) OR (delete_requested_at IS NOT NULL AND provider_deleted_at IS NULL)`),
    index('payments_booking_idx').on(t.bookingId),
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_status_idx').on(t.status),
    index('payments_due_date_idx').on(t.dueDate),
    check('payments_amount_positive', sql`${t.amountCents} > 0`),
    check('payments_refund_within_amount', sql`${t.refundedCents} BETWEEN 0 AND ${t.amountCents}`),
  ],
);

/**
 * Caução (proteção contra dano — Fase 20).
 *
 * Cobrança AVULSA no gateway, igual à compra de Destaque/Turbo — nunca
 * somada ao aluguel recorrente (ver `subscriptions`), porque não é receita:
 * é dinheiro do locatário em custódia da plataforma, e some para nós assim
 * que devolvido. `status` acompanha a COBRANÇA em si (o gateway confirmou o
 * pagamento?); `releaseStatus` acompanha o que aconteceu com o dinheiro
 * DEPOIS de cobrado — as duas coisas mudam em momentos diferentes.
 *
 * O valor retido numa disputa (`forfeitedCents`) fica marcado como devido
 * ao proprietário, mas o REPASSE de verdade ainda não é automático — ver
 * `ledgerEntryType.deposit_forfeited_to_owner` e a Fase 20 em docs/STATUS.md.
 */
export const bookingDeposits = pgTable(
  'booking_deposits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),

    amountCents: integer('amount_cents').notNull(),

    provider: text('provider').notNull().default('asaas'),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    invoiceUrl: text('invoice_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    providerPayload: jsonb('provider_payload').$type<Record<string, unknown>>(),

    releaseStatus: depositReleaseStatus('release_status').notNull().default('held'),
    /** Preenchidos juntos, só quando releaseStatus sai de 'held'. */
    releasedCents: integer('released_cents'),
    forfeitedCents: integer('forfeited_cents'),
    /** A denúncia (com dano procedente) que decidiu a retenção, se houve uma. */
    resolvedReportId: uuid('resolved_report_id').references(() => reports.id, { onDelete: 'set null' }),
    releasedAt: timestamp('released_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('booking_deposits_booking_key').on(t.bookingId),
    uniqueIndex('booking_deposits_provider_id_key').on(t.provider, t.providerPaymentId),
    index('booking_deposits_status_idx').on(t.status),
    index('booking_deposits_release_status_idx').on(t.releaseStatus),
    check('booking_deposits_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'booking_deposits_released_non_negative',
      sql`${t.releasedCents} IS NULL OR ${t.releasedCents} >= 0`,
    ),
    check(
      'booking_deposits_forfeited_non_negative',
      sql`${t.forfeitedCents} IS NULL OR ${t.forfeitedCents} >= 0`,
    ),
    /**
     * Ou ainda está tudo em aberto (nenhum valor decidido), ou já foi
     * decidido por inteiro — os dois números somam exatamente o total. Não
     * existe meio-termo gravável: nunca um `released` sem saber o forfeited,
     * nem os dois somando um valor diferente da caução cobrada.
     */
    check(
      'booking_deposits_release_amounts_consistent',
      sql`(${t.releaseStatus} = 'held' AND ${t.releasedCents} IS NULL AND ${t.forfeitedCents} IS NULL)
          OR (${t.releaseStatus} <> 'held' AND ${t.releasedCents} IS NOT NULL AND ${t.forfeitedCents} IS NOT NULL
              AND ${t.releasedCents} + ${t.forfeitedCents} = ${t.amountCents})`,
    ),
    check(
      'booking_deposits_release_status_matches_split',
      sql`${t.releaseStatus} NOT IN ('released','forfeited','partially_forfeited')
          OR (
            (${t.releaseStatus} = 'released' AND ${t.forfeitedCents} = 0)
            OR (${t.releaseStatus} = 'forfeited' AND ${t.releasedCents} = 0)
            OR (${t.releaseStatus} = 'partially_forfeited' AND ${t.releasedCents} > 0 AND ${t.forfeitedCents} > 0)
          )`,
    ),
  ],
);

/** Repasse ao proprietario (a perna do split que sai para a carteira dele). */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    provider: text('provider').notNull().default('asaas'),
    providerSplitId: text('provider_split_id'),
    /** Carteira destino no momento do repasse (o dono pode trocar depois). */
    providerWalletId: text('provider_wallet_id').notNull(),

    amountCents: integer('amount_cents').notNull(),
    status: payoutStatus('status').notNull().default('pending'),
    failureReason: text('failure_reason'),

    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payouts_provider_split_key').on(t.provider, t.providerSplitId),
    index('payouts_payment_idx').on(t.paymentId),
    index('payouts_owner_idx').on(t.ownerId, t.status),
    check('payouts_amount_positive', sql`${t.amountCents} > 0`),
  ],
);

/**
 * Livro-razao append-only.
 *
 * Nenhuma linha daqui e alterada ou apagada: estorno e chargeback entram como
 * novos lancamentos de sinal contrario. E a fonte de verdade para conferir
 * quanto a plataforma realmente ganhou e quanto cada proprietario recebeu.
 * `amountCents` e assinado: positivo entra, negativo sai.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: ledgerEntryType('type').notNull(),

    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    payoutId: uuid('payout_id').references(() => payouts.id, { onDelete: 'restrict' }),
    /** Cobranca do Premium (receita da plataforma, sem reserva) — 0034. */
    premiumChargeId: uuid('premium_charge_id').references(() => premiumCharges.id, { onDelete: 'restrict' }),
    /** Benefício do primeiro mês que originou o lançamento — 0036. */
    premiumBenefitId: uuid('premium_benefit_id').references(() => premiumBenefits.id, { onDelete: 'restrict' }),
    /** Titular do lancamento. NULL = a propria plataforma. */
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'restrict' }),

    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),
    description: text('description'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_booking_idx').on(t.bookingId),
    index('ledger_payment_idx').on(t.paymentId),
    index('ledger_premium_charge_idx').on(t.premiumChargeId),
    index('ledger_premium_benefit_idx').on(t.premiumBenefitId),
    index('ledger_user_idx').on(t.userId),
    index('ledger_type_occurred_idx').on(t.type, t.occurredAt),
    check('ledger_amount_not_zero', sql`${t.amountCents} <> 0`),
  ],
);

/**
 * Eventos de webhook recebidos.
 *
 * Gravamos ANTES de processar. `providerEventId` unico garante que reentrega
 * do gateway (que acontece sempre) nao cobre, credite ou repasse duas vezes.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),

    status: webhookStatus('status').notNull().default('received'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),

    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_key').on(t.provider, t.providerEventId),
    index('webhook_events_status_idx').on(t.status, t.receivedAt),
    index('webhook_events_type_idx').on(t.eventType),
  ],
);

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  booking: one(bookings, { fields: [subscriptions.bookingId], references: [bookings.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  payouts: many(payouts),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  payment: one(payments, { fields: [payouts.paymentId], references: [payments.id] }),
  owner: one(profiles, { fields: [payouts.ownerId], references: [profiles.id] }),
}));

export const bookingDepositsRelations = relations(bookingDeposits, ({ one }) => ({
  booking: one(bookings, { fields: [bookingDeposits.bookingId], references: [bookings.id] }),
  resolvedReport: one(reports, { fields: [bookingDeposits.resolvedReportId], references: [reports.id] }),
}));

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
} from './enums';
import { profiles } from './users';
import { bookings } from './bookings';

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
    /** Dia do vencimento (1..28 — evita meses curtos). */
    billingDay: integer('billing_day').notNull(),
    nextDueDate: date('next_due_date'),

    /** Ciclos seguidos com falha, para politica de suspensao. */
    failedCycles: integer('failed_cycles').notNull().default(0),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_provider_id_key').on(t.provider, t.providerSubscriptionId),
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

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_provider_id_key').on(t.provider, t.providerPaymentId),
    index('payments_booking_idx').on(t.bookingId),
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_status_idx').on(t.status),
    index('payments_due_date_idx').on(t.dueDate),
    check('payments_amount_positive', sql`${t.amountCents} > 0`),
    check('payments_refund_within_amount', sql`${t.refundedCents} BETWEEN 0 AND ${t.amountCents}`),
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

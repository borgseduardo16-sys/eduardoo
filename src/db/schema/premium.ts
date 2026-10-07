import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  premiumMembershipStatus,
  premiumMembershipSource,
  paymentStatus,
  paymentMethod,
} from './enums';
import { profiles } from './users';

/**
 * Assinatura Premium — plano PAGO, recorrente, próprio no Asaas (separado das
 * assinaturas das locações: sem split, valor da plataforma). 1:1 com
 * `profiles`, por isso `userId` é a própria chave primária.
 *
 * Esta linha é o RESUMO da assinatura (estado, preço combinado, vínculo com o
 * Asaas, "não renova"). Quem diz se a pessoa É Premium AGORA são os ciclos
 * (`premium_cycles`): Premium = existir um ciclo pago cujo período cobre o
 * momento atual — função `premium_is_active()`, pelo relógio do banco.
 * Nenhuma tela ou consulta olha `status = 'active'` sozinho: depois do fim do
 * período pago a linha pode continuar `active` até a varredura
 * (`sync_premium_memberships`) virar `expired`/`cancelled`.
 *
 * Estados:
 *   pending_payment — assinatura criada, primeira cobrança ainda não confirmada.
 *                     NÃO é Premium (Premium = pagamento confirmado).
 *   active          — tem (ou teve, até a varredura) um período pago.
 *   expired         — o período pago acabou e nenhuma renovação foi confirmada.
 *   cancelled       — terminou por cancelamento (a pessoa pediu para não
 *                     renovar e o período acabou, ou a administração revogou).
 *
 * "Cancelar" NÃO encerra o Premium na hora: marca `cancel_at_period_end` —
 * a pessoa segue Premium e usando os benefícios até o fim do período já pago,
 * sem renovação automática e sem reembolso proporcional.
 *
 * `source = 'admin_grant'` é o modo administrativo/teste (suporte): período
 * com data de fim, sem cobrança e SEM benefícios financeiros (taxa reduzida,
 * benefício de primeiro mês), a menos que a administração marque
 * `financial_test_enabled` de propósito.
 */
export const premiumMemberships = pgTable(
  'premium_memberships',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    status: premiumMembershipStatus('status').notNull(),
    source: premiumMembershipSource('source').notNull(),

    /** Vínculo com a assinatura recorrente no gateway (NULL no modo administrativo). */
    provider: text('provider'),
    providerSubscriptionId: text('provider_subscription_id'),
    /** Forma de pagamento escolhida ao assinar: cartão renova sozinho; Pix gera uma cobrança por mês. */
    billingMethod: paymentMethod('billing_method'),
    /** Preço mensal combinado ao assinar, em centavos (mudar o preço depois não mexe em quem já assinou). */
    planCents: integer('plan_cents'),

    /** Resumo do ciclo pago mais recente — a verdade está em `premium_cycles`. */
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),

    /** A pessoa pediu para NÃO renovar: segue Premium até `current_period_end`. */
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    /** Quando o GATEWAY confirmou o cancelamento da recorrência (sem isto, o agendador tenta de novo). */
    providerCancelledAt: timestamp('provider_cancelled_at', { withTimezone: true }),

    /** Só para teste: libera os benefícios financeiros num Premium concedido pela administração. */
    financialTestEnabled: boolean('financial_test_enabled').notNull().default(false),

    grantedBy: uuid('granted_by').references(() => profiles.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),

    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('premium_memberships_status_idx').on(t.status),
    uniqueIndex('premium_memberships_provider_sub_key')
      .on(t.provider, t.providerSubscriptionId)
      .where(sql`provider_subscription_id IS NOT NULL`),
    /** Recorrência a cancelar no gateway (o agendador executa e repete até confirmar). */
    index('premium_memberships_cancel_pending_idx')
      .on(t.updatedAt)
      .where(sql`provider_subscription_id IS NOT NULL AND provider_cancelled_at IS NULL`),
    check(
      'premium_memberships_cancelled_has_timestamp',
      sql`(${t.status} <> 'cancelled') OR (${t.cancelledAt} IS NOT NULL)`,
    ),
    check(
      'premium_memberships_period_order',
      sql`${t.currentPeriodStart} IS NULL OR ${t.currentPeriodEnd} IS NULL OR ${t.currentPeriodEnd} > ${t.currentPeriodStart}`,
    ),
    /** Um Premium `active` sempre tem uma data de fim — nunca "para sempre". */
    check(
      'premium_memberships_active_has_period',
      sql`${t.status}::text <> 'active' OR ${t.currentPeriodEnd} IS NOT NULL`,
    ),
    check(
      'premium_memberships_cancel_request_has_timestamp',
      sql`NOT ${t.cancelAtPeriodEnd} OR ${t.cancelRequestedAt} IS NOT NULL`,
    ),
    /** O "modo teste financeiro" só existe para concessão administrativa. */
    check(
      'premium_memberships_financial_test_admin_only',
      sql`NOT ${t.financialTestEnabled} OR ${t.source}::text = 'admin_grant'`,
    ),
    check(
      'premium_memberships_subscription_has_plan',
      sql`${t.source}::text <> 'subscription' OR (${t.planCents} IS NOT NULL AND ${t.planCents} > 0)`,
    ),
  ],
);

/**
 * Cobrança do Premium no gateway — a primeira e cada renovação. Espelha
 * `payments`, mas sem reserva, sem split e sem repasse: é receita da
 * plataforma. `providerPaymentId` é ÚNICO (idempotência contra webhook
 * duplicado). O status só muda por evento do gateway.
 */
export const premiumCharges = pgTable(
  'premium_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    provider: text('provider').notNull().default('asaas'),
    providerPaymentId: text('provider_payment_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id'),

    status: paymentStatus('status').notNull().default('pending'),
    /** Forma de pagamento (do gateway, quando informada; senão a escolhida ao assinar). */
    method: paymentMethod('method'),

    /** Bruto cobrado, em centavos. */
    amountCents: integer('amount_cents').notNull(),
    gatewayFeeCents: integer('gateway_fee_cents'),
    netAmountCents: integer('net_amount_cents'),
    refundedCents: integer('refunded_cents').notNull().default(0),

    dueDate: date('due_date').notNull(),
    /** Quando o pagamento foi confirmado — relógio do BANCO, gravado no webhook. */
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Quando o dinheiro ficou disponível (PAYMENT_RECEIVED). */
    creditedAt: timestamp('credited_at', { withTimezone: true }),

    invoiceUrl: text('invoice_url'),
    failureReason: text('failure_reason'),
    providerPayload: jsonb('provider_payload').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('premium_charges_provider_id_key').on(t.provider, t.providerPaymentId),
    index('premium_charges_user_idx').on(t.userId, t.createdAt),
    index('premium_charges_status_idx').on(t.status),
    index('premium_charges_subscription_idx').on(t.providerSubscriptionId),
    check('premium_charges_amount_positive', sql`${t.amountCents} > 0`),
    check('premium_charges_refund_within_amount', sql`${t.refundedCents} BETWEEN 0 AND ${t.amountCents}`),
  ],
);

/**
 * Ciclo do Premium = período mensal EFETIVAMENTE PAGO. Cada cobrança
 * confirmada gera exatamente um ciclo; é nele que se contam os benefícios
 * (2 Destaques e 1 Turbo por ciclo — não acumulam). Ciclo da administração
 * (`source = 'admin_grant'`) não tem cobrança e tem data de fim.
 *
 * Os períodos de uma pessoa nunca se sobrepõem (restrição de exclusão
 * `premium_cycles_no_overlap`, na migração). Fim antecipado (estorno,
 * contestação, revogação pela administração) grava `ended_early_at`: o fim
 * efetivo é `COALESCE(ended_early_at, ends_at)`.
 *
 * `financial_eligible` é CONGELADO na criação: só o Premium pago e confirmado
 * (ou a concessão administrativa com a marca de teste) dá direito aos
 * benefícios financeiros.
 */
export const premiumCycles = pgTable(
  'premium_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** 1, 2, 3… por pessoa. */
    number: integer('number').notNull(),
    source: premiumMembershipSource('source').notNull(),
    chargeId: uuid('charge_id').references(() => premiumCharges.id, { onDelete: 'restrict' }),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    endedEarlyAt: timestamp('ended_early_at', { withTimezone: true }),
    endedEarlyReason: text('ended_early_reason'),

    financialEligible: boolean('financial_eligible').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('premium_cycles_user_number_key').on(t.userId, t.number),
    uniqueIndex('premium_cycles_charge_key').on(t.chargeId),
    index('premium_cycles_user_ends_idx').on(t.userId, t.endsAt),
    check('premium_cycles_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'premium_cycles_ended_early_within',
      sql`${t.endedEarlyAt} IS NULL OR (${t.endedEarlyAt} >= ${t.startsAt} AND ${t.endedEarlyAt} <= ${t.endsAt})`,
    ),
    /** Ciclo pago sempre nasce de uma cobrança; ciclo administrativo nunca. */
    check(
      'premium_cycles_charge_matches_source',
      sql`(${t.source}::text = 'subscription') = (${t.chargeId} IS NOT NULL)`,
    ),
  ],
);

export const premiumMembershipsRelations = relations(premiumMemberships, ({ one }) => ({
  user: one(profiles, { fields: [premiumMemberships.userId], references: [profiles.id] }),
}));

export const premiumChargesRelations = relations(premiumCharges, ({ one }) => ({
  user: one(profiles, { fields: [premiumCharges.userId], references: [profiles.id] }),
}));

export const premiumCyclesRelations = relations(premiumCycles, ({ one }) => ({
  user: one(profiles, { fields: [premiumCycles.userId], references: [profiles.id] }),
  charge: one(premiumCharges, { fields: [premiumCycles.chargeId], references: [premiumCharges.id] }),
}));

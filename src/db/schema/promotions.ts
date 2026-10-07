import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  promotionType,
  promotionStatus,
  promotionSource,
  paymentStatus,
} from './enums';
import { profiles } from './users';
import { spaces } from './spaces';
import { premiumCycles } from './premium';

/**
 * Promocao de um anuncio (Destaque ou Turbo).
 *
 * Estado real (`promotionStatus`), nunca um booleano `is_featured` — pedido
 * explicito, para a estrutura aguentar evolucao futura (agendamento,
 * campanha) sem migracao nova.
 *
 * `ownerId` e redundante com `spaces.owner_id` de proposito, mesmo padrao de
 * `bookings.owner_id`: o dono do anuncio pode mudar (nao muda, mas podia);
 * quem usou o beneficio naquele mes, nao.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    type: promotionType('type').notNull(),
    status: promotionStatus('status').notNull().default('active'),
    source: promotionSource('source').notNull(),

    /** Id da transacao no gateway, quando vier de compra avulsa. NULL hoje sempre. */
    transactionId: text('transaction_id'),

    /**
     * Ciclo do Premium que financiou o beneficio (`source = 'premium_benefit'`):
     * o limite de 2 Destaques e 1 Turbo vale POR CICLO PAGO, nao por mes do
     * calendario. A trava `promotions_guard_premium_quota` (migracao 0034)
     * confere, no INSERT, que o ciclo e do dono, esta vigente e ainda tem saldo.
     * Promocoes antigas (mes-calendario, antes da 0034) ficam com NULL.
     */
    premiumCycleId: uuid('premium_cycle_id').references(() => premiumCycles.id, { onDelete: 'restrict' }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promotions_space_idx').on(t.spaceId),
    /**
     * O contador mensal de beneficio usado (2 Destaques + 1 Turbo por mes)
     * e lido contando linhas aqui — `owner_id + type + source + created_at
     * dentro do mes corrente` — em vez de uma coluna de saldo a parte. Este
     * indice e o que torna essa contagem rapida.
     */
    index('promotions_owner_period_idx').on(t.ownerId, t.type, t.source, t.createdAt),
    /** Varredura preguicosa de promocao vencida (mesmo padrao de bookings expirados). */
    index('promotions_status_expires_idx').on(t.status, t.expiresAt),
    /** Saldo do ciclo: quantas promocoes de cada tipo o Premium ja usou naquele ciclo. */
    index('promotions_premium_cycle_idx').on(t.premiumCycleId, t.type),

    /**
     * Um anuncio nao pode ter mais de uma promocao vigente ao mesmo tempo —
     * cobre as duas regras do pedido numa unica trava: nao sobrepor Destaque
     * e nao empilhar Turbo com Turbo. `scheduled` entra tambem porque uma
     * promocao agendada futura ja "reserva" o proximo periodo do anuncio.
     */
    uniqueIndex('promotions_one_active_per_space')
      .on(t.spaceId)
      .where(sql`status IN ('scheduled','active')`),

    check('promotions_expires_after_started', sql`${t.expiresAt} > ${t.startedAt}`),
    check(
      'promotions_cancelled_has_timestamp',
      sql`(${t.status} <> 'cancelled') OR (${t.cancelledAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * Compra avulsa de Destaque/Turbo — preco fixo por duracao, cobranca UNICA no
 * gateway (nao recorrente, sem split: o dinheiro e inteiro da plataforma).
 *
 * Espelha `payments`, mas nao referencia `bookings`: e por isso uma tabela
 * propria, nao uma reforma de `payments` (que tem `booking_id NOT NULL` e
 * regras de payout/ledger que nao se aplicam aqui).
 *
 * A `promotions` correspondente so e criada quando o pagamento CONFIRMA (no
 * webhook) — antes disso so existe o registro da compra, pendente. Por isso
 * `promotion_id` comeca NULL.
 */
export const promotionPurchases = pgTable(
  'promotion_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    type: promotionType('type').notNull(),
    /** Duracao contratada, em horas — 24/72/120 (1/3/5 dias de Destaque) ou 1/5/12/24 (Turbo). */
    durationHours: integer('duration_hours').notNull(),
    /** Preco pago, em centavos — sempre um dos valores fixos do catalogo (src/lib/promotions/purchase-pricing.ts). */
    priceCents: integer('price_cents').notNull(),

    provider: text('provider').notNull().default('asaas'),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    invoiceUrl: text('invoice_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    providerPayload: jsonb('provider_payload').$type<Record<string, unknown>>(),

    /** Preenchido no webhook, so quando o pagamento confirma e a promocao e criada. */
    promotionId: uuid('promotion_id').references(() => promotions.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promotion_purchases_provider_id_key').on(t.provider, t.providerPaymentId),
    index('promotion_purchases_space_idx').on(t.spaceId),
    index('promotion_purchases_owner_idx').on(t.ownerId, t.createdAt),
    index('promotion_purchases_status_idx').on(t.status),
    check('promotion_purchases_price_positive', sql`${t.priceCents} > 0`),
    check('promotion_purchases_duration_positive', sql`${t.durationHours} > 0`),
  ],
);

export const promotionsRelations = relations(promotions, ({ one }) => ({
  space: one(spaces, { fields: [promotions.spaceId], references: [spaces.id] }),
  owner: one(profiles, { fields: [promotions.ownerId], references: [profiles.id] }),
}));

export const promotionPurchasesRelations = relations(promotionPurchases, ({ one }) => ({
  space: one(spaces, { fields: [promotionPurchases.spaceId], references: [spaces.id] }),
  owner: one(profiles, { fields: [promotionPurchases.ownerId], references: [profiles.id] }),
  promotion: one(promotions, { fields: [promotionPurchases.promotionId], references: [promotions.id] }),
}));


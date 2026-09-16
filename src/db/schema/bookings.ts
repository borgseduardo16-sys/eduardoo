import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { bookingStatus } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';

/**
 * Reserva/locacao de um espaco.
 *
 * TODOS os valores monetarios sao calculados NO SERVIDOR e congelados aqui no
 * momento da aprovacao. O navegador nunca envia preco: envia apenas o id do
 * espaco e o periodo. Se a plataforma mudar a taxa amanha, contratos vigentes
 * seguem com a taxa que foi acordada, porque ficou gravada nesta linha.
 *
 * Relacao das contas (tudo em centavos, inteiro):
 *   monthlyRentCents   = preco do espaco definido pelo proprietario
 *   renterFeeCents     = round(monthlyRent * renterFeeBps / 10000)
 *   ownerFeeCents      = round(monthlyRent * ownerFeeBps  / 10000)
 *   totalChargedCents  = monthlyRent + renterFee     <- o locatario paga
 *   ownerPayoutCents   = monthlyRent - ownerFee      <- o proprietario recebe
 *   receita bruta da plataforma = renterFee + ownerFee
 *
 * A tarifa do gateway sai ANTES do split e e absorvida pela plataforma
 * (ver docs/PAGAMENTOS.md — isso reduz a margem liquida real).
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Codigo curto legivel, para suporte e comprovantes. Ex: MP-7F3K9Q */
    reference: text('reference').notNull(),

    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    renterId: uuid('renter_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** Redundante com spaces.owner_id de proposito: o dono pode mudar, o contrato nao. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    status: bookingStatus('status').notNull().default('requested'),

    startDate: date('start_date').notNull(),
    /** NULL = contrato por prazo indeterminado, renovando mes a mes. */
    endDate: date('end_date'),

    // ---- Valores congelados no aceite (centavos) ----
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
    renterFeeBps: integer('renter_fee_bps').notNull(),
    ownerFeeBps: integer('owner_fee_bps').notNull(),
    renterFeeCents: integer('renter_fee_cents').notNull(),
    ownerFeeCents: integer('owner_fee_cents').notNull(),
    totalChargedCents: integer('total_charged_cents').notNull(),
    ownerPayoutCents: integer('owner_payout_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),

    /** Copia das regras do anuncio no aceite — prova do que foi combinado. */
    termsSnapshot: jsonb('terms_snapshot').$type<Record<string, unknown>>(),

    renterMessage: text('renter_message'),
    ownerResponse: text('owner_response'),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),
    cancellationReason: text('cancellation_reason'),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_reference_key').on(t.reference),
    index('bookings_space_idx').on(t.spaceId),
    index('bookings_renter_idx').on(t.renterId, t.status),
    index('bookings_owner_idx').on(t.ownerId, t.status),
    index('bookings_status_idx').on(t.status),

    /** O locatario nao pode ser o proprietario. */
    check('bookings_distinct_parties', sql`${t.renterId} <> ${t.ownerId}`),
    check('bookings_dates_ordered', sql`${t.endDate} IS NULL OR ${t.endDate} > ${t.startDate}`),
    check('bookings_rent_positive', sql`${t.monthlyRentCents} > 0`),
    check('bookings_fees_non_negative', sql`${t.renterFeeCents} >= 0 AND ${t.ownerFeeCents} >= 0`),
    /**
     * A aritmetica do dinheiro vira invariante do banco. Se um bug de
     * aplicacao tentar gravar um total inconsistente, o INSERT falha.
     */
    check(
      'bookings_total_matches',
      sql`${t.totalChargedCents} = ${t.monthlyRentCents} + ${t.renterFeeCents}`,
    ),
    check(
      'bookings_payout_matches',
      sql`${t.ownerPayoutCents} = ${t.monthlyRentCents} - ${t.ownerFeeCents}`,
    ),
    check('bookings_payout_positive', sql`${t.ownerPayoutCents} > 0`),

    /**
     * Um mesmo espaco nao pode ter duas locacoes vigentes ao mesmo tempo.
     * Indice unico parcial: vale apenas para os status que ocupam o espaco.
     */
    uniqueIndex('bookings_one_active_per_space')
      .on(t.spaceId)
      .where(sql`status IN ('approved','awaiting_payment','active','past_due')`),
  ],
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  space: one(spaces, { fields: [bookings.spaceId], references: [spaces.id] }),
  renter: one(profiles, { fields: [bookings.renterId], references: [profiles.id] }),
  owner: one(profiles, { fields: [bookings.ownerId], references: [profiles.id] }),
}));

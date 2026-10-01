import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
  jsonb,
  foreignKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { bookingEndReason, bookingStatus, rentalKind, rentalTimeUnit } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';
import { spaceUnitGroups, spaceUnits } from './rentals';

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

    // ---- Parte 12: unidade, forma e horário exato ----
    /** Contínuo (mensal, sem data para terminar) ou temporário (horas/dias/semanas). */
    kind: rentalKind('kind').notNull().default('continuous'),
    /** Grupo escolhido pelo locatário (do mesmo anúncio — chave composta). */
    groupId: uuid('group_id'),
    /**
     * Unidade ocupada. NULL só enquanto é uma solicitação de aluguel
     * contínuo: a unidade é escolhida pelo servidor no aceite.
     */
    unitId: uuid('unit_id'),
    /** Início exato. Contínuo: meia-noite (Brasília) de `start_date`. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** Fim exato (temporário). Contínuo: NULL. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /**
     * Até quando a unidade fica protegida: fim + 7 min de janela de
     * renovação (quando o grupo aceita renovar). NULL = sem fim (contínuo).
     * É este intervalo que a restrição `bookings_unit_no_overlap` compara.
     */
    occupiedUntil: timestamp('occupied_until', { withTimezone: true }),
    /** Temporário: quanto foi comprado (ex.: 2 'hour'). */
    durationUnits: integer('duration_units'),
    durationUnit: rentalTimeUnit('duration_unit'),
    /** Cópia da regra do grupo na hora da reserva: esta reserva pode ser renovada. */
    renewalAllowed: boolean('renewal_allowed').notNull().default(false),
    /** Reserva que esta renova (a renovação começa onde a anterior termina). */
    renewedFromId: uuid('renewed_from_id').references((): AnyPgColumn => bookings.id, { onDelete: 'set null' }),
    /** Temporário aguardando pagamento: a unidade fica segura até aqui. */
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    /** Contínuo com pagamento pendente: quando a 1ª janela (40 min) começou. */
    paymentIssueStartedAt: timestamp('payment_issue_started_at', { withTimezone: true }),
    /** Fim do prazo total (40 min + 1 h). Passou disso sem pagamento: encerra. */
    paymentIssueDeadlineAt: timestamp('payment_issue_deadline_at', { withTimezone: true }),
    /** Por que terminou (`ended`/`expired`). NULL nos encerrados antes da Parte 12. */
    endReason: bookingEndReason('end_reason'),
    /** Chave do formulário: o mesmo envio repetido (duplo clique) devolve a mesma reserva. */
    idempotencyKey: text('idempotency_key'),

    /**
     * Dia do início (Brasília). No temporário, `start_date`/`end_date` são os
     * dias que a reserva toca (fim exclusivo) — é o que o calendário de
     * bloqueios compara.
     */
    startDate: date('start_date').notNull(),
    /** NULL = contrato por prazo indeterminado, renovando mes a mes. */
    endDate: date('end_date'),

    // ---- Valores congelados no aceite (centavos) ----
    /**
     * Valor do aluguel de UMA cobrança: no contínuo, o mês; no temporário,
     * o período inteiro comprado (ex.: 3 horas). O nome ficou do tempo em
     * que só existia aluguel mensal — renomear mexeria em dezenas de
     * consultas sem mudar nada no que é gravado.
     */
    monthlyRentCents: integer('monthly_rent_cents').notNull(),
    renterFeeBps: integer('renter_fee_bps').notNull(),
    ownerFeeBps: integer('owner_fee_bps').notNull(),
    renterFeeCents: integer('renter_fee_cents').notNull(),
    ownerFeeCents: integer('owner_fee_cents').notNull(),
    totalChargedCents: integer('total_charged_cents').notNull(),
    ownerPayoutCents: integer('owner_payout_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),

    /**
     * Caução (Fase 20), congelada no aceite como tudo aqui — 0 quando o
     * anúncio não exige (a maioria). Cobrada à parte, nunca somada no
     * aluguel recorrente: é dinheiro que volta, não receita. Ver
     * `booking_deposits` (src/db/schema/payments.ts) pro ciclo de vida da
     * cobrança e da devolução em si.
     */
    depositCents: integer('deposit_cents').notNull().default(0),

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
    check('bookings_deposit_non_negative', sql`${t.depositCents} >= 0`),

    /*
     * Parte 12: "uma locação vigente por espaço" deu lugar a "nenhuma
     * sobreposição por UNIDADE" — restrição de exclusão
     * `bookings_unit_no_overlap` (migração 0032; o Drizzle não descreve
     * EXCLUDE). Junto dela, na mesma migração, os CHECKs que dependem do
     * preenchimento dos dados antigos: forma do temporário, unidade e início
     * obrigatórios em reserva que ocupa, prazo do pagamento pendente.
     */
    foreignKey({
      name: 'bookings_group_same_space_fk',
      columns: [t.spaceId, t.groupId],
      foreignColumns: [spaceUnitGroups.spaceId, spaceUnitGroups.id],
    }),
    foreignKey({
      name: 'bookings_unit_same_group_fk',
      columns: [t.groupId, t.unitId],
      foreignColumns: [spaceUnits.groupId, spaceUnits.id],
    }),
    index('bookings_unit_status_idx').on(t.unitId, t.status),
    index('bookings_group_idx').on(t.groupId),
    index('bookings_hold_expires_idx').on(t.holdExpiresAt).where(sql`status = 'awaiting_payment'`),
    index('bookings_payment_deadline_idx').on(t.paymentIssueDeadlineAt).where(sql`status = 'past_due'`),
    index('bookings_temporary_ending_idx').on(t.occupiedUntil).where(sql`kind = 'temporary' AND status = 'active'`),
    uniqueIndex('bookings_renter_idempotency_key').on(t.renterId, t.idempotencyKey).where(sql`idempotency_key IS NOT NULL`),
    /** No máximo UMA renovação viva por reserva (duas abas renovando ao mesmo tempo: só uma passa). */
    uniqueIndex('bookings_one_live_renewal')
      .on(t.renewedFromId)
      .where(sql`renewed_from_id IS NOT NULL AND status IN ('approved','awaiting_payment','active','past_due')`),
  ],
);

export const bookingsRelations = relations(bookings, ({ one }) => ({
  space: one(spaces, { fields: [bookings.spaceId], references: [spaces.id] }),
  group: one(spaceUnitGroups, { fields: [bookings.groupId], references: [spaceUnitGroups.id] }),
  unit: one(spaceUnits, { fields: [bookings.unitId], references: [spaceUnits.id] }),
  renter: one(profiles, { fields: [bookings.renterId], references: [profiles.id] }),
  owner: one(profiles, { fields: [bookings.ownerId], references: [profiles.id] }),
}));

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
import { bookingEndReason, bookingEndRequestStatus, bookingStatus } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';

/**
 * Locação mensal de UMA unidade de um anúncio.
 *
 * TODOS os valores monetarios sao calculados NO SERVIDOR e congelados aqui no
 * momento da aprovacao. O navegador nunca envia preco: envia apenas o id do
 * espaco e a data de inicio. Se a plataforma mudar a taxa amanha, contratos
 * vigentes seguem com a taxa que foi acordada, porque ficou gravada nesta linha.
 *
 * Relacao das contas (tudo em centavos, inteiro):
 *   monthlyRentCents   = preco mensal do anuncio, definido pelo proprietario
 *   renterFeeCents     = round(monthlyRent * renterFeeBps / 10000)
 *   ownerFeeCents      = round(monthlyRent * ownerFeeBps  / 10000)
 *   totalChargedCents  = monthlyRent + renterFee     <- o locatario paga
 *   ownerPayoutCents   = monthlyRent - ownerFee      <- o proprietario recebe
 *   receita bruta da plataforma = renterFee + ownerFee
 *
 * A tarifa do gateway sai ANTES do split e e absorvida pela plataforma
 * (ver docs/PAGAMENTOS.md — isso reduz a margem liquida real).
 *
 * Disponibilidade: um anúncio tem `quantity_offered` vagas na plataforma e
 * cada reserva que ocupa (approved, awaiting_payment, active, past_due) usa
 * uma. Quem garante que a última vaga não é vendida duas vezes é o banco —
 * trigger `bookings_guard_capacity` (migração 0033), que trava a linha do
 * anúncio antes de contar. Nenhuma unidade física é identificada aqui: a
 * organização física (a vaga B17, a pilastra da esquerda…) é do proprietário
 * e vai nas instruções de acesso.
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

    /** Chave do formulário: o mesmo envio repetido (duplo clique) devolve a mesma reserva. */
    idempotencyKey: text('idempotency_key'),

    /** Dia do início da locação (Brasília). A cobrança mensal renova neste mesmo dia. */
    startDate: date('start_date').notNull(),
    /** NULL = contrato por prazo indeterminado, renovando mes a mes. */
    endDate: date('end_date'),

    // ---- Prazos (relógio do BANCO, nunca do navegador) ----
    /**
     * Até quando o proprietário pode aceitar ou recusar o pedido: 24 h depois
     * de pedido (`booking.request_expiry_hours`). Preenchido por trigger.
     * Passou disso sem resposta: o pedido vira `expired`.
     */
    responseDeadlineAt: timestamp('response_deadline_at', { withTimezone: true }),
    /**
     * Até quando o locatário pode pagar a locação aceita: 24 h depois do
     * aceite (`booking.payment_deadline_hours`). Preenchido por trigger no
     * aceite. Passou disso sem pagamento: vira `expired` e a vaga volta.
     */
    firstPaymentDeadlineAt: timestamp('first_payment_deadline_at', { withTimezone: true }),
    /** Mensalidade que falhou: quando a janela de regularização abriu. */
    paymentIssueStartedAt: timestamp('payment_issue_started_at', { withTimezone: true }),
    /** Fim da janela TOTAL de 2 h. Passou disso sem pagamento: a locação encerra. */
    paymentIssueDeadlineAt: timestamp('payment_issue_deadline_at', { withTimezone: true }),

    /** Por que terminou (`ended`/`expired`/`cancelled`). */
    endReason: bookingEndReason('end_reason'),

    // ---- Valores congelados no aceite (centavos) ----
    /** Valor de UMA mensalidade (preço mensal do anúncio no momento do pedido/aceite). */
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

    // ---- Como chegar e usar o espaço (preenchido pelo proprietário no aceite) ----
    /**
     * Instruções de acesso ("sua vaga fica ao lado da pilastra…"). O aceite
     * exige TEXTO ou ÁUDIO — trigger `bookings_guard_approval` no banco. Só o
     * locatário e o proprietário da reserva leem isto.
     */
    accessInstructions: text('access_instructions'),
    /** Áudio das instruções (bucket privado `chat-audio`, pasta da conversa). */
    accessAudioPath: text('access_audio_path'),
    accessAudioDurationMs: integer('access_audio_duration_ms'),
    accessAudioMime: text('access_audio_mime'),
    accessInstructionsAt: timestamp('access_instructions_at', { withTimezone: true }),

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

    /** Contagem de vagas ocupadas por anúncio (a trava de capacidade usa isto). */
    index('bookings_space_occupying_idx')
      .on(t.spaceId)
      .where(sql`status IN ('approved','awaiting_payment','active','past_due')`),
    /** Varreduras de prazo: pedido sem resposta, aceite sem pagamento, janela de 2 h. */
    index('bookings_response_deadline_idx').on(t.responseDeadlineAt).where(sql`status = 'requested'`),
    index('bookings_first_payment_deadline_idx')
      .on(t.firstPaymentDeadlineAt)
      .where(sql`status IN ('approved','awaiting_payment')`),
    index('bookings_payment_deadline_idx').on(t.paymentIssueDeadlineAt).where(sql`status = 'past_due'`),
    uniqueIndex('bookings_renter_idempotency_key')
      .on(t.renterId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    /**
     * Um pedido pendente por pessoa e anúncio: o duplo clique não cria dois.
     * Que ela não tenha OUTRA locação viva do mesmo anúncio quem confere é a
     * trava `bookings_guard_single_live` (migração 0033), no INSERT.
     */
    uniqueIndex('bookings_one_pending_per_renter_space')
      .on(t.spaceId, t.renterId)
      .where(sql`status = 'requested'`),

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
    check(
      'bookings_access_instructions_length',
      sql`${t.accessInstructions} IS NULL OR char_length(btrim(${t.accessInstructions})) BETWEEN 10 AND 1000`,
    ),
    /** O áudio das instruções anda junto com a duração e o tipo (1 s a 3 min). */
    check(
      'bookings_access_audio_shape',
      sql`(${t.accessAudioPath} IS NULL AND ${t.accessAudioDurationMs} IS NULL AND ${t.accessAudioMime} IS NULL)
          OR (${t.accessAudioPath} IS NOT NULL AND ${t.accessAudioDurationMs} BETWEEN 1000 AND 180000
              AND ${t.accessAudioMime} IS NOT NULL)`,
    ),

    /**
     * Pagamento pendente: só em `past_due`, e sempre com o prazo fixo de 2 h
     * (120 min) a partir do início da falha. Fora dele os campos ficam vazios —
     * só a locação encerrada guarda a última janela, como histórico.
     */
    check(
      'bookings_payment_window',
      sql`(${t.status} = 'past_due'
            AND ${t.paymentIssueStartedAt} IS NOT NULL
            AND ${t.paymentIssueDeadlineAt} = ${t.paymentIssueStartedAt} + interval '120 minutes')
          OR (${t.status} <> 'past_due' AND ${t.paymentIssueStartedAt} IS NULL AND ${t.paymentIssueDeadlineAt} IS NULL)
          OR (${t.status} = 'ended' AND ${t.paymentIssueStartedAt} IS NOT NULL AND ${t.paymentIssueDeadlineAt} > ${t.paymentIssueStartedAt})`,
    ),
    check(
      'bookings_end_reason_matches',
      sql`${t.endReason} IS NULL OR ${t.status}::text IN ('ended', 'expired', 'cancelled')`,
    ),

    /*
     * Regras que o Drizzle não descreve vivem na migração 0033, em triggers:
     * `bookings_guard_capacity` (última vaga), `bookings_guard_price` (preço =
     * preço do anúncio), `bookings_guard_approval` (instruções de acesso e
     * prazo de pagamento no aceite) e `bookings_set_deadlines` (prazo de
     * resposta de 24 h no pedido).
     */
  ],
);

/**
 * Pedido do proprietário para encerrar uma locação em andamento.
 *
 * O proprietário NÃO apaga o anúncio nem a locação: registra o pedido, com a
 * data e (se quiser) o motivo, e o locatário é avisado. Quando a data chega,
 * a manutenção do banco (`release_expired_rentals`) encerra a locação. O
 * histórico fica: pedidos retirados ou cumpridos continuam aqui.
 *
 * Regras de multa e aviso prévio NÃO estão definidas: o prazo mínimo vem de
 * `rental.end_request_min_notice_days` (hoje 0) e é conferido por trigger,
 * para a regra poder mudar sem deploy quando for decidida.
 */
export const bookingEndRequests = pgTable(
  'booking_end_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** Dia (Brasília) em que o proprietário quer a locação encerrada. */
    requestedEndDate: date('requested_end_date').notNull(),
    reason: text('reason'),
    status: bookingEndRequestStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('booking_end_requests_booking_idx').on(t.bookingId, t.createdAt),
    /** No máximo UM pedido pendente por locação. */
    uniqueIndex('booking_end_requests_one_pending')
      .on(t.bookingId)
      .where(sql`status = 'pending'`),
    /** A fila da manutenção: pedidos pendentes por data. */
    index('booking_end_requests_due_idx').on(t.requestedEndDate).where(sql`status = 'pending'`),
    check('booking_end_requests_reason_max', sql`${t.reason} IS NULL OR char_length(${t.reason}) <= 500`),
    check('booking_end_requests_resolved_matches', sql`(${t.status} = 'pending') = (${t.resolvedAt} IS NULL)`),
  ],
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  space: one(spaces, { fields: [bookings.spaceId], references: [spaces.id] }),
  renter: one(profiles, { fields: [bookings.renterId], references: [profiles.id] }),
  owner: one(profiles, { fields: [bookings.ownerId], references: [profiles.id] }),
  endRequests: many(bookingEndRequests),
}));

export const bookingEndRequestsRelations = relations(bookingEndRequests, ({ one }) => ({
  booking: one(bookings, { fields: [bookingEndRequests.bookingId], references: [bookings.id] }),
  requester: one(profiles, { fields: [bookingEndRequests.requestedBy], references: [profiles.id] }),
}));

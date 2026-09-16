import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { reviewKind, reportReason, reportStatus, reportTarget, reportSeverity } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';
import { messages } from './messaging';
import { bookings } from './bookings';

/**
 * Avaliacao apos uma locacao concluida.
 *
 * Duas regras impedem avaliacao falsa, e ambas vivem no BANCO, nao so no codigo:
 * 1. Toda avaliacao exige um `bookingId` real — sem locacao, nao ha avaliacao.
 * 2. UNIQUE(booking, autor, tipo) — uma avaliacao por parte, por locacao.
 * Uma trigger ainda valida que a reserva esta encerrada e que o autor participou dela.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    kind: reviewKind('kind').notNull(),

    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** Preenchido quando kind = renter_to_space. */
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    /** Preenchido quando kind = owner_to_renter. */
    targetUserId: uuid('target_user_id').references(() => profiles.id, { onDelete: 'cascade' }),

    rating: integer('rating').notNull(),
    comment: text('comment'),

    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reviews_booking_author_kind_key').on(t.bookingId, t.authorId, t.kind),
    index('reviews_space_idx').on(t.spaceId),
    index('reviews_target_user_idx').on(t.targetUserId),
    check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
    check('reviews_comment_max', sql`${t.comment} IS NULL OR length(${t.comment}) <= 2000`),
    /** O alvo tem que bater com o tipo da avaliacao. */
    check(
      'reviews_target_matches_kind',
      sql`(${t.kind} = 'renter_to_space' AND ${t.spaceId} IS NOT NULL AND ${t.targetUserId} IS NULL)
          OR (${t.kind} = 'owner_to_renter' AND ${t.targetUserId} IS NOT NULL AND ${t.spaceId} IS NULL)`,
    ),
  ],
);

/**
 * Denuncia.
 *
 * Um registro serve aos tres alvos — anuncio, usuario e mensagem — porque a
 * fila de moderacao e uma so, e o moderador precisa ver o caso inteiro junto.
 * Tabelas separadas por alvo espalhariam a mesma decisao em tres lugares.
 *
 * `targetType` diz qual coluna de alvo esta preenchida, e um CHECK garante que
 * exatamente uma esteja — sem isso, uma denuncia poderia ficar apontando para
 * lugar nenhum ou para dois alvos ao mesmo tempo.
 *
 * `severity` e calculada no servidor a partir do motivo, nunca informada por
 * quem denuncia. Caso contrario todo mundo marcaria "critico".
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    targetType: reportTarget('target_type').notNull(),

    /** Preenchido quando targetType = 'space'. */
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    /** Preenchido quando targetType = 'user'. */
    targetUserId: uuid('target_user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    /** Preenchido quando targetType = 'message'. */
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),

    /** NULL = denuncia de visitante sem conta. */
    reporterId: uuid('reporter_id').references(() => profiles.id, { onDelete: 'set null' }),

    reason: reportReason('reason').notNull(),
    severity: reportSeverity('severity').notNull().default('normal'),
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),

    /**
     * Copia do conteudo denunciado no momento da denuncia.
     * Se o autor editar ou apagar depois, o moderador ainda ve o que motivou
     * a denuncia — que e justamente o que costuma sumir.
     */
    evidenceSnapshot: jsonb('evidence_snapshot').$type<Record<string, unknown>>(),

    resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    /** true = a denuncia procedia. Alimenta a contagem de reincidencia. */
    upheld: boolean('upheld'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_space_idx').on(t.spaceId),
    index('reports_target_user_idx').on(t.targetUserId),
    index('reports_message_idx').on(t.messageId),
    index('reports_reporter_idx').on(t.reporterId),
    /** A fila do moderador: abertas primeiro, mais graves no topo. */
    index('reports_queue_idx')
      .on(t.status, t.severity, t.createdAt)
      .where(sql`status IN ('open','reviewing')`),

    /** Exatamente um alvo, coerente com targetType. */
    check(
      'reports_target_matches_type',
      sql`(${t.targetType} = 'space'   AND ${t.spaceId} IS NOT NULL AND ${t.targetUserId} IS NULL AND ${t.messageId} IS NULL)
          OR (${t.targetType} = 'user'    AND ${t.targetUserId} IS NOT NULL AND ${t.spaceId} IS NULL AND ${t.messageId} IS NULL)
          OR (${t.targetType} = 'message' AND ${t.messageId} IS NOT NULL AND ${t.spaceId} IS NULL AND ${t.targetUserId} IS NULL)`,
    ),
    /** Ninguem denuncia a si mesmo — isso so poluiria a fila. */
    check(
      'reports_no_self_report',
      sql`${t.targetUserId} IS NULL OR ${t.reporterId} IS NULL OR ${t.targetUserId} <> ${t.reporterId}`,
    ),
    check(
      'reports_details_max',
      sql`${t.details} IS NULL OR length(${t.details}) <= 2000`,
    ),
    /**
     * Um usuario logado nao abre varias denuncias em aberto do mesmo alvo.
     * COALESCE funciona porque o CHECK acima garante que so uma coluna de
     * alvo esta preenchida.
     */
    uniqueIndex('reports_one_open_per_target')
      .on(t.reporterId, t.targetType, sql`COALESCE(space_id, target_user_id, message_id)`)
      .where(sql`status IN ('open','reviewing') AND reporter_id IS NOT NULL`),
  ],
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  booking: one(bookings, { fields: [reviews.bookingId], references: [bookings.id] }),
  author: one(profiles, { fields: [reviews.authorId], references: [profiles.id] }),
  space: one(spaces, { fields: [reviews.spaceId], references: [spaces.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  space: one(spaces, { fields: [reports.spaceId], references: [spaces.id] }),
  targetUser: one(profiles, { fields: [reports.targetUserId], references: [profiles.id] }),
  message: one(messages, { fields: [reports.messageId], references: [messages.id] }),
  reporter: one(profiles, { fields: [reports.reporterId], references: [profiles.id] }),
}));

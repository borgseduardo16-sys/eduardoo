import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { reviewKind, reportReason, reportStatus } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';
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

/** Denuncia de anuncio. Vai para a fila do painel administrativo. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    /** NULL = denuncia de visitante sem conta. */
    reporterId: uuid('reporter_id').references(() => profiles.id, { onDelete: 'set null' }),

    reason: reportReason('reason').notNull(),
    details: text('details'),
    status: reportStatus('status').notNull().default('open'),

    resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_space_idx').on(t.spaceId),
    index('reports_status_idx').on(t.status, t.createdAt),
    /** Um usuario logado nao abre denuncias repetidas do mesmo anuncio em aberto. */
    uniqueIndex('reports_one_open_per_reporter')
      .on(t.spaceId, t.reporterId)
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
  reporter: one(profiles, { fields: [reports.reporterId], references: [profiles.id] }),
}));

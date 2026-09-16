import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
  boolean,
  inet,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { notificationType } from './enums';
import { profiles } from './users';

/** Notificacao in-app. Email/push leem desta mesma fila. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    type: notificationType('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** Para onde a notificacao leva ao ser clicada. */
    linkPath: text('link_path'),
    data: jsonb('data').$type<Record<string, unknown>>(),

    readAt: timestamp('read_at', { withTimezone: true }),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
  ],
);

/**
 * Trilha de auditoria.
 *
 * Toda acao sensivel (admin bloqueando conta, remocao de anuncio, mudanca de
 * taxa, alteracao de dados de recebimento) grava aqui. Append-only.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL = acao do proprio sistema (job, webhook). */
    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),

    /** Ex: 'space.removed', 'user.suspended', 'settings.fees_changed'. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),

    /** Antes/depois do que mudou, sem dado sensivel. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    ip: inet('ip'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_action_idx').on(t.action, t.createdAt),
  ],
);

/**
 * Configuracao da plataforma em runtime.
 *
 * As taxas moram AQUI, e nao em constante de codigo, por dois motivos:
 * mudar taxa nao pode exigir deploy, e cada mudanca fica auditavel.
 * O valor vigente e copiado para a reserva no aceite (ver bookings).
 */
export const platformSettings = pgTable(
  'platform_settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description'),
    /** true = pode ser lido pelo cliente (ex.: taxa exibida no resumo). */
    isPublic: boolean('is_public').notNull().default(false),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, { fields: [notifications.userId], references: [profiles.id] }),
}));

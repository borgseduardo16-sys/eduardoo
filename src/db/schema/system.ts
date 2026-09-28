import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  jsonb,
  boolean,
  inet,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { notificationType, notificationCategory } from './enums';
import { profiles } from './users';

/**
 * Preferencia de notificacao por categoria (Fase 21).
 *
 * Sem linha = tudo ligado (padrao), entao nao precisa de preenchimento para
 * quem ja existe. So se grava quando a pessoa muda algo.
 *
 * Categorias essenciais (reservas, pagamentos, conta) nao podem ser
 * desligadas nem por um INSERT direto: o CHECK garante — desligar aviso de
 * pagamento recusado so prejudicaria quem desligou.
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    category: notificationCategory('category').notNull(),
    /** Aparece na central (sino). */
    inApp: boolean('in_app').notNull().default(true),
    /** Aviso no celular (Web Push), quando a pessoa ativou push. */
    push: boolean('push').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.category] }),
    check(
      'notification_preferences_essential_locked',
      sql`${t.category} NOT IN ('reservas', 'pagamentos', 'conta') OR (${t.inApp} AND ${t.push})`,
    ),
  ],
);

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

    /**
     * Chave de idempotencia (Fase 21), opcional. O mesmo evento processado
     * duas vezes — webhook reenviado, cron rodando de novo, clique duplo —
     * gera a mesma chave, e o indice unico abaixo faz o segundo INSERT virar
     * nada (`ON CONFLICT DO NOTHING`), sem notificacao nem push duplicados.
     * Ex.: `promotion_expiring:<promotionId>`, `review_available:<bookingId>`.
     */
    dedupeKey: text('dedupe_key'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_user_dedupe_key')
      .on(t.userId, t.dedupeKey)
      .where(sql`dedupe_key IS NOT NULL`),
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

/**
 * Inscrição de notificação push do navegador (Fase 19).
 *
 * Uma pessoa pode ter várias — celular, computador — por isso não é uma
 * coluna em `profiles`. `endpoint` é o identificador único que o próprio
 * navegador gera por inscrição (URL do serviço de push do
 * Google/Mozilla/Apple); `p256dh`/`auth` são as chaves de criptografia
 * exigidas pelo protocolo Web Push pra cifrar o conteúdo — não são segredo
 * nosso, pertencem ao navegador da pessoa, mas identificam o dispositivo.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),

    /** Só pra diagnóstico ("suas notificações estão ativas no Chrome, Windows"). */
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_key').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
);

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(profiles, { fields: [pushSubscriptions.userId], references: [profiles.id] }),
}));

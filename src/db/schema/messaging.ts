import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { messageKind } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';
import { bookings } from './bookings';

/**
 * Conversa entre um interessado e o proprietario, sempre no contexto de um anuncio.
 * Unica por (espaco, interessado) — reabrir o chat cai na mesma thread.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    renterId: uuid('renter_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Preenchido quando a conversa vira reserva. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),

    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    /** Bloqueada por denuncia ou por encerramento da locacao. */
    closedAt: timestamp('closed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_space_renter_key').on(t.spaceId, t.renterId),
    index('conversations_owner_idx').on(t.ownerId, t.lastMessageAt),
    index('conversations_renter_idx').on(t.renterId, t.lastMessageAt),
    check('conversations_distinct_parties', sql`${t.renterId} <> ${t.ownerId}`),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** Tipo da mensagem. Só texto e áudio — o chat não aceita imagem. */
    kind: messageKind('kind').notNull().default('text'),
    /** Texto da mensagem. Vazio nas mensagens de áudio. */
    body: text('body').notNull().default(''),
    /**
     * Áudio (kind = 'audio'): caminho no bucket privado `chat-audio`, sempre
     * `<id da conversa>/<uuid>.<ext>`. Nunca uma URL: a URL assinada, de
     * validade curta, é gerada no servidor para quem participa da conversa.
     */
    audioPath: text('audio_path'),
    audioDurationMs: integer('audio_duration_ms'),
    audioMime: text('audio_mime'),
    readAt: timestamp('read_at', { withTimezone: true }),

    /** Mensagem escondida por moderacao — o conteudo fica para auditoria. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),

    /**
     * Sinalizada automaticamente pelo detector de dados de contato
     * (src/lib/safety/contact-detection.ts). Sinalizar NAO esconde a mensagem:
     * serve para avisar quem esta conversando e para alimentar a fila de
     * moderacao. Bloquear toda troca de contato quebraria conversas legitimas.
     */
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    /** Ex: 'contato:telefone,email' — o que o detector encontrou. */
    flagReason: text('flag_reason'),
    /** Sinaliza que a mensagem foi gerada pelo sistema (ex.: "reserva aprovada"). */
    isSystem: boolean('is_system').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_sender_idx').on(t.senderId),
    /** Fila de revisao das mensagens sinalizadas e ainda visiveis. */
    index('messages_flagged_idx')
      .on(t.flaggedAt)
      .where(sql`flagged_at IS NOT NULL AND hidden_at IS NULL`),
    /** Texto precisa de conteúdo; áudio não tem texto. */
    check('messages_body_not_empty', sql`${t.kind}::text = 'audio' OR length(trim(${t.body})) > 0`),
    check('messages_body_max', sql`length(${t.body}) <= 4000`),
    /** Os campos de áudio andam juntos e só existem em mensagem de áudio. */
    check(
      'messages_audio_shape',
      sql`(${t.kind}::text = 'text' AND ${t.audioPath} IS NULL AND ${t.audioDurationMs} IS NULL AND ${t.audioMime} IS NULL)
          OR (${t.kind}::text = 'audio' AND ${t.audioPath} IS NOT NULL AND ${t.audioDurationMs} BETWEEN 1000 AND 180000
              AND ${t.audioMime} IS NOT NULL AND ${t.body} = '')`,
    ),
    /** O arquivo de áudio mora na pasta da própria conversa. */
    check(
      'messages_audio_path_in_conversation',
      sql`${t.audioPath} IS NULL OR ${t.audioPath} LIKE (${t.conversationId}::text || '/%')`,
    ),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  space: one(spaces, { fields: [conversations.spaceId], references: [spaces.id] }),
  renter: one(profiles, { fields: [conversations.renterId], references: [profiles.id] }),
  owner: one(profiles, { fields: [conversations.ownerId], references: [profiles.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(profiles, { fields: [messages.senderId], references: [profiles.id] }),
}));

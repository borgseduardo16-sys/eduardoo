import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
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

    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),

    /** Mensagem escondida por moderacao — o conteudo fica para auditoria. */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),
    /** Sinaliza que a mensagem foi gerada pelo sistema (ex.: "reserva aprovada"). */
    isSystem: boolean('is_system').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_sender_idx').on(t.senderId),
    check('messages_body_not_empty', sql`length(trim(${t.body})) > 0`),
    check('messages_body_max', sql`length(${t.body}) <= 4000`),
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

import 'server-only';
import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { conversations, messages, profiles, spaces } from '@/db/schema';

/** Conversa entre este espaço e este locatário, se existir. Não cria. */
export async function findConversation(spaceId: string, renterId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.spaceId, spaceId), eq(conversations.renterId, renterId)))
    .limit(1);
  return row ?? null;
}

/**
 * Acha a conversa do par (espaço, locatário) ou cria uma nova — devolve
 * sempre o id. Uso interno: NÃO valida quem pode iniciar conversa (espaço
 * publicado, bloqueio entre as partes). Quem chama decide isso antes:
 * `startConversationAction` checa explicitamente; o fluxo de reserva
 * (`src/lib/messaging/system.ts`) confia que a própria reserva já provou
 * que as partes não estão bloqueadas (trigger `bookings_guard_block`) — e,
 * mesmo assim, a criação continua protegida pelo trigger
 * `conversations_guard_block` no banco.
 */
export async function getOrCreateConversation(
  spaceId: string,
  renterId: string,
  ownerId: string,
): Promise<string> {
  const existente = await findConversation(spaceId, renterId);
  if (existente) return existente.id;

  const [nova] = await db
    .insert(conversations)
    .values({ spaceId, renterId, ownerId })
    .onConflictDoNothing({ target: [conversations.spaceId, conversations.renterId] })
    .returning({ id: conversations.id });
  if (nova) return nova.id;

  // Corrida: outra chamada criou entre o SELECT e o INSERT acima.
  const criadaPelaOutra = await findConversation(spaceId, renterId);
  if (criadaPelaOutra) return criadaPelaOutra.id;

  throw new Error('Não foi possível criar a conversa.');
}

/**
 * Inbox: todas as conversas de um usuário (como locatário OU proprietário),
 * mais recentes primeiro, com prévia da última mensagem e contagem de não lidas.
 */
export async function listConversations(userId: string) {
  return db
    .select({
      id: conversations.id,
      spaceId: conversations.spaceId,
      spaceTitle: spaces.title,
      spaceSlug: spaces.slug,
      renterId: conversations.renterId,
      ownerId: conversations.ownerId,
      lastMessageAt: conversations.lastMessageAt,
      closedAt: conversations.closedAt,
      outraParteNome: sql<string | null>`
        (SELECT full_name FROM profiles WHERE id =
          CASE WHEN ${conversations.renterId} = ${userId} THEN ${conversations.ownerId} ELSE ${conversations.renterId} END)
      `,
      ultimaMensagem: sql<string | null>`
        (SELECT body FROM messages WHERE conversation_id = ${conversations.id}
         AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 1)
      `,
      naoLidas: sql<number>`
        (SELECT count(*)::int FROM messages WHERE conversation_id = ${conversations.id}
         AND sender_id <> ${userId} AND read_at IS NULL AND hidden_at IS NULL)
      `,
    })
    .from(conversations)
    .innerJoin(spaces, eq(spaces.id, conversations.spaceId))
    .where(or(eq(conversations.renterId, userId), eq(conversations.ownerId, userId)))
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`));
}

/** Uma conversa, com autorização: só quem participa (locatário ou dono) enxerga. */
export async function getConversationForUser(conversationId: string, userId: string) {
  const [row] = await db
    .select({
      id: conversations.id,
      spaceId: conversations.spaceId,
      spaceTitle: spaces.title,
      spaceSlug: spaces.slug,
      renterId: conversations.renterId,
      ownerId: conversations.ownerId,
      closedAt: conversations.closedAt,
    })
    .from(conversations)
    .innerJoin(spaces, eq(spaces.id, conversations.spaceId))
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.renterId, userId), eq(conversations.ownerId, userId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listMessages(conversationId: string) {
  return db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: profiles.fullName,
      body: messages.body,
      isSystem: messages.isSystem,
      hiddenAt: messages.hiddenAt,
      flaggedAt: messages.flaggedAt,
      createdAt: messages.createdAt,
      readAt: messages.readAt,
    })
    .from(messages)
    .innerJoin(profiles, eq(profiles.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function countUnreadConversations(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${messages.conversationId})::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        or(eq(conversations.renterId, userId), eq(conversations.ownerId, userId)),
        ne(messages.senderId, userId),
        isNull(messages.readAt),
        isNull(messages.hiddenAt),
      ),
    );
  return row?.n ?? 0;
}

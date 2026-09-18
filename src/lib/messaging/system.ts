import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { conversations, messages } from '@/db/schema';
import { getOrCreateConversation, findConversation } from './queries';
import { notifyNewMessage } from './notify';

export type PostBookingSystemMessageInput = {
  spaceId: string;
  renterId: string;
  ownerId: string;
  spaceTitle: string;
  /** Quem "disse" isto — o dono ao aceitar, quem cancelou ao cancelar. */
  actorId: string;
  /** Quem deve ser avisado por e-mail — a OUTRA parte, nunca quem agiu. */
  recipientId: string;
  body: string;
  /**
   * true (aceite): cria a conversa se ainda não existir — a partir de uma
   * reserva aceita, as duas partes quase sempre vão precisar combinar algo.
   * false (cancelamento): só publica se já existia conversa — não vale
   * abrir um canal novo só para anunciar que a reserva acabou.
   */
  createIfMissing: boolean;
};

/**
 * Publica uma mensagem de sistema (ex.: "reserva aceita") na conversa entre
 * locatário e proprietário de uma reserva.
 *
 * Best-effort de propósito: nunca deixa a ação de negócio que chamou isto
 * (aceitar ou cancelar reserva) falhar por causa disto. O caso real que
 * motiva isto: se as partes ficaram bloqueadas uma da outra DEPOIS da
 * reserva ter sido criada (bloqueio não cancela reserva em andamento), criar
 * a conversa esbarraria no trigger `conversations_guard_block` — a reserva
 * continua tendo que mudar de status mesmo assim.
 */
export async function postBookingSystemMessage(
  input: PostBookingSystemMessageInput,
): Promise<void> {
  try {
    let conversationId: string | null;
    if (input.createIfMissing) {
      conversationId = await getOrCreateConversation(input.spaceId, input.renterId, input.ownerId);
    } else {
      const existente = await findConversation(input.spaceId, input.renterId);
      conversationId = existente?.id ?? null;
    }
    if (!conversationId) return;

    await db.insert(messages).values({
      conversationId,
      senderId: input.actorId,
      body: input.body,
      isSystem: true,
    });
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await notifyNewMessage({
      recipientId: input.recipientId,
      conversationId,
      senderName: 'MyPlace',
      spaceTitle: input.spaceTitle,
      preview: input.body,
    });
  } catch (err) {
    console.error('[messaging] falha ao publicar mensagem de sistema da reserva:', err);
  }
}

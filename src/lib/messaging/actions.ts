'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { conversations, messages, spaces, notifications } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { isBlockedBetween } from '@/lib/safety/queries';
import { detectContactInfo, buildFlagReason } from '@/lib/safety/contact-detection';
import { startConversationSchema, sendMessageSchema } from './schemas';
import { findConversation, getConversationForUser } from './queries';

export type MessagingActionState = { ok: boolean; message?: string };

/**
 * Inicia (ou reabre) a conversa com o proprietario de um espaco.
 *
 * A checagem de bloqueio aqui e so pra dar uma mensagem amigavel — quem
 * garante de verdade e o trigger `conversations_guard_block` no banco (ver
 * drizzle/0003_seguranca_e_taxas.sql). Se este código sumisse, nada vazaria.
 */
export async function startConversationAction(
  _prev: MessagingActionState | undefined,
  formData: FormData,
): Promise<MessagingActionState> {
  const user = await requireUserOrThrow();

  const parsed = startConversationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: 'Espaço inválido.' };
  }
  const { spaceId } = parsed.data;

  const [espaco] = await db
    .select({ id: spaces.id, ownerId: spaces.ownerId, status: spaces.status })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  if (!espaco || espaco.status !== 'published') {
    return { ok: false, message: 'Este espaço não está disponível.' };
  }
  if (espaco.ownerId === user.id) {
    return { ok: false, message: 'Você não pode conversar sobre o próprio espaço.' };
  }
  if (await isBlockedBetween(user.id, espaco.ownerId)) {
    return { ok: false, message: 'Não é possível iniciar esta conversa.' };
  }

  const existente = await findConversation(spaceId, user.id);
  if (existente) {
    redirect(`/mensagens/${existente.id}`);
  }

  const [nova] = await db
    .insert(conversations)
    .values({ spaceId, renterId: user.id, ownerId: espaco.ownerId })
    .onConflictDoNothing({ target: [conversations.spaceId, conversations.renterId] })
    .returning({ id: conversations.id });

  if (!nova) {
    // corrida: duas abas criando ao mesmo tempo — a que perdeu so busca a que ganhou.
    const criadaPelaOutra = await findConversation(spaceId, user.id);
    if (criadaPelaOutra) redirect(`/mensagens/${criadaPelaOutra.id}`);
    return { ok: false, message: 'Não foi possível iniciar a conversa. Tente novamente.' };
  }

  revalidatePath('/mensagens');
  redirect(`/mensagens/${nova.id}`);
}

/**
 * Envia uma mensagem. Nunca esconde nem recusa por conteudo sinalizado — so
 * marca (`flagged_at`/`flag_reason`) pra fila de moderacao e avisa quem
 * mandou. Bloquear mensagem legitima ("minha garagem fica na rua X") so
 * empurraria golpe pra ofuscacao mais criativa (ver contact-detection.ts).
 */
export async function sendMessageAction(
  _prev: MessagingActionState | undefined,
  formData: FormData,
): Promise<MessagingActionState> {
  const user = await requireUserOrThrow();

  const parsed = sendMessageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { conversationId, body } = parsed.data;

  const conversa = await getConversationForUser(conversationId, user.id);
  if (!conversa) {
    return { ok: false, message: 'Conversa não encontrada.' };
  }
  if (conversa.closedAt) {
    return { ok: false, message: 'Esta conversa está encerrada.' };
  }

  const deteccao = detectContactInfo(body);
  const flagReason = buildFlagReason(deteccao);
  const destinatarioId = conversa.renterId === user.id ? conversa.ownerId : conversa.renterId;

  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      conversationId,
      senderId: user.id,
      body,
      flaggedAt: flagReason ? new Date() : null,
      flagReason,
    });
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
    await tx.insert(notifications).values({
      userId: destinatarioId,
      type: 'new_message',
      title: 'Nova mensagem',
      body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
      linkPath: `/mensagens/${conversationId}`,
      data: { conversationId },
    });
  });

  revalidatePath(`/mensagens/${conversationId}`);
  revalidatePath('/mensagens');
  return { ok: true };
}

/** Marca como lidas as mensagens que a outra parte mandou nesta conversa. */
export async function markConversationReadAction(conversationId: string) {
  const user = await requireUserOrThrow();
  const conversa = await getConversationForUser(conversationId, user.id);
  if (!conversa) return;

  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, user.id),
        isNull(messages.readAt),
      ),
    );
}

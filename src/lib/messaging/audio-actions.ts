'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, conversations, messages } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { insertNotification, flushPushJobs } from '@/lib/notifications/dispatch';
import { isBlockedBetween } from '@/lib/safety/queries';
import { rateLimit } from '@/lib/rate-limit';
import { getConversationForUser, getOrCreateConversation } from './queries';
import { notifyNewMessage } from './notify';
import {
  AUDIO_MAX_BYTES,
  AudioValidationError,
  validateAudioBytes,
} from './audio-format';
import { isPathInConversation, removeChatAudio, storeChatAudio } from './audio';

/**
 * Áudio no chat (texto e áudio; imagem NÃO existe aqui).
 *
 * O áudio passa pelo servidor: quem decide é o servidor, que confere a
 * participação na conversa, o tamanho, a duração e o FORMATO PELO CONTEÚDO
 * (primeiros bytes) antes de guardar qualquer coisa no bucket privado. O
 * arquivo vai para `<id da conversa>/<uuid>.<ext>` e só é servido por URL
 * assinada de validade curta, depois de conferir de novo quem está pedindo
 * (ver as rotas /api/mensagens/[id]/audio e /api/reservas/[id]/audio).
 *
 * Limite conhecido: o detector de dados de contato (telefone, e-mail, "pagar
 * por fora") só lê TEXTO. Áudio não é transcrito, então passa sem o aviso — a
 * denúncia de mensagem continua valendo para áudio.
 */

export type AudioActionState = { ok: boolean; message?: string };
export type AccessAudioState =
  | { ok: true; path: string; durationMs: number }
  | { ok: false; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerArquivo(formData: FormData): File | null {
  const f = formData.get('audio');
  return f instanceof File ? f : null;
}

/** Lê e valida o arquivo do formulário. Lança `AudioValidationError` com mensagem pronta. */
async function validarEnvio(formData: FormData) {
  const arquivo = lerArquivo(formData);
  if (!arquivo) throw new AudioValidationError('Nenhum áudio recebido. Grave de novo.');
  if (arquivo.size > AUDIO_MAX_BYTES) {
    throw new AudioValidationError('O áudio é grande demais. Grave um mais curto.');
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const duracao = Number(formData.get('durationMs'));
  return { bytes, ...validateAudioBytes(bytes, Math.round(duracao)) };
}

// ---------------------------------------------------------------------------
// Mensagem de áudio numa conversa
// ---------------------------------------------------------------------------

export async function sendAudioMessageAction(formData: FormData): Promise<AudioActionState> {
  const user = await requireUserOrThrow();

  const conversationId = String(formData.get('conversationId') ?? '');
  if (!UUID_RE.test(conversationId)) return { ok: false, message: 'Conversa inválida.' };

  const conversa = await getConversationForUser(conversationId, user.id);
  if (!conversa) return { ok: false, message: 'Conversa não encontrada.' };
  if (conversa.closedAt) return { ok: false, message: 'Esta conversa está encerrada.' };

  const destinatarioId = conversa.renterId === user.id ? conversa.ownerId : conversa.renterId;
  if (await isBlockedBetween(user.id, destinatarioId)) {
    return { ok: false, message: 'Não é possível enviar mensagem para esta pessoa.' };
  }

  const limite = await rateLimit(`audio:${user.id}`, { limit: 12, windowSeconds: 60 });
  if (!limite.allowed) return { ok: false, message: 'Muitos áudios em pouco tempo. Aguarde um instante.' };

  let path: string;
  let duracaoMs: number;
  let mime: string;
  try {
    const v = await validarEnvio(formData);
    duracaoMs = v.durationMs;
    mime = v.format.mime;
    path = await storeChatAudio(conversationId, v.bytes, v.format);
  } catch (err) {
    if (err instanceof AudioValidationError) return { ok: false, message: err.message };
    throw err;
  }

  let pushJob;
  try {
    pushJob = await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        conversationId,
        senderId: user.id,
        kind: 'audio',
        body: '',
        audioPath: path,
        audioDurationMs: duracaoMs,
        audioMime: mime,
      });
      await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
      return insertNotification(tx, {
        userId: destinatarioId,
        type: 'new_message',
        title: 'Nova mensagem',
        body: 'Enviou uma mensagem de áudio.',
        linkPath: `/mensagens/${conversationId}`,
        data: { conversationId },
      });
    });
  } catch (err) {
    // Sem a mensagem, o arquivo não tem a quem pertencer: não deixa órfão no bucket.
    await removeChatAudio([path]);
    throw err;
  }
  if (pushJob) await flushPushJobs([pushJob]);

  revalidatePath(`/mensagens/${conversationId}`);
  revalidatePath('/mensagens');

  await notifyNewMessage({
    recipientId: destinatarioId,
    conversationId,
    senderName: user.publicName ?? 'Alguém',
    spaceTitle: conversa.spaceTitle,
    preview: 'Enviou uma mensagem de áudio.',
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Áudio das instruções de acesso (gravado pelo proprietário ao aceitar)
// ---------------------------------------------------------------------------

/**
 * Envia o áudio das instruções de acesso de UM pedido que ainda espera
 * resposta. O arquivo vai para a pasta da conversa deste pedido; quem confere,
 * no aceite, que ele é dali (e que existe e é áudio) é `respondToBookingRequestAction`
 * e o gatilho `bookings_guard_approval` do banco. Regravar apaga o áudio anterior —
 * mas nunca um que já esteja numa mensagem ou numa locação.
 */
export async function uploadAccessAudioAction(formData: FormData): Promise<AccessAudioState> {
  const user = await requireUserOrThrow();

  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) return { ok: false, message: 'Solicitação inválida.' };

  const [pedido] = await db
    .select({ id: bookings.id, ownerId: bookings.ownerId, renterId: bookings.renterId, spaceId: bookings.spaceId, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!pedido || pedido.ownerId !== user.id) return { ok: false, message: 'Solicitação não encontrada.' };
  if (pedido.status !== 'requested') return { ok: false, message: 'Esta solicitação já foi respondida.' };
  if (await isBlockedBetween(user.id, pedido.renterId)) {
    return { ok: false, message: 'Não é possível enviar áudio para esta pessoa.' };
  }

  const limite = await rateLimit(`audio:${user.id}`, { limit: 12, windowSeconds: 60 });
  if (!limite.allowed) return { ok: false, message: 'Muitos áudios em pouco tempo. Aguarde um instante.' };

  // A conversa precisa existir para o áudio ter pasta: cria se ainda não houver.
  let conversationId: string;
  try {
    conversationId = await getOrCreateConversation(pedido.spaceId, pedido.renterId, pedido.ownerId);
  } catch {
    return { ok: false, message: 'Não foi possível preparar a conversa para o áudio. Tente de novo.' };
  }

  let path: string;
  let duracaoMs: number;
  try {
    const v = await validarEnvio(formData);
    duracaoMs = v.durationMs;
    path = await storeChatAudio(conversationId, v.bytes, v.format);
  } catch (err) {
    if (err instanceof AudioValidationError) return { ok: false, message: err.message };
    throw err;
  }

  // Regravou: o anterior some do bucket — se ninguém usa.
  const anterior = String(formData.get('previousPath') ?? '');
  if (anterior && anterior !== path && isPathInConversation(anterior, conversationId)) {
    const [usadoEmMensagem] = await db.select({ id: messages.id }).from(messages).where(eq(messages.audioPath, anterior)).limit(1);
    const [usadoEmLocacao] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.accessAudioPath, anterior)).limit(1);
    if (!usadoEmMensagem && !usadoEmLocacao) await removeChatAudio([anterior]);
  }

  return { ok: true, path, durationMs: duracaoMs };
}

/**
 * Descarta o áudio das instruções que o proprietário gravou e desistiu de usar
 * (apagou a gravação ou fechou o formulário). Só apaga arquivo que ninguém
 * usa — nunca um que já esteja numa mensagem ou numa locação — e só da
 * conversa de um pedido seu.
 */
export async function discardAccessAudioAction(formData: FormData): Promise<AudioActionState> {
  const user = await requireUserOrThrow();
  const bookingId = String(formData.get('bookingId') ?? '');
  const path = String(formData.get('path') ?? '');
  if (!UUID_RE.test(bookingId) || !path) return { ok: false, message: 'Pedido inválido.' };

  const [pedido] = await db
    .select({ ownerId: bookings.ownerId, renterId: bookings.renterId, spaceId: bookings.spaceId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!pedido || pedido.ownerId !== user.id) return { ok: false, message: 'Solicitação não encontrada.' };

  const [conversa] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.spaceId, pedido.spaceId), eq(conversations.renterId, pedido.renterId)))
    .limit(1);
  if (!conversa || !isPathInConversation(path, conversa.id)) return { ok: false, message: 'Áudio inválido.' };

  const [usadoEmMensagem] = await db.select({ id: messages.id }).from(messages).where(eq(messages.audioPath, path)).limit(1);
  const [usadoEmLocacao] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.accessAudioPath, path)).limit(1);
  if (usadoEmMensagem || usadoEmLocacao) return { ok: false, message: 'Este áudio já está em uso.' };

  await removeChatAudio([path]);
  return { ok: true };
}

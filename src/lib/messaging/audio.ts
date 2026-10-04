import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AUDIO_MAX_BYTES,
  AudioValidationError,
  CHAT_AUDIO_BUCKET,
  sniffAudioType,
  type AudioFormat,
} from './audio-format';

/**
 * Armazenamento do áudio (Supabase Storage, bucket PRIVADO `chat-audio`).
 *
 * Nada aqui decide QUEM pode ouvir ou enviar: isso é da camada que chama
 * (participante da conversa, confirmado na consulta). Aqui só se grava,
 * lê e assina — sempre pelo servidor, com a service role. O caminho é
 * `<id da conversa>/<uuid>.<ext>`: a primeira pasta é a conversa, e é isso
 * que as políticas do bucket (migração 0033) e o CHECK
 * `messages_audio_path_in_conversation` usam.
 */

export function buildChatAudioPath(conversationId: string, extension: string): string {
  return `${conversationId}/${crypto.randomUUID()}.${extension}`;
}

/** O caminho pertence à pasta desta conversa? (Defesa contra apontar para o áudio de outra.) */
export function isPathInConversation(path: string, conversationId: string): boolean {
  return (
    path.startsWith(`${conversationId}/`) &&
    !path.includes('..') &&
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|ogg|m4a|mp3)$/i.test(path)
  );
}

/** Grava o áudio já validado. Devolve o caminho; lança com mensagem pronta se o armazenamento falhar. */
export async function storeChatAudio(
  conversationId: string,
  bytes: Uint8Array,
  format: AudioFormat,
): Promise<string> {
  const path = buildChatAudioPath(conversationId, format.extension);
  const { error } = await createAdminClient()
    .storage.from(CHAT_AUDIO_BUCKET)
    .upload(path, bytes, {
      contentType: format.mime,
      // O caminho já tem um uuid: colisão seria bug nosso, não concorrência.
      upsert: false,
      cacheControl: '3600',
    });
  if (error) {
    if (error.message.toLowerCase().includes('bucket not found')) {
      throw new AudioValidationError(
        'O armazenamento de áudio ainda não está configurado. Crie o bucket "chat-audio" no painel do Supabase.',
      );
    }
    console.error('[áudio] upload falhou:', error.message);
    throw new AudioValidationError('Não foi possível enviar o áudio. Tente novamente.');
  }
  return path;
}

/** Lê o arquivo do bucket e revalida o conteúdo. `null` se não existe ou não é áudio aceito. */
export async function readChatAudio(
  path: string,
): Promise<{ bytes: Uint8Array; format: AudioFormat } | null> {
  const { data, error } = await createAdminClient().storage.from(CHAT_AUDIO_BUCKET).download(path);
  if (error || !data) return null;
  if (data.size > AUDIO_MAX_BYTES) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const format = sniffAudioType(bytes);
  return format ? { bytes, format } : null;
}

/** Apaga arquivos que não valem mais (regravação, envio que falhou). Melhor esforço. */
export async function removeChatAudio(paths: string[]): Promise<void> {
  const alvos = paths.filter(Boolean);
  if (alvos.length === 0) return;
  const { error } = await createAdminClient().storage.from(CHAT_AUDIO_BUCKET).remove(alvos);
  if (error) console.error('[áudio] arquivo órfão:', alvos.join(', '), error.message);
}

/**
 * URL assinada de validade curta. Quem chama já provou que a pessoa participa
 * da conversa: é por isso que a URL nasce aqui e nunca fica gravada.
 */
export async function signChatAudioUrl(path: string, ttlSeconds = 120): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .storage.from(CHAT_AUDIO_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error('[áudio] falha ao assinar URL:', error?.message);
    return null;
  }
  return data.signedUrl;
}

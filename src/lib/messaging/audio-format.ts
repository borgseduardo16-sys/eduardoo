/**
 * Validação de áudio do chat e das instruções de acesso — módulo PURO, sem
 * `server-only`: não toca em segredo, banco nem rede. Serve ao servidor (que
 * decide) e ao navegador (que só recusa cedo um arquivo grande demais).
 *
 * POR QUE POR CONTEÚDO E NÃO POR EXTENSÃO: o nome e o `Content-Type` do
 * arquivo vêm de quem envia. Os primeiros bytes são o formato de verdade —
 * mesma ideia da validação das fotos (src/lib/storage/images.ts).
 *
 * O chat aceita SÓ texto e áudio. Imagem não entra: o bucket `chat-audio` só
 * permite estes quatro tipos e este módulo só reconhece estes quatro.
 */

export const CHAT_AUDIO_BUCKET = 'chat-audio';

/** Mesmos limites do CHECK `messages_audio_shape` e `bookings_access_audio_shape`. */
export const AUDIO_MIN_MS = 1_000;
export const AUDIO_MAX_MS = 180_000;

/** Fala em qualidade de voz cabe em bem menos; o teto é folga para o formato do aparelho. */
export const AUDIO_MAX_BYTES = 3 * 1024 * 1024;
export const AUDIO_MIN_BYTES = 256;

export type AudioFormat = {
  mime: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg';
  extension: 'webm' | 'ogg' | 'm4a' | 'mp3';
};

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioValidationError';
  }
}

/** Descobre o formato lendo os primeiros bytes; `null` quando não é um dos quatro aceitos. */
export function sniffAudioType(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 12) return null;

  // WebM (contêiner Matroska): 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'audio/webm', extension: 'webm' };
  }
  // Ogg: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return { mime: 'audio/ogg', extension: 'ogg' };
  }
  // MP4/M4A (Safari grava assim): "ftyp" a partir do byte 4
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { mime: 'audio/mp4', extension: 'm4a' };
  }
  // MP3: marca "ID3" ou sincronismo de quadro (FF Ex / FF Fx)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return { mime: 'audio/mpeg', extension: 'mp3' };
  }
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return { mime: 'audio/mpeg', extension: 'mp3' };
  }
  return null;
}

/** Confere duração informada e conteúdo do arquivo. Lança `AudioValidationError` em pt-BR. */
export function validateAudioBytes(
  bytes: Uint8Array,
  durationMs: number,
): { format: AudioFormat; durationMs: number } {
  if (!Number.isFinite(durationMs) || !Number.isInteger(durationMs)) {
    throw new AudioValidationError('Duração do áudio inválida. Grave de novo.');
  }
  if (durationMs < AUDIO_MIN_MS) {
    throw new AudioValidationError('O áudio é curto demais. Grave pelo menos 1 segundo.');
  }
  if (durationMs > AUDIO_MAX_MS) {
    throw new AudioValidationError('O áudio passa de 3 minutos. Grave um mais curto.');
  }
  if (bytes.length < AUDIO_MIN_BYTES) {
    throw new AudioValidationError('O áudio veio vazio. Grave de novo.');
  }
  if (bytes.length > AUDIO_MAX_BYTES) {
    throw new AudioValidationError('O áudio é grande demais. Grave um mais curto.');
  }
  const format = sniffAudioType(bytes);
  if (!format) {
    throw new AudioValidationError('Formato de áudio não aceito. Grave pelo próprio aplicativo.');
  }
  return { format, durationMs };
}

/** "0:07", "2:35" — duração para mostrar no player. */
export function formatAudioDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

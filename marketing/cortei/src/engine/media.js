// Abre o vídeo do usuário sem carregar o arquivo inteiro na memória (lê só os pedaços necessários).
import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';

export class UserError extends Error {}

export async function openVideo(file) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let video;
  try { video = await input.getPrimaryVideoTrack(); } catch { throw new UserError('Não consegui ler esse arquivo. Tente um vídeo em MP4, MOV, WebM ou MKV.'); }
  if (!video) throw new UserError('Esse arquivo não tem vídeo.');
  if (!(await video.canDecode())) {
    throw new UserError(`Seu navegador não consegue abrir o formato desse vídeo (${video.codec || 'desconhecido'}). Tente pelo Google Chrome no computador ou converta o vídeo para MP4.`);
  }
  let audio = await input.getPrimaryAudioTrack();
  let audioNote = '';
  if (audio && !(await audio.canDecode())) { audio = null; audioNote = 'O áudio desse vídeo está num formato que o navegador não lê, então ele será tratado como vídeo sem som.'; }
  const t0 = Math.max(0, await input.getFirstTimestamp());
  const duration = await input.computeDuration();
  let fps = 30;
  try { const st = await video.computePacketStats(120); if (st.averagePacketRate > 1) fps = st.averagePacketRate; } catch { /* mantém 30 */ }
  return { file, input, video, audio, audioNote, t0, duration, span: duration - t0, width: video.displayWidth, height: video.displayHeight, fps };
}

export const fmtTime = (s) => {
  s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};

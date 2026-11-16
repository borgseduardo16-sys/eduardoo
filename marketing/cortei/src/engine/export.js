// Exportação: decodifica os pedaços do vídeo, desenha cada quadro com o compositor e codifica o MP4 no próprio aparelho.
import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSink, CanvasSource, AudioBufferSource, getFirstEncodableVideoCodec, canEncodeAudio } from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { Compositor, outputSize } from './compose.js';
import { mapTime } from './analyze.js';
import { SR } from './audio.js';

export const QUALITIES = {
  720: { nome: '720p', bitrate: 4.5e6 },
  1080: { nome: '1080p', bitrate: 9e6 },
  1440: { nome: '2K', bitrate: 16e6 },
};

let aacRegistered = false;
// escolhe o formato: MP4 com H.264 + AAC (aceito em todas as redes); se o navegador não codifica H.264, cai para WebM
export async function pickFormat(W, H, bitrate) {
  const mp4 = new Mp4OutputFormat({ fastStart: 'in-memory' });
  const v = await getFirstEncodableVideoCodec(['avc'], { width: W, height: H, bitrate });
  if (v) {
    if (!(await canEncodeAudio('aac')) && !aacRegistered) { registerAacEncoder(); aacRegistered = true; } // codificador AAC próprio quando o navegador não tem
    return { format: mp4, video: 'avc', audio: 'aac', ext: 'mp4', mime: 'video/mp4', social: true };
  }
  const webm = new WebMOutputFormat();
  const v2 = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width: W, height: H, bitrate });
  if (!v2) throw new Error('Seu navegador não consegue gerar vídeo. Use o Google Chrome atualizado.');
  return { format: webm, video: v2, audio: 'opus', ext: 'webm', mime: 'video/webm', social: false };
}

// tamanho dos quadros lidos do vídeo original: não passa do necessário para a saída
export function sinkSize(media, W, H, framing) {
  const sw = media.width, sh = media.height, contain = Math.min(W / sw, H / sh), cover = Math.max(W / sw, H / sh);
  const base = framing === 'fill' ? cover : framing === 'mid' ? Math.sqrt(contain * cover) : contain;
  const s = Math.min(1, base * 1.25, 2560 / Math.max(sw, sh));
  const ev = (x) => Math.max(2, Math.round(x / 2) * 2);
  return { width: ev(sw * s), height: ev(sh * s) };
}

/**
 * opts: { media, tl, state (para o compositor), aspect, quality, mixed (AudioBuffer|null), fps, onProgress, signal }
 * devolve { blob, ext, mime, social, W, H, seconds }
 */
export async function exportClip({ media, tl, state, aspect, quality, mixed, onProgress, signal }) {
  const started = performance.now();
  const q = QUALITIES[quality] || QUALITIES[720], { W, H } = outputSize(aspect, Number(quality) || 720);
  const fps = media.fps >= 23.5 && media.fps <= 30.5 ? Math.round(media.fps) : 30;
  const fmt = await pickFormat(W, H, q.bitrate);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const comp = new Compositor(W, H);
  const output = new Output({ format: fmt.format, target: new BufferTarget() });
  const vsrc = new CanvasSource(canvas, { codec: fmt.video, bitrate: q.bitrate, keyFrameInterval: 2, latencyMode: 'quality' });
  output.addVideoTrack(vsrc, { frameRate: fps });
  let asrc = null;
  if (mixed) { asrc = new AudioBufferSource({ codec: fmt.audio, bitrate: 160e3 }); output.addAudioTrack(asrc); }
  await output.start();

  const sz = sinkSize(media, W, H, state.framing);
  const sink = new CanvasSink(media.video, { width: sz.width, height: sz.height, fit: 'fill', poolSize: 3 });
  const total = Math.max(1, Math.round(tl.outDur * fps));
  let segK = -1, it = null, cur = null, next = null, audioPos = 0;
  const pushAudio = async (untilSec) => {
    // manda o áudio em fatias de 1 s, junto com o vídeo, para o arquivo ficar bem intercalado
    while (asrc && audioPos < mixed.length && audioPos / SR < untilSec) {
      const len = Math.min(SR, mixed.length - audioPos), slice = new AudioBuffer({ length: len, numberOfChannels: mixed.numberOfChannels, sampleRate: SR });
      for (let c = 0; c < mixed.numberOfChannels; c++) slice.copyToChannel(mixed.getChannelData(c).subarray(audioPos, audioPos + len), c);
      await asrc.add(slice); audioPos += len;
    }
  };
  try {
    for (let n = 0; n < total; n++) {
      if (signal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const t = n / fps, { k, src } = mapTime(tl, t);
      if (k !== segK) {
        if (it) await it.return();
        const g = tl.segments[k];
        it = sink.canvases(g.s, g.e + 0.5); segK = k; cur = null; next = await it.next();
      }
      while (next && !next.done && next.value.timestamp <= src + 1e-3) { cur = next.value; next = await it.next(); }
      if (!cur && next && !next.done) cur = next.value;
      if (cur) comp.draw(ctx, cur.canvas, media.width, media.height, t, state);
      await vsrc.add(t, 1 / fps);
      if (n % fps === 0) await pushAudio(t + 1.5);
      if (n % 3 === 0) onProgress?.(n / total, (performance.now() - started) / 1000);
    }
    if (it) await it.return();
    await pushAudio(Infinity);
    await output.finalize();
  } catch (e) {
    try { if (it) await it.return(); } catch { /* já fechado */ }
    try { await output.cancel(); } catch { /* já cancelado */ }
    throw e;
  }
  onProgress?.(1, (performance.now() - started) / 1000);
  return { blob: new Blob([output.target.buffer], { type: fmt.mime }), ext: fmt.ext, mime: fmt.mime, social: fmt.social, W, H, fps, seconds: (performance.now() - started) / 1000 };
}

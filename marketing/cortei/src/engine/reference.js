// Vídeos de referência: mede o RITMO da edição (cortes por minuto e tamanho das pausas) para editar no mesmo ritmo.
// Não copia conteúdo nem efeitos: só os números do ritmo ficam guardados.
import { CanvasSink } from 'mediabunny';
import { openVideo } from './media.js';
import { audioEnvelope, buildAnalysis, percentile, HOP, DEFAULT_STYLE } from './analyze.js';

const MAX_SECONDS = 90; // analisa até 1min30 de cada referência
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function analyzeReference(file, onProgress, signal) {
  const media = await openVideo(file);
  const end = Math.min(media.duration, media.t0 + MAX_SECONDS), seconds = end - media.t0;
  // 1) cortes de imagem: compara todos os quadros em miniatura e conta as mudanças bruscas
  const w = 32, h = 18, sink = new CanvasSink(media.video, { width: w, height: h, fit: 'fill', poolSize: 1 });
  const diffs = [], times = []; let prev = null, last = 0;
  for await (const wc of sink.canvases(media.t0, end)) {
    const px = wc.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, lum = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 3 + px[i + 1] * 6 + px[i + 2]) / 10;
    if (prev) { let d = 0; for (let j = 0; j < lum.length; j++) d += Math.abs(lum[j] - prev[j]); diffs.push(d / lum.length / 255); times.push(wc.timestamp); }
    prev = lum;
    const now = performance.now();
    if (now - last > 200) { last = now; onProgress?.(0.85 * Math.min(1, (wc.timestamp - media.t0) / seconds)); if (signal?.aborted) throw new DOMException('cancelado', 'AbortError'); }
  }
  let cuts = 0, lastCut = -9;
  for (let i = 0; i < diffs.length; i++) {
    const win = diffs.slice(Math.max(0, i - 15), i), med = win.length ? percentile(win, 0.5) : 0;
    if (diffs[i] > 0.1 && diffs[i] > med * 5 + 0.02 && times[i] - lastCut > 0.3) { cuts++; lastCut = times[i]; }
  }
  const cutsPerMin = seconds > 3 ? (cuts / seconds) * 60 : 0;
  // 2) pausas na fala: até que tamanho de silêncio a referência deixa passar
  let maxPause = null;
  if (media.audio) {
    const db = await audioEnvelope(media, (p) => onProgress?.(0.85 + 0.15 * p), signal);
    const A = buildAnalysis(media, db, null);
    if (isFinite(A.silenceThr)) {
      const runs = []; let run = 0; const n = Math.min(A.n, Math.round(seconds / HOP));
      for (let i = 0; i < n; i++) { if (A.sil[i]) run++; else { if (run * HOP >= 0.15) runs.push(run * HOP); run = 0; } }
      if (runs.length >= 3) maxPause = percentile(runs, 0.9);
    }
  }
  media.input.dispose?.();
  onProgress?.(1);
  return { name: file.name, seconds, cuts, cutsPerMin, maxPause };
}

// junta as referências num perfil de ritmo
export function styleFromReferences(refs) {
  if (!refs?.length) return null;
  const cpm = refs.map((r) => r.cutsPerMin).filter((v) => v > 0), pauses = refs.map((r) => r.maxPause).filter((v) => v != null);
  const avgCpm = cpm.length ? cpm.reduce((a, b) => a + b, 0) / cpm.length : 0;
  const avgShot = avgCpm > 0 ? 60 / avgCpm : null;
  const pause = pauses.length ? pauses.reduce((a, b) => a + b, 0) / pauses.length : null;
  return {
    refs: refs.length, cutsPerMin: avgCpm, avgShot, maxPause: pause,
    punchGap: avgShot ? clamp(avgShot, 1.2, 6) : DEFAULT_STYLE.punchGap,
    minSilence: pause != null ? clamp(pause + 0.1, 0.3, 1.2) : DEFAULT_STYLE.minSilence,
  };
}

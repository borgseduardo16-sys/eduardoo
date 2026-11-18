// Vídeos de referência: mede como o vídeo foi editado para editar os vídeos da pessoa no mesmo estilo.
// Mede: ritmo dos cortes, pausas na fala, zoom nos cortes, posição e cor de destaque da legenda,
// se tem música de fundo (e o volume dela) e se as transições têm efeito sonoro.
// Só os números ficam guardados; o vídeo não é copiado nem enviado para lugar nenhum.
import { CanvasSink, AudioBufferSink } from 'mediabunny';
import { openVideo } from './media.js';
import { audioEnvelope, buildAnalysis, percentile, HOP, DEFAULT_STYLE } from './analyze.js';
import { fft } from './stutter.js';

const MAX_SECONDS = 90; // analisa até 1min30 de cada referência
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const aborted = (signal) => { if (signal?.aborted) throw new DOMException('cancelado', 'AbortError'); };
const ZOOMS = [1.08, 1.15, 1.25, 1.35];

// mapas para "dar zoom" numa imagem pequena (vizinho mais próximo, a partir do centro)
function zoomMaps(w, h) {
  return ZOOMS.map((s) => {
    const m = new Int32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = Math.round(h / 2 + (y - h / 2) / s) * w + Math.round(w / 2 + (x - w / 2) / s);
    return m;
  });
}
const diff = (a, b, map) => { let d = 0; for (let j = 0; j < a.length; j++) d += Math.abs(a[j] - b[map ? map[j] : j]); return d / a.length / 255; };

export async function analyzeReference(file, onProgress, signal) {
  const media = await openVideo(file);
  try {
    const end = Math.min(media.duration, media.t0 + MAX_SECONDS), seconds = end - media.t0;
    const prog = (p) => onProgress?.(clamp(p, 0, 1));

    // 1) cortes e zoom: compara todos os quadros em miniatura
    const w = 64, h = 36, maps = zoomMaps(w, h), sink = new CanvasSink(media.video, { width: w, height: h, fit: 'fill', poolSize: 1 });
    const frames = []; let prev = null, last = 0;
    for await (const wc of sink.canvases(media.t0, end)) {
      const px = wc.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, lum = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 3 + px[i + 1] * 6 + px[i + 2]) / 10;
      if (prev) {
        const d = diff(lum, prev);
        let dz = d, sz = 1;
        if (d > 0.04) maps.forEach((m, k) => { const v = diff(lum, prev, m); if (v < dz) { dz = v; sz = ZOOMS[k]; } });
        frames.push({ t: wc.timestamp, d, dz, sz });
      }
      prev = lum;
      const now = performance.now();
      if (now - last > 200) { last = now; prog(0.5 * ((wc.timestamp - media.t0) / seconds)); aborted(signal); }
    }
    let cuts = 0, zoomCuts = 0, zoomSum = 0, lastCut = -9; const cutTimes = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], win = frames.slice(Math.max(0, i - 15), i).map((x) => x.d), med = win.length ? percentile(win, 0.5) : 0;
      if (f.d > 0.05 && f.d > med * 4 + 0.015 && f.t - lastCut > 0.3) {
        cuts++; lastCut = f.t; cutTimes.push(f.t);
        if (f.sz > 1 && f.dz < f.d * 0.55 && f.dz < 0.09) { zoomCuts++; zoomSum += f.sz; } // mesmo enquadramento, só que mais perto
      }
    }

    // 2) legenda: procura uma faixa de texto claro com contorno escuro que muda o tempo todo
    const cap = await detectCaptions(media, end, (p) => prog(0.5 + 0.3 * p), signal);

    // 3) áudio: pausas, música de fundo, som nas transições
    let maxPause = null, music = null, sfxCuts = null;
    if (media.audio) {
      const db = await audioEnvelope(media, (p) => prog(0.8 + 0.15 * p), signal);
      const A = buildAnalysis(media, db, null);
      if (isFinite(A.silenceThr)) {
        const runs = []; let run = 0; const n = Math.min(A.n, Math.round(seconds / HOP));
        for (let i = 0; i < n; i++) { if (A.sil[i]) run++; else { if (run * HOP >= 0.15) runs.push(run * HOP); run = 0; } }
        if (runs.length >= 3) maxPause = percentile(runs, 0.9);
      }
      music = await musicBed(media, db, end, signal);
      if (cutTimes.length >= 3) sfxCuts = await sfxOnCuts(media, cutTimes.slice(0, 30), end, signal);
    }
    prog(1);
    return { name: file.name, seconds, cuts, cutsPerMin: seconds > 3 ? (cuts / seconds) * 60 : 0, maxPause, zoomCuts, zoomScale: zoomCuts ? zoomSum / zoomCuts : null, cap, music, sfxCuts };
  } finally { media.input.dispose?.(); }
}

async function detectCaptions(media, end, onProgress, signal) {
  const CW = 144, CH = Math.max(32, Math.round((CW * media.height) / media.width / 2) * 2);
  const times = []; for (let t = media.t0 + 0.25; t < end; t += 0.5) times.push(t);
  if (times.length < 6) return null;
  const sink = new CanvasSink(media.video, { width: CW, height: CH, fit: 'fill', poolSize: 1 });
  const rows = [], colors = []; let k = 0;
  for await (const wc of sink.canvasesAtTimestamps(times)) {
    k++; if (!wc) continue;
    const d = wc.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, CW, CH).data;
    const lum = new Uint8Array(CW * CH);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) lum[j] = (d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10;
    // letra de legenda = traço claro e fino com contorno ou sombra escura do lado. Faixas largas (fundo, cenário) não contam.
    const r = new Uint16Array(CH), col = [], maxRun = Math.max(3, Math.round(CW * 0.05)), mask = new Uint8Array(CW);
    for (let y = 2; y < CH - 2; y++) {
      for (let x = 0; x < CW; x++) {
        mask[x] = 0; if (x < 2 || x >= CW - 2) continue;
        const j = y * CW + x, R = d[j * 4], G = d[j * 4 + 1], B = d[j * 4 + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = mx ? (mx - mn) / mx : 0;
        const white = lum[j] > 200 && sat < 0.22, vivid = mx > 170 && sat > 0.45;
        if ((white || vivid) && Math.min(lum[j - 2], lum[j + 2], lum[j - 2 * CW], lum[j + 2 * CW]) <= 80) mask[x] = vivid ? 2 : 1;
      }
      for (let x = 0; x < CW;) {
        if (!mask[x]) { x++; continue; }
        let e = x; while (e < CW && mask[e]) e++;
        if (e - x <= maxRun) {
          r[y]++;
          for (let k = x; k < e; k++) if (mask[k] === 2) { const j = (y * CW + k) * 4; col.push([y, d[j], d[j + 1], d[j + 2]]); }
        }
        x = e;
      }
    }
    rows.push(r); colors.push(col);
    if (k % 10 === 0) { onProgress?.(k / times.length); aborted(signal); }
  }
  if (rows.length < 6) return null;
  const minPx = 4, present = new Float32Array(CH), change = new Float32Array(CH);
  for (let y = 0; y < CH; y++) {
    let p = 0, c = 0;
    for (let f = 0; f < rows.length; f++) { if (rows[f][y] >= minPx) p++; if (f) c += Math.abs(rows[f][y] - rows[f - 1][y]); }
    present[y] = p / rows.length; change[y] = c / (rows.length - 1) / CW;
  }
  const score = new Float32Array(CH);
  for (let y = 1; y < CH - 1; y++) score[y] = ((change[y - 1] + change[y] + change[y + 1]) / 3) * ((present[y - 1] + present[y] + present[y + 1]) / 3);
  let best = -1, bv = 0;
  for (let y = Math.round(CH * 0.08); y < CH * 0.95; y++) if (score[y] > bv) { bv = score[y]; best = y; }
  const med = percentile(Array.from(score), 0.5);
  if (best < 0 || present[best] < 0.3 || bv < med * 3 + 0.01) return { found: false };
  let y0 = best, y1 = best;
  while (y0 > 0 && present[y0 - 1] >= present[best] * 0.5) y0--;
  while (y1 < CH - 1 && present[y1 + 1] >= present[best] * 0.5) y1++;
  if (y1 - y0 > CH * 0.22) return { found: false }; // faixa alta demais: é o próprio vídeo, não legenda
  const pos = (y0 + y1) / 2 / CH;
  // cor de destaque: a cor viva mais comum dentro da faixa da legenda
  const bins = new Map(); let vivid = 0, total = 0;
  for (let f = 0; f < rows.length; f++) {
    for (let y = y0; y <= y1; y++) total += rows[f][y] * 2;
    for (const [y, R, G, B] of colors[f]) {
      if (y < y0 || y > y1) continue;
      vivid++;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B); let hue = 0;
      if (mx !== mn) hue = mx === R ? ((G - B) / (mx - mn) + 6) % 6 : mx === G ? (B - R) / (mx - mn) + 2 : (R - G) / (mx - mn) + 4;
      const key = Math.floor(hue * 2) % 12, e = bins.get(key) || { n: 0, R: 0, G: 0, B: 0 };
      e.n++; e.R += R; e.G += G; e.B += B; bins.set(key, e);
    }
  }
  let color = null;
  if (total && vivid >= rows.length * 2 && vivid / Math.max(1, total) >= 0.04) {
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    const hex = (v) => Math.round(v / top.n).toString(16).padStart(2, '0');
    color = '#' + hex(top.R) + hex(top.G) + hex(top.B);
  }
  return { found: true, pos, place: pos < 0.36 ? 'topo' : pos < 0.62 ? 'centro' : 'baixo', color, strength: present[best] };
}

// música de fundo: entre as falas o som não cai para o silêncio, e o que sobra é tonal (notas), não chiado
async function musicBed(media, db, end, signal) {
  const s = Array.from(db).sort((a, b) => a - b);
  if (s.length < 40) return null;
  const p = (q) => s[Math.floor(q * (s.length - 1))], floor = p(0.15), top = p(0.9);
  // com música, as pausas nunca caem para o silêncio e o fundo fica bem abaixo da voz
  if (floor < -58 || top - floor < 15) return { bed: false, rel: floor - top };
  const quiet = []; for (let i = 0; i < db.length; i++) if (db[i] <= floor + 1 && db[i] > -90) quiet.push(i);
  const pick = []; for (let k = 0; k < 10 && quiet.length; k++) pick.push(quiet[Math.floor(((k + 0.5) * quiet.length) / 10)]);
  const sink = new AudioBufferSink(media.audio), flats = [];
  for (const i of pick) {
    aborted(signal);
    const t = media.t0 + i * HOP, N = 2048, re = new Float32Array(N), im = new Float32Array(N); let n0 = 0, sr = 48000;
    // junta os pedacinhos decodificados (no Opus cada um tem só 20 ms) até ter 2048 amostras
    for await (const { buffer, timestamp } of sink.buffers(t, Math.min(end, t + 0.2))) {
      sr = buffer.sampleRate; const d = buffer.getChannelData(0); let k = n0 ? 0 : Math.max(0, Math.round((t - timestamp) * sr));
      while (k < d.length && n0 < N) re[n0++] = d[k++];
      if (n0 >= N) break;
    }
    if (n0 < N) continue;
    for (let k = 0; k < N; k++) re[k] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (N - 1));
    fft(re, im);
    const k0 = Math.ceil((100 * N) / sr), k1 = Math.floor((4000 * N) / sr);
    let lg = 0, ar = 0, n = 0;
    for (let k = k0; k <= k1; k++) { const pw = re[k] * re[k] + im[k] * im[k] + 1e-12; lg += Math.log(pw); ar += pw; n++; }
    flats.push(Math.exp(lg / n) / (ar / n));
  }
  if (flats.length < 4) return null;
  flats.sort((a, b) => a - b);
  const flat = flats[Math.floor(flats.length / 2)];
  return { bed: flat < 0.12 && top - floor < 34, rel: floor - top, flat };
}

// as transições têm som (whoosh)? compara o "chiado" do áudio logo antes dos cortes com momentos aleatórios
async function sfxOnCuts(media, cutTimes, end, signal) {
  const sink = new AudioBufferSink(media.audio);
  const feat = async (t) => {
    // whoosh = chiado agudo: muita energia nas frequências altas em relação ao total (voz tem pouca)
    let h = 0, n = 0, e = 0;
    for await (const { buffer } of sink.buffers(Math.max(media.t0, t - 0.25), Math.min(end, t + 0.25))) {
      const d = buffer.getChannelData(0);
      for (let i = 1; i < d.length; i++) { const x = d[i] - d[i - 1]; h += x * x; e += d[i] * d[i]; n++; }
    }
    return n ? { z: h / (e + 1e-9), e: e / n } : null;
  };
  const rand = []; for (let i = 0; i < 24; i++) rand.push(media.t0 + ((i + 0.5) * (end - media.t0)) / 24);
  const base = [];
  for (const t of rand) { aborted(signal); const f = await feat(t); if (f) base.push(f); }
  if (base.length < 8) return null;
  const zHi = percentile(base.map((f) => f.z), 0.8), eMid = percentile(base.map((f) => f.e), 0.5);
  const hits = async (ts) => { let h = 0, n = 0; for (const t of ts) { aborted(signal); const f = await feat(t); if (!f) continue; n++; if (f.z > zHi && f.e > eMid) h++; } return n ? h / n : 0; };
  const atCuts = await hits(cutTimes), atRandom = base.filter((f) => f.z > zHi && f.e > eMid).length / base.length;
  return Math.max(0, atCuts - atRandom);
}

// junta as referências num perfil de estilo
export function styleFromReferences(refs) {
  if (!refs?.length) return null;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const cpm = avg(refs.map((r) => r.cutsPerMin).filter((v) => v > 0)) || 0;
  const avgShot = cpm > 0 ? 60 / cpm : null, pause = avg(refs.map((r) => r.maxPause).filter((v) => v != null));
  const zr = refs.filter((r) => r.zoomCuts != null), cuts = zr.reduce((n, r) => n + (r.cuts || 0), 0), zc = zr.reduce((n, r) => n + r.zoomCuts, 0);
  const zoom = cuts >= 4 ? { on: zc / cuts >= 0.15, amt: zc ? clamp(avg(zr.filter((r) => r.zoomScale).map((r) => r.zoomScale)) - 1, 0.06, 0.3) : null } : null;
  const caps = refs.map((r) => r.cap).filter((c) => c && c.found);
  const cap = caps.length && caps.length >= refs.filter((r) => r.cap).length / 2
    ? { place: mode(caps.map((c) => c.place)), color: caps.map((c) => c.color).find(Boolean) || null } : null;
  const ms = refs.map((r) => r.music).filter(Boolean);
  const music = ms.length ? { bed: ms.filter((m) => m.bed).length > ms.length / 2, rel: avg(ms.filter((m) => m.bed).map((m) => m.rel)) } : null;
  const sx = refs.map((r) => r.sfxCuts).filter((v) => v != null);
  const sfx = sx.length ? (avg(sx) >= 0.35 ? 'full' : avg(sx) >= 0.15 ? 'soft' : 'off') : null;
  return {
    refs: refs.length, cutsPerMin: cpm, avgShot, maxPause: pause,
    punchGap: avgShot ? clamp(avgShot, 1.2, 6) : DEFAULT_STYLE.punchGap,
    minSilence: pause != null ? clamp(pause + 0.1, 0.3, 1.2) : DEFAULT_STYLE.minSilence,
    zoom, cap, music, sfx,
  };
}
function mode(arr) { const c = {}; let best = arr[0]; for (const x of arr) { c[x] = (c[x] || 0) + 1; if (c[x] > c[best]) best = x; } return best; }

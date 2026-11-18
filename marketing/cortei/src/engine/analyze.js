// Análise do vídeo: volume do áudio ao longo do tempo, movimento da imagem e escolha dos melhores trechos.
import { AudioSampleSink, EncodedPacketSink, CanvasSink } from 'mediabunny';

export const HOP = 0.05; // cada "bin" da análise vale 50 ms
// ritmo padrão da edição; pode ser trocado pelo ritmo medido nos vídeos de referência
export const DEFAULT_STYLE = { minSilence: 0.8, punchGap: 2.5 };
const aborted = (signal) => { if (signal?.aborted) throw new DOMException('cancelado', 'AbortError'); };

// volume (dB) a cada 50 ms, lendo o áudio inteiro em fluxo
export async function audioEnvelope(media, onProgress, signal) {
  const { audio, t0, duration } = media;
  const n = Math.max(1, Math.ceil((duration - t0) / HOP));
  const sum = new Float64Array(n), cnt = new Uint32Array(n);
  const sink = new AudioSampleSink(audio);
  let buf = new Float32Array(4096), lastTick = 0;
  for await (const s of sink.samples()) {
    try {
      const frames = s.numberOfFrames;
      if (buf.length < frames) buf = new Float32Array(frames);
      s.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
      const step = 1 / s.sampleRate, base = s.timestamp - t0;
      for (let i = 0; i < frames; i += 2) {
        const b = ((base + i * step) / HOP) | 0;
        if (b >= 0 && b < n) { const v = buf[i]; sum[b] += v * v; cnt[b]++; }
      }
      const now = performance.now();
      if (now - lastTick > 200) { lastTick = now; onProgress?.(Math.min(1, (s.timestamp - t0) / (duration - t0))); aborted(signal); }
    } finally { s.close(); }
  }
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) db[i] = cnt[i] ? 10 * Math.log10(sum[i] / cnt[i] + 1e-10) : -100;
  return db;
}

// movimento: compara quadros-chave espaçados (decodifica só 1 quadro por ponto, então é rápido mesmo em vídeo longo)
export async function motionCurve(media, onProgress, signal) {
  const { video, t0, duration } = media;
  const span = duration - t0;
  const N = Math.min(600, Math.max(6, Math.floor(span)));
  const ps = new EncodedPacketSink(video);
  const stamps = []; let last = -Infinity;
  for (let i = 0; i < N; i++) {
    const kp = await ps.getKeyPacket(t0 + ((i + 0.5) * span) / N, { metadataOnly: true });
    if (kp && kp.timestamp > last + 0.2) { stamps.push(kp.timestamp); last = kp.timestamp; }
    if (i % 50 === 0) aborted(signal);
  }
  const w = 48, h = 27;
  const cs = new CanvasSink(video, { width: w, height: h, fit: 'fill', poolSize: 1 });
  const pts = []; let prev = null, prevT = 0, k = 0;
  for await (const wc of cs.canvasesAtTimestamps(stamps)) {
    k++;
    if (!wc) continue;
    const px = wc.canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const lum = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 3 + px[i + 1] * 6 + px[i + 2]) / 10;
    if (prev) { let d = 0; for (let j = 0; j < lum.length; j++) d += Math.abs(lum[j] - prev[j]); pts.push({ a: prevT, b: wc.timestamp, v: d / lum.length / 255 }); }
    prev = lum; prevT = wc.timestamp;
    if (k % 10 === 0) { onProgress?.(k / stamps.length); aborted(signal); }
  }
  if (pts.length < 3) return null;
  const n = Math.max(1, Math.ceil(span / HOP)), out = new Float32Array(n);
  for (const p of pts) { const i0 = Math.max(0, ((p.a - t0) / HOP) | 0), i1 = Math.min(n, ((p.b - t0) / HOP) | 0); for (let i = i0; i < i1; i++) out[i] = p.v; }
  const ref = percentile(pts.map((p) => p.v), 0.9) || 1;
  for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i] / ref);
  return out;
}

export function percentile(arr, p) {
  const a = Float32Array.from(arr).sort();
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
}

// junta tudo: estatísticas, limiar de silêncio, momentos de impacto
export function buildAnalysis(media, db, motion) {
  const n = Math.max(1, Math.ceil(media.span / HOP));
  const A = { t0: media.t0, duration: media.duration, n, db, motion, hasAudio: !!db };
  if (db) {
    // amostra para as estatísticas (o vídeo pode ter milhões de bins)
    const stepS = Math.max(1, Math.floor(n / 20000)), samp = [];
    for (let i = 0; i < n; i += stepS) if (db[i] > -95) samp.push(db[i]);
    A.p10 = percentile(samp, 0.1); A.p50 = percentile(samp, 0.5); A.p75 = percentile(samp, 0.75); A.p90 = percentile(samp, 0.9); A.p95 = percentile(samp, 0.95);
    A.dynamic = A.p90 - A.p10;
    // só existe "silêncio" de verdade se o áudio varia bastante (fala com pausas); som constante não é cortado
    A.silenceThr = A.dynamic >= 14 ? A.p10 + 0.3 * A.dynamic : -Infinity;
    A.loud = new Float32Array(n); A.onset = new Uint8Array(n); A.sil = new Uint8Array(n);
    const den = Math.max(3, A.p95 - A.p50);
    let lastOn = -99;
    for (let i = 0; i < n; i++) {
      if (db[i] !== db[i]) continue; // NaN: trecho de vídeo sem áudio
      A.loud[i] = Math.min(1.5, Math.max(0, (db[i] - A.p50) / den));
      if (db[i] < A.silenceThr) A.sil[i] = 1;
      if (i >= 6) {
        let m = 0; for (let j = i - 6; j < i; j++) m += db[j]; m /= 6;
        if (m === m && db[i] - m > 7 && db[i] > A.p50 && i - lastOn > 5) { A.onset[i] = 1; lastOn = i; }
      }
    }
  }
  return A;
}

const prefix = (arr, n) => { const p = new Float64Array(n + 1); if (arr) for (let i = 0; i < n; i++) p[i + 1] = p[i] + arr[i]; return p; };

// escolhe os N melhores trechos (sem sobrepor) para a duração pedida
export function findCandidates(A, clipLen, count = 3) {
  const span = A.duration - A.t0;
  if (span <= clipLen + 0.5) return [{ start: A.t0, score: 1 }];
  const wl = Math.round(clipLen / HOP), n = A.n;
  const pL = prefix(A.loud, n), pO = prefix(A.onset, n), pS = prefix(A.sil, n), pM = prefix(A.motion, n);
  const step = Math.max(1, Math.round(0.5 / HOP)), all = [];
  for (let i = 0; i + wl <= n; i += step) {
    const L = (pL[i + wl] - pL[i]) / wl, O = Math.min(1, (pO[i + wl] - pO[i]) / clipLen / 1.2), S = (pS[i + wl] - pS[i]) / wl, M = A.motion ? (pM[i + wl] - pM[i]) / wl : 0;
    const score = A.hasAudio ? 0.45 * L + 0.25 * O + (A.motion ? 0.3 * M : 0) - 0.35 * S : M;
    all.push({ start: A.t0 + i * HOP, score });
  }
  all.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of all) {
    if (picked.every((p) => Math.abs(p.start - c.start) >= clipLen)) picked.push(c);
    if (picked.length >= count) break;
  }
  const best = picked[0]?.score || 1, worst = all[all.length - 1]?.score || 0;
  for (const p of picked) p.rel = best > worst ? (p.score - worst) / (best - worst) : 1;
  return picked;
}

// começa o clipe logo depois de uma pausa (para não começar no meio de uma palavra)
function snapStart(A, start) {
  if (!A.hasAudio) return start;
  const i0 = Math.max(0, Math.round((start - 1.5 - A.t0) / HOP)), i1 = Math.min(A.n - 1, Math.round((start + 0.5 - A.t0) / HOP));
  let best = -1, bestV = Infinity;
  for (let i = i0; i <= i1; i++) { const v = (A.db[Math.max(0, i - 1)] + A.db[i] + A.db[Math.min(A.n - 1, i + 1)]) / 3; if (v === v && v < bestV) { bestV = v; best = i; } }
  return best >= 0 && bestV < A.p50 - 6 ? A.t0 + best * HOP : start;
}

// monta os pedaços que entram no clipe. Pula: silêncios longos (cutSilence), trechos marcados para sair (excl:
// erros, repetições, gaguejos) e a divisa entre dois vídeos (windows). Tudo no tempo do projeto.
export function buildSegments(A, start, clipLen, { cutSilence = true, adjust = 0, style = DEFAULT_STYLE, excl = [], windows = null } = {}) {
  const MIN_SIL = style.minSilence, PAD = 0.15, MAX_SPAN = clipLen * 3 + 5, end = A.duration;
  start = Math.min(Math.max(A.t0, snapStart(A, start) + adjust), Math.max(A.t0, end - 1));
  const skips = [];
  if (cutSilence && A.hasAudio && isFinite(A.silenceThr)) {
    const i0 = Math.max(0, Math.floor((start - A.t0) / HOP)), i1 = Math.min(A.n, Math.ceil((start + MAX_SPAN - A.t0) / HOP));
    for (let j = i0; j < i1; j++) {
      if (!A.sil[j]) continue;
      let e = j; while (e < A.n && A.sil[e]) e++;
      if ((e - j) * HOP >= MIN_SIL) skips.push({ a: A.t0 + j * HOP + PAD, b: e >= A.n ? end : A.t0 + e * HOP - PAD, sil: true });
      j = e;
    }
  }
  for (const x of excl) if (x.b > x.a) skips.push({ a: x.a, b: x.b, sil: false });
  if (windows) for (let k = 0; k < windows.length - 1; k++) skips.push({ a: windows[k].b, b: windows[k + 1].a, sil: false, edge: true });
  skips.sort((p, q) => p.a - q.a);
  const merged = [];
  for (const x of skips) {
    const l = merged[merged.length - 1];
    if (l && x.a <= l.b + 0.02) { l.b = Math.max(l.b, x.b); l.sil = l.sil && x.sil; } else merged.push({ ...x });
  }
  const segs = []; let need = clipLen, cur = start, prevSil = true;
  for (const x of merged) {
    if (need <= 0.02 || cur - start > MAX_SPAN) break;
    if (x.b <= cur) continue;
    if (x.a <= cur) { cur = x.b; prevSil = x.sil; continue; }
    const len = x.a - cur;
    if (len >= need) { segs.push({ s: cur, e: cur + need }); need = 0; break; }
    // entre dois silêncios, pedacinhos menores que 0,5 s são ruído; perto de um corte de erro, vale até 0,1 s
    const minLen = prevSil && x.sil ? 0.5 : 0.1;
    if (len >= minLen) { segs.push({ s: cur, e: x.a }); need -= len; }
    cur = x.b; prevSil = x.sil;
  }
  if (need > 0.02 && cur < end && cur - start <= MAX_SPAN) segs.push({ s: cur, e: Math.min(end, cur + need) });
  // um restinho muito curto no final fica estranho: sai
  if (segs.length > 1 && segs[segs.length - 1].e - segs[segs.length - 1].s < 0.7) segs.pop();
  return finish(segs.length ? segs : [{ s: start, e: Math.min(end, start + clipLen) }]);
}

function finish(segs) {
  let t = 0;
  for (const g of segs) { g.dur = g.e - g.s; g.out = t; t += g.dur; }
  return { segments: segs, outDur: t };
}

// posição no vídeo original para um instante do clipe
export function mapTime(tl, t) {
  const segs = tl.segments;
  for (let k = 0; k < segs.length; k++) { const g = segs[k]; if (t < g.out + g.dur || k === segs.length - 1) return { k, src: g.s + Math.min(g.dur, Math.max(0, t - g.out)) }; }
  return { k: 0, src: segs[0].s };
}

// instante do clipe final que corresponde a um instante do projeto (se ele foi cortado, o ponto do corte)
export function toOut(tl, vt) {
  let t = 0;
  for (const g of tl.segments) { if (vt < g.s) return t; if (vt <= g.e) return g.out + (vt - g.s); t = g.out + g.dur; }
  return t;
}

// palavras (tempo do projeto) → palavras no tempo do clipe final; as que caíram num corte somem
export function wordsToTimeline(words, tl) {
  const out = [], segs = tl.segments; let k = 0;
  for (const w of words) {
    if (!w.text) continue;
    while (k < segs.length && segs[k].e <= w.start) k++;
    if (k >= segs.length) break;
    const g = segs[k];
    if (w.start < g.s - 0.05) continue;
    const start = g.out + Math.max(0, w.start - g.s), end = g.out + Math.min(g.dur, Math.max(w.end, w.start + 0.08) - g.s);
    out.push({ text: w.text, start, end: Math.max(end, start + 0.08), ref: w });
  }
  return out;
}

// momentos de impacto dentro do clipe (para zoom e efeitos sonoros), já no tempo do clipe
export function buildEvents(A, tl, style = DEFAULT_STYLE) {
  const ev = { cuts: tl.segments.slice(1).map((g) => g.out), punches: [], impact: null };
  if (!A.hasAudio) return ev;
  const found = [];
  for (const g of tl.segments) {
    const i0 = Math.max(6, Math.round((g.s - A.t0) / HOP)), i1 = Math.min(A.n, Math.round((g.e - A.t0) / HOP));
    for (let i = i0; i < i1; i++) {
      if (!A.onset[i]) continue;
      let m = 0; for (let j = i - 6; j < i; j++) m += A.db[j]; m /= 6;
      const t = g.out + (A.t0 + i * HOP - g.s);
      if (t > 1.2 && t < tl.outDur - 1) found.push({ t, strength: A.db[i] - m + Math.max(0, A.db[i] - A.p75) });
    }
  }
  found.sort((a, b) => b.strength - a.strength);
  const max = Math.max(1, Math.floor(tl.outDur / (style.punchGap * 1.6)));
  for (const f of found) {
    if (ev.punches.every((p) => Math.abs(p - f.t) >= style.punchGap)) ev.punches.push(f.t);
    if (ev.punches.length >= max) break;
  }
  if (ev.punches.length) ev.impact = ev.punches[0];
  ev.punches.sort((a, b) => a - b);
  return ev;
}

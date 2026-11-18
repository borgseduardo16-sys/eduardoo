// Projeto com um ou mais vídeos em sequência. Tudo vira uma linha do tempo única ("tempo do projeto"),
// começando em 0: o vídeo 1 ocupa o começo, o vídeo 2 vem logo depois, e assim por diante.
import { openVideo } from './media.js';
import { audioEnvelope, motionCurve, buildAnalysis, HOP } from './analyze.js';

export const MAX_CLIPS = 20;

export async function openClip(file) {
  const m = await openVideo(file);
  m.id = Math.random().toString(36).slice(2);
  m.name = file.name;
  return m;
}

// análise de um vídeo (volume e movimento); fica guardada no próprio clipe para não repetir
export function analyzeClip(clip, onProgress, signal) {
  if (!clip.an) {
    const prog = { a: clip.audio ? 0 : 1, v: 0 };
    const upd = () => onProgress?.(clip.audio ? prog.a * 0.6 + prog.v * 0.4 : prog.v);
    clip.onProg = upd;
    clip.an = (async () => {
      const db = clip.audio ? await audioEnvelope(clip, (p) => { prog.a = p; clip.onProg?.(); }, signal) : null; prog.a = 1;
      let motion = null;
      try { motion = await motionCurve(clip, (p) => { prog.v = p; clip.onProg?.(); }, signal); } catch (e) { if (e.name === 'AbortError') throw e; }
      prog.v = 1; clip.onProg?.();
      return { db, motion };
    })();
    clip.an.catch(() => { clip.an = null; });
  } else if (onProgress) clip.onProg = () => onProgress(1);
  return clip.an;
}

// monta o projeto: posição de cada vídeo na linha do tempo
export function makeProject(clips) {
  let bins = 0;
  const wins = clips.map((c) => {
    const n = Math.max(1, Math.ceil(c.span / HOP)), a = bins * HOP;
    bins += n;
    return { a, b: a + c.span, n, bin0: bins - n };
  });
  return { clips, wins, total: bins * HOP, bins, span: clips.reduce((s, c) => s + c.span, 0) };
}

// junta as análises dos vídeos numa análise só, no tempo do projeto
export function combineAnalysis(proj, parts) {
  const { bins, clips, wins } = proj;
  const anyAudio = parts.some((p) => p.db), anyMotion = parts.some((p) => p.motion);
  const db = anyAudio ? new Float32Array(bins).fill(NaN) : null; // NaN = vídeo sem áudio (não conta como silêncio)
  const motion = anyMotion ? new Float32Array(bins) : null;
  parts.forEach((p, i) => {
    const w = wins[i];
    if (db && p.db) db.set(p.db.subarray(0, w.n), w.bin0);
    if (motion && p.motion) motion.set(p.motion.subarray(0, w.n), w.bin0);
  });
  const A = buildAnalysis({ t0: 0, duration: proj.total, span: proj.total }, db, motion);
  A.wins = wins; A.clips = clips.length;
  return A;
}

// onde fica um instante do projeto: qual vídeo e qual tempo dentro dele
export function locate(proj, vt) {
  const { wins, clips } = proj;
  let i = 0;
  while (i < wins.length - 1 && vt >= wins[i + 1].a) i++;
  const c = clips[i], local = c.t0 + Math.min(c.span, Math.max(0, vt - wins[i].a));
  return { i, clip: c, local };
}

// trecho (no tempo do projeto) → vídeo e tempos locais. Os trechos nunca atravessam a divisa entre dois vídeos.
export function segSource(proj, g) {
  const { i, clip, local } = locate(proj, g.s + 1e-4);
  const s = clip.t0 + (g.s - proj.wins[i].a);
  return { i, clip, s: Math.max(clip.t0, s), e: Math.min(clip.duration, s + g.dur), local };
}

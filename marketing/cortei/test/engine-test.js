// Página de teste do motor (sem interface): expõe as funções em window.T para o Playwright chamar.
import { openVideo } from '../src/engine/media.js';
import { audioEnvelope, motionCurve, buildAnalysis, findCandidates, buildSegments, buildEvents } from '../src/engine/analyze.js';
import { buildTimelineAudio, mixAudio, toMono16k, planSfx } from '../src/engine/audio.js';
import { exportClip } from '../src/engine/export.js';
import { chunkWords } from '../src/engine/compose.js';

const S = {};
window.T = {
  async open(file) {
    S.media = await openVideo(file);
    const m = S.media; return { duration: m.duration, t0: m.t0, w: m.width, h: m.height, fps: m.fps, audio: !!m.audio, vcodec: m.video.codec, acodec: m.audio?.codec };
  },
  async analyze() {
    const t = performance.now();
    const db = S.media.audio ? await audioEnvelope(S.media) : null; const t1 = performance.now();
    const motion = await motionCurve(S.media); const t2 = performance.now();
    S.A = buildAnalysis(S.media, db, motion);
    return { audioMs: Math.round(t1 - t), motionMs: Math.round(t2 - t1), p10: S.A.p10, p50: S.A.p50, p90: S.A.p90, thr: S.A.silenceThr, onsets: S.A.onset ? S.A.onset.reduce((a, b) => a + b, 0) : 0, motion: !!motion };
  },
  candidates(len) { S.len = len; S.c = findCandidates(S.A, len, 3); return S.c; },
  segments(i, cut) { S.tl = buildSegments(S.A, S.c[i].start, S.len, { cutSilence: cut }); S.ev = buildEvents(S.A, S.tl); return { tl: S.tl, ev: S.ev, sfx: planSfx(S.ev, 'full', true, S.tl.outDur) }; },
  async audio16k() { S.main = await buildTimelineAudio(S.media, S.tl); const a = await toMono16k(S.main); return { len: a.length, dur: S.main.duration, sr: S.main.sampleRate }; },
  async export(opts) {
    S.main = S.main || (await buildTimelineAudio(S.media, S.tl));
    const mixed = await mixAudio({ main: S.main, music: null, ev: S.ev, sfx: opts.sfx || 'full', hasTitle: !!opts.title, outDur: S.tl.outDur });
    const state = { framing: opts.framing || 'blur', tl: S.tl, ev: S.ev, fx: { zoom: true, progress: true }, cap: { on: true, style: opts.style || 'impacto', pos: 'auto', chunks: chunkWords(opts.words || []) }, title: { text: opts.title || '', mode: 'all' } };
    await document.fonts.load('900 40px Montserrat'); await document.fonts.load('800 40px "Plus Jakarta Sans"');
    const r = await exportClip({ media: S.media, tl: S.tl, state, aspect: opts.aspect || '9:16', quality: opts.quality || 720, mixed });
    S.result = r; window.__blob = r.blob;
    return { ext: r.ext, mime: r.mime, social: r.social, W: r.W, H: r.H, fps: r.fps, seconds: r.seconds, size: r.blob.size };
  },
  async blobBase64() { const b = new Uint8Array(await window.__blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
};

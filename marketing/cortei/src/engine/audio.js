// Áudio do clipe: junta os pedaços do áudio original, cria os efeitos sonoros (sintetizados aqui mesmo, sem arquivos) e mixa tudo.
import { AudioBufferSink } from 'mediabunny';
import { segSource } from './project.js';

export const SR = 48000;

// áudio dos pedaços que entram no clipe, colado em sequência (de um ou vários vídeos), sempre em 48 kHz
export async function buildTimelineAudio(proj, tl, signal) {
  const clips = proj.clips;
  if (!clips.some((c) => c.audio)) return null;
  const ch = Math.max(...clips.map((c) => (c.audio ? Math.min(2, c.audio.numberOfChannels || 1) : 1)));
  const lens = tl.segments.map((g) => Math.max(1, Math.round(g.dur * SR))), total = lens.reduce((a, b) => a + b, 0);
  // escreve direto no AudioBuffer final (sem cópia extra: importante em vídeos de 20 min)
  const out = new AudioBuffer({ length: total, numberOfChannels: ch, sampleRate: SR });
  const data = Array.from({ length: ch }, (_, c) => out.getChannelData(c));
  const sinks = new Map();
  let off = 0;
  for (let k = 0; k < tl.segments.length; k++) {
    if (signal?.aborted) throw new DOMException('cancelado', 'AbortError');
    const g = tl.segments[k], n = lens[k], src = segSource(proj, g);
    if (src.clip.audio) {
      if (!sinks.has(src.i)) sinks.set(src.i, new AudioBufferSink(src.clip.audio));
      for await (const { buffer, timestamp } of sinks.get(src.i).buffers(src.s, src.e)) {
        const r = buffer.sampleRate / SR, startFrame = Math.round((timestamp - src.s) * SR);
        const dstFrom = Math.max(0, startFrame), skip = Math.max(0, -startFrame), outLen = Math.floor(buffer.length / r);
        const count = Math.min(outLen - skip, n - dstFrom);
        if (count <= 0) continue;
        for (let c = 0; c < ch; c++) {
          const sd = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)), dd = data[c], base = off + dstFrom;
          if (r === 1) dd.set(sd.subarray(skip, skip + count), base);
          else for (let q = 0; q < count; q++) { const x = (q + skip) * r, i0 = x | 0, f = x - i0, a = sd[i0] || 0, b = sd[Math.min(sd.length - 1, i0 + 1)] || 0; dd[base + q] = a + (b - a) * f; }
        }
      }
    }
    // micro fade nas emendas para não dar estalo
    const f = Math.min(Math.round(SR * 0.008), n >> 1);
    for (let c = 0; c < ch; c++) for (let i = 0; i < f; i++) { const a = i / f; data[c][off + i] *= a; data[c][off + n - 1 - i] *= a; }
    off += n;
  }
  return out;
}

// versão mono em 16 kHz para o reconhecimento de fala
export async function toMono16k(buffer) {
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.duration * 16000)), 16000);
  const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

export async function decodeAudioFile(file) {
  const ctx = new OfflineAudioContext(2, 1, SR);
  return ctx.decodeAudioData(await file.arrayBuffer());
}

function noiseBuffer(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate), d = b.getChannelData(0);
  let seed = 22222; // ruído determinístico: o mesmo clipe sempre sai igual
  for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  return b;
}

// ---- efeitos sonoros enviados pela pessoa: o ponto mais forte do som cai em cima do momento
export function soundPeak(buffer) {
  const d = buffer.getChannelData(0); let best = 0, bv = 0;
  for (let i = 0; i < d.length; i += 64) { const v = Math.abs(d[i]); if (v > bv) { bv = v; best = i; } }
  return best / buffer.sampleRate;
}
function playOwn(ctx, out, own, at, endAligned) {
  const src = ctx.createBufferSource(); src.buffer = own.buffer;
  const g = ctx.createGain(); g.gain.value = own.gain ?? 0.9;
  const t = endAligned ? at - own.buffer.duration : at - (own.peak ?? 0); // a subida termina no impacto
  const start = Math.max(0, t), offset = Math.max(0, -t);
  if (offset >= own.buffer.duration) return;
  src.connect(g).connect(out); src.start(start, offset);
}

// ---- efeitos sonoros sintetizados
function whoosh(ctx, out, noise, t, dur = 0.5, gain = 0.5) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(700, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(-0.6, t); pan.pan.linearRampToValueAtTime(0.6, t + dur);
  src.connect(bp).connect(g).connect(pan).connect(out); src.start(t); src.stop(t + dur + 0.02);
}
function impact(ctx, out, noise, t, gain = 0.9) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.85);
  const n = ctx.createBufferSource(); n.buffer = noise;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.25);
  const ng = ctx.createGain(); ng.gain.setValueAtTime(gain * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  n.connect(lp).connect(ng).connect(out); n.start(t); n.stop(t + 0.32);
}
function riser(ctx, out, noise, t, dur = 1.2, gain = 0.32) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 2.5;
  hp.frequency.setValueAtTime(300, t); hp.frequency.exponentialRampToValueAtTime(5200, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.97); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(hp).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.02);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(960, t + dur);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(gain * 0.22, t + dur * 0.97); og.gain.linearRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function pop(ctx, out, t, gain = 0.4) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(480, t); o.frequency.exponentialRampToValueAtTime(920, t + 0.06);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.16);
}

// lista os efeitos que entram (usada também para mostrar o resumo na tela)
export function planSfx(ev, level, hasTitle, outDur) {
  const list = [];
  if (level === 'off') return list;
  if (hasTitle) list.push({ type: 'pop', t: 0.04, at: 0.04 });
  if (ev.impact != null) {
    if (level === 'full' && ev.impact > 1.4) list.push({ type: 'riser', t: ev.impact - 1.2, at: ev.impact, end: true });
    list.push({ type: 'impact', t: ev.impact, at: ev.impact });
  }
  if (level === 'full') for (const p of ev.punches) if (p !== ev.impact && p > 0.3 && p < outDur - 0.4) list.push({ type: 'whoosh', t: Math.max(0, p - 0.22), at: p });
  return list;
}

// mixagem final: áudio original + música + efeitos, com limitador e fade no final
export async function mixAudio({ main, music, musicVol = 0.2, ev, sfx = 'full', hasTitle = false, outDur, userSfx = null }) {
  const plan = planSfx(ev, sfx, hasTitle, outDur);
  if (!main && !music && !plan.length) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(outDur * SR), SR);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -5; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.18;
  const master = ctx.createGain();
  master.gain.setValueAtTime(1, Math.max(0, outDur - 0.3)); master.gain.linearRampToValueAtTime(0.0001, outDur);
  comp.connect(master).connect(ctx.destination);
  if (main) { const s = ctx.createBufferSource(); s.buffer = main; s.connect(comp); s.start(0); }
  if (music) {
    const s = ctx.createBufferSource(); s.buffer = music; s.loop = true;
    const g = ctx.createGain(), v = Math.max(0, Math.min(1, musicVol)) * (main ? 0.6 : 0.9);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(v, Math.min(0.6, outDur / 4));
    g.gain.setValueAtTime(v, Math.max(0.7, outDur - 1.2)); g.gain.linearRampToValueAtTime(0.0001, outDur);
    s.connect(g).connect(comp); s.start(0);
  }
  if (plan.length) {
    const bus = ctx.createGain(); bus.gain.value = sfx === 'soft' ? 0.4 : 0.55; bus.connect(comp);
    const noise = noiseBuffer(ctx, 2);
    for (const e of plan) {
      const own = userSfx?.[e.type];
      if (own) { playOwn(ctx, bus, own, e.at ?? e.t, e.end); continue; }
      if (e.type === 'whoosh') whoosh(ctx, bus, noise, e.t);
      else if (e.type === 'impact') impact(ctx, bus, noise, e.t);
      else if (e.type === 'riser') riser(ctx, bus, noise, e.t);
      else pop(ctx, bus, e.t);
    }
  }
  return ctx.startRendering();
}

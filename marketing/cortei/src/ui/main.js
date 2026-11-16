// Cortei · interface. Todo o processamento acontece no navegador do usuário.
import { CanvasSink } from 'mediabunny';
import { openVideo, fmtTime, UserError } from '../engine/media.js';
import { audioEnvelope, motionCurve, buildAnalysis, findCandidates, buildSegments, buildEvents, mapTime, DEFAULT_STYLE } from '../engine/analyze.js';
import { Compositor, outputSize, chunkWords, CAPTION_STYLES } from '../engine/compose.js';
import { buildTimelineAudio, toMono16k, decodeAudioFile, mixAudio, planSfx } from '../engine/audio.js';
import { exportClip, QUALITIES } from '../engine/export.js';
import { analyzeReference, styleFromReferences } from '../engine/reference.js';

const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } } };
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
const params = new URLSearchParams(location.search);
// 1080p e 2K vão gastar créditos quando o sistema de créditos entrar; nesta versão de base ficam liberados
const PRO_LOCKED = false;
const FULL_MAX = 600; // modo "vídeo todo": até 10 minutos

const S = {
  mode: 'clip', media: null, A: null, analyzing: null, clipLen: 40, aspect: '9:16', framing: 'blur',
  cands: [], pick: 0, adjust: 0, cut: true, tl: null, ev: null,
  cap: { on: true, words: null, key: '', style: 'impacto', pos: 'auto', lang: 'pt', model: 'base', busy: false },
  title: { text: '', mode: 'all' }, zoom: true, bar: true, sfx: 'soft',
  music: { buffer: null, name: '', vol: 0.25, url: '' }, quality: 720,
  refs: store.get('cortei_refs') || [], style: null, mainAudio: null, mainKey: '', result: null, abort: null,
};
S.style = styleFromReferences(S.refs);
const style = () => S.style || DEFAULT_STYLE;

// ---------------------------------------------------------------- telas
const SCREENS = ['home', 'setup', 'editor', 'done'];
function show(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('btnNew').hidden = name === 'home';
  if (name !== 'editor') pause();
  window.scrollTo(0, 0);
}
function chips(el, items, value, onPick) {
  el.innerHTML = items.map((it) => `<button type="button" class="chip${it.v === value ? ' on' : ''}" data-v="${it.v}" aria-pressed="${it.v === value}">${it.t}${it.pro ? ' <span class="pill pro">Pro</span>' : ''}</button>`).join('');
  el.querySelectorAll('.chip').forEach((b) => (b.onclick = () => onPick(isNaN(b.dataset.v) || b.dataset.v === '' ? b.dataset.v : Number(b.dataset.v))));
}
const setBar = (box, p) => { const i = box.querySelector('.bar i') || box.querySelector('i'); if (i) i.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; };
const say = (el, text) => { el.textContent = text || ''; el.hidden = !text; };

// ---------------------------------------------------------------- início
document.querySelectorAll('.mode').forEach((b) => (b.onclick = () => {
  S.mode = b.dataset.mode;
  document.querySelectorAll('.mode').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
}));
const drop = $('drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => { const f = ev.dataTransfer?.files?.[0]; if (f) loadFile(f); });
$('file').onchange = (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
$('btnNew').onclick = $('btnNew2').onclick = () => { reset(); show('home'); };

function reset() {
  S.abort?.abort(); pause();
  try { S.media?.input.dispose(); } catch { /* já fechado */ }
  if (S.srcUrl) URL.revokeObjectURL(S.srcUrl);
  if (S.result?.url) URL.revokeObjectURL(S.result.url);
  Object.assign(S, { media: null, A: null, analyzing: null, cands: [], pick: 0, adjust: 0, tl: null, ev: null, mainAudio: null, mainKey: '', result: null, srcUrl: '' });
  S.cap.words = null; S.cap.key = '';
  $('src').removeAttribute('src'); $('src').load();
}

async function loadFile(file) {
  say($('homeErr'), '');
  reset();
  try {
    S.media = await openVideo(file);
  } catch (e) { say($('homeErr'), e instanceof UserError ? e.message : 'Não consegui abrir esse vídeo. Tente outro arquivo.'); return; }
  const m = S.media;
  $('fileName').textContent = file.name;
  $('fileMeta').textContent = `${fmtTime(m.span)} · ${m.width}×${m.height} · ${(file.size / 1048576).toFixed(file.size > 1e9 ? 0 : 1)} MB${m.audio ? '' : ' · sem áudio'}`;
  let note = m.audioNote || '';
  if (S.mode === 'full' && m.span > FULL_MAX) { S.mode = 'clip'; note = `Esse vídeo tem mais de 10 minutos, então o modo "editar o vídeo todo" não está disponível para ele nesta versão. Vou criar clipes dos melhores momentos. ${note}`; }
  say($('setupNote'), note);
  $('durStep').hidden = S.mode === 'full';
  $('btnFind').textContent = S.mode === 'full' ? 'Editar o vídeo' : 'Encontrar os melhores momentos';
  document.querySelector('#done h2').textContent = S.mode === 'full' ? 'Seu vídeo está pronto' : 'Seu clipe está pronto';
  document.querySelector('#exporting h3').textContent = S.mode === 'full' ? 'Exportando o vídeo' : 'Exportando o clipe';
  if (S.mode === 'clip' && m.span < S.clipLen) S.clipLen = Math.max(5, Math.floor(m.span));
  renderSetup(); show('setup');
  $('btnFind').disabled = false; $('anaProg').hidden = true;
  S.srcUrl = URL.createObjectURL(file);
  const v = $('src'); v.src = S.srcUrl; v.muted = false; S.pvFallback = false;
  v.onerror = () => { S.pvFallback = true; };
  S.thumbs = new CanvasSink(m.video, { width: 320, height: Math.max(2, Math.round((320 * m.height) / m.width / 2) * 2), fit: 'fill', poolSize: 0 });
  startAnalysis();
}

const DURS = [15, 30, 40, 60, 90];
function renderSetup() {
  const durs = DURS.filter((d) => d <= S.media.span + 0.5).map((d) => ({ v: d, t: d + ' s' }));
  const pickDur = (d) => { S.clipLen = d; $('durCustom').value = ''; renderSetup(); if ($('editor').hidden === false) recompute(true); };
  chips($('durChips'), durs, S.clipLen, pickDur); chips($('durChips2'), durs, S.clipLen, pickDur);
  const asp = [{ v: '9:16', t: 'Vertical 9:16' }, { v: '1:1', t: 'Quadrado 1:1' }, { v: '16:9', t: 'Horizontal 16:9' }];
  const pickAsp = (a) => { S.aspect = a; renderSetup(); if ($('editor').hidden === false) { setupPreview(); refresh(); } };
  chips($('aspChips'), asp, S.aspect, pickAsp); chips($('aspChips2'), asp, S.aspect, pickAsp);
}
$('durCustom').onchange = (e) => { const v = Math.round(Number(e.target.value)); if (v >= 5) { S.clipLen = Math.min(180, v, Math.floor(S.media.span)); renderSetup(); } };

function startAnalysis() {
  const m = S.media, ac = new AbortController(); S.abort = ac;
  const prog = { a: 0, v: 0 };
  const upd = () => { const p = m.audio ? prog.a * 0.6 + prog.v * 0.4 : prog.v; setBar($('anaProg'), p); $('anaText').textContent = `Analisando o vídeo... ${Math.round(p * 100)}%`; };
  S.analyzing = (async () => {
    const db = m.audio ? await audioEnvelope(m, (p) => { prog.a = p; upd(); }, ac.signal) : null; prog.a = 1;
    let motion = null;
    try { motion = await motionCurve(m, (p) => { prog.v = p; upd(); }, ac.signal); } catch (e) { if (e.name === 'AbortError') throw e; }
    prog.v = 1; upd();
    S.A = buildAnalysis(m, db, motion);
    return S.A;
  })();
  S.analyzing.catch(() => {});
}

$('btnFind').onclick = async () => {
  $('btnFind').disabled = true; $('anaProg').hidden = false;
  try { await S.analyzing; } catch (e) { if (e.name !== 'AbortError') { say($('setupNote'), 'Não consegui analisar esse vídeo. Tente outro arquivo ou use o Google Chrome.'); $('btnFind').disabled = false; } return; }
  await document.fonts.load('900 40px Montserrat').catch(() => {}); await document.fonts.load('800 40px "Plus Jakarta Sans"').catch(() => {});
  S.pick = 0; S.adjust = 0;
  renderEditorStatic(); setupPreview(); recompute(true); show('editor');
};

// ---------------------------------------------------------------- editor
function renderEditorStatic() {
  $('momCard').hidden = S.mode === 'full'; $('durBox').hidden = S.mode === 'full';
  $('btnExport').textContent = S.mode === 'full' ? 'Exportar vídeo' : 'Exportar clipe';
  const re = () => { renderEditorStatic(); refresh(); };
  chips($('frmChips'), [{ v: 'blur', t: 'Vídeo inteiro + fundo desfocado' }, { v: 'mid', t: 'Meio-termo' }, { v: 'fill', t: 'Tela cheia (corta as laterais)' }], S.framing, (v) => { S.framing = v; re(); });
  chips($('styChips'), Object.entries(CAPTION_STYLES).map(([v, s]) => ({ v, t: s.nome })), S.cap.style, (v) => { S.cap.style = v; re(); });
  chips($('posChips'), [{ v: 'auto', t: 'Automática' }, { v: 'centro', t: 'Centro' }, { v: 'baixo', t: 'Embaixo' }], S.cap.pos, (v) => { S.cap.pos = v; re(); });
  chips($('ttlChips'), [{ v: 'all', t: 'O vídeo todo' }, { v: 'start', t: 'Só no começo (4 s)' }], S.title.mode, (v) => { S.title.mode = v; re(); });
  chips($('sfxChips'), [{ v: 'off', t: 'Nenhum' }, { v: 'soft', t: 'Discretos' }, { v: 'full', t: 'Completos' }], S.sfx, (v) => { S.sfx = v; re(); });
  chips($('qChips'), Object.entries(QUALITIES).map(([v, q]) => ({ v: Number(v), t: q.nome, pro: Number(v) > 720 })), S.quality, (v) => { if (PRO_LOCKED && v > 720) return; S.quality = v; re(); });
  const { W, H } = outputSize(S.aspect, S.quality);
  $('qInfo').textContent = `${W}×${H}. 720p é a qualidade padrão. 1080p e 2K são opções Pro${PRO_LOCKED ? '.' : ' (liberadas nesta versão de teste).'}`;
}

const tlKey = () => JSON.stringify(S.tl.segments.map((g) => [Math.round(g.s * 100), Math.round(g.e * 100)]));

// recalcula os trechos e os eventos quando muda duração, momento, início ou corte de silêncio
function recompute(newCands) {
  if (S.mode === 'full') { S.cands = [{ start: S.A.t0, score: 1, rel: 1 }]; S.pick = 0; }
  else if (newCands || !S.cands.length) { S.cands = findCandidates(S.A, S.clipLen, 3); S.pick = Math.min(S.pick, S.cands.length - 1); renderMoments(); }
  const len = S.mode === 'full' ? S.media.span : S.clipLen;
  S.tl = buildSegments(S.A, S.cands[S.pick].start, len, { cutSilence: S.cut, adjust: S.adjust, style: style() });
  S.ev = buildEvents(S.A, S.tl, style());
  const g0 = S.tl.segments[0], gl = S.tl.segments[S.tl.segments.length - 1], cuts = S.tl.segments.length - 1;
  $('cutInfo').textContent = `Trecho do vídeo original: ${fmtTime(g0.s)} até ${fmtTime(gl.e)} · ${S.mode === 'full' ? 'vídeo final' : 'clipe'} com ${S.tl.outDur.toFixed(1).replace('.', ',')} s${cuts ? ` · ${cuts} ${cuts === 1 ? 'corte' : 'cortes'}` : ''}${S.style ? ' · no ritmo das suas referências' : ''}`;
  if (!S.A.hasAudio) $('optCut').closest('.switch').hidden = true;
  const stale = S.cap.words && S.cap.key !== tlKey();
  if (stale) { say($('capErr'), 'O corte mudou. Gere as legendas de novo para elas acompanharem o novo trecho.'); }
  else if (!S.cap.busy) say($('capErr'), '');
  pv.t = 0; $('scrub').max = S.tl.outDur; $('scrub').value = 0;
  refresh(); seek(0);
}

async function renderMoments() {
  const box = $('moments'), names = ['Melhor momento', '2ª opção', '3ª opção'];
  box.innerHTML = S.cands.map((c, i) => `<button type="button" class="moment${i === S.pick ? ' on' : ''}" data-i="${i}"><img alt="" data-t="${c.start}"><b>${names[i]}</b><small>começa em ${fmtTime(c.start)}</small><div class="meter"><i style="width:${Math.round(30 + 70 * (c.rel ?? 1))}%"></i></div></button>`).join('');
  box.querySelectorAll('.moment').forEach((b) => (b.onclick = () => { S.pick = Number(b.dataset.i); S.adjust = 0; box.querySelectorAll('.moment').forEach((x) => x.classList.toggle('on', x === b)); recompute(false); }));
  for (const img of box.querySelectorAll('img')) {
    try { const wc = await S.thumbs.getCanvas(Number(img.dataset.t) + 1); if (wc) img.src = wc.canvas.toDataURL('image/jpeg', 0.7); } catch { /* sem miniatura */ }
  }
}

document.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => { S.adjust += Number(b.dataset.adj); recompute(false); }));
$('optCut').onchange = (e) => { S.cut = e.target.checked; recompute(false); };
$('capOn').onchange = (e) => { S.cap.on = e.target.checked; refresh(); };
$('capLang').onchange = (e) => { S.cap.lang = e.target.value; };
$('capModel').onchange = (e) => { S.cap.model = e.target.value; };
$('title').oninput = (e) => { S.title.text = e.target.value; refresh(); };
$('optZoom').onchange = (e) => { S.zoom = e.target.checked; refresh(); };
$('optBar').onchange = (e) => { S.bar = e.target.checked; refresh(); };

// estado que o compositor usa (o mesmo na prévia e na exportação)
function compState() {
  const fresh = S.cap.words && S.cap.key === tlKey();
  return { framing: S.framing, tl: S.tl, ev: S.ev, fx: { zoom: S.zoom, progress: S.bar }, cap: { on: S.cap.on && !!fresh, chunks: fresh ? S.cap.chunks : [], style: S.cap.style, pos: S.cap.pos }, title: { text: S.title.text, mode: S.title.mode } };
}

// ---------------------------------------------------------------- prévia
const pv = { t: 0, k: 0, playing: false, comp: null, ctx: null, raf: 0, st: null };
function setupPreview() {
  const { W, H } = outputSize(S.aspect, 540), c = $('pv');
  c.width = W; c.height = H; pv.ctx = c.getContext('2d', { alpha: false }); pv.comp = new Compositor(W, H);
  $('phone').classList.toggle('wide', W >= H);
}
function refresh() {
  if (!S.tl) return;
  pv.st = compState();
  const plan = planSfx(S.ev, S.sfx, !!S.title.text.trim(), S.tl.outDur), n = (t) => plan.filter((p) => p.type === t).length;
  $('sfxInfo').textContent = S.sfx === 'off' ? 'Sem efeitos sonoros.' : plan.length ? `Neste clipe: ${[n('impact') && 'impacto no momento mais forte', n('riser') && 'subida antes do impacto', n('whoosh') && `${n('whoosh')} transições`, n('pop') && 'toque no título'].filter(Boolean).join(', ')}. São sons criados pelo próprio app, livres de direitos.` : 'Nenhum momento forte foi encontrado neste trecho para colocar efeito.';
  drawPreview();
}
async function drawPreview() {
  if (!pv.st || !pv.ctx) return;
  const v = $('src'), m = S.media;
  if (!S.pvFallback && v.readyState >= 2 && v.videoWidth) pv.comp.draw(pv.ctx, v, v.videoWidth, v.videoHeight, pv.t, pv.st);
  else if (S.pvFallback) {
    // o navegador não toca esse arquivo direto: mostra o quadro parado
    const my = (pv.fbSeq = (pv.fbSeq || 0) + 1);
    try { const wc = await S.thumbs.getCanvas(mapTime(S.tl, pv.t).src); if (wc && my === pv.fbSeq) pv.comp.draw(pv.ctx, wc.canvas, m.width, m.height, pv.t, pv.st); } catch { /* sem quadro */ }
    $('pvNote').textContent = 'Seu navegador não reproduz esse arquivo na prévia, então ela mostra só o quadro parado. A exportação funciona normalmente.'; $('pvNote').classList.add('show');
  }
  $('clock').textContent = `${fmtTime(pv.t)} / ${fmtTime(S.tl.outDur)}`;
}
function seek(t) {
  pv.t = Math.max(0, Math.min(S.tl.outDur - 0.01, t));
  const m = mapTime(S.tl, pv.t); pv.k = m.k;
  const v = $('src');
  if (!S.pvFallback) { try { v.currentTime = m.src; } catch { /* ainda carregando */ } }
  drawPreview();
}
$('src').addEventListener('seeked', drawPreview);
$('src').addEventListener('loadeddata', drawPreview);
function setPlayIcon() { $('playIcon').setAttribute('d', pv.playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'); $('btnPlay').setAttribute('aria-label', pv.playing ? 'Pausar' : 'Reproduzir'); }
function play() {
  if (S.pvFallback || !S.tl) return;
  const v = $('src'); if (pv.t >= S.tl.outDur - 0.05) seek(0);
  pv.playing = true; setPlayIcon();
  v.play().catch(() => { pv.playing = false; setPlayIcon(); });
  const mu = $('musicEl');
  if (S.music.url) { mu.volume = Math.min(1, S.music.vol * 0.6); try { mu.currentTime = pv.t % (mu.duration || 1e9); } catch { /* sem duração ainda */ } mu.play().catch(() => {}); }
  cancelAnimationFrame(pv.raf); pv.raf = requestAnimationFrame(loop);
}
function pause() {
  pv.playing = false; cancelAnimationFrame(pv.raf);
  try { $('src').pause(); $('musicEl').pause(); } catch { /* nada tocando */ }
  setPlayIcon();
}
function loop() {
  if (!pv.playing) return;
  const v = $('src'), segs = S.tl.segments; let g = segs[pv.k], ts = v.currentTime;
  if (ts >= g.e - 0.03 || v.ended) {
    if (pv.k < segs.length - 1) { pv.k++; g = segs[pv.k]; v.currentTime = g.s; ts = g.s; }
    else { pause(); seek(0); return; }
  }
  pv.t = g.out + Math.max(0, Math.min(g.dur, ts - g.s));
  $('scrub').value = pv.t; drawPreview();
  pv.raf = requestAnimationFrame(loop);
}
$('btnPlay').onclick = () => (pv.playing ? pause() : play());
$('scrub').oninput = (e) => { pause(); seek(Number(e.target.value)); };

// ---------------------------------------------------------------- legendas
let asr = null;
async function timelineAudio() {
  const key = tlKey();
  if (S.mainKey !== key) { S.mainAudio = await buildTimelineAudio(S.media, S.tl); S.mainKey = key; }
  return S.mainAudio;
}
$('btnCap').onclick = async () => {
  if (S.cap.busy) return;
  if (!S.media.audio) { say($('capErr'), 'Esse vídeo não tem áudio, então não há fala para transcrever.'); return; }
  S.cap.busy = true; $('btnCap').disabled = true; say($('capErr'), ''); $('capProg').hidden = false; setBar($('capProg'), 0.02); $('capText').textContent = 'Preparando o áudio...';
  const key = tlKey();
  try {
    const pcm = await toMono16k(await timelineAudio());
    const words = await new Promise((resolve, reject) => {
      asr = asr || new Worker('/assets/asr-worker.js', { type: 'module' });
      asr.onerror = (e) => reject(new Error(e.message || 'falha ao carregar o reconhecimento de fala'));
      asr.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'download') { setBar($('capProg'), 0.05 + 0.6 * (m.loaded / m.total)); $('capText').textContent = `Baixando o reconhecimento de fala (só na primeira vez)... ${Math.round(m.loaded / 1048576)} de ${Math.round(m.total / 1048576)} MB`; }
        else if (m.type === 'stage' && m.stage === 'transcribing') { setBar($('capProg'), 0.7); $('capText').textContent = 'Transcrevendo a fala... isso pode levar alguns minutos.'; }
        else if (m.type === 'done') resolve(m.words);
        else if (m.type === 'error') reject(new Error(m.message));
      };
      asr.postMessage({ type: 'run', audio: pcm, model: S.cap.model, language: S.cap.lang, ortBase: isLocal ? '/ort/' : null, lib: isLocal ? '/tf/transformers.min.js' : null, device: params.get('asr') || null }, [pcm.buffer]);
    });
    // organiza os tempos (o modelo às vezes devolve tempos repetidos ou fora de ordem)
    let last = 0; const clean = [];
    for (const w of words) { const start = Math.max(last, Math.min(S.tl.outDur, w.start || 0)), end = Math.max(start + 0.08, Math.min(S.tl.outDur, w.end || start + 0.3)); clean.push({ text: w.text, start, end }); last = start; }
    S.cap.words = clean; S.cap.key = key; S.cap.chunks = chunkWords(clean);
    if (!clean.length) say($('capErr'), 'Não encontrei fala nesse trecho.');
    renderWords(); refresh();
  } catch (e) {
    say($('capErr'), 'Não consegui gerar as legendas. Confira a internet (o reconhecimento de fala é baixado na primeira vez) e tente de novo. Se continuar, use a precisão "Rápida".');
    console.error(e);
  }
  S.cap.busy = false; $('btnCap').disabled = false; $('capProg').hidden = true;
};
function renderWords() {
  const box = $('words'); $('capEdit').hidden = !S.cap.words?.length;
  box.innerHTML = '';
  (S.cap.words || []).forEach((w, i) => {
    const sp = document.createElement('span'); sp.contentEditable = 'true'; sp.spellcheck = false; sp.textContent = w.text; sp.setAttribute('role', 'textbox'); sp.setAttribute('aria-label', 'Palavra ' + (i + 1));
    sp.oninput = () => { w.text = sp.textContent.replace(/\s+/g, ' ').trim(); S.cap.chunks = chunkWords(S.cap.words); refresh(); };
    sp.onfocus = () => { pause(); seek(w.start + 0.02); };
    sp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } };
    box.appendChild(sp);
  });
}

// ---------------------------------------------------------------- música
$('music').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('musicInfo').textContent = 'Carregando a música...';
  try {
    S.music.buffer = await decodeAudioFile(f); S.music.name = f.name;
    if (S.music.url) URL.revokeObjectURL(S.music.url);
    S.music.url = URL.createObjectURL(f); $('musicEl').src = S.music.url; $('musicEl').loop = true;
    $('musicInfo').textContent = `${f.name} · ${fmtTime(S.music.buffer.duration)}. Use só música que você tem direito de usar.`;
    $('musicDel').hidden = false; $('musicVolBox').hidden = false;
  } catch { $('musicInfo').textContent = 'Não consegui abrir essa música. Tente um arquivo MP3 ou WAV.'; }
};
$('musicDel').onclick = () => { S.music.buffer = null; if (S.music.url) URL.revokeObjectURL(S.music.url); S.music.url = ''; $('musicEl').removeAttribute('src'); $('musicDel').hidden = true; $('musicVolBox').hidden = true; $('musicInfo').textContent = 'Música removida.'; };
$('musicVol').oninput = (e) => { S.music.vol = Number(e.target.value) / 100; $('musicEl').volume = Math.min(1, S.music.vol * 0.6); };

// ---------------------------------------------------------------- exportar
$('btnExport').onclick = async () => {
  pause();
  const ac = new AbortController(); S.abort = ac;
  $('exporting').hidden = false; setBar($('exporting'), 0); $('expText').textContent = 'Preparando o áudio...';
  try {
    const main = await timelineAudio();
    const mixed = await mixAudio({ main, music: S.music.buffer, musicVol: S.music.vol, ev: S.ev, sfx: S.sfx, hasTitle: !!S.title.text.trim(), outDur: S.tl.outDur });
    const r = await exportClip({
      media: S.media, tl: S.tl, state: compState(), aspect: S.aspect, quality: S.quality, mixed, signal: ac.signal,
      onProgress: (p, secs) => { setBar($('exporting'), p); const left = p > 0.03 ? (secs / p) * (1 - p) : null; $('expText').textContent = `${Math.round(p * 100)}%${left != null ? ` · falta cerca de ${left < 60 ? Math.ceil(left) + ' s' : Math.ceil(left / 60) + ' min'}` : ''}`; },
    });
    if (S.result?.url) URL.revokeObjectURL(S.result.url);
    const name = `cortei-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${r.ext}`;
    S.result = { ...r, url: URL.createObjectURL(r.blob), name };
    $('result').src = S.result.url; $('btnDown').href = S.result.url; $('btnDown').download = name;
    $('doneMeta').textContent = `${r.W}×${r.H} · ${fmtTime(S.tl.outDur)} · ${(r.blob.size / 1048576).toFixed(1)} MB · exportado em ${Math.round(r.seconds)} s`;
    say($('doneNote'), r.social ? '' : 'Seu navegador não gera MP4, então o vídeo saiu em WebM, que algumas redes não aceitam. Para sair em MP4, use o Google Chrome.');
    $('btnSave').hidden = !(isMobile && navigator.canShare);
    show('done');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); alertBox('Não consegui exportar. Tente a qualidade 720p ou use o Google Chrome atualizado.'); }
  }
  $('exporting').hidden = true;
};
$('btnCancel').onclick = () => S.abort?.abort();
function alertBox(text) { say($('capErr'), ''); const n = $('pvNote'); n.textContent = text; n.style.color = '#991b1b'; n.classList.add('show'); n.scrollIntoView({ block: 'center' }); }
$('btnBack').onclick = () => { show('editor'); seek(pv.t); };
$('btnSave').onclick = async () => {
  const r = S.result, file = new File([r.blob], r.name, { type: r.mime });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Meu clipe' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  $('btnDown').click();
};

// ---------------------------------------------------------------- vídeos de referência
function renderRefs() {
  const st = S.style;
  $('refPill').hidden = !st; $('refClear').hidden = !st;
  if (st) {
    $('refPill').textContent = 'Ritmo aprendido';
    $('refInfo').textContent = `Aprendido com ${st.refs} ${st.refs === 1 ? 'vídeo' : 'vídeos'}: ${st.avgShot ? `um corte a cada ${st.avgShot.toFixed(1).replace('.', ',')} s` : 'sem cortes de imagem detectados'}${st.maxPause != null ? ` · pausas de até ${st.maxPause.toFixed(1).replace('.', ',')} s` : ''}. Seus próximos vídeos serão editados nesse ritmo.`;
  } else $('refInfo').textContent = 'Nenhuma referência ainda: o Cortei usa o ritmo padrão.';
}
$('refFiles').onchange = async (e) => {
  const files = [...e.target.files].slice(0, 5); e.target.value = ''; if (!files.length) return;
  $('refBar').hidden = false; const out = [];
  for (let i = 0; i < files.length; i++) {
    $('refInfo').textContent = `Analisando a referência ${i + 1} de ${files.length}...`;
    try { out.push(await analyzeReference(files[i], (p) => setBar($('refBar'), (i + p) / files.length))); } catch { /* arquivo que não abre é ignorado */ }
  }
  $('refBar').hidden = true;
  if (!out.length) { $('refInfo').textContent = 'Não consegui ler esses vídeos. Tente arquivos MP4.'; return; }
  S.refs = out.map(({ seconds, cuts, cutsPerMin, maxPause }) => ({ seconds, cuts, cutsPerMin, maxPause })); store.set('cortei_refs', S.refs);
  S.style = styleFromReferences(S.refs); renderRefs();
};
$('refClear').onclick = () => { S.refs = []; S.style = null; store.set('cortei_refs', []); renderRefs(); };
renderRefs();

window.__cortei = S; // usado nos testes automáticos
window.__corteiSetWords = (w) => { S.cap.words = w; S.cap.key = tlKey(); S.cap.chunks = chunkWords(w); renderWords(); refresh(); }; // idem

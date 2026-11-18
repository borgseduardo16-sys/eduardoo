// Cortei · interface. Todo o processamento acontece no navegador do usuário.
import { CanvasSink } from 'mediabunny';
import { fmtTime, UserError } from '../engine/media.js';
import { findCandidates, buildSegments, buildEvents, mapTime, toOut, wordsToTimeline, DEFAULT_STYLE, HOP } from '../engine/analyze.js';
import { Compositor, outputSize, chunkWords, CAPTION_STYLES, FONTS } from '../engine/compose.js';
import { buildTimelineAudio, toMono16k, decodeAudioFile, mixAudio, planSfx, soundPeak } from '../engine/audio.js';
import { exportClip, QUALITIES } from '../engine/export.js';
import { analyzeReference, styleFromReferences } from '../engine/reference.js';
import { openClip, analyzeClip, makeProject, combineAnalysis, segSource, locate, MAX_CLIPS } from '../engine/project.js';
import { detectRetakes, snapFix } from '../engine/retakes.js';
import { features, speechIslands, findRestarts } from '../engine/stutter.js';
import { saveFile, loadFile as loadStored, removeFile } from './files-store.js';

const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } } };
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
const params = new URLSearchParams(location.search);
// 1080p e 2K vão gastar créditos quando o sistema de créditos entrar; nesta versão de base ficam liberados
const PRO_LOCKED = false;
const FULL_MAX = 1200; // modo "vídeo todo": até 20 minutos no total
const PIECE = 28; // a fala é transcrita em pedaços de até 28 s
const num = (v, d = 1) => v.toFixed(d).replace('.', ',');

const S = {
  mode: 'clip', clips: [], proj: null, A: null, clipLen: 40, aspect: '9:16', framing: 'blur',
  cands: [], pick: 0, adjust: 0, cut: true, tl: null, ev: null, segSrc: [],
  asr: { words: [], covered: [], islands: [], restarts: [], busy: false, lang: 'pt', model: 'base', approx: false, used: false },
  fixes: [], fixOn: true, fixUser: new Map(), fixWarn: '',
  cap: { on: true, style: 'impacto', pos: 'auto', font: null, color: null, words: [], chunks: [] },
  title: { text: '', mode: 'all' }, zoom: true, zoomAmt: 0.1, bar: false, sfx: 'soft',
  ownSfx: {}, ownFont: null,
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
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mb = (b) => (b / 1048576).toFixed(b > 1e9 ? 0 : 1) + ' MB';

// ---------------------------------------------------------------- início: escolher vídeos
document.querySelectorAll('.mode').forEach((b) => (b.onclick = () => {
  S.mode = b.dataset.mode;
  document.querySelectorAll('.mode').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
}));
const drop = $('drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => { const f = [...(ev.dataTransfer?.files || [])]; if (f.length) startWith(f); });
$('file').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) startWith(f); };
$('fileMore').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); };
$('btnNew').onclick = $('btnNew2').onclick = () => { reset(); show('home'); };

function reset() {
  S.abort?.abort(); pause();
  for (const c of S.clips) { try { c.input.dispose(); } catch { /* já fechado */ } if (c.url) URL.revokeObjectURL(c.url); }
  if (S.result?.url) URL.revokeObjectURL(S.result.url);
  $('srcBox').innerHTML = '';
  Object.assign(S, { clips: [], proj: null, A: null, cands: [], pick: 0, adjust: 0, tl: null, ev: null, segSrc: [], mainAudio: null, mainKey: '', result: null, fixes: [], fixUser: new Map(), fixWarn: '' });
  Object.assign(S.asr, { words: [], covered: [], islands: [], restarts: [], busy: false, approx: false, used: false });
  S.cap.words = []; S.cap.chunks = [];
}

async function startWith(files) {
  say($('homeErr'), '');
  reset();
  const ok = await addFiles(files, true);
  if (!ok) return;
  show('setup');
}

async function addFiles(files, first = false) {
  const errs = [];
  for (const f of files) {
    if (S.clips.length >= MAX_CLIPS) { errs.push(`Dá para juntar até ${MAX_CLIPS} vídeos.`); break; }
    try { const c = await openClip(f); c.size = f.size; S.clips.push(c); analyzeClip(c).catch(() => {}); }
    catch (e) { errs.push(`${f.name}: ${e instanceof UserError ? e.message : 'não consegui abrir esse vídeo.'}`); }
  }
  if (!S.clips.length) { say($('homeErr'), errs.join(' ') || 'Não consegui abrir esse vídeo.'); return false; }
  say(first ? $('homeErr') : $('setupErr'), '');
  say($('setupErr'), errs.join(' '));
  renderSetup();
  return true;
}

function renderClipList() {
  const box = $('clipList'), n = S.clips.length;
  box.innerHTML = S.clips.map((c, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(c.name)}</b><small>${fmtTime(c.span)} · ${c.width}×${c.height} · ${mb(c.size)}${c.audio ? '' : ' · sem áudio'}</small></div>
    <div class="acts">${n > 1 ? `<button type="button" data-up="${i}" aria-label="Subir" ${i ? '' : 'disabled'}>↑</button><button type="button" data-down="${i}" aria-label="Descer" ${i < n - 1 ? '' : 'disabled'}>↓</button>` : ''}<button type="button" data-del="${i}" aria-label="Remover">✕</button></div></li>`).join('');
  const swap = (i, j) => { [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]]; renderSetup(); };
  box.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => swap(+b.dataset.up, +b.dataset.up - 1)));
  box.querySelectorAll('[data-down]').forEach((b) => (b.onclick = () => swap(+b.dataset.down, +b.dataset.down + 1)));
  box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const [c] = S.clips.splice(+b.dataset.del, 1); try { c.input.dispose(); } catch { /* já fechado */ }
    if (!S.clips.length) { reset(); show('home'); return; }
    renderSetup();
  }));
  const span = S.clips.reduce((s, c) => s + c.span, 0);
  $('totalMeta').textContent = n > 1 ? `${n} vídeos · ${fmtTime(span)} no total` : fmtTime(span);
}

const DURS = [15, 30, 40, 60, 90];
const totalSpan = () => (S.proj ? S.proj.total : S.clips.reduce((s, c) => s + c.span, 0));
function renderSetup() {
  renderClipList();
  const span = totalSpan(), notes = S.clips.map((c) => c.audioNote).filter(Boolean);
  if (S.mode === 'full' && span > FULL_MAX) notes.unshift(`Juntos, os vídeos passam de 20 minutos. Para editar o vídeo todo, deixe no máximo 20 minutos no total. Se continuar assim, o Cortei cria um clipe com os melhores momentos.`);
  say($('setupNote'), notes.join(' '));
  const full = S.mode === 'full' && span <= FULL_MAX;
  $('durStep').hidden = full;
  $('btnFind').textContent = full ? (S.clips.length > 1 ? 'Juntar e editar' : 'Editar o vídeo') : 'Encontrar os melhores momentos';
  $('btnFind').disabled = false; $('anaProg').hidden = true;
  if (!full && span < S.clipLen) S.clipLen = Math.max(5, Math.floor(span));
  const durs = DURS.filter((d) => d <= span + 0.5).map((d) => ({ v: d, t: d + ' s' }));
  const pickDur = (d) => { S.clipLen = d; $('durCustom').value = ''; renderSetup(); if (!$('editor').hidden) recompute(true); };
  chips($('durChips'), durs, S.clipLen, pickDur); chips($('durChips2'), durs, S.clipLen, pickDur);
  const asp = [{ v: '9:16', t: 'Vertical 9:16' }, { v: '1:1', t: 'Quadrado 1:1' }, { v: '16:9', t: 'Horizontal 16:9' }];
  const pickAsp = (a) => { S.aspect = a; renderSetup(); if (!$('editor').hidden) { setupPreview(); refresh(); } };
  chips($('aspChips'), asp, S.aspect, pickAsp); chips($('aspChips2'), asp, S.aspect, pickAsp);
}
$('durCustom').onchange = (e) => { const v = Math.round(Number(e.target.value)); if (v >= 5) { S.clipLen = Math.min(180, v, Math.floor(totalSpan())); renderSetup(); } };

$('btnFind').onclick = async () => {
  $('btnFind').disabled = true; $('anaProg').hidden = false;
  const ac = new AbortController(); S.abort = ac;
  const prog = S.clips.map(() => 0);
  const upd = () => { const p = prog.reduce((a, b) => a + b, 0) / prog.length; setBar($('anaProg'), p); $('anaText').textContent = `Analisando ${S.clips.length > 1 ? 'os vídeos' : 'o vídeo'}... ${Math.round(p * 100)}%`; };
  let parts;
  try { parts = await Promise.all(S.clips.map((c, i) => analyzeClip(c, (p) => { prog[i] = p; upd(); }, ac.signal))); }
  catch (e) { if (e.name !== 'AbortError') { say($('setupNote'), 'Não consegui analisar esses vídeos. Tente outro arquivo ou use o Google Chrome.'); $('btnFind').disabled = false; } return; }
  S.proj = makeProject(S.clips); S.A = combineAnalysis(S.proj, parts);
  if (S.mode === 'full' && S.proj.total > FULL_MAX) S.mode = 'clip';
  Object.assign(S.asr, { words: [], covered: [], islands: [], restarts: [], approx: false, used: false }); S.fixes = []; S.fixUser = new Map(); S.fixWarn = '';
  await Promise.all(['900 40px Montserrat', '800 40px "Plus Jakarta Sans"', '800 40px Poppins', '40px Anton', '40px "Bebas Neue"'].map((f) => document.fonts.load(f).catch(() => {})));
  setupVideos();
  S.pick = 0; S.adjust = 0;
  const full = S.mode === 'full';
  document.querySelector('#done h2').textContent = full ? 'Seu vídeo está pronto' : 'Seu clipe está pronto';
  document.querySelector('#exporting h3').textContent = full ? 'Exportando o vídeo' : 'Exportando o clipe';
  $('speechCard').hidden = !S.A.hasAudio; $('btnAsr').hidden = false; $('btnAsr').textContent = 'Ouvir a fala'; say($('asrErr'), '');
  renderEditorStatic(); setupPreview(); recompute(true); renderFixes(); show('editor');
};

// um <video> escondido por arquivo: é dele que a prévia tira os quadros
function setupVideos() {
  const box = $('srcBox'); box.innerHTML = '';
  S.vids = S.clips.map((c) => {
    if (!c.url) c.url = URL.createObjectURL(c.file);
    const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.src = c.url;
    v.addEventListener('error', () => { c.noPlay = true; drawPreview(); });
    v.addEventListener('seeked', drawPreview); v.addEventListener('loadeddata', drawPreview);
    box.appendChild(v);
    if (!c.thumbs) c.thumbs = new CanvasSink(c.video, { width: 320, height: Math.max(2, Math.round((320 * c.height) / c.width / 2) * 2), fit: 'fill', poolSize: 0 });
    return v;
  });
}

// ---------------------------------------------------------------- editor
function renderEditorStatic() {
  const full = S.mode === 'full';
  $('momCard').hidden = full; $('durBox').hidden = full;
  $('btnExport').textContent = full ? 'Exportar vídeo' : 'Exportar clipe';
  const re = () => { renderEditorStatic(); refresh(); };
  chips($('frmChips'), [{ v: 'blur', t: 'Vídeo inteiro + fundo desfocado' }, { v: 'mid', t: 'Meio-termo' }, { v: 'fill', t: 'Tela cheia (corta as laterais)' }], S.framing, (v) => { S.framing = v; re(); });
  chips($('styChips'), Object.entries(CAPTION_STYLES).map(([v, s]) => ({ v, t: s.nome })), S.cap.style, (v) => { S.cap.style = v; re(); });
  const fonts = Object.entries(FONTS).filter(([k]) => k !== 'propria' || S.ownFont).map(([v, f]) => ({ v, t: f.nome }));
  chips($('fontChips'), fonts, S.cap.font || CAPTION_STYLES[S.cap.style].font, (v) => { S.cap.font = v; re(); });
  $('fontChips').querySelectorAll('.chip').forEach((b) => (b.style.fontFamily = { montserrat: 'Montserrat', poppins: 'Poppins', anton: 'Anton', bebas: '"Bebas Neue"', propria: 'CorteiUser' }[b.dataset.v] || ''));
  $('capColor').value = S.cap.color || CAPTION_STYLES[S.cap.style].color.toLowerCase();
  chips($('posChips'), [{ v: 'auto', t: 'Automática' }, { v: 'topo', t: 'Em cima' }, { v: 'centro', t: 'Centro' }, { v: 'baixo', t: 'Embaixo' }], S.cap.pos, (v) => { S.cap.pos = v; re(); });
  chips($('ttlChips'), [{ v: 'all', t: 'O vídeo todo' }, { v: 'start', t: 'Só no começo (4 s)' }], S.title.mode, (v) => { S.title.mode = v; re(); });
  chips($('sfxChips'), [{ v: 'off', t: 'Nenhum' }, { v: 'soft', t: 'Discretos' }, { v: 'full', t: 'Completos' }], S.sfx, (v) => { S.sfx = v; re(); });
  chips($('qChips'), Object.entries(QUALITIES).map(([v, q]) => ({ v: Number(v), t: q.nome, pro: Number(v) > 720 })), S.quality, (v) => { if (PRO_LOCKED && v > 720) return; S.quality = v; re(); });
  $('optZoom').checked = S.zoom; $('optBar').checked = S.bar; $('optCut').checked = S.cut; $('optFix').checked = S.fixOn; $('capOn').checked = S.cap.on;
  const { W, H } = outputSize(S.aspect, S.quality);
  $('qInfo').textContent = `${W}×${H}. 720p é a qualidade padrão. 1080p e 2K são opções Pro${PRO_LOCKED ? '.' : ' (liberadas nesta versão de teste).'}`;
  renderOwnSfx();
}

const fixActive = (f) => S.fixOn && (S.fixUser.has(f.key) ? S.fixUser.get(f.key) : f.def);
const activeFixes = () => S.fixes.filter(fixActive);

// recalcula os trechos e os eventos quando muda duração, momento, início, cortes ou erros de fala
function recompute(newCands) {
  const full = S.mode === 'full';
  if (full) { S.cands = [{ start: 0, score: 1, rel: 1 }]; S.pick = 0; }
  else if (newCands || !S.cands.length) { S.cands = findCandidates(S.A, S.clipLen, 3); S.pick = Math.min(S.pick, S.cands.length - 1); renderMoments(); }
  const len = full ? S.proj.total : S.clipLen;
  S.tl = buildSegments(S.A, S.cands[S.pick].start, len, { cutSilence: S.cut, adjust: S.adjust, style: style(), excl: activeFixes(), windows: S.proj.wins });
  S.segSrc = S.tl.segments.map((g) => segSource(S.proj, g));
  S.ev = buildEvents(S.A, S.tl, style());
  const cuts = S.tl.segments.length - 1, nFix = activeFixes().filter((f) => f.a >= S.tl.segments[0].s - 0.5 && f.b <= S.tl.segments[S.tl.segments.length - 1].e + 0.5).length;
  let where;
  if (S.clips.length > 1) {
    const used = new Set(S.segSrc.map((x) => x.i));
    where = `${used.size} de ${S.clips.length} vídeos em sequência`;
  } else { const a = S.segSrc[0], b = S.segSrc[S.segSrc.length - 1]; where = `Trecho do vídeo original: ${fmtTime(a.s)} até ${fmtTime(b.e)}`; }
  $('cutInfo').textContent = `${where} · ${full ? 'vídeo final' : 'clipe'} com ${num(S.tl.outDur)} s${cuts ? ` · ${cuts} ${cuts === 1 ? 'corte' : 'cortes'}` : ''}${nFix ? ` · ${nFix} ${nFix === 1 ? 'erro de fala cortado' : 'erros de fala cortados'}` : ''}${S.style ? ' · no estilo das suas referências' : ''}`;
  $('optCut').closest('.switch').hidden = !S.A.hasAudio;
  updateCaptions();
  pv.t = 0; $('scrub').max = S.tl.outDur; $('scrub').value = 0;
  refresh(); seek(0);
  if (S.asr.used && uncovered().length) scheduleAsr();
}

async function renderMoments() {
  const box = $('moments'), names = ['Melhor momento', '2ª opção', '3ª opção'], multi = S.clips.length > 1;
  box.innerHTML = S.cands.map((c, i) => { const l = locate(S.proj, c.start); return `<button type="button" class="moment${i === S.pick ? ' on' : ''}" data-i="${i}"><img alt="" data-i="${l.i}" data-t="${l.local}"><b>${names[i]}</b><small>${multi ? `vídeo ${l.i + 1}, ` : ''}começa em ${fmtTime(l.local)}</small><div class="meter"><i style="width:${Math.round(30 + 70 * (c.rel ?? 1))}%"></i></div></button>`; }).join('');
  box.querySelectorAll('.moment').forEach((b) => (b.onclick = () => { S.pick = Number(b.dataset.i); S.adjust = 0; box.querySelectorAll('.moment').forEach((x) => x.classList.toggle('on', x === b)); recompute(false); }));
  for (const img of box.querySelectorAll('img')) {
    try { const wc = await S.clips[+img.dataset.i].thumbs.getCanvas(Number(img.dataset.t) + 1); if (wc) img.src = wc.canvas.toDataURL('image/jpeg', 0.7); } catch { /* sem miniatura */ }
  }
}

document.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => { S.adjust += Number(b.dataset.adj); recompute(false); }));
$('optCut').onchange = (e) => { S.cut = e.target.checked; recompute(false); };
$('optFix').onchange = (e) => { S.fixOn = e.target.checked; renderFixes(); recompute(false); };
$('capOn').onchange = (e) => { S.cap.on = e.target.checked; refresh(); };
$('capLang').onchange = (e) => { S.asr.lang = e.target.value; };
$('capModel').onchange = (e) => { S.asr.model = e.target.value; };
$('capColor').oninput = (e) => { S.cap.color = e.target.value; refresh(); };
$('capColorReset').onclick = () => { S.cap.color = null; renderEditorStatic(); refresh(); };
$('title').oninput = (e) => { S.title.text = e.target.value; refresh(); };
$('optZoom').onchange = (e) => { S.zoom = e.target.checked; refresh(); };
$('optBar').onchange = (e) => { S.bar = e.target.checked; refresh(); };

// estado que o compositor usa (o mesmo na prévia e na exportação)
function compState() {
  return {
    framing: S.framing, tl: S.tl, ev: S.ev, fx: { zoom: S.zoom, zoomAmt: S.zoomAmt, progress: S.bar },
    cap: { on: S.cap.on && S.cap.chunks.length > 0, chunks: S.cap.chunks, style: S.cap.style, pos: S.cap.pos, font: S.cap.font, color: S.cap.color },
    title: { text: S.title.text, mode: S.title.mode },
  };
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
  const own = Object.keys(S.ownSfx).filter((k) => S.ownSfx[k]).length;
  $('sfxInfo').textContent = S.sfx === 'off' ? 'Sem efeitos sonoros.' : plan.length ? `Neste ${S.mode === 'full' ? 'vídeo' : 'clipe'}: ${[n('impact') && 'impacto no momento mais forte', n('riser') && 'subida antes do impacto', n('whoosh') && `${n('whoosh')} transições`, n('pop') && 'toque no título'].filter(Boolean).join(', ')}. ${own ? 'Onde você enviou um som seu, ele entra no lugar do som do app.' : 'São sons criados pelo próprio app, livres de direitos.'}` : 'Nenhum momento forte foi encontrado neste trecho para colocar efeito.';
  drawPreview();
}
async function drawPreview() {
  if (!pv.st || !pv.ctx || !S.tl) return;
  const k = Math.min(pv.k, S.segSrc.length - 1), src = S.segSrc[k], clip = src.clip, v = S.vids?.[src.i];
  if (v && !clip.noPlay && v.readyState >= 2 && v.videoWidth) pv.comp.draw(pv.ctx, v, v.videoWidth, v.videoHeight, pv.t, pv.st);
  else if (clip.noPlay) {
    // o navegador não toca esse arquivo direto: mostra o quadro parado
    const my = (pv.fbSeq = (pv.fbSeq || 0) + 1);
    try { const g = S.tl.segments[k], wc = await clip.thumbs.getCanvas(src.s + (mapTime(S.tl, pv.t).src - g.s)); if (wc && my === pv.fbSeq) pv.comp.draw(pv.ctx, wc.canvas, clip.width, clip.height, pv.t, pv.st); } catch { /* sem quadro */ }
    $('pvNote').textContent = 'Seu navegador não reproduz esse arquivo na prévia, então ela mostra só o quadro parado. A exportação funciona normalmente.'; $('pvNote').classList.add('show');
  }
  $('clock').textContent = `${fmtTime(pv.t)} / ${fmtTime(S.tl.outDur)}`;
}
function seek(t) {
  if (!S.tl) return;
  pv.t = Math.max(0, Math.min(S.tl.outDur - 0.01, t));
  const m = mapTime(S.tl, pv.t); pv.k = m.k;
  const src = S.segSrc[m.k], v = S.vids?.[src.i];
  if (v && !src.clip.noPlay) { try { v.currentTime = src.s + (m.src - S.tl.segments[m.k].s); } catch { /* ainda carregando */ } }
  drawPreview();
}
function setPlayIcon() { $('playIcon').setAttribute('d', pv.playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z'); $('btnPlay').setAttribute('aria-label', pv.playing ? 'Pausar' : 'Reproduzir'); }
function play() {
  if (!S.tl) return;
  const src0 = S.segSrc[pv.k]; if (src0.clip.noPlay) return;
  if (pv.t >= S.tl.outDur - 0.05) seek(0);
  const v = S.vids[S.segSrc[pv.k].i];
  pv.playing = true; setPlayIcon();
  v.play().catch(() => { pv.playing = false; setPlayIcon(); });
  const mu = $('musicEl');
  if (S.music.url) { mu.volume = Math.min(1, S.music.vol * 0.6); try { mu.currentTime = pv.t % (mu.duration || 1e9); } catch { /* sem duração ainda */ } mu.play().catch(() => {}); }
  cancelAnimationFrame(pv.raf); pv.raf = requestAnimationFrame(loop);
}
function pause() {
  pv.playing = false; cancelAnimationFrame(pv.raf);
  try { (S.vids || []).forEach((v) => v.pause()); $('musicEl').pause(); } catch { /* nada tocando */ }
  setPlayIcon();
}
function loop() {
  if (!pv.playing) return;
  const segs = S.tl.segments; let g = segs[pv.k], src = S.segSrc[pv.k], v = S.vids[src.i], ts = v.currentTime;
  if (ts >= src.e - 0.03 || v.ended) {
    if (pv.k < segs.length - 1) {
      pv.k++; g = segs[pv.k]; const nx = S.segSrc[pv.k], nv = S.vids[nx.i];
      if (nx.clip.noPlay) { pause(); return; }
      nv.currentTime = nx.s; ts = nx.s;
      if (nv !== v) { v.pause(); nv.play().catch(() => {}); }
      src = nx; v = nv;
    } else { pause(); seek(0); return; }
  }
  pv.t = g.out + Math.max(0, Math.min(g.dur, ts - src.s));
  $('scrub').value = pv.t; drawPreview();
  pv.raf = requestAnimationFrame(loop);
}
$('btnPlay').onclick = () => (pv.playing ? pause() : play());
$('scrub').oninput = (e) => { pause(); seek(Number(e.target.value)); };

// ---------------------------------------------------------------- fala: transcrição, erros e legendas
let asrWorker = null, asrSeq = 0, asrTimer = 0;
const asrPending = new Map();
function asrCall(pcm, onMsg) {
  if (!asrWorker) {
    asrWorker = new Worker('/assets/asr-worker.js', { type: 'module' });
    asrWorker.onmessage = (e) => { const m = e.data, p = asrPending.get(m.id); if (!p) return; if (m.type === 'done') { asrPending.delete(m.id); p.resolve(m); } else if (m.type === 'error') { asrPending.delete(m.id); p.reject(new Error(m.message)); } else p.onMsg?.(m); };
    asrWorker.onerror = (e) => { for (const p of asrPending.values()) p.reject(new Error(e.message || 'falha no reconhecimento de fala')); asrPending.clear(); asrWorker = null; };
  }
  const id = ++asrSeq;
  return new Promise((resolve, reject) => {
    asrPending.set(id, { resolve, reject, onMsg });
    const local = isLocal && params.get('asrmodel') === 'local';
    asrWorker.postMessage({ type: 'run', id, audio: pcm, model: S.asr.model, language: S.asr.lang, ortBase: isLocal ? '/ort/' : null, lib: isLocal ? '/tf/transformers.min.js' : null, device: params.get('asr') || null, localModels: local ? '/models/' : null, modelId: local ? 'Xenova/whisper-' + (params.get('m') || 'tiny') : null }, [pcm.buffer]);
  });
}

// partes do clipe atual que ainda não foram transcritas (tempo do projeto)
function uncovered() {
  const out = [];
  for (const g of S.tl.segments) {
    let parts = [[g.s, g.e]];
    for (const [a, b] of S.asr.covered) parts = parts.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, a], [b, y]].filter(([p, q]) => q - p > 0.3)));
    out.push(...parts);
  }
  return out;
}
// divide em pedaços de até 28 s, cortando nos pontos mais baixos do volume
function pieces(gaps) {
  const flat = [];
  for (let [s, e] of gaps) {
    while (e - s > PIECE) {
      let cut = s + PIECE - 3;
      if (S.A.db) { let bv = Infinity; for (let t = s + 18; t < s + PIECE - 0.5; t += HOP) { const v = S.A.db[Math.round(t / HOP)]; if (v === v && v < bv) { bv = v; cut = t; } } }
      flat.push([s, cut]); s = cut;
    }
    flat.push([s, e]);
  }
  const out = []; let cur = [], len = 0;
  for (const [s, e] of flat) { if (len + (e - s) > PIECE && cur.length) { out.push(cur); cur = []; len = 0; } cur.push([s, e]); len += e - s; }
  if (cur.length) out.push(cur);
  return out;
}
const asTl = (list) => { let t = 0; const segments = list.map(([s, e]) => { const g = { s, e, dur: e - s, out: t }; t += g.dur; return g; }); return { segments, outDur: t }; };

function scheduleAsr() { clearTimeout(asrTimer); asrTimer = setTimeout(() => runAsr(true), 700); }
$('btnAsr').onclick = () => runAsr(false);
async function runAsr(auto) {
  if (S.asr.busy || !S.A?.hasAudio) return;
  const todo = pieces(uncovered());
  if (!todo.length) { if (!auto) $('fixInfo').textContent = fixSummary(); return; }
  S.asr.busy = true; S.asr.used = true; $('btnAsr').disabled = true; say($('asrErr'), '');
  $('asrProg').hidden = false; setBar($('asrProg'), 0.02);
  const total = todo.reduce((n, p) => n + p.reduce((m, [s, e]) => m + e - s, 0), 0); let done = 0;
  try {
    for (const piece of todo) {
      $('asrText').textContent = `Ouvindo a fala... ${Math.round((done / total) * 100)}%`;
      const tlp = asTl(piece), buf = await buildTimelineAudio(S.proj, tlp);
      if (!buf) break;
      const pcm = await toMono16k(buf);
      // recomeços pelo som (o áudio vai para o worker em seguida, então analisa antes)
      const F = features(pcm), isl = speechIslands(F), V = (t) => mapTime(tlp, Math.min(tlp.outDur - 0.001, Math.max(0, t))).src;
      S.asr.islands.push(...isl.map((x) => ({ a: V(x.a), b: V(x.b) })));
      S.asr.restarts.push(...findRestarts(F, isl).map((r) => ({ ...r, a: V(r.a), b: V(r.b) })));
      const res = await asrCall(pcm, (m) => {
        if (m.type === 'download') { setBar($('asrProg'), 0.02 + 0.5 * (m.loaded / m.total)); $('asrText').textContent = `Baixando o reconhecimento de fala (só na primeira vez)... ${Math.round(m.loaded / 1048576)} de ${Math.round(m.total / 1048576)} MB`; }
      });
      S.asr.approx = S.asr.approx || res.approx;
      let last = -1;
      for (const w of res.words) {
        const s0 = Math.min(tlp.outDur - 0.01, Math.max(0, w.start)), e0 = Math.min(tlp.outDur - 0.001, Math.max(s0 + 0.05, w.end));
        let start = mapTime(tlp, s0).src, end = mapTime(tlp, e0).src;
        if (end <= start || end - start > 3) end = start + Math.min(1, e0 - s0);
        if (start < last) start = last;
        S.asr.words.push({ text: w.text, start, end }); last = start;
      }
      S.asr.covered.push(...piece);
      done += tlp.outDur; setBar($('asrProg'), 0.52 + 0.48 * (done / total));
    }
    S.asr.words.sort((a, b) => a.start - b.start); S.asr.islands.sort((a, b) => a.a - b.a);
    buildFixes();
    if (!S.asr.words.length) say($('asrErr'), 'Não encontrei fala nesse trecho.');
  } catch (e) {
    console.error(e);
    say($('asrErr'), 'Não consegui ouvir a fala. Confira a internet (o reconhecimento de fala é baixado na primeira vez) e tente de novo. Se continuar, use a precisão "Rápida".');
    S.asr.used = false; // não tenta de novo sozinho
  }
  S.asr.busy = false; $('btnAsr').disabled = false; $('asrProg').hidden = true;
  $('btnAsr').textContent = 'Ouvir de novo o trecho que faltou';
  renderFixes(); recompute(false);
  if (!uncovered().length) $('btnAsr').hidden = true;
}

// junta os erros achados pelo texto e os recomeços achados pelo som
function buildFixes() {
  const W = S.asr.words, isl = S.asr.islands;
  const startNear = (t, back, fwd) => { let best = null; for (const x of isl) if (x.a >= t - back && x.a <= t + fwd && (!best || Math.abs(x.a - t) < Math.abs(best.a - t))) best = x; return best; };
  const text = detectRetakes(W).map((f) => {
    let g = snapFix(f, S.A);
    if (f.kind !== 'hesitacao') {
      // o tempo das palavras pode errar uns décimos: encaixa o corte nas pausas reais da voz
      const nb = startNear(g.b, 0.6, 0.4); if (nb) g = { ...g, b: nb.a - 0.03 };
      const na = startNear(g.a, 0.3, 0.3); if (na && na.a - 0.03 < g.b - 0.1) g = { ...g, a: na.a - 0.03 };
    }
    return { ...g, def: true };
  });
  const between = (a, b) => W.filter((w) => w.start >= a - 0.02 && w.start < b);
  const sound = S.asr.restarts.filter((r) => !text.some((f) => f.a < r.b + 0.2 && r.a < f.b + 0.2)).map((r) => {
    const inside = between(r.a, r.b), after = W.filter((w) => w.start >= r.b).slice(0, 5);
    // a primeira tentativa quase nunca vira texto; o que foi ouvido ali é falado de novo logo depois
    return { kind: 'som', label: r.strong ? 'Recomeço (pelo som)' : 'Possível recomeço (confira)', a: r.a, b: r.b, removed: 'primeira tentativa', kept: [...inside, ...after].slice(0, 6).map((w) => w.text).join(' '), def: r.strong, sound: true };
  });
  S.fixes = [...text, ...sound].sort((x, y) => x.a - y.a).map((f) => ({ ...f, key: Math.round(f.a * 20) }));
  // trava: se a transcrição parece estranha (cortaria muito), nada é cortado sozinho
  const speech = W.reduce((n, w) => n + Math.max(0.05, w.end - w.start), 0), cut = text.reduce((n, f) => n + (f.b - f.a), 0);
  S.fixWarn = '';
  if (W.length >= 6 && cut > Math.max(3, speech * 0.3)) {
    S.fixes.forEach((f) => (f.def = false));
    S.fixWarn = 'A transcrição parece estranha (cortaria muita coisa), então nada foi cortado sozinho. Marque só o que estiver certo.';
  }
}
function fixSummary() {
  if (!S.asr.used) return 'Toque em "Ouvir a fala" para o Cortei achar os erros.';
  if (!S.fixes.length) return 'Não encontrei erros, repetições nem gaguejos na fala.';
  const on = activeFixes().length;
  return `${S.fixes.length} ${S.fixes.length === 1 ? 'trecho encontrado' : 'trechos encontrados'}${S.fixOn ? ` · ${on} ${on === 1 ? 'cortado' : 'cortados'}` : ' · nenhum cortado'}. Toque em "Ver" para ouvir e desmarque o que quiser manter.`;
}
function renderFixes() {
  $('fixInfo').textContent = (S.fixWarn ? S.fixWarn + ' ' : '') + fixSummary() + (S.asr.approx ? ' (Tempos aproximados: confira na prévia.)' : '');
  const box = $('fixList');
  box.innerHTML = S.fixes.map((f) => { const on = fixActive(f); return `<li class="${on ? '' : 'off'}"><input type="checkbox" data-k="${f.key}" ${on ? 'checked' : ''} ${S.fixOn ? '' : 'disabled'} aria-label="Cortar este trecho"><div><small>${f.label}</small><s>${esc(f.removed)}</s>${f.kept ? ` <span class="k">→ ${esc(f.kept)}…</span>` : ''}</div><button type="button" class="btn ghost sm" data-see="${f.key}">Ver</button></li>`; }).join('');
  box.querySelectorAll('input').forEach((c) => (c.onchange = () => { S.fixUser.set(+c.dataset.k, c.checked); renderFixes(); recompute(false); }));
  box.querySelectorAll('[data-see]').forEach((b) => (b.onclick = () => { const f = S.fixes.find((x) => x.key === +b.dataset.see); pause(); seek(Math.max(0, toOut(S.tl, f.a) - 1.5)); play(); }));
}

function captionSource() {
  const acts = activeFixes().filter((f) => f.sound);
  if (!acts.length) return S.asr.words;
  const W = S.asr.words.map((w) => ({ ...w, orig: w.orig || w }));
  for (const f of acts) {
    const inside = W.filter((w) => w.start >= f.a - 0.02 && w.start < f.b);
    if (!inside.length) continue;
    const next = W.find((w) => w.start >= f.b), room = Math.min(0.2 * inside.length, next ? Math.max(0.1, next.start - f.b - 0.02) : 1);
    inside.forEach((w, i) => { w.start = f.b + 0.02 + (room * i) / inside.length; w.end = w.start + (room / inside.length) * 0.9; });
  }
  return W.sort((a, b) => a.start - b.start);
}
function updateCaptions() {
  S.cap.words = S.tl ? wordsToTimeline(captionSource(), S.tl) : [];
  S.cap.chunks = chunkWords(S.cap.words);
  $('capInfo').textContent = S.cap.words.length ? '' : S.asr.used ? 'Sem fala neste trecho.' : 'As legendas aparecem depois de "Ouvir a fala".';
  $('capInfo').hidden = !$('capInfo').textContent;
  renderWords();
}
function renderWords() {
  const box = $('words'); $('capEdit').hidden = !S.cap.words.length;
  box.innerHTML = '';
  S.cap.words.forEach((w, i) => {
    const sp = document.createElement('span'); sp.contentEditable = 'true'; sp.spellcheck = false; sp.textContent = w.text; sp.setAttribute('role', 'textbox'); sp.setAttribute('aria-label', 'Palavra ' + (i + 1));
    sp.oninput = () => { w.text = w.ref.text = (w.ref.orig || w.ref).text = sp.textContent.replace(/\s+/g, ' ').trim(); S.cap.chunks = chunkWords(S.cap.words); refresh(); };
    sp.onfocus = () => { pause(); seek(w.start + 0.02); };
    sp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } };
    box.appendChild(sp);
  });
}

// ---------------------------------------------------------------- fonte própria e efeitos sonoros próprios
async function useFont(file, persist) {
  try {
    const face = new FontFace('CorteiUser', await file.arrayBuffer());
    await face.load();
    if (S.ownFontFace) document.fonts.delete(S.ownFontFace);
    document.fonts.add(face); S.ownFontFace = face; S.ownFont = file.name;
    if (persist) { await saveFile('fonte', file); S.cap.font = 'propria'; }
    $('fontInfo').textContent = `Usando a sua fonte: ${file.name}`; $('fontDel').hidden = false;
    renderEditorStatic(); refresh();
  } catch { $('fontInfo').textContent = 'Não consegui ler essa fonte. Envie um arquivo .ttf, .otf ou .woff.'; }
}
$('fontFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) useFont(f, true); };
$('fontDel').onclick = () => { removeFile('fonte'); if (S.ownFontFace) document.fonts.delete(S.ownFontFace); S.ownFont = null; S.ownFontFace = null; if (S.cap.font === 'propria') S.cap.font = null; $('fontDel').hidden = true; $('fontInfo').textContent = 'Fonte removida.'; renderEditorStatic(); refresh(); };

const SFX_SLOTS = [['whoosh', 'Transição (whoosh)'], ['impact', 'Impacto'], ['riser', 'Subida antes do impacto'], ['pop', 'Entrada do título']];
async function useSfx(slot, file, persist) {
  try {
    const buffer = await decodeAudioFile(file);
    if (buffer.duration > 8) throw new Error('longo');
    S.ownSfx[slot] = { buffer, peak: soundPeak(buffer), name: file.name };
    if (persist) await saveFile('sfx-' + slot, file);
  } catch (e) { S.ownSfx[slot] = null; alertBox(e.message === 'longo' ? 'Esse som é longo demais para um efeito (máximo 8 segundos).' : 'Não consegui abrir esse som. Tente MP3, WAV ou M4A.'); }
  renderOwnSfx(); refresh();
}
function renderOwnSfx() {
  const box = $('ownSfx');
  box.innerHTML = SFX_SLOTS.map(([k, nome]) => { const o = S.ownSfx[k]; return `<li><span><b>${nome}</b><br><small>${o ? esc(o.name) : 'som do app'}</small></span><span class="row" style="margin:0"><label class="btn ghost sm" for="sfx-${k}">${o ? 'Trocar' : 'Enviar som'}</label><input type="file" id="sfx-${k}" data-slot="${k}" accept="audio/*,.mp3,.wav,.m4a,.ogg" hidden>${o ? `<button type="button" class="btn ghost sm" data-del="${k}">Remover</button>` : ''}</span></li>`; }).join('');
  box.querySelectorAll('input').forEach((i) => (i.onchange = (e) => { const f = e.target.files[0]; if (f) useSfx(i.dataset.slot, f, true); }));
  box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { S.ownSfx[b.dataset.del] = null; removeFile('sfx-' + b.dataset.del); renderOwnSfx(); refresh(); }));
}
// recarrega o que a pessoa já tinha enviado antes
(async () => {
  const f = await loadStored('fonte'); if (f?.blob) await useFont(new File([f.blob], f.name, { type: f.type }), false);
  for (const [k] of SFX_SLOTS) { const s = await loadStored('sfx-' + k); if (s?.blob) await useSfx(k, new File([s.blob], s.name, { type: s.type }), false); }
})();

// ---------------------------------------------------------------- música
$('music').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('musicInfo').textContent = 'Carregando a música...';
  try {
    S.music.buffer = await decodeAudioFile(f); S.music.name = f.name;
    if (S.music.url) URL.revokeObjectURL(S.music.url);
    S.music.url = URL.createObjectURL(f); $('musicEl').src = S.music.url; $('musicEl').loop = true;
    $('musicInfo').textContent = `${f.name} · ${fmtTime(S.music.buffer.duration)}. Use só música que você tem direito de usar.`;
    $('musicDel').hidden = false; $('musicVolBox').hidden = false; $('musicVol').value = Math.round(S.music.vol * 100);
  } catch { $('musicInfo').textContent = 'Não consegui abrir essa música. Tente um arquivo MP3 ou WAV.'; }
};
$('musicDel').onclick = () => { S.music.buffer = null; if (S.music.url) URL.revokeObjectURL(S.music.url); S.music.url = ''; $('musicEl').removeAttribute('src'); $('musicDel').hidden = true; $('musicVolBox').hidden = true; $('musicInfo').textContent = 'Música removida.'; };
$('musicVol').oninput = (e) => { S.music.vol = Number(e.target.value) / 100; $('musicEl').volume = Math.min(1, S.music.vol * 0.6); };

// ---------------------------------------------------------------- exportar
async function timelineAudio(signal) {
  const key = JSON.stringify(S.tl.segments.map((g) => [Math.round(g.s * 100), Math.round(g.e * 100)]));
  if (S.mainKey !== key) { S.mainAudio = null; S.mainAudio = await buildTimelineAudio(S.proj, S.tl, signal); S.mainKey = key; }
  return S.mainAudio;
}
$('btnExport').onclick = async () => {
  pause();
  const ac = new AbortController(); S.abort = ac;
  $('exporting').hidden = false; setBar($('exporting'), 0); $('expText').textContent = 'Preparando o áudio...';
  try {
    const main = await timelineAudio(ac.signal);
    const userSfx = Object.fromEntries(Object.entries(S.ownSfx).filter(([, v]) => v));
    const mixed = await mixAudio({ main, music: S.music.buffer, musicVol: S.music.vol, ev: S.ev, sfx: S.sfx, hasTitle: !!S.title.text.trim(), outDur: S.tl.outDur, userSfx });
    const r = await exportClip({
      proj: S.proj, tl: S.tl, state: compState(), aspect: S.aspect, quality: S.quality, mixed, signal: ac.signal,
      onProgress: (p, secs) => { setBar($('exporting'), p); const left = p > 0.03 ? (secs / p) * (1 - p) : null; $('expText').textContent = `${Math.round(p * 100)}%${left != null ? ` · falta cerca de ${left < 60 ? Math.ceil(left) + ' s' : Math.ceil(left / 60) + ' min'}` : ''}`; },
    });
    if (S.result?.url) URL.revokeObjectURL(S.result.url);
    const name = `cortei-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${r.ext}`;
    S.result = { ...r, url: URL.createObjectURL(r.blob), name };
    $('result').src = S.result.url; $('btnDown').href = S.result.url; $('btnDown').download = name;
    $('doneMeta').textContent = `${r.W}×${r.H} · ${fmtTime(S.tl.outDur)} · ${mb(r.blob.size)} · exportado em ${Math.round(r.seconds)} s`;
    say($('doneNote'), r.social ? '' : 'Seu navegador não gera MP4, então o vídeo saiu em WebM, que algumas redes não aceitam. Para sair em MP4, use o Google Chrome.');
    $('btnSave').hidden = !(isMobile && navigator.canShare);
    show('done');
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); alertBox('Não consegui exportar. Tente a qualidade 720p ou use o Google Chrome atualizado.'); }
  }
  $('exporting').hidden = true;
};
$('btnCancel').onclick = () => S.abort?.abort();
function alertBox(text) { const n = $('pvNote'); n.textContent = text; n.style.color = '#991b1b'; n.classList.add('show'); n.scrollIntoView({ block: 'center' }); }
$('btnBack').onclick = () => { show('editor'); seek(pv.t); };
$('btnSave').onclick = async () => {
  const r = S.result, file = new File([r.blob], r.name, { type: r.mime });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Meu vídeo' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  $('btnDown').click();
};

// ---------------------------------------------------------------- vídeos de referência
// aplica nas opções o que foi aprendido (a pessoa pode mudar tudo depois)
function applyStyle(st) {
  if (!st) return;
  if (st.zoom) { S.zoom = st.zoom.on; if (st.zoom.amt) S.zoomAmt = st.zoom.amt; }
  if (st.cap) { S.cap.pos = st.cap.place === 'topo' ? 'topo' : st.cap.place === 'centro' ? 'centro' : 'baixo'; if (st.cap.color) S.cap.color = st.cap.color; }
  if (st.sfx) S.sfx = st.sfx;
  if (st.music?.bed && st.music.rel != null) S.music.vol = Math.min(0.5, Math.max(0.08, 0.12 + (st.music.rel + 25) * 0.025));
}
function learnedLines(st) {
  const L = [];
  L.push(`<b>Ritmo:</b> ${st.avgShot ? `um corte a cada ${num(st.avgShot)} s` : 'quase sem cortes'}${st.maxPause != null ? `, pausas de até ${num(st.maxPause)} s` : ''}`);
  if (st.zoom) L.push(`<b>Zoom:</b> ${st.zoom.on ? `zoom nos cortes${st.zoom.amt ? ` (cerca de ${Math.round(st.zoom.amt * 100)}%)` : ''}` : 'quase não usa zoom'}`);
  if (st.cap) L.push(`<b>Legenda:</b> ${{ topo: 'em cima', centro: 'no centro', baixo: 'embaixo' }[st.cap.place]}${st.cap.color ? `, destaque <span class="swatch" style="background:${st.cap.color}"></span>` : ', sem cor de destaque'}`);
  else L.push('<b>Legenda:</b> não encontrei legenda com segurança');
  if (st.music) L.push(`<b>Música:</b> ${st.music.bed ? 'tem música de fundo (o volume da sua música vai seguir esse nível)' : 'sem música de fundo'}`);
  if (st.sfx) L.push(`<b>Efeitos sonoros:</b> ${{ full: 'som nas transições', soft: 'efeitos discretos', off: 'quase sem efeitos' }[st.sfx]}`);
  L.push('<b>Fonte e sons exatos:</b> não dá para descobrir pelo vídeo. Escolha uma fonte parecida ou envie o arquivo da sua fonte e os seus efeitos sonoros no editor.');
  return L.map((l) => `<li>${l}</li>`).join('');
}
function renderRefs() {
  const st = S.style;
  $('refPill').hidden = !st; $('refClear').hidden = !st; $('refClear2').hidden = !st;
  if (st) {
    $('refPill').textContent = 'Estilo aprendido';
    $('refInfo').textContent = `Aprendido com ${st.refs} ${st.refs === 1 ? 'vídeo' : 'vídeos'}. Seus próximos vídeos serão editados nesse estilo:`;
  } else $('refInfo').textContent = 'Nenhuma referência ainda: o Cortei usa o estilo padrão.';
  $('refInfo2').textContent = $('refInfo').textContent;
  for (const id of ['refList', 'refList2']) { $(id).innerHTML = st ? learnedLines(st) : ''; $(id).hidden = !st; }
}
const onRefs = async (e) => {
  const files = [...e.target.files].slice(0, 5); e.target.value = ''; if (!files.length) return;
  const bars = [$('refBar'), $('refBar2')]; bars.forEach((x) => (x.hidden = false)); const out = [];
  for (let i = 0; i < files.length; i++) {
    $('refInfo').textContent = $('refInfo2').textContent = `Estudando a referência ${i + 1} de ${files.length}...`;
    try { out.push(await analyzeReference(files[i], (p) => bars.forEach((x) => setBar(x, (i + p) / files.length)))); } catch (err) { console.error(err); }
  }
  bars.forEach((x) => (x.hidden = true));
  if (!out.length) { $('refInfo').textContent = $('refInfo2').textContent = 'Não consegui ler esses vídeos. Tente arquivos MP4.'; return; }
  S.refs = out.map(({ name, ...rest }) => rest); store.set('cortei_refs', S.refs);
  S.style = styleFromReferences(S.refs); applyStyle(S.style); renderRefs();
  if (S.tl && !$('editor').hidden) { renderEditorStatic(); recompute(false); } // reedita na hora no novo estilo
};
$('refFiles').onchange = $('refFiles2').onchange = onRefs;
$('refClear').onclick = $('refClear2').onclick = () => {
  S.refs = []; S.style = null; store.set('cortei_refs', []);
  Object.assign(S, { zoom: true, zoomAmt: 0.1, sfx: 'soft' }); Object.assign(S.cap, { pos: 'auto', color: null });
  renderRefs(); if (S.tl && !$('editor').hidden) { renderEditorStatic(); recompute(false); }
};
applyStyle(S.style); renderRefs();

window.__cortei = S; // usado nos testes automáticos
window.__corteiWords = (w) => { S.asr.words = w; S.asr.used = true; S.asr.covered = [[0, 1e9]]; buildFixes(); renderFixes(); recompute(false); }; // idem

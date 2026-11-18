// Compositor: desenha um quadro do clipe (fundo, vídeo com zoom, título, legendas, barra). Usado na prévia e na exportação.
export const ASPECTS = { '9:16': [9, 16], '1:1': [1, 1], '16:9': [16, 9] };
const even = (v) => Math.round(v / 2) * 2;
export function outputSize(aspect, short) {
  const [a, b] = ASPECTS[aspect];
  return a < b ? { W: short, H: even((short * b) / a) } : a === b ? { W: short, H: short } : { W: even((short * a) / b), H: short };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const UI_FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

// fontes da legenda; "propria" é a fonte que a pessoa enviou (carregada com o nome CorteiUser)
export const FONTS = {
  montserrat: { nome: 'Montserrat', css: (fs) => `900 ${fs}px Montserrat`, k: 1 },
  poppins: { nome: 'Poppins', css: (fs) => `800 ${fs}px Poppins`, k: 1 },
  anton: { nome: 'Anton', css: (fs) => `400 ${fs}px Anton`, k: 1.12 },
  bebas: { nome: 'Bebas Neue', css: (fs) => `400 ${fs}px "Bebas Neue"`, k: 1.3 },
  jakarta: { nome: 'Jakarta', css: (fs) => `800 ${fs}px "Plus Jakarta Sans"`, k: 1 },
  propria: { nome: 'Sua fonte', css: (fs) => `${fs}px CorteiUser`, k: 1 },
};
export const CAPTION_STYLES = {
  impacto: { nome: 'Contorno', font: 'montserrat', size: 78, upper: true, color: '#FFE500' },
  caixa: { nome: 'Caixa', font: 'jakarta', size: 60, upper: false, color: '#2563eb' },
  limpa: { nome: 'Limpa', font: 'jakarta', size: 58, upper: false, color: '#ffffff' },
};

// agrupa as palavras em blocos curtos (no máximo 3 palavras), do jeito que aparece em vídeo curto
export function chunkWords(words) {
  const chunks = []; let cur = [];
  const flush = () => { if (cur.length) { chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
  for (const w of words || []) {
    const text = String(w.text || '').trim(); if (!text) continue;
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + text.length;
    if (prev && (w.start - prev.end > 0.45 || cur.length >= 3 || chars > 18 || /[.!?…]$/.test(prev.text))) flush();
    cur.push({ text, start: w.start, end: Math.max(w.end, w.start + 0.08) });
  }
  flush();
  for (let i = 0; i < chunks.length; i++) { const c = chunks[i], nx = chunks[i + 1]; c.end = nx ? (nx.start - c.end < 0.6 ? nx.start : c.end + 0.2) : c.end + 0.3; }
  return chunks;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrapText(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/).filter(Boolean), lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
  return lines;
}

export class Compositor {
  constructor(W, H) {
    this.W = W; this.H = H; this.u = Math.min(W, H) / 1080;
    this.bg = document.createElement('canvas');
    this.bg.width = Math.max(16, Math.round(W / 10)); this.bg.height = Math.max(16, Math.round(H / 10));
    this.bgx = this.bg.getContext('2d');
    this.blurOk = typeof this.bgx.filter === 'string';
  }

  // st: { framing, tl, ev, fx:{zoom,progress}, cap:{on,chunks,style,pos}, title:{text,mode} }
  draw(ctx, src, sw, sh, t, st) {
    const { W, H } = this;
    const contain = Math.min(W / sw, H / sh), cover = Math.max(W / sw, H / sh);
    const base = st.framing === 'fill' ? cover : st.framing === 'mid' ? Math.sqrt(contain * cover) : contain;
    const bw = Math.min(W, sw * base), bh = Math.min(H, sh * base), bx = (W - bw) / 2, by = (H - bh) / 2;
    const full = bw >= W - 1 && bh >= H - 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowColor = 'transparent';
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!full) {
      // fundo desfocado: o próprio vídeo ampliado, borrado numa tela pequena e esticado
      const g = this.bgx, gw = this.bg.width, gh = this.bg.height, s = Math.max(gw / sw, gh / sh) * 1.15;
      if (this.blurOk) g.filter = `blur(${Math.max(2, gw / 36)}px)`;
      g.drawImage(src, (gw - sw * s) / 2, (gh - sh * s) / 2, sw * s, sh * s);
      ctx.drawImage(this.bg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(8,10,16,.42)'; ctx.fillRect(0, 0, W, H);
    }
    let z = 1, ox = 0, oy = 0;
    if (st.fx.zoom) {
      z = this.zoomAt(t, st);
      if (st.ev.impact != null) { const d = t - st.ev.impact; if (d >= 0 && d < 0.4) { const a = 14 * this.u * Math.pow(1 - d / 0.4, 2); ox = a * Math.sin(d * 90); oy = a * Math.cos(d * 70); } }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    const dw = sw * base * z, dh = sh * base * z;
    ctx.drawImage(src, (W - dw) / 2 + ox, (H - dh) / 2 + oy, dw, dh);
    ctx.restore();
    const box = { x: bx, y: by, w: bw, h: bh };
    if (st.title?.text) this.drawTitle(ctx, t, st, box);
    if (st.cap?.on && st.cap.chunks?.length) this.drawCaptions(ctx, t, st, box);
    if (st.fx.progress) {
      const h = Math.max(4, 10 * this.u);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(0, H - h, W, h);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, H - h, W * clamp01(t / st.tl.outDur), h);
    }
  }

  zoomAt(t, st) {
    const segs = st.tl.segments; let k = 0;
    while (k < segs.length - 1 && t >= segs[k].out + segs[k].dur) k++;
    const g = segs[k]; let z = 1;
    const amt = st.fx.zoomAmt ?? 0.1;
    if (segs.length > 1 && k % 2 === 1) z += amt * 0.6; // alterna o enquadramento a cada corte (disfarça o corte seco)
    z += 0.035 * clamp01((t - g.out) / Math.max(4, g.dur)); // aproximação lenta
    for (const p of st.ev.punches) { const d = t - p; if (d >= 0 && d < 0.9) z += amt * (d < 0.07 ? d / 0.07 : 1 - easeInOut((d - 0.07) / 0.83)); }
    return z;
  }

  drawTitle(ctx, t, st, box) {
    const { W, H, u } = this, text = st.title.text.trim();
    const show = st.title.mode === 'all' ? 1 : clamp01(1 - (t - 4) / 0.3);
    if (!text || show <= 0) return;
    const fs = 56 * u, padX = 34 * u, padY = 22 * u, lh = fs * 1.2;
    ctx.font = `800 ${fs}px ${UI_FONT}`;
    const lines = wrapText(ctx, text, W * 0.86 - 2 * padX, 3);
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * padX, bh = lines.length * lh + 2 * padY;
    const top = box.y > bh + 90 * u ? Math.max(H * 0.09, box.y - bh - 34 * u) : H * 0.1;
    const s = t < 0.3 ? 0.8 + 0.2 * easeOutBack(t / 0.3) : 1;
    ctx.save(); ctx.translate(W / 2, top + bh / 2); ctx.scale(s, s); ctx.globalAlpha = show * clamp01(t / 0.12 + 0.2);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 8 * u;
    ctx.fillStyle = '#fff'; roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 24 * u); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#0b0d12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh + fs * 0.04));
    ctx.restore();
  }

  drawCaptions(ctx, t, st, box) {
    const { W, H, u } = this, chunks = st.cap.chunks;
    let c = null;
    for (let i = 0; i < chunks.length; i++) { if (t >= chunks[i].start && t < chunks[i].end) { c = chunks[i]; break; } if (chunks[i].start > t) break; }
    if (!c) return;
    const sty = CAPTION_STYLES[st.cap.style] || CAPTION_STYLES.impacto, font = FONTS[st.cap.font] || FONTS[sty.font];
    const fs = sty.size * u * font.k * (st.cap.scale || 1), hl = st.cap.color || sty.color, upper = st.cap.upper ?? sty.upper;
    ctx.font = `${font.css(fs)}, ${UI_FONT}`;
    const items = c.words.map((w) => { const text = upper ? w.text.toUpperCase() : w.text; return { text, w: ctx.measureText(text).width, start: w.start }; });
    const space = fs * 0.36, maxW = W * 0.86, lines = []; let line = [], lw = 0;
    for (const it of items) {
      if (line.length && lw + space + it.w > maxW) { lines.push({ items: line, w: lw }); line = []; lw = 0; }
      lw += (line.length ? space : 0) + it.w; line.push(it);
    }
    if (line.length) lines.push({ items: line, w: lw });
    let active = 0; items.forEach((it, i) => { if (t >= it.start) active = i; });
    const lh = fs * 1.24, below = H - (box.y + box.h);
    let cy;
    if (st.cap.pos === 'topo') cy = Math.max(H * 0.26, box.y + 120 * u);
    else if (st.cap.pos === 'centro') cy = H * 0.5;
    else if (st.cap.pos === 'baixo') cy = H * (W > H ? 0.84 : 0.76);
    else cy = below > 380 * u ? Math.min(box.y + box.h + 150 * u, H * 0.78) : H * (W > H ? 0.84 : 0.72);
    const s = 0.88 + 0.12 * easeOutBack((t - c.start) / 0.12);
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(s, s);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    let idx = 0;
    lines.forEach((ln, li) => {
      const y = (li - (lines.length - 1) / 2) * lh; let x = -ln.w / 2;
      if (st.cap.style === 'caixa') {
        ctx.fillStyle = 'rgba(11,13,18,.9)'; roundRect(ctx, x - 26 * u, y - lh / 2 + 2 * u, ln.w + 52 * u, lh - 4 * u, 18 * u); ctx.fill();
      }
      for (const it of ln.items) {
        const on = idx === active;
        if (st.cap.style === 'impacto') {
          ctx.save(); ctx.translate(x + it.w / 2, y); if (on) ctx.scale(1.05, 1.05);
          ctx.strokeStyle = '#000'; ctx.lineWidth = fs * 0.2;
          ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = fs * 0.07;
          ctx.strokeText(it.text, -it.w / 2, 0);
          ctx.shadowColor = 'transparent'; ctx.fillStyle = on ? hl : '#fff'; ctx.fillText(it.text, -it.w / 2, 0);
          ctx.restore();
        } else if (st.cap.style === 'caixa') {
          if (on) { ctx.fillStyle = hl; roundRect(ctx, x - 12 * u, y - fs * 0.56, it.w + 24 * u, fs * 1.12, 12 * u); ctx.fill(); }
          ctx.fillStyle = '#fff'; ctx.fillText(it.text, x, y + fs * 0.03);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 3 * u;
          ctx.globalAlpha = on ? 1 : 0.68; ctx.fillStyle = on ? hl : '#fff'; ctx.fillText(it.text, x, y);
          ctx.globalAlpha = 1; ctx.shadowColor = 'transparent';
        }
        x += it.w + space; idx++;
      }
    });
    ctx.restore();
  }
}

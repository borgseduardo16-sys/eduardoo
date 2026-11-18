// Acha erros de fala na transcrição para cortar: frase recomeçada, palavra errada falada de novo,
// palavra cortada no meio, gaguejo (palavra repetida) e hesitação ("hã", "é..." arrastado).
// Entra: palavras no tempo do projeto [{text,start,end}], em ordem. Sai: lista de cortes sugeridos.

// palavras que as pessoas repetem de propósito ("não, não", "muito muito"): não contam como gaguejo
const EMPHASIS = new Set(['nao', 'muito', 'sim', 'bem', 'mais', 'super', 'nunca', 'ja', 'isso', 'olha', 'calma', 'ta', 'ok', 'vai', 'bora', 'corre', 'para', 'pare', 'nossa', 'gente', 'cara', 'mano', 'aqui', 'agora', 'ai']);
const FILLERS = new Set(['hum', 'hmm', 'hm', 'humm', 'ahn', 'anh', 'ah', 'aah', 'ahh', 'eh', 'ehh', 'ee', 'eee', 'uh', 'uhm', 'umm', 'mm', 'mmm', 'aa', 'aaa', 'er', 'erm']); // "há" e "a" ficam de fora: são palavras de verdade
const MAX_ATTEMPT_WORDS = 15, MAX_ATTEMPT_SEC = 10;

export const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const isCut = (t) => /(-|—|–|\.\.\.|…)$/.test(String(t || '').trim()) && norm(t).length > 0;
const quote = (ws) => ws.map((w) => String(w.text).trim()).join(' ');

/**
 * words: [{text,start,end}] (tempo do projeto, em ordem)
 * devolve [{ id, kind, label, from, to, removed: "texto", kept: "texto que fica" , a, b }]
 * a/b = trecho a cortar (tempo do projeto); from/to = índices das palavras removidas [from, to)
 */
export function detectRetakes(words) {
  const W = words.map((w, i) => ({ i, n: norm(w.text), cut: isCut(w.text), s: w.start, e: Math.max(w.end, w.start + 0.05), raw: w.text })).filter((w) => w.n);
  const gone = new Set(), fixes = [];
  const alive = () => W.filter((w) => !gone.has(w.i));
  const mark = (L, from, to, kind) => {
    const rm = L.slice(from, to);
    if (!rm.length || rm.some((w) => gone.has(w.i))) return false;
    rm.forEach((w) => gone.add(w.i));
    fixes.push({ kind, idx: rm.map((w) => w.i), keptIdx: L.slice(to, to + Math.max(2, to - from + 2)).map((w) => w.i) });
    return true;
  };
  const isPrefix = (a, b) => a.n.length >= 2 && b.n.length > a.n.length && b.n.startsWith(a.n);

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    // 1) palavra cortada no meio: "pac... pacote", "fal- falar"
    let L = alive();
    for (let k = 0; k < L.length - 1; k++) {
      const a = L[k], b = L[k + 1], c = L[k + 2];
      if (gone.has(a.i)) continue;
      const near = (x) => x && x.s - a.e < 1.5;
      if ((a.cut && near(b)) || (near(b) && a.n.length >= 3 && b.n.length >= a.n.length + 2 && b.n.startsWith(a.n))) { changed = mark(L, k, k + 1, 'cortada') || changed; continue; }
      // "pac o pacote": a palavra cortada seguida de uma palavrinha e da palavra inteira
      if (near(c) && b.n.length <= 3 && isPrefix(a, c) && a.n.length >= 3) changed = mark(L, k, k + 1, 'cortada') || changed;
    }
    // 2) frase recomeçada / palavra errada falada de novo / gaguejo
    L = alive();
    for (let j = 1; j < L.length; j++) {
      if (gone.has(L[j].i)) continue;
      let best = null;
      for (let i = Math.max(0, j - MAX_ATTEMPT_WORDS); i < j; i++) {
        if (gone.has(L[i].i) || L[j].s - L[i].s > MAX_ATTEMPT_SEC) continue;
        let m = 0;
        while (i + m < j && j + m < L.length && L[i + m].n === L[j + m].n) m++;
        if (!m) continue;
        const att = j - i, div = att - m, pause = L[j].s - L[j - 1].e;
        let ok = false, kind = 'repeticao';
        if (div === 0) {
          // a tentativa inteira é repetida em seguida: "eu vou | eu vou falar", "o o pacote"
          ok = m >= 2 || (!EMPHASIS.has(L[i].n) && L[i].n.length <= 12);
          if (m === 1) kind = 'gaguejo';
        } else if (div === 1 && (L[j - 1].cut || isPrefix(L[j - 1], L[j + m] || { n: '' }))) {
          ok = true; // "o pac | o pacote"
        } else if (m >= 3 && div <= 2 && pause >= 0.25) {
          ok = true; kind = 'errada'; // "eu comprei esse produto | eu comprei esse pacote"
        } else if (m >= 2 && div === 1 && pause >= 0.4) {
          ok = true; kind = 'errada';
        }
        if (ok && (!best || i < best.i)) best = { i, kind };
      }
      if (best && mark(L, best.i, j, best.kind)) { changed = true; L = alive(); j = Math.max(0, L.findIndex((w) => w.i > best.i)) ; }
    }
    // 3) hesitação: "hã", "hum", "é..." arrastado ou isolado
    L = alive();
    for (let k = 0; k < L.length; k++) {
      const w = L[k], d = w.e - w.s, gb = k ? w.s - L[k - 1].e : 1, ga = k < L.length - 1 ? L[k + 1].s - w.e : 1;
      const filler = FILLERS.has(w.n) || /^(h?[aeu]+h*|h*m+)$/.test(w.n) && w.n.length >= 2 && !['eu', 'ae', 'au', 'ue', 'ha', 'hu', 'ai', 'oi', 'ah'].includes(w.n);
      const eLong = (w.n === 'e' || w.n === 'a') && (d >= 0.5 || (w.cut && d >= 0.25) || (gb >= 0.3 && ga >= 0.3 && d >= 0.3));
      if (filler || eLong) changed = mark(L, k, k + 1, 'hesitacao') || changed;
    }
    if (!changed) break;
  }

  // transforma em trechos de tempo
  const byIdx = new Map(W.map((w) => [w.i, w]));
  const keptAfter = (iLast) => W.find((w) => w.i > iLast && !gone.has(w.i));
  const keptBefore = (iFirst) => { let r = null; for (const w of W) { if (w.i >= iFirst) break; if (!gone.has(w.i)) r = w; } return r; };
  const LABEL = { repeticao: 'Frase repetida', errada: 'Fala corrigida', cortada: 'Palavra cortada', gaguejo: 'Gaguejo', hesitacao: 'Hesitação' };
  return fixes
    .map((f, n) => {
      const first = byIdx.get(f.idx[0]), last = byIdx.get(f.idx[f.idx.length - 1]);
      const next = keptAfter(last.i), prev = keptBefore(first.i);
      const a = Math.max(prev ? prev.e + 0.02 : first.s - 0.05, first.s - 0.04);
      let b = next ? Math.min(next.s - 0.03, last.e + 1.5) : last.e + 0.08;
      if (b <= a) b = last.e + 0.02;
      return {
        id: 'f' + n, kind: f.kind, label: LABEL[f.kind], a, b, from: f.idx[0], to: last.i + 1,
        removed: quote(f.idx.map((i) => words[i])),
        kept: quote(f.keptIdx.filter((i) => !gone.has(i) && words[i]).slice(0, 6).map((i) => words[i])),
      };
    })
    .sort((x, y) => x.a - y.a);
}

// ajusta o começo e o fim do corte para o ponto mais baixo do volume ali perto (não come sílaba)
export function snapFix(fix, A) {
  if (!A?.db) return fix;
  const HOPS = 0.05, find = (t, back, fwd) => {
    const i0 = Math.max(0, Math.round((t - back - A.t0) / HOPS)), i1 = Math.min(A.n - 1, Math.round((t + fwd - A.t0) / HOPS));
    let best = -1, bv = Infinity;
    for (let i = i0; i <= i1; i++) { const v = A.db[i]; if (v === v && v < bv) { bv = v; best = i; } }
    return best < 0 ? t : A.t0 + best * HOPS + HOPS / 2;
  };
  const a = find(fix.a, 0.08, 0.05), b = find(fix.b, 0.06, 0.06);
  return { ...fix, a: Math.min(a, fix.a + 0.05), b: Math.max(b, a + 0.05) };
}

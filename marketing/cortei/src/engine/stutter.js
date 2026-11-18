// Recomeços pelo som: acha quando a pessoa começa a falar, para e repete ("o pac... o pacote"),
// mesmo quando a transcrição não escreveu a primeira tentativa. Compara o "timbre" (MFCC) do fim de uma fala
// com o começo da fala seguinte; se forem parecidos o bastante, a primeira tentativa é cortada.
// Tudo em áudio mono 16 kHz; tempos em segundos dentro do pedaço analisado.

const SR = 16000, WIN = 400, HOPN = 160, NFFT = 512, NMEL = 26, NCEP = 12, FR = HOPN / SR; // 10 ms por quadro

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

let melBank = null;
function mel() {
  if (melBank) return melBank;
  const hz2mel = (f) => 2595 * Math.log10(1 + f / 700), mel2hz = (m) => 700 * (10 ** (m / 2595) - 1);
  const lo = hz2mel(100), hi = hz2mel(7000), pts = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor(((NFFT + 1) * mel2hz(lo + ((hi - lo) * i) / (NMEL + 1))) / SR));
  melBank = [];
  for (let m = 1; m <= NMEL; m++) { const f = new Float32Array(NFFT / 2 + 1); for (let k = pts[m - 1]; k < pts[m]; k++) f[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]); for (let k = pts[m]; k < pts[m + 1]; k++) f[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]); melBank.push(f); }
  return melBank;
}

// volume (dB) e MFCC a cada 10 ms
export function features(pcm) {
  const n = Math.max(0, Math.floor((pcm.length - WIN) / HOPN) + 1), bank = mel(), hamm = new Float32Array(WIN);
  for (let i = 0; i < WIN; i++) hamm[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  const db = new Float32Array(n), cep = new Array(n), re = new Float32Array(NFFT), im = new Float32Array(NFFT), lm = new Float32Array(NMEL);
  for (let f = 0; f < n; f++) {
    re.fill(0); im.fill(0); let e = 0;
    for (let i = 0; i < WIN; i++) { const v = pcm[f * HOPN + i]; e += v * v; re[i] = v * hamm[i]; }
    db[f] = 10 * Math.log10(e / WIN + 1e-10);
    fft(re, im);
    for (let m = 0; m < NMEL; m++) { let s = 0; const fb = bank[m]; for (let k = 0; k <= NFFT / 2; k++) if (fb[k]) s += fb[k] * (re[k] * re[k] + im[k] * im[k]); lm[m] = Math.log(s + 1e-10); }
    const c = new Float32Array(NCEP);
    for (let k = 1; k <= NCEP; k++) { let s = 0; for (let m = 0; m < NMEL; m++) s += lm[m] * Math.cos((Math.PI * k * (m + 0.5)) / NMEL); c[k - 1] = s; }
    cep[f] = c;
  }
  // tira a média (deixa a comparação independente do microfone)
  const mean = new Float32Array(NCEP); for (const c of cep) for (let k = 0; k < NCEP; k++) mean[k] += c[k] / Math.max(1, n);
  for (const c of cep) for (let k = 0; k < NCEP; k++) c[k] -= mean[k];
  return { db, cep, n };
}

// "ilhas" de fala: trechos com voz separados por pausas
export function speechIslands(F) {
  const s = Array.from(F.db).sort((a, b) => a - b), p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? -100;
  const thr = Math.max(p(0.1) + 9, p(0.97) - 32);
  const raw = []; let st = -1;
  for (let i = 0; i <= F.n; i++) { const on = i < F.n && F.db[i] > thr; if (on && st < 0) st = i; if (!on && st >= 0) { raw.push([st, i]); st = -1; } }
  const out = [];
  for (const x of raw) { const l = out[out.length - 1]; if (l && x[0] - l[1] < 12) l[1] = x[1]; else out.push([...x]); } // pausas < 120 ms não separam
  return out.filter(([a, b]) => b - a >= 6).map(([a, b]) => ({ a: a * FR, b: b * FR, fa: a, fb: b }));
}

const dist = (x, y) => { let s = 0; for (let k = 0; k < NCEP; k++) { const d = x[k] - y[k]; s += d * d; } return Math.sqrt(s); };
// alinha a consulta (fim da fala anterior) com o começo da fala seguinte; começo preso, fim livre
function dtwCost(cep, q0, q1, r0, r1) {
  const q = q1 - q0, r = r1 - r0; if (q < 5 || r < 5) return Infinity;
  let prev = new Float32Array(r).fill(Infinity), cur = new Float32Array(r), prevL = new Float32Array(r), curL = new Float32Array(r);
  for (let i = 0; i < q; i++) {
    for (let j = 0; j < r; j++) {
      const d = dist(cep[q0 + i], cep[r0 + j]);
      if (i === 0 && j === 0) { cur[j] = d; curL[j] = 1; continue; }
      let best = Infinity, L = 0;
      if (i > 0 && prev[j] < best) { best = prev[j]; L = prevL[j]; }
      if (j > 0 && cur[j - 1] < best) { best = cur[j - 1]; L = curL[j - 1]; }
      if (i > 0 && j > 0 && prev[j - 1] <= best) { best = prev[j - 1]; L = prevL[j - 1]; }
      cur[j] = best + d; curL[j] = L + 1;
    }
    [prev, cur] = [cur, prev]; [prevL, curL] = [curL, prevL];
  }
  let m = Infinity; for (let j = Math.floor(q * 0.6); j < r; j++) m = Math.min(m, prev[j] / prevL[j]);
  return m;
}

/**
 * devolve [{ a, b, ratio, strong }]: corta de a (começo da tentativa) até b (começo da repetição)
 */
export function findRestarts(F, islands) {
  const out = [], LENS = [0.25, 0.35, 0.5, 0.7, 0.9, 1.2];
  for (let i = 0; i < islands.length - 1; i++) {
    const A = islands[i], B = islands[i + 1], gap = B.a - A.b;
    if (gap < 0.12 || gap > 2.5) continue;
    let pick = null;
    for (const L of LENS) {
      const q = Math.round(L / FR); if (q > A.fb - A.fa) break;
      const q0 = A.fb - q, r1 = Math.min(B.fb, B.fa + Math.round(q * 1.8));
      const c = dtwCost(F.cep, q0, A.fb, B.fa, r1);
      // referência: o mesmo trecho comparado com o começo de outras falas da gravação
      const base = [];
      for (let k = 0; k < islands.length && base.length < 8; k++) {
        if (k === i || k === i + 1) continue;
        const K = islands[k]; if (K.fb - K.fa < q * 0.8) continue;
        base.push(dtwCost(F.cep, q0, A.fb, K.fa, Math.min(K.fb, K.fa + Math.round(q * 1.8))));
      }
      if (base.length < 2) continue;
      base.sort((x, y) => x - y);
      const ratio = c / base[Math.floor(base.length / 2)];
      if (ratio < 0.68 && (!pick || ratio <= pick.ratio * 1.12)) pick = { a: A.b - L, b: B.a, ratio, L };
    }
    if (pick) out.push({ a: pick.a, b: pick.b, ratio: pick.ratio, strong: pick.ratio < 0.6 });
  }
  return out;
}

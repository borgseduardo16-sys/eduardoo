/*
 * Converte as SDFs em malhas densas por "surface nets" (dual contouring simples) e
 * reprojeta cada vértice na superfície exata (Newton) — malha lisa, com normais
 * analíticas. Saída: binários em ./malhas/ (posições + normais Float32, índices Uint32).
 *   node gerar-malhas.mjs [passo_mm_corpo=3]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { corpo, osso, vertebra } from './sdf.mjs';

function surfaceNets(f, min, max, h) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const campo = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // aceleração: blocos de 8³ longe da superfície são pulados (só o sinal importa)
  const B = 8;
  for (let bk = 0; bk < nz; bk += B)
    for (let bj = 0; bj < ny; bj += B)
      for (let bi = 0; bi < nx; bi += B) {
        const cx = min[0] + (bi + B / 2) * h, cy = min[1] + (bj + B / 2) * h, cz = min[2] + (bk + B / 2) * h;
        const dc = f(cx, cy, cz);
        const raio = B * h * 0.9;
        const longe = Math.abs(dc) > raio * 1.2;
        for (let k = bk; k < Math.min(nz, bk + B); k++)
          for (let j = bj; j < Math.min(ny, bj + B); j++)
            for (let i = bi; i < Math.min(nx, bi + B); i++)
              campo[id(i, j, k)] = longe ? dc : f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
      }

  const vertIdx = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cantos = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const arestas = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const v = new Array(8);
        for (let c = 0; c < 8; c++) {
          v[c] = campo[id(i + cantos[c][0], j + cantos[c][1], k + cantos[c][2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of arestas) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += cantos[a][0] + (cantos[b][0] - cantos[a][0]) * t;
          sy += cantos[a][1] + (cantos[b][1] - cantos[a][1]) * t;
          sz += cantos[a][2] + (cantos[b][2] - cantos[a][2]) * t;
          n++;
        }
        vertIdx[id(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
      }

  const idx = [];
  const quad = (a, b, c, d, inv) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (inv) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = campo[id(i, j, k)] < 0;
        if (i < nx - 1 && s0 !== (campo[id(i + 1, j, k)] < 0))
          quad(vertIdx[id(i, j - 1, k - 1)], vertIdx[id(i, j, k - 1)], vertIdx[id(i, j, k)], vertIdx[id(i, j - 1, k)], s0);
        if (j < ny - 1 && s0 !== (campo[id(i, j + 1, k)] < 0))
          quad(vertIdx[id(i - 1, j, k - 1)], vertIdx[id(i - 1, j, k)], vertIdx[id(i, j, k)], vertIdx[id(i, j, k - 1)], s0);
        if (k < nz - 1 && s0 !== (campo[id(i, j, k + 1)] < 0))
          quad(vertIdx[id(i - 1, j - 1, k)], vertIdx[id(i, j - 1, k)], vertIdx[id(i, j, k)], vertIdx[id(i - 1, j, k)], s0);
      }

  // reprojeção na superfície exata + normais pelo gradiente
  const P = new Float32Array(pos);
  const N = new Float32Array(P.length);
  const e = h * 0.25;
  for (let v = 0; v < P.length; v += 3) {
    let x = P[v], y = P[v + 1], z = P[v + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      const g = Math.hypot(gx, gy, gz) || 1;
      gx /= g; gy /= g; gz /= g;
      const passo = Math.max(-h * 0.5, Math.min(h * 0.5, d));
      x -= gx * passo; y -= gy * passo; z -= gz * passo;
    }
    P[v] = x; P[v + 1] = y; P[v + 2] = z;
    N[v] = gx; N[v + 1] = gy; N[v + 2] = gz;
  }
  return { P, N, I: new Uint32Array(idx) };
}

function salvar(nome, m) {
  mkdirSync('malhas', { recursive: true });
  writeFileSync(`malhas/${nome}.pos`, Buffer.from(m.P.buffer));
  writeFileSync(`malhas/${nome}.nrm`, Buffer.from(m.N.buffer));
  writeFileSync(`malhas/${nome}.idx`, Buffer.from(m.I.buffer));
  console.log(`${nome}: ${(m.P.length / 3).toLocaleString('pt-BR')} vértices, ${(m.I.length / 3).toLocaleString('pt-BR')} triângulos`);
}

const passo = Number(process.argv[2] ?? 3) / 1000;
let t = Date.now();
salvar('corpo', surfaceNets(corpo, [-0.34, -0.01, -0.17], [0.34, 1.8, 0.18], passo));
console.log(`  ${(Date.now() - t) / 1000}s`); t = Date.now();
salvar('osso', surfaceNets(osso, [-0.33, 0.06, -0.12], [0.33, 1.78, 0.13], 0.0018));
console.log(`  ${(Date.now() - t) / 1000}s`); t = Date.now();
salvar('vertebra', surfaceNets(vertebra, [-0.6, -0.5, -0.8], [0.6, 0.5, 0.6], 0.015));
console.log(`  ${(Date.now() - t) / 1000}s`);

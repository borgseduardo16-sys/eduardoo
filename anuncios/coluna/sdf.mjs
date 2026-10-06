/*
 * Anatomia procedural por SDF (campos de distância com sinal): o corpo é a união SUAVE de
 * elipsoides e cones arredondados — superfície orgânica contínua, sem facetas. Depois vira
 * malha densa (surface nets) em gerar-malhas.mjs. Unidades em metros, y para cima, frente = +z.
 */

export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = len3(x / rx, y / ry, z / rz);
  const k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** Cone arredondado entre a e b, raios ra → rb (Inigo Quilez). */
export function roundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const yv = pax * bax + pay * bay + paz * baz;
  const z = yv - l2;
  const xx = (pax * l2 - bax * yv), xy = (pay * l2 - bay * yv), xz = (paz * l2 - baz * yv);
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = yv * yv * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}

export function capsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

/* ------------------------------------------------------------------ corpo (pele) */

function lado(px, py, pz, s) {
  // membros de um lado (s = +1 direito / -1 esquerdo); usa |x| espelhado
  const x = px * s;
  let d = 1e9;
  // braço (pose em A suave)
  d = Math.min(d, roundCone(x, py, pz, 0.195, 1.385, -0.012, 0.245, 1.105, -0.018, 0.05, 0.037));
  d = smin(d, ellipsoid(x, py, pz, 0.205, 1.30, -0.008, 0.045, 0.085, 0.045), 0.03); // bíceps/tríceps
  d = smin(d, roundCone(x, py, pz, 0.247, 1.095, -0.012, 0.272, 0.845, 0.035, 0.038, 0.025), 0.025);
  d = smin(d, ellipsoid(x, py, pz, 0.255, 1.03, -0.002, 0.038, 0.07, 0.038), 0.025); // antebraço
  // mão
  d = smin(d, ellipsoid(x, py, pz, 0.278, 0.775, 0.048, 0.02, 0.058, 0.04), 0.02);
  d = smin(d, roundCone(x, py, pz, 0.278, 0.75, 0.05, 0.281, 0.69, 0.055, 0.016, 0.011), 0.015);
  d = smin(d, roundCone(x, py, pz, 0.268, 0.79, 0.075, 0.262, 0.745, 0.098, 0.011, 0.008), 0.012); // polegar
  // deltoide
  d = smin(d, ellipsoid(x, py, pz, 0.185, 1.395, -0.008, 0.062, 0.072, 0.062), 0.035);
  // perna
  d = smin(d, roundCone(x, py, pz, 0.092, 0.905, 0.0, 0.1, 0.515, 0.002, 0.088, 0.056), 0.04);
  d = smin(d, ellipsoid(x, py, pz, 0.105, 0.72, 0.022, 0.07, 0.15, 0.065), 0.04); // quadríceps
  d = smin(d, ellipsoid(x, py, pz, 0.1, 0.495, 0.012, 0.05, 0.056, 0.05), 0.03); // joelho
  d = smin(d, roundCone(x, py, pz, 0.1, 0.48, -0.004, 0.106, 0.095, -0.012, 0.054, 0.033), 0.03);
  d = smin(d, ellipsoid(x, py, pz, 0.1, 0.36, -0.028, 0.048, 0.095, 0.048), 0.035); // panturrilha
  // pé
  d = smin(d, roundCone(x, py, pz, 0.107, 0.06, -0.03, 0.118, 0.025, 0.115, 0.04, 0.027), 0.03);
  d = smin(d, ellipsoid(x, py, pz, 0.106, 0.04, -0.035, 0.035, 0.035, 0.04), 0.02);
  return d;
}

export function corpo(px, py, pz) {
  let d = ellipsoid(px, py, pz, 0, 1.665, 0.008, 0.079, 0.106, 0.094); // crânio
  d = smin(d, ellipsoid(px, py, pz, 0, 1.588, 0.036, 0.058, 0.052, 0.062), 0.035); // mandíbula
  d = smin(d, ellipsoid(px, py, pz, 0, 1.63, 0.092, 0.012, 0.025, 0.02), 0.015); // nariz
  d = smin(d, roundCone(px, py, pz, 0, 1.465, -0.008, 0, 1.585, 0.0, 0.054, 0.046), 0.03); // pescoço
  // trapézio
  d = smin(d, roundCone(px, py, pz, -0.15, 1.43, -0.025, 0.15, 1.43, -0.025, 0.045, 0.045), 0.06);
  // tronco
  d = smin(d, ellipsoid(px, py, pz, 0, 1.305, 0.012, 0.165, 0.15, 0.105), 0.05); // peito
  d = smin(d, ellipsoid(px, py, pz, -0.072, 1.315, 0.058, 0.082, 0.068, 0.052), 0.03);
  d = smin(d, ellipsoid(px, py, pz, 0.072, 1.315, 0.058, 0.082, 0.068, 0.052), 0.03);
  d = smin(d, ellipsoid(px, py, pz, 0, 1.155, 0.0, 0.138, 0.16, 0.094), 0.06); // cintura
  d = smin(d, ellipsoid(px, py, pz, 0, 1.03, 0.014, 0.132, 0.13, 0.092), 0.06); // abdome
  d = smin(d, ellipsoid(px, py, pz, 0, 0.935, -0.006, 0.168, 0.105, 0.102), 0.06); // quadril
  d = smin(d, ellipsoid(px, py, pz, -0.076, 0.885, -0.052, 0.088, 0.105, 0.078), 0.04); // glúteos
  d = smin(d, ellipsoid(px, py, pz, 0.076, 0.885, -0.052, 0.088, 0.105, 0.078), 0.04);
  d = smin(d, ellipsoid(px, py, pz, 0, 1.24, -0.06, 0.15, 0.17, 0.05), 0.06); // dorsais
  d = smin(d, lado(px, py, pz, 1), 0.035);
  d = smin(d, lado(px, py, pz, -1), 0.035);
  return d;
}

/* ------------------------------------------------------------------- coluna */

/** Curva da coluna (S): t=0 no topo (C1), t=1 na base (S1). Retorna [x,y,z]. */
export function curvaColuna(t) {
  const y = 1.535 - t * 0.6;
  // lordose cervical (frente), cifose torácica (trás), lordose lombar (frente)
  const z = -0.035 + 0.012 * Math.sin(t * Math.PI * 0.9) * -1
    - 0.03 * Math.exp(-((t - 0.38) ** 2) / 0.03)
    + 0.022 * Math.exp(-((t - 0.82) ** 2) / 0.012)
    + 0.012 * Math.exp(-((t - 0.05) ** 2) / 0.004);
  return [0, y, z];
}

/** Vértebra no espaço local (corpo no +z, processo espinhoso no -z), altura ~1 (escala depois). */
export function vertebra(px, py, pz) {
  // corpo vertebral: cilindro arredondado (elipsoide achatado + capsula)
  let d = ellipsoid(px, py, pz, 0, 0, 0.18, 0.36, 0.2, 0.3);
  d = smin(d, capsule(px, py, pz, -0.22, 0, 0.18, 0.22, 0, 0.18, 0.2), 0.05);
  // arco vertebral (anel atrás)
  const ax = px, az = pz + 0.18;
  const anel = Math.sqrt(Math.max(0, len3(ax, 0, az) - 0.18) ** 2 + py * py) - 0.07;
  d = smin(d, Math.max(anel, -(pz + 0.0)), 0.05);
  // processo espinhoso (para trás e para baixo)
  d = smin(d, roundCone(px, py, pz, 0, 0.0, -0.32, 0, -0.18, -0.68, 0.08, 0.04), 0.06);
  // processos transversos
  d = smin(d, roundCone(px, py, pz, -0.12, 0.02, -0.22, -0.45, 0.06, -0.28, 0.06, 0.04), 0.05);
  d = smin(d, roundCone(px, py, pz, 0.12, 0.02, -0.22, 0.45, 0.06, -0.28, 0.06, 0.04), 0.05);
  // facetas articulares
  d = smin(d, capsule(px, py, pz, -0.15, -0.12, -0.2, -0.15, 0.16, -0.22, 0.05), 0.04);
  d = smin(d, capsule(px, py, pz, 0.15, -0.12, -0.2, 0.15, 0.16, -0.22, 0.05), 0.04);
  return d;
}

/* ---------------------------------------------------------------- esqueleto */

const costelas = [];
for (let i = 0; i < 12; i++) {
  const t = 0.24 + i * 0.045; // posição na coluna (torácica)
  const [, y, z] = curvaColuna(t);
  const larg = 0.075 + 0.055 * Math.sin(Math.min(1, (i + 1) / 7) * Math.PI * 0.5) - (i > 8 ? (i - 8) * 0.012 : 0);
  const prof = 0.085 + 0.02 * Math.sin((i / 11) * Math.PI);
  const queda = 0.07 + i * 0.008;
  const fim = i < 7 ? 1 : i < 10 ? 0.82 : 0.55; // flutuantes mais curtas
  const pts = [];
  const N = 18;
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * Math.PI * fim; // de trás (0) para frente (π)
    pts.push([Math.sin(a) * larg, y - (k / N) * queda, z + 0.01 - (1 - Math.cos(a)) * 0.5 * -prof * 1.0 + 0.0]);
  }
  costelas.push(pts);
}

function costela(px, py, pz) {
  let d = 1e9;
  for (const pts of costelas) {
    // caixa delimitadora rápida
    if (py > pts[0][1] + 0.03 || py < pts[pts.length - 1][1] - 0.03) continue;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      d = Math.min(d, capsule(Math.abs(px), py, pz, a[0], a[1], a[2], b[0], b[1], b[2], 0.0058));
    }
  }
  return d;
}

function osso(px, py, pz) {
  const x = Math.abs(px);
  // crânio + face
  let d = ellipsoid(px, py, pz, 0, 1.67, 0.0, 0.07, 0.085, 0.085);
  d = smin(d, ellipsoid(px, py, pz, 0, 1.6, 0.03, 0.05, 0.045, 0.05), 0.02);
  d = Math.max(d, -ellipsoid(x, py, pz, 0.028, 1.635, 0.075, 0.02, 0.017, 0.03)); // órbitas
  // clavículas
  d = Math.min(d, roundCone(x, py, pz, 0.02, 1.43, 0.035, 0.165, 1.445, -0.01, 0.009, 0.008));
  // escápulas
  d = Math.min(d, ellipsoid(x, py, pz, 0.1, 1.33, -0.085, 0.06, 0.075, 0.012));
  // esterno
  d = Math.min(d, ellipsoid(px, py, pz, 0, 1.3, 0.085, 0.02, 0.09, 0.01));
  // úmero, rádio/ulna
  d = Math.min(d, roundCone(x, py, pz, 0.198, 1.385, -0.012, 0.243, 1.11, -0.016, 0.017, 0.012));
  d = Math.min(d, roundCone(x, py, pz, 0.245, 1.095, -0.01, 0.268, 0.86, 0.04, 0.009, 0.008));
  d = Math.min(d, roundCone(x, py, pz, 0.252, 1.09, -0.02, 0.278, 0.86, 0.025, 0.008, 0.007));
  // pelve: asas ilíacas + sacro
  d = Math.min(d, ellipsoid(x, py, pz, 0.095, 0.975, -0.01, 0.065, 0.055, 0.018 + 0.0 * x));
  d = smin(d, ellipsoid(x, py, pz, 0.06, 0.9, 0.02, 0.04, 0.035, 0.03), 0.02);
  d = smin(d, capsule(x, py, pz, 0.015, 0.875, 0.05, 0.05, 0.89, 0.04, 0.012), 0.01); // púbis
  // fêmur, tíbia, fíbula
  d = Math.min(d, roundCone(x, py, pz, 0.085, 0.905, -0.005, 0.1, 0.51, 0.008, 0.019, 0.015));
  d = Math.min(d, ellipsoid(x, py, pz, 0.1, 0.5, 0.01, 0.03, 0.025, 0.028));
  d = Math.min(d, roundCone(x, py, pz, 0.1, 0.48, 0.0, 0.105, 0.09, -0.008, 0.016, 0.012));
  d = Math.min(d, roundCone(x, py, pz, 0.118, 0.47, -0.012, 0.12, 0.1, -0.015, 0.007, 0.006));
  d = Math.min(d, costela(px, py, pz));
  return d;
}

export { osso };

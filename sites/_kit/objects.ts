/*
 * Objetos 3D procedurais reutilizáveis (sem modelos externos): relógio em
 * camadas (explodível), engrenagem, névoa/nuvens e partículas. No bundle da CENA.
 */
import * as THREE from 'three';

/* ----------------------------------------------------------------- texturas */

/** Textura de "puff" de nuvem/fumaça: vários círculos suaves sobrepostos. */
export function puffTexture(size = 256, seed = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 14; i++) {
    const r = size * (0.14 + rnd() * 0.22);
    const x = size * (0.26 + rnd() * 0.48);
    const y = size * (0.3 + rnd() * 0.4);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mostrador do relógio desenhado em canvas: sunburst, índices, subdials e marca. */
export function dialTexture(marca: string, dark = true): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const base = dark ? ['#0b1730', '#050a16'] : ['#f3efe7', '#d9d2c3'];
  const gr = g.createRadialGradient(cx, cx, 20, cx, cx, cx);
  gr.addColorStop(0, base[0]);
  gr.addColorStop(1, base[1]);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // sunburst
  g.save();
  g.translate(cx, cx);
  for (let i = 0; i < 360; i += 1.5) {
    g.rotate((1.5 * Math.PI) / 180);
    g.strokeStyle = `rgba(255,255,255,${0.018 + ((i * 7) % 5) * 0.006})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 40);
    g.lineTo(0, cx);
    g.stroke();
  }
  g.restore();
  // índices
  const ouro = '#d9b878';
  g.fillStyle = ouro;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const grande = i % 5 === 0;
    const r1 = cx - 46;
    const r2 = cx - (grande ? 118 : 74);
    g.strokeStyle = ouro;
    g.lineWidth = grande ? 14 : 3;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r1, cx - Math.cos(a) * r1);
    g.lineTo(cx + Math.sin(a) * r2, cx - Math.cos(a) * r2);
    g.stroke();
  }
  // subdial
  g.strokeStyle = 'rgba(217,184,120,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cx + 190, 120, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * 100, cx + 190 - Math.cos(a) * 100);
    g.lineTo(cx + Math.sin(a) * 118, cx + 190 - Math.cos(a) * 118);
    g.stroke();
  }
  g.fillStyle = ouro;
  g.textAlign = 'center';
  g.font = '600 54px "Unbounded", system-ui, sans-serif';
  g.fillText(marca.toUpperCase(), cx, cx - 150);
  g.font = '400 26px system-ui, sans-serif';
  g.fillStyle = 'rgba(217,184,120,0.7)';
  g.fillText('AUTOMATIC · SAPPHIRE', cx, cx - 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* --------------------------------------------------------------- engrenagem */

export function gearGeometry(teeth: number, rOuter: number, rInner: number, thick: number, hole = 0.12): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [rInner, a],
      [rOuter, a + step * 0.18],
      [rOuter, a + step * 0.48],
      [rInner, a + step * 0.66],
    ];
    pts.forEach(([r, ang], k) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, rInner * hole * 3, 0, Math.PI * 2, true);
  s.holes.push(h);
  // raios (vazados) para parecer uma engrenagem de relojoaria
  const razoes = 5;
  for (let i = 0; i < razoes; i++) {
    const a0 = (i / razoes) * Math.PI * 2 + 0.18;
    const a1 = ((i + 1) / razoes) * Math.PI * 2 - 0.18;
    const p = new THREE.Path();
    const r0 = rInner * 0.4;
    const r1 = rInner * 0.82;
    p.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    p.absarc(0, 0, r0, a0, a1, false);
    p.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    p.absarc(0, 0, r1, a1, a0, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: thick * 0.15, bevelThickness: thick * 0.15, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); // eixo = Y
  g.translate(0, -thick / 2, 0);
  return g;
}

/* ------------------------------------------------------------------ relógio */

export type Watch = {
  group: THREE.Group;
  /** Pulseira (pode ser escondida em telas estreitas). */
  strap: THREE.Group;
  /** Camadas na ordem de baixo para cima, com a altura de repouso e a explodida. */
  layers: { name: string; obj: THREE.Object3D; rest: number; exploded: number }[];
  hands: { hour: THREE.Object3D; minute: THREE.Object3D; second: THREE.Object3D };
  gears: THREE.Mesh[];
  materials: { steel: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; glass: THREE.MeshPhysicalMaterial };
  /** 0 = montado, 1 = totalmente explodido. */
  setExplode: (e: number) => void;
  dispose: () => void;
};

/** Relógio de pulso com o eixo no +Y (mostrador para cima). Tudo procedural. */
export function makeWatch(marca: string, quality: 'high' | 'low'): Watch {
  const seg = quality === 'high' ? 96 : 48;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => (disposables.push(o), o);

  const steel = track(new THREE.MeshStandardMaterial({ color: 0xd6dbe2, metalness: 1, roughness: 0.22 }));
  const steelDark = track(new THREE.MeshStandardMaterial({ color: 0x8b929c, metalness: 1, roughness: 0.38 }));
  const gold = track(new THREE.MeshStandardMaterial({ color: 0xd6a85a, metalness: 1, roughness: 0.28 }));
  const glass = track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, side: THREE.DoubleSide }));
  const dialTex = track(dialTexture(marca, true));
  const dialMat = track(new THREE.MeshStandardMaterial({ map: dialTex, metalness: 0.5, roughness: 0.45 }));

  const layers: Watch['layers'] = [];
  const add = (name: string, obj: THREE.Object3D, rest: number, exploded: number) => {
    obj.position.y = rest;
    group.add(obj);
    layers.push({ name, obj, rest, exploded });
  };

  // 1. Fundo da caixa
  const back = new THREE.Mesh(track(new THREE.CylinderGeometry(1.0, 1.04, 0.1, seg)), steelDark);
  add('Fundo', back, -0.2, -1.6);

  // 2. Movimento: três engrenagens de ouro + platina
  const mov = new THREE.Group();
  const plate = new THREE.Mesh(track(new THREE.CylinderGeometry(0.92, 0.92, 0.04, seg)), track(new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.9, roughness: 0.5 })));
  mov.add(plate);
  const gears: THREE.Mesh[] = [];
  const specs: [number, number, number, number, number][] = [
    [18, 0.46, 0.38, -0.05, 0.1], // dentes, rExt, rInt, x, z
    [12, 0.3, 0.24, 0.55, -0.35],
    [10, 0.24, 0.19, -0.5, 0.52],
  ];
  for (const [n, ro, ri, x, z] of specs) {
    const gm = new THREE.Mesh(track(gearGeometry(n, ro, ri, 0.06)), gold);
    gm.position.set(x, 0.06, z);
    mov.add(gm);
    gears.push(gm);
  }
  add('Movimento', mov, 0.0, -0.75);

  // 3. Caixa (anel lapidado) — perfil por revolução
  const prof = [
    [0.93, -0.1], [1.1, -0.1], [1.15, -0.02], [1.15, 0.1], [1.1, 0.16], [0.97, 0.16], [0.93, 0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const caseMid = new THREE.Mesh(track(new THREE.LatheGeometry(prof, seg)), steel);
  // coroa
  const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 24)), steel);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(1.22, 0.03, 0);
  caseMid.add(crown);
  // alças (lugs)
  const lugGeo = track(new THREE.BoxGeometry(0.22, 0.16, 0.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(lugGeo, steel);
    l.position.set(sx * 0.46, 0.02, sz * 1.18);
    caseMid.add(l);
  }
  add('Caixa', caseMid, 0.45, 0.4);

  // 4. Mostrador
  const dial = new THREE.Mesh(track(new THREE.CylinderGeometry(0.93, 0.93, 0.03, seg)), [steelDark, dialMat, steelDark]);
  // (CylinderGeometry: grupos = lateral, topo, base)
  add('Mostrador', dial, 0.55, 1.15);

  // 5. Ponteiros
  const hands = new THREE.Group();
  const mkHand = (len: number, w: number, mat: THREE.Material, y: number) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.012, len)), mat);
    m.position.z = -len / 2 + len * 0.12;
    pivot.add(m);
    pivot.position.y = y;
    hands.add(pivot);
    return pivot;
  };
  const hour = mkHand(0.52, 0.07, gold, 0.0);
  const minute = mkHand(0.78, 0.05, gold, 0.015);
  const second = mkHand(0.86, 0.014, steel, 0.03);
  const pin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 24)), gold);
  hands.add(pin);
  add('Ponteiros', hands, 0.62, 1.75);

  // 6. Cristal + moldura
  const top = new THREE.Group();
  const crystal = new THREE.Mesh(track(new THREE.CylinderGeometry(0.97, 0.97, 0.03, seg)), glass);
  const bezelProf = [[0.93, 0], [1.02, 0], [1.13, 0.05], [1.12, 0.1], [0.97, 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
  const bezel = new THREE.Mesh(track(new THREE.LatheGeometry(bezelProf, seg)), steel);
  top.add(crystal, bezel);
  add('Cristal', top, 0.72, 2.35);

  // Pulseira (links curvados para baixo), fora das camadas
  const linkGeo = track(new THREE.BoxGeometry(0.98, 0.1, 0.3));
  const linkGeoMid = track(new THREE.BoxGeometry(0.34, 0.12, 0.28));
  const strap = new THREE.Group();
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = dir * (1.55 + i * 0.33);
      const y = -Math.pow(i * 0.33, 2) * 0.16;
      const link = new THREE.Group();
      const a = new THREE.Mesh(linkGeo, steelDark);
      const b = new THREE.Mesh(linkGeoMid, steel);
      b.position.y = 0.012;
      a.scale.x = 0.62;
      link.add(a, b);
      link.position.set(0, y + 0.1, z);
      link.rotation.x = dir * Math.atan(-0.16 * 2 * (i * 0.33)) * -1 * 0.9;
      strap.add(link);
    }
  }
  group.add(strap);

  const setExplode = (e: number) => {
    for (const l of layers) l.obj.position.y = l.rest + (l.exploded - l.rest) * e;
    strap.position.y = -0.1 * e;
    strap.scale.set(1, 1, 1 + e * 0.12);
  };

  return {
    group,
    strap,
    layers,
    hands: { hour, minute, second },
    gears,
    materials: { steel, gold, glass },
    setExplode,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/* ------------------------------------------------------------ névoa / nuvens */

export type Fog = {
  group: THREE.Group;
  /** Atualiza deriva e cor. `tint` = cor das nuvens; `opacity` multiplica a opacidade base; `camZ` faz as nuvens esmaecerem ao passar pela câmera. */
  update: (t: number, tint: THREE.ColorRepresentation, opacity: number, camZ: number) => void;
  dispose: () => void;
};

/** Campo de puffs em profundidade: com a câmera avançando em Z, dá a travessia por nuvens. */
export function makeFog(count: number, zNear: number, zFar: number, spread = 14): Fog {
  const group = new THREE.Group();
  const texs = [puffTexture(256, 1), puffTexture(256, 2), puffTexture(256, 3)];
  const sprites: { s: THREE.Sprite; base: number; sp: number; ph: number; x0: number; y0: number; sh: number }[] = [];
  let r = 7;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, opacity: 0.5 });
    const s = new THREE.Sprite(m);
    const z = zFar + (zNear - zFar) * (i / count) + (rnd() - 0.5) * 3;
    const x0 = (rnd() - 0.5) * spread * 1.4;
    const y0 = (rnd() - 0.5) * spread * 0.7;
    const sc = 7 + rnd() * 9;
    s.position.set(x0, y0, z);
    s.scale.set(sc, sc * 0.7, 1);
    s.material.rotation = rnd() * Math.PI * 2;
    group.add(s);
    sprites.push({ s, base: 0.45 + rnd() * 0.45, sp: 0.05 + rnd() * 0.12, ph: rnd() * 6.28, x0, y0, sh: [0, 0.1, 0.22][Math.floor(rnd() * 3)] });
  }
  const col = new THREE.Color();
  return {
    group,
    update(t, tint, opacity, camZ) {
      col.set(tint);
      for (const p of sprites) {
        p.s.position.x = p.x0 + Math.sin(t * p.sp + p.ph) * 1.2;
        p.s.position.y = p.y0 + Math.cos(t * p.sp * 0.8 + p.ph) * 0.5;
        const m = p.s.material;
        m.color.copy(col).multiplyScalar(1 - p.sh); // alguns puffs mais escuros = volume
        const d = camZ - p.s.position.z; // distância à frente da câmera
        const fade = d < 0.5 ? 0 : d > 7 ? 1 : (d - 0.5) / 6.5;
        m.opacity = p.base * opacity * fade * fade * (3 - 2 * fade);
        m.rotation += 0.0006 * (p.sp > 0.1 ? 1 : -1);
      }
    },
    dispose() {
      texs.forEach((t) => t.dispose());
      sprites.forEach((p) => p.s.material.dispose());
    },
  };
}

/* --------------------------------------------------------------- partículas */

export function makeDust(count: number, spread: THREE.Vector3, color = 0xffffff, size = 0.05) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread.x;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  const map = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({ size, map, color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  return { points: pts, material: mat, dispose: () => (geo.dispose(), mat.dispose(), map.dispose()) };
}

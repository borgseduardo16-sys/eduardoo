/*
 * Cena do anúncio: corpo em "raio-X" holográfico, esqueleto translúcido e coluna com dor
 * (vermelho pulsante) controlada pelo roteiro. Render DETERMINÍSTICO: window.quadro(t) desenha
 * o instante t (s) — o gravador tira um print por quadro, sem depender do relógio.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { curvaColuna } from './sdf.mjs';

declare global {
  interface Window {
    quadro: (t: number) => void;
    pronto: Promise<void>;
    ROTEIRO: Roteiro;
  }
}

export type Chave = { t: number; [k: string]: number };
export type Texto = {
  ini: number;
  fim: number;
  /** palavras entre *asteriscos* ganham destaque (serifa itálica colorida) */
  texto: string;
  estilo: 'titulo' | 'apoio' | 'selo' | 'marca' | 'cta' | 'gigante' | 'contador' | 'pontos' | 'assinatura';
  /** instante (s) em que cada palavra é falada — a palavra aparece exatamente aí */
  tempos?: number[];
  de?: number; ate?: number; dur?: number; n?: number;
  pos: 'topo' | 'centro' | 'baixo';
  /** cor do destaque: dor (vermelho) ou alivio (azul-gelo) */
  tom?: 'dor' | 'alivio' | 'ouro';
  atraso?: number;
  /** posição vertical exata (px do topo) — sobrepõe `pos` */
  y?: number;
};

export type Cena = { ini: number; fim: number; tipo: 'boneco' | 'tipo' };
export type Roteiro = {
  duracao: number;
  cenas: Cena[];
  textos: Texto[];
  /** trilhas animadas por chaves (interpolação suave entre elas) */
  trilhas: Record<string, Chave[]>;
};

const W = 1080, H = 1920;

/* ----------------------------------------------------------------- utilitários */
const suave = (x: number) => x * x * (3 - 2 * x);
function valor(trilha: Chave[] | undefined, nome: string, t: number, padrao: number): number {
  if (!trilha || !trilha.length) return padrao;
  const ks = trilha.filter((k) => nome in k);
  if (!ks.length) return padrao;
  if (t <= ks[0].t) return ks[0][nome];
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t <= b.t) return a[nome] + (b[nome] - a[nome]) * suave((t - a.t) / (b.t - a.t));
  }
  return ks[ks.length - 1][nome];
}

async function carregar(nome: string) {
  const [p, n, i] = await Promise.all(
    ['pos', 'nrm', 'idx'].map((e) => fetch(`malhas/${nome}.${e}`).then((r) => r.arrayBuffer())),
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(i), 1));
  return g;
}

/* ------------------------------------------------------------------- shaders */
const vert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #ifdef USE_INSTANCING
  attribute float aT; varying float vT;
  #endif
  void main(){
    #ifdef USE_INSTANCING
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vT = aT;
    #else
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    #endif
    vW = w.xyz; vV = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const fragPele = /* glsl */ `
  uniform vec3 uRim; uniform vec3 uCore; uniform float uOpac; uniform float uDor; uniform float uDorY;
  uniform float uTempo; uniform float uVarredura;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float rim = pow(f, 2.6);
    vec3 c = uCore * 0.03 + uRim * rim * 0.6;
    // linhas finas de "scanner", muito sutis
    c *= 0.94 + 0.06 * sin(vW.y * 900.0);
    // dor: aura vermelha na lombar (atrás)
    float zy = (vW.y - uDorY) / 0.09; float zona = exp(-zy * zy) * smoothstep(0.03, -0.09, vW.z) * uDor;
    c = mix(c, vec3(1.0, 0.1, 0.04) * (0.25 + rim * 1.4), clamp(zona, 0.0, 1.0));
    // varredura de luz (alívio)
    float fy = (vW.y - uVarredura) / 0.035; float faixa = exp(-fy * fy);
    c += vec3(0.65, 0.85, 1.0) * faixa * (0.08 + rim * 0.75);
    gl_FragColor = vec4(c * uOpac, 1.0);
  }`;

const fragOsso = /* glsl */ `
  uniform vec3 uCor; uniform float uOpac;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float luz = 0.12 + pow(f, 1.8) * 0.9;
    gl_FragColor = vec4(uCor * luz * uOpac, 1.0);
  }`;

const fragColuna = /* glsl */ `
  uniform vec3 uCor; uniform float uOpac; uniform float uDor; uniform float uDorT; uniform float uDorL;
  uniform float uTempo; uniform float uCalma;
  varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vT;
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float luz = 0.10 + pow(f, 1.5) * 0.55 + max(dot(n, normalize(vec3(0.3, 0.6, 0.7))), 0.0) * 0.32;
    vec3 c = uCor * luz;
    float pulso = 0.86 + 0.14 * sin(uTempo * 4.2 - vT * 9.0);
    float dt = (vT - uDorT) / uDorL; float d = uDor * exp(-dt * dt) * pulso;
    c = mix(c, vec3(0.95, 0.045, 0.02) * (0.45 + 0.75 * pow(f, 1.1) + 0.25 * max(dot(n, normalize(vec3(0.3, 0.6, 0.7))), 0.0)), clamp(d * 1.3, 0.0, 1.0));
    c += vec3(0.5, 0.8, 1.0) * uCalma * (0.25 + pow(f, 1.4)) * 0.65; // alívio: frio e calmo
    gl_FragColor = vec4(c * uOpac, 1.0);
  }`;

/* --------------------------------------------------------------------- cena */
async function montar() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, W / H, 0.05, 50);

  // fundo: gradiente radial azul-noite com vinheta (quad na câmera)
  const fundo = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      depthWrite: false, depthTest: false,
      uniforms: { uTom: { value: new THREE.Color('#0a1a2c') }, uDor: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: `uniform vec3 uTom; uniform float uDor; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 p = vUv - vec2(0.5, 0.55); p.x *= 0.5625;
          float r = length(p);
          vec3 c = mix(uTom * 1.25, vec3(0.006, 0.009, 0.016), smoothstep(0.0, 0.62, r));
          c = mix(c, c + vec3(0.12, 0.01, 0.0) * 0.6, uDor * smoothstep(0.5, 0.0, r));
          c += (h(vUv * 1000.0) - 0.5) * 0.012; // grão
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  fundo.renderOrder = -10;
  fundo.frustumCulled = false;
  scene.add(fundo);

  const [gCorpo, gOsso, gVert] = await Promise.all([carregar('corpo'), carregar('osso'), carregar('vertebra')]);

  const add = THREE.AdditiveBlending;
  const pele = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: fragPele, transparent: true, depthWrite: false, blending: add, side: THREE.DoubleSide,
    uniforms: {
      uRim: { value: new THREE.Color('#8fd0ff') }, uCore: { value: new THREE.Color('#4a86c0') },
      uOpac: { value: 1 }, uDor: { value: 0 }, uDorY: { value: 1.02 }, uTempo: { value: 0 }, uVarredura: { value: -1 },
    },
  });
  const ossoMat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: fragOsso, transparent: true, depthWrite: false, blending: add, side: THREE.FrontSide,
    uniforms: { uCor: { value: new THREE.Color('#cfe0ee') }, uOpac: { value: 0.2 } },
  });
  const colunaMat = new THREE.ShaderMaterial({
    // coluna SÓLIDA (sem somar brilho): assim o vermelho da dor aparece na própria vértebra
    vertexShader: vert, fragmentShader: fragColuna, transparent: true, depthWrite: true, blending: THREE.NormalBlending,
    uniforms: {
      uCor: { value: new THREE.Color('#b9cfe2') }, uOpac: { value: 1 }, uDor: { value: 0 }, uDorT: { value: 0.86 },
      uDorL: { value: 0.12 }, uTempo: { value: 0 }, uCalma: { value: 0 },
    },
  });

  const figura = new THREE.Group();
  scene.add(figura);
  figura.add(new THREE.Mesh(gCorpo, pele));
  figura.add(new THREE.Mesh(gOsso, ossoMat));

  // coluna: 24 vértebras (7 cervicais, 12 torácicas, 5 lombares) + sacro, ao longo da curva em S
  const N = 25;
  const col = new THREE.InstancedMesh(gVert, colunaMat, N);
  const aT = new Float32Array(N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pV = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [x, y, z] = curvaColuna(t);
    const [, y2, z2] = curvaColuna(Math.min(1, t + 0.01));
    const [, y1, z1] = curvaColuna(Math.max(0, t - 0.01));
    const ang = Math.atan2(z2 - z1, -(y2 - y1)); // inclinação no plano sagital
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -ang);
    const reg = i < 7 ? 0.62 + i * 0.03 : i < 19 ? 0.82 + (i - 7) * 0.025 : 1.12 + (i - 19) * 0.06;
    const esc = 0.031 * reg;
    const passo = 0.6 / (N - 1); // distância entre vértebras
    s.set(esc, (passo * 0.78) / 0.42, esc); // corpo vertebral ocupa ~78% do passo (resto = disco)
    pV.set(x, y, z);
    m.compose(pV, q, s);
    col.setMatrixAt(i, m);
    aT[i] = t;
  }
  gVert.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 1));
  col.renderOrder = 20; // por último: por cima da pele translúcida (que não apaga a cor)
  figura.add(col);

  // aura da dor: brilho vermelho volumétrico (sprite) que pulsa na região afetada
  const auraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: add,
    uniforms: { uI: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uI; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; float a = pow(max(0.0,1.0-r),2.2); gl_FragColor = vec4(vec3(1.0,0.12,0.05)*a*uI,1.0); }',
  });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), auraMat);
  aura.renderOrder = 5;
  figura.add(aura);

  // pedestal de luz sob os pés
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.285, 256),
    new THREE.MeshBasicMaterial({ color: '#6fbaff', transparent: true, opacity: 0.55, blending: add, depthWrite: false, side: THREE.DoubleSide }),
  );
  anel.rotation.x = -Math.PI / 2;
  anel.position.y = 0.002;
  scene.add(anel);
  const brilhoChao = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 128),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: add,
      uniforms: { uOpac: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uOpac; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; gl_FragColor = vec4(vec3(0.25,0.55,0.95)*pow(1.0-r,2.5)*0.35*uOpac,1.0); }',
    }),
  );
  brilhoChao.rotation.x = -Math.PI / 2;
  brilhoChao.position.y = 0.001;
  scene.add(brilhoChao);

  // partículas (poeira de luz) — posições fixas, deriva determinística
  const NP = 900;
  const pp = new Float32Array(NP * 3);
  let semente = 3;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < NP; i++) {
    pp[i * 3] = (rnd() - 0.5) * 3;
    pp[i * 3 + 1] = rnd() * 2.6 - 0.2;
    pp[i * 3 + 2] = (rnd() - 0.5) * 3 - 0.5;
  }
  const gP = new THREE.BufferGeometry();
  gP.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const matP = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: add,
    uniforms: { uT: { value: 0 }, uOpac: { value: 1 } },
    vertexShader: `uniform float uT; varying float vA;
      void main(){ vec3 p = position; p.y += mod(uT*0.02 + p.x*3.1, 0.6) - 0.3; p.x += sin(uT*0.2 + p.z*4.0)*0.03;
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = 5.0 / -mv.z; vA = fract(sin(dot(position.xy, vec2(12.9,78.2)))*437.5); }`,
    fragmentShader: `uniform float uOpac; varying float vA; void main(){ float r = length(gl_PointCoord-0.5)*2.0;
      gl_FragColor = vec4(vec3(0.6,0.8,1.0)*(1.0-r)*0.5*vA*uOpac, 1.0); }`,
  });
  scene.add(new THREE.Points(gP, matP));

  // pós-processamento: brilho (bloom) para o LED/raio-X
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.42, 0.45, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- tipografia (DOM por cima do canvas; animação 100% em função de t)
  const camada = document.getElementById('textos')!;
  const escuro = document.getElementById('escuro')!;
  const canvasEl = document.getElementById('gl') as HTMLCanvasElement;
  const fundoTipo = document.getElementById('fundo-tipo')!;
  const blocos = window.ROTEIRO.textos.map((tx) => {
    const el = document.createElement('div');
    el.className = `bloco ${tx.estilo}`;
    el.style.top = `${tx.y ?? 800}px`;
    const palavras: HTMLSpanElement[] = [];
    if (tx.estilo === 'pontos') {
      for (let i = 0; i < (tx.n ?? 31); i++) {
        const d = document.createElement('span');
        d.className = 'ponto';
        el.appendChild(d);
        palavras.push(d);
      }
    } else {
      let dentro = false; // destaque pode abranger várias palavras: *alguns minutos*
      tx.texto.split('\n').forEach((linha, li) => {
        if (li) el.appendChild(document.createElement('br'));
        linha.split(' ').forEach((w) => {
          const sp = document.createElement('span');
          const abre = w.startsWith('*');
          const fecha = /\*[.,!?…]?$/.test(w);
          const destaque = dentro || abre;
          if (abre && !fecha) dentro = true;
          if (fecha) dentro = false;
          sp.textContent = w.replace(/\*/g, '') + ' ';
          sp.className = destaque ? `p destaque ${tx.tom ?? 'alivio'}` : 'p';
          el.appendChild(sp);
          palavras.push(sp);
        });
      });
    }
    camada.appendChild(el);
    return { tx, el, palavras };
  });
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const sai = (x: number) => 1 - Math.pow(1 - x, 3);
  const textos = (t: number) => {
    for (const { tx, el, palavras } of blocos) {
      const ativo = t >= tx.ini - 0.05 && t <= tx.fim;
      el.style.display = ativo ? '' : 'none';
      if (!ativo) continue;
      const saida = clamp01((tx.fim - t) / 0.18); // saída rápida (corte limpo)
      if (tx.estilo === 'pontos') {
        const prog = clamp01((t - tx.ini) / ((tx.ate ?? tx.fim) - tx.ini));
        palavras.forEach((d, i) => {
          const on = clamp01(prog * palavras.length - i);
          d.style.opacity = ((0.18 + 0.82 * on) * saida).toFixed(3);
          d.style.transform = `scale(${(0.7 + 0.3 * sai(on)).toFixed(3)})`;
          d.classList.toggle('on', on > 0.5);
        });
        continue;
      }
      if (tx.estilo === 'contador') {
        const e = clamp01((t - tx.ini) / (tx.dur ?? 1));
        palavras[0].textContent = String(Math.round((tx.de ?? 1) + ((tx.ate ?? 31) - (tx.de ?? 1)) * sai(e)));
        palavras[0].style.opacity = (clamp01((t - tx.ini) / 0.2) * saida).toFixed(3);
        palavras[0].style.transform = `scale(${(0.86 + 0.14 * sai(e)).toFixed(3)})`;
        continue;
      }
      palavras.forEach((sp, i) => {
        const t0 = tx.tempos?.[Math.min(i, (tx.tempos?.length ?? 1) - 1)] ?? tx.ini + i * 0.06;
        const e = sai(clamp01((t - t0) / 0.32));
        sp.style.opacity = (e * saida).toFixed(3);
        sp.style.filter = `blur(${((1 - e) * 8).toFixed(2)}px)`;
        sp.style.transform = `translateY(${((1 - e) * 34).toFixed(1)}px) scale(${(0.94 + 0.06 * e).toFixed(3)})`;
      });
    }
  };
  // cenas: qual está ativa e o "empurrão" de câmera das cenas tipográficas
  const cenaEm = (t: number) => window.ROTEIRO.cenas.find((c) => t >= c.ini && t < c.fim) ?? window.ROTEIRO.cenas[window.ROTEIRO.cenas.length - 1];

  const alvo = new THREE.Vector3();
  window.quadro = (t: number) => {
    const R = window.ROTEIRO.trilhas;
    const cam = R.camera;
    // câmera em órbita: ângulo (graus), distância, altura do olho e do alvo
    const ang = THREE.MathUtils.degToRad(valor(cam, 'ang', t, 20));
    const dist = valor(cam, 'dist', t, 4.2);
    const alt = valor(cam, 'alt', t, 1.0);
    const alvoY = valor(cam, 'alvoY', t, 0.95);
    const alvoX = valor(cam, 'alvoX', t, 0);
    camera.position.set(Math.sin(ang) * dist, alt, Math.cos(ang) * dist);
    alvo.set(alvoX, alvoY, 0);
    camera.lookAt(alvo);
    camera.fov = valor(cam, 'fov', t, 26);
    camera.updateProjectionMatrix();

    const C = R.corpo;
    const opac = valor(C, 'opac', t, 1);
    pele.uniforms.uOpac.value = opac;
    ossoMat.uniforms.uOpac.value = 0.2 * valor(C, 'osso', t, 1) * opac;
    colunaMat.uniforms.uOpac.value = opac;
    pele.uniforms.uTempo.value = t;
    colunaMat.uniforms.uTempo.value = t;
    const dor = valor(C, 'dor', t, 0);
    pele.uniforms.uDor.value = dor * 0.8;
    colunaMat.uniforms.uDor.value = dor;
    colunaMat.uniforms.uDorT.value = valor(C, 'dorT', t, 0.86);
    colunaMat.uniforms.uDorL.value = valor(C, 'dorL', t, 0.12);
    pele.uniforms.uDorY.value = curvaColuna(valor(C, 'dorT', t, 0.86))[1];
    colunaMat.uniforms.uCalma.value = valor(C, 'calma', t, 0);
    pele.uniforms.uVarredura.value = valor(C, 'varredura', t, -1);
    (fundo.material as THREE.ShaderMaterial).uniforms.uDor.value = dor;
    const [, ay, az] = curvaColuna(valor(C, 'dorT', t, 0.86));
    aura.position.set(0, ay, az - 0.02);
    auraMat.uniforms.uI.value = dor * (0.42 + 0.18 * Math.sin(t * 4.2)) * opac;
    figura.rotation.y = THREE.MathUtils.degToRad(valor(C, 'giro', t, 0));
    matP.uniforms.uT.value = t;
    matP.uniforms.uOpac.value = opac;
    bloom.strength = valor(C, 'bloom', t, 0.42);
    const cena = cenaEm(t);
    const bordaIn = clamp01((t - cena.ini) / 0.12);
    const boneco = cena.tipo === 'boneco';
    canvasEl.style.opacity = boneco ? bordaIn.toFixed(3) : '0';
    fundoTipo.style.opacity = boneco ? '0' : '1';
    // cena tipográfica: leve aproximação contínua (dá vida sem efeito exagerado)
    const k = clamp01((t - cena.ini) / Math.max(0.5, cena.fim - cena.ini));
    camada.style.transform = boneco ? 'none' : `scale(${(1.035 - 0.035 * sai(k)).toFixed(4)})`;
    fundoTipo.style.backgroundPosition = `50% ${(40 + 20 * k).toFixed(2)}%`;
    if (boneco) composer.render();
    textos(t);
    escuro.style.opacity = String(valor(C, 'escuro', t, 0));
  };
}

window.pronto = montar();

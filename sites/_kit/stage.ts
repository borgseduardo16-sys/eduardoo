/*
 * Palco 3D do kit: UM canvas fixo atrás do conteúdo, cuja cena é guiada pela
 * rolagem (como nos sites de relojoaria / "voando pelo scroll"). Este arquivo
 * fica no bundle da CENA (carregado sob demanda): é o único que importa o Three.
 *
 * Uso, no scene.ts de cada site:
 *   export default (host, opts) => mountStage(host, opts, (ctx) => { ...; return { update, dispose } });
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export { THREE };

export type StageOpts = {
  /** 'low' = celular / máquina fraca: pixel ratio ≤ 1,5, menos objetos. */
  quality: 'high' | 'low';
  /** prefers-reduced-motion: sem animação contínua, só redesenha ao rolar. */
  reduced: boolean;
};

export type StageCtx = StageOpts & {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** Largura/altura do palco em px e a proporção. */
  width: number;
  height: number;
  aspect: number;
  /** Posição do mouse, -1..1, suavizada (0,0 no toque). */
  mouse: { x: number; y: number };
  /** Progresso GLOBAL da página, 0..1, suavizado. */
  progress: number;
  /** Progresso de um trecho: 0 quando o elemento ainda não apareceu, 1 quando já saiu por cima. */
  pass: (id: string) => number;
  /** Progresso dentro de uma seção "grudada" (altura > 100vh com conteúdo sticky): 0 → 1 durante a rolagem dela. */
  stick: (id: string) => number;
  /** Troca o fundo do palco (qualquer valor CSS de `background`). */
  setBackground: (css: string) => void;
  /** Liga reflexos realistas em metal/vidro (RoomEnvironment). Chame uma vez ao construir a cena. */
  useEnvironment: (intensity?: number) => void;
};

export type StageScene = {
  update: (ctx: StageCtx, t: number, dt: number) => void;
  dispose?: () => void;
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function mountStage(
  host: HTMLElement,
  opts: StageOpts,
  build: (ctx: StageCtx) => StageScene,
): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return () => {}; // sem WebGL: o site segue só com o fundo CSS
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  camera.position.set(0, 0, 9);

  const els = new Map<string, HTMLElement | null>();
  const el = (id: string) => {
    if (!els.has(id)) els.set(id, document.getElementById(id));
    return els.get(id) ?? null;
  };

  let pmrem: THREE.PMREMGenerator | null = null;
  let envTex: THREE.Texture | null = null;
  const ctx: StageCtx = {
    ...opts,
    scene,
    camera,
    renderer,
    width: 1,
    height: 1,
    aspect: 1,
    mouse: { x: 0, y: 0 },
    progress: 0,
    pass: (id) => {
      const e = el(id);
      if (!e) return 0;
      const r = e.getBoundingClientRect();
      const vh = window.innerHeight;
      return clamp((vh - r.top) / (vh + r.height));
    },
    stick: (id) => {
      const e = el(id);
      if (!e) return 0;
      const r = e.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span <= 0 ? 0 : clamp(-r.top / span);
    },
    setBackground: (css) => {
      host.style.background = css;
    },
    useEnvironment: (intensity = 1) => {
      if (envTex) return;
      pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = intensity;
    },
  };

  const cena = build(ctx);

  const medir = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    ctx.width = w;
    ctx.height = h;
    ctx.aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = ctx.aspect;
    camera.updateProjectionMatrix();
  };
  medir();
  const ro = new ResizeObserver(() => {
    medir();
    quadro(0);
  });
  ro.observe(host);

  // Mouse suavizado (só com mouse de verdade).
  const alvoMouse = { x: 0, y: 0 };
  const aoMover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    alvoMouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    alvoMouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', aoMover, { passive: true });

  const progressoBruto = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp(window.scrollY / max) : 0;
  };
  ctx.progress = progressoBruto();

  let ultimo = performance.now();
  let raf = 0;
  const quadro = (agora: number) => {
    const t = agora / 1000;
    const dt = Math.min(0.05, (agora - ultimo) / 1000 || 0.016);
    ultimo = agora || ultimo;
    const k = opts.reduced ? 1 : 1 - Math.pow(0.0015, dt); // suavização independente do fps
    ctx.progress += (progressoBruto() - ctx.progress) * k;
    ctx.mouse.x += (alvoMouse.x - ctx.mouse.x) * k * 0.6;
    ctx.mouse.y += (alvoMouse.y - ctx.mouse.y) * k * 0.6;
    cena.update(ctx, t, dt);
    renderer.render(scene, camera);
  };

  const laco = (agora: number) => {
    quadro(agora);
    raf = requestAnimationFrame(laco);
  };
  const ligar = () => {
    if (opts.reduced || raf || document.hidden) return;
    ultimo = performance.now();
    raf = requestAnimationFrame(laco);
  };
  const desligar = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const aoVisibilidade = () => (document.hidden ? desligar() : ligar());
  document.addEventListener('visibilitychange', aoVisibilidade);

  // Movimento reduzido: sem laço; redesenha quando a rolagem muda.
  let pendente = false;
  const aoRolar = () => {
    if (!opts.reduced || pendente) return;
    pendente = true;
    requestAnimationFrame((a) => {
      pendente = false;
      quadro(a);
    });
  };
  window.addEventListener('scroll', aoRolar, { passive: true });

  if (opts.reduced) quadro(performance.now());
  else ligar();

  return () => {
    desligar();
    ro.disconnect();
    window.removeEventListener('pointermove', aoMover);
    window.removeEventListener('scroll', aoRolar);
    document.removeEventListener('visibilitychange', aoVisibilidade);
    cena.dispose?.();
    envTex?.dispose();
    pmrem?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

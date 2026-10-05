'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
 * Cena 3D do hero: um pequeno "estacionamento" isométrico de vagas. A maioria
 * está livre (lajotas baixas, neutras); algumas estão ocupadas (blocos azuis
 * da marca). É a metáfora do produto — espaço ocioso virando espaço usado —
 * e não um objeto decorativo qualquer.
 *
 * Custo controlado: ~60 malhas, 2 luzes, sem sombras nem pós-processamento,
 * pixel ratio ≤ 1,5, laço de render pausado fora da tela / aba oculta.
 */

const PALETA = {
  claro: { livre: 0xe4e1dc, borda: 0xc9c5be, ocupada: 0x2f5f9e, luz: 1.0 },
  escuro: { livre: 0x2a2724, borda: 0x3d3935, ocupada: 0x6c9fd8, luz: 0.85 },
};

function esquemaEscuro(): boolean {
  const tema = document.documentElement.dataset.theme;
  if (tema === 'dark') return true;
  if (tema === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const COLS = 9;
const ROWS = 5;
// Vagas ocupadas (col,row): espalhadas, para não parecer um desenho.
const OCUPADAS = new Set(['1,1', '3,0', '4,2', '2,3', '6,1', '7,3', '5,4', '8,0', '0,4']);

export default function HeroSceneCanvas({ trigger }: { trigger: HTMLElement | null }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // sem WebGL: o hero segue só com o fundo em CSS
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(10, 7, 10);
    camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 12, 4);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.9));

    const grupo = new THREE.Group();
    scene.add(grupo);

    const passo = 1.25;
    const tileGeo = new THREE.BoxGeometry(1.1, 0.12, 1.1);
    const blocoGeo = new THREE.BoxGeometry(0.86, 0.7, 0.86);
    const bordaGeo = new THREE.EdgesGeometry(tileGeo);
    const matLivre = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const matOcupada = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    const matBorda = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });

    const flutuantes: { mesh: THREE.Mesh; fase: number }[] = [];

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = (c - (COLS - 1) / 2) * passo;
        const z = (r - (ROWS - 1) / 2) * passo;
        const tile = new THREE.Mesh(tileGeo, matLivre);
        tile.position.set(x, 0, z);
        tile.add(new THREE.LineSegments(bordaGeo, matBorda));
        grupo.add(tile);
        if (OCUPADAS.has(`${c},${r}`)) {
          const bloco = new THREE.Mesh(blocoGeo, matOcupada);
          bloco.position.set(x, 0.41, z);
          grupo.add(bloco);
          flutuantes.push({ mesh: bloco, fase: c * 1.7 + r });
        }
      }
    }

    function aplicarPaleta() {
      const p = esquemaEscuro() ? PALETA.escuro : PALETA.claro;
      matLivre.color.setHex(p.livre);
      matOcupada.color.setHex(p.ocupada);
      matBorda.color.setHex(p.borda);
      key.intensity = 1.6 * p.luz;
    }
    aplicarPaleta();
    const mqEscuro = window.matchMedia('(prefers-color-scheme: dark)');
    mqEscuro.addEventListener('change', aplicarPaleta);
    const obsTema = new MutationObserver(aplicarPaleta);
    obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Enquadramento: ortográfica, ajustada ao tamanho real do contêiner.
    function redimensionar() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const metade = 3.5;
      const aspecto = w / h;
      camera.left = -metade * aspecto;
      camera.right = metade * aspecto;
      camera.top = metade;
      camera.bottom = -metade;
      camera.updateProjectionMatrix();
      desenhar();
    }

    const estado = { giro: 0.0, scroll: 0, mx: 0, my: 0, entrada: 0 };

    function desenhar() {
      const t = performance.now() / 1000;
      grupo.rotation.y = -0.6 + estado.scroll * 0.45 + estado.mx * 0.1;
      grupo.rotation.x = estado.my * 0.05;
      grupo.position.y = -1.3 - estado.scroll * 0.6;
      for (const f of flutuantes) f.mesh.position.y = 0.41 + Math.sin(t * 0.8 + f.fase) * 0.035;
      const e = estado.entrada;
      grupo.scale.setScalar(0.92 + 0.08 * e);
      matLivre.opacity = matOcupada.opacity = e;
      matLivre.transparent = matOcupada.transparent = e < 1;
      matBorda.opacity = 0.8 * e;
      renderer.render(scene, camera);
    }

    // Loop só enquanto visível.
    let raf = 0;
    let visivel = false;
    const laco = () => {
      desenhar();
      raf = requestAnimationFrame(laco);
    };
    const atualizarLaco = () => {
      const deve = visivel && !document.hidden;
      if (deve && !raf) raf = requestAnimationFrame(laco);
      if (!deve && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      atualizarLaco();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', atualizarLaco);

    const ro = new ResizeObserver(redimensionar);
    ro.observe(host);

    // Parallax pelo mouse (só com mouse), suavizado.
    const aoMover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      gsap.to(estado, {
        mx: (e.clientX / window.innerWidth - 0.5) * 2,
        my: (e.clientY / window.innerHeight - 0.5) * 2,
        duration: 1.2,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    };
    window.addEventListener('pointermove', aoMover, { passive: true });

    // Entrada + giro ligado à rolagem.
    gsap.registerPlugin(ScrollTrigger);
    gsap.to(estado, { entrada: 1, duration: 1.4, ease: 'power2.out', delay: 0.2 });
    const st = trigger
      ? ScrollTrigger.create({
          trigger,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.8,
          onUpdate: (self) => (estado.scroll = self.progress),
        })
      : null;

    redimensionar();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      st?.kill();
      gsap.killTweensOf(estado);
      window.removeEventListener('pointermove', aoMover);
      document.removeEventListener('visibilitychange', atualizarLaco);
      mqEscuro.removeEventListener('change', aplicarPaleta);
      obsTema.disconnect();
      tileGeo.dispose();
      blocoGeo.dispose();
      bordaGeo.dispose();
      matLivre.dispose();
      matOcupada.dispose();
      matBorda.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [trigger]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
 * Campo de partículas do hero: ~260 pontos em profundidade (azul e branco, uns
 * poucos verdes). Função: dar profundidade e "vida" ao fundo da mensagem
 * principal, com parallax pelo mouse e deriva ligada à rolagem. Um único draw
 * call; render pausado fora da tela.
 */
export default function ScenePoints({ trigger }: { trigger: HTMLElement | null }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
    camera.position.z = 9;

    const N = 260;
    const pos = new Float32Array(N * 3);
    const cor = new Float32Array(N * 3);
    const azul = new THREE.Color(0x5b94ff);
    const branco = new THREE.Color(0xdbe6ff);
    const verde = new THREE.Color(0x25d366);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 13;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const r = Math.random();
      const c = r < 0.05 ? verde : r < 0.55 ? azul : branco;
      cor.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));

    // Ponto redondo e macio desenhado num canvas 2D (sem arquivo de imagem).
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 64;
    const g = c2.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c2);

    const mat = new THREE.PointsMaterial({
      size: 0.16,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pontos = new THREE.Points(geo, mat);
    scene.add(pontos);

    const estado = { mx: 0, my: 0, scroll: 0, entrada: 0 };

    function desenhar() {
      const t = performance.now() / 1000;
      pontos.rotation.y = t * 0.025 + estado.mx * 0.18;
      pontos.rotation.x = estado.my * 0.08 + estado.scroll * 0.35;
      pontos.position.y = estado.scroll * 2.2;
      mat.opacity = 0.85 * estado.entrada;
      renderer.render(scene, camera);
    }

    function redimensionar() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      desenhar();
    }

    let raf = 0;
    let visivel = false;
    const laco = () => {
      desenhar();
      raf = requestAnimationFrame(laco);
    };
    const atualizar = () => {
      const deve = visivel && !document.hidden;
      if (deve && !raf) raf = requestAnimationFrame(laco);
      if (!deve && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      atualizar();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', atualizar);
    const ro = new ResizeObserver(redimensionar);
    ro.observe(host);

    const aoMover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      gsap.to(estado, {
        mx: (e.clientX / window.innerWidth - 0.5) * 2,
        my: (e.clientY / window.innerHeight - 0.5) * 2,
        duration: 1.4,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    };
    window.addEventListener('pointermove', aoMover, { passive: true });

    gsap.registerPlugin(ScrollTrigger);
    gsap.to(estado, { entrada: 1, duration: 2, ease: 'power2.out' });
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
      document.removeEventListener('visibilitychange', atualizar);
      geo.dispose();
      mat.dispose();
      tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [trigger]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

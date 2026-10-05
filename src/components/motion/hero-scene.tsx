'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Three.js (~150 kB) só é baixado quando a cena realmente vai aparecer.
const Canvas = dynamic(() => import('./hero-scene-canvas'), { ssr: false });

/**
 * Palco 3D na base do hero (longe do texto e da busca). Só monta em tela larga, com mouse, sem "reduzir
 * movimento" e sem "economizar dados" — no celular o hero fica limpo (e
 * rápido). Decorativo: oculto para leitores de tela e sem capturar cliques.
 */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const ok =
      window.matchMedia('(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
        .matches && !nav.connection?.saveData;
    // Adia para depois do primeiro desenho: o hero nunca espera pelo 3D.
    if (!ok) return;
    const secao = ref.current?.parentElement ?? null;
    const id = window.setTimeout(() => setAlvo(secao), 400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[22rem] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_8%,#000_60%)]"
    >
      {alvo && <Canvas trigger={alvo} />}
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/*
 * Rolagem suave (Lenis) só nas páginas de apresentação. Telas de trabalho —
 * mapa de tela cheia, chat, formulários e painéis — mantêm a rolagem nativa,
 * onde o scroll interno de listas e mapas precisa continuar previsível.
 */
const ROTAS_SUAVES = new Set(['/', '/como-funciona', '/taxas', '/protecao', '/premium']);

export function SmoothScroll() {
  const pathname = usePathname();
  const ativo = ROTAS_SUAVES.has(pathname);

  useEffect(() => {
    if (!ativo) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      lerp: 0.1,
      // Toque continua com a rolagem nativa do aparelho (inércia do iOS/Android).
      syncTouch: false,
      // Modais (<dialog>) e áreas marcadas rolam sozinhos, sem arrastar a página.
      prevent: (node) => Boolean(node.closest('dialog, [data-lenis-prevent]')),
    });

    // Um único relógio para Lenis e GSAP: o ScrollTrigger lê a posição já suavizada.
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [ativo]);

  return null;
}

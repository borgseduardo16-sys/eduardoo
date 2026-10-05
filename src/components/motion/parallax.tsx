'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Parallax sutil: o filho se desloca `distance` px (positivo = sobe mais
 * devagar) enquanto a seção cruza a tela. Só em tela larga e sem
 * "reduzir movimento"; no celular a seção fica parada, sem custo.
 */
export function Parallax({
  children,
  className,
  distance = 40,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        el,
        { y: distance },
        {
          y: -distance,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        },
      );
    });
    return () => mm.revert();
  }, [distance]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

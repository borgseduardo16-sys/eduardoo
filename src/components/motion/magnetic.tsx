'use client';

import { useRef, type ReactNode } from 'react';
import { LazyMotion, domAnimation, m, useMotionValue, useSpring } from 'motion/react';

/**
 * Atração magnética discreta: o botão acompanha o cursor por poucos pixels.
 * Só com mouse (pointer: fine) — no toque não faz nada.
 */
export function Magnetic({
  children,
  className,
  strength = 0.18,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });

  const podeAtrair = () =>
    window.matchMedia('(pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        ref={ref}
        className={className}
        style={{ x, y, display: 'inline-block' }}
        onPointerMove={(e) => {
          if (!podeAtrair() || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          x.set((e.clientX - (r.left + r.width / 2)) * strength);
          y.set((e.clientY - (r.top + r.height / 2)) * strength);
        }}
        onPointerLeave={() => {
          x.set(0);
          y.set(0);
        }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

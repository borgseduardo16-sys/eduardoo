'use client';

import type { ReactNode } from 'react';

/** Cartão com um halo suave que acompanha o cursor (CSS vars --mx/--my). */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`v-spot ${className ?? ''}`}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

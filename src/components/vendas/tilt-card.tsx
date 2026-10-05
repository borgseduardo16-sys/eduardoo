'use client';

import { useRef, type ReactNode } from 'react';

/**
 * Cartão que inclina em 3D seguindo o mouse (≤ `max`°) e acende um reflexo
 * onde o cursor está. Só com mouse; no toque fica parado.
 */
export function TiltCard({
  children,
  className,
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const mover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const el = ref.current;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (clientX - r.left) / r.width;
      const py = (clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${((0.5 - py) * max * 2).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((px - 0.5) * max * 2).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
  };
  const sair = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div style={{ perspective: '1200px' }} className="[transform-style:preserve-3d]">
      <div
        ref={ref}
        onPointerMove={mover}
        onPointerLeave={sair}
        className={`v-tilt ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  );
}

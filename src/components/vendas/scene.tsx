'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const Canvas = dynamic(() => import('./scene-canvas'), { ssr: false });

/**
 * Fundo 3D do hero. Só liga em tela ≥ 768 px, sem "reduzir movimento" e sem
 * "economizar dados"; no celular o fundo é só CSS (rápido e sem custo de GPU).
 */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const ok =
      window.matchMedia('(min-width: 768px) and (prefers-reduced-motion: no-preference)').matches &&
      !nav.connection?.saveData;
    if (!ok) return;
    const secao = ref.current?.parentElement ?? null;
    const id = window.setTimeout(() => setAlvo(secao), 500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {alvo && <Canvas trigger={alvo} />}
    </div>
  );
}

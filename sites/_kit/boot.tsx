import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    /** Definido pelo HTML final: devolve o módulo da cena (Blob embutido). */
    __cenaKit?: () => Promise<{ default: (host: HTMLElement, opts: { quality: 'high' | 'low'; reduced: boolean }) => () => void }>;
  }
}

/**
 * Fundo fixo do site onde mora o canvas 3D. `fallback` é o fundo CSS mostrado
 * até a cena carregar (e se não houver WebGL). O Three só é interpretado depois
 * do primeiro desenho.
 */
export function Stage({ fallback = '#0a0a0a', className = '' }: { fallback?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || !window.__cenaKit) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fraco = window.innerWidth < 768 || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || nav.connection?.saveData === true;
    let dispose: (() => void) | undefined;
    let cancelado = false;
    const id = window.setTimeout(() => {
      window.__cenaKit!().then((m) => {
        if (!cancelado) dispose = m.default(host, { quality: fraco ? 'low' : 'high', reduced });
      }).catch(() => {});
    }, 120);
    return () => {
      cancelado = true;
      window.clearTimeout(id);
      dispose?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{ background: fallback }}
      className={`pointer-events-none fixed inset-0 z-0 ${className}`}
    />
  );
}

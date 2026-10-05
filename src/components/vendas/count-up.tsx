'use client';

import { useEffect, useRef } from 'react';
import { animate } from 'motion';
import { formatBRL } from '@/lib/money';
import { useInViewOnce } from './use-in-view';

/**
 * Número que conta de 0 até `to` ao entrar na tela. O HTML já nasce com o
 * valor final (`format(to)`): sem JS, ou com "reduzir movimento", nada muda.
 * `tipo`: 'brl' trata `to` como centavos (src/lib/money.ts); 'inteiro' mostra o número.
 */
export function CountUp({
  to,
  tipo = 'inteiro',
  className,
  duration = 1.0,
}: {
  to: number;
  tipo?: 'brl' | 'inteiro';
  className?: string;
  duration?: number;
}) {
  const [ref, visto] = useInViewOnce<HTMLSpanElement>('0px 0px -10% 0px');
  const feito = useRef(false);
  const format = tipo === 'brl' ? formatBRL : String;

  useEffect(() => {
    const el = ref.current;
    if (!visto || feito.current || !el) return;
    feito.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(Math.round(v));
      },
      onComplete: () => {
        el.textContent = format(to);
      },
    });
    return () => c.stop();
  }, [visto, to, duration, format, ref]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {format(to)}
    </span>
  );
}

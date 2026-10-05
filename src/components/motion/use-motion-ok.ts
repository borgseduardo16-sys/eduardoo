'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * true quando a pessoa NÃO pediu para reduzir movimento. No servidor devolve
 * true: o HTML sai no estado inicial da animação e o cliente corrige na
 * hidratação (quem reduz movimento vê o conteúdo final, sem transição).
 */
export function useMotionOk(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(QUERY).matches,
    () => true,
  );
}

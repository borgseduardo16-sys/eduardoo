'use client';

import { useEffect, useRef } from 'react';

/**
 * Numa navegação que rola na horizontal (celular), traz o item atual
 * (`aria-current="page"`) para a vista ao abrir a página — sem isso, a aba
 * em que a pessoa está pode ficar escondida depois da borda da tela.
 * Só mexe na rolagem horizontal da própria lista, nunca na da página.
 */
export function KeepCurrentVisible() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const lista = ref.current?.parentElement;
    const atual = lista?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!lista || !atual || lista.scrollWidth <= lista.clientWidth) return;
    const a = atual.getBoundingClientRect();
    const l = lista.getBoundingClientRect();
    if (a.left >= l.left && a.right <= l.right) return;
    lista.scrollLeft += a.left - l.left - (l.width - a.width) / 2;
  }, []);
  return <span ref={ref} hidden />;
}

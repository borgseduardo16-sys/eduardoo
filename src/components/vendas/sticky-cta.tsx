'use client';

import { useEffect, useState } from 'react';
import { BuyButton } from './buy-button';
import { PRECO_TEXTO } from './config';

/**
 * Barra de compra fixa (mais útil no celular, onde o CTA do hero já saiu da
 * tela). Só aparece depois do hero e some quando a oferta ou o fechamento
 * estão visíveis — nunca duplica um botão que já está na tela.
 */
export function StickyCta() {
  const [passouHero, setPassouHero] = useState(false);
  const [ofertaVisivel, setOfertaVisivel] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('topo');
    const alvos = ['oferta', 'final'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const visiveis = new Set<Element>();
    const ioHero = new IntersectionObserver(([e]) => setPassouHero(!e.isIntersecting), { rootMargin: '0px 0px -40% 0px' });
    const ioOferta = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? visiveis.add(e.target) : visiveis.delete(e.target)));
      setOfertaVisivel(visiveis.size > 0);
    });
    if (hero) ioHero.observe(hero);
    alvos.forEach((a) => ioOferta.observe(a));
    return () => {
      ioHero.disconnect();
      ioOferta.disconnect();
    };
  }, []);

  const mostrar = passouHero && !ofertaVisivel;
  return (
    <div
      aria-hidden={!mostrar}
      inert={!mostrar}
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] ${
        mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full border border-white/10 bg-[#070d1b]/85 p-1.5 pl-5 shadow-[0_20px_50px_-10px_rgb(0_0_0/0.9)] backdrop-blur-xl">
        <p className="leading-tight">
          <span className="block text-[0.6875rem] text-[var(--v-muted)]">Comece hoje por</span>
          <span className="block text-base font-semibold tabular-nums">{PRECO_TEXTO}</span>
        </p>
        <BuyButton size="md" location="sticky" className="shrink-0">
          Quero começar
        </BuyButton>
      </div>
    </div>
  );
}

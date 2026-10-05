'use client';

import { useEffect, useRef } from 'react';
import { CheckCheck } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { IllustrativeTag } from './illustrative-tag';

const LINHAS = [
  { t: 'Orçamento', d: 'Cliente pediu valores', rot: -5, x: -18, y: 6 },
  { t: 'Dúvida', d: 'Sobre horário de atendimento', rot: 4, x: 20, y: -4 },
  { t: 'Pedido', d: 'Quer confirmar o combinado', rot: -3, x: 12, y: 8 },
  { t: 'Retorno', d: 'Voltou a perguntar', rot: 6, x: -14, y: -2 },
];

/**
 * A mesma lista de conversas, antes e depois: ligada à rolagem, as conversas
 * espalhadas se alinham e o selo muda de "Antes" para "Depois". É a
 * transformação do produto acontecendo na tela, não um enfeite.
 */
export function BeforeAfterScrub() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const linhas = gsap.utils.toArray<HTMLElement>('[data-linha]', el);
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: { trigger: el, start: 'top 75%', end: 'center 45%', scrub: 0.7 },
      });
      linhas.forEach((l, i) => {
        const d = LINHAS[i];
        gsap.set(l, { rotation: d.rot, x: d.x, y: d.y });
        tl.to(l, { rotation: 0, x: 0, y: 0 }, 0);
      });
      tl.fromTo('[data-antes]', { opacity: 1 }, { opacity: 0, duration: 0.2 }, 0.2)
        .fromTo('[data-depois]', { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.65)
        .fromTo('[data-ok]', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, stagger: 0.08 }, 0.55)
        .fromTo('[data-glow]', { opacity: 0 }, { opacity: 1 }, 0.4)
        .fromTo('[data-card]', { filter: 'grayscale(1) brightness(0.8)' }, { filter: 'grayscale(0) brightness(1)' }, 0.3);
    });

    return () => mm.revert();
  }, []);

  return (
    <div ref={root} className="relative mx-auto w-full max-w-md">
      <div data-glow className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgb(47_123_255/0.22),transparent_70%)]" />
      <div className="rounded-3xl border border-white/10 bg-[#070d1b]/90 p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="relative h-6 w-24">
            <span data-antes className="absolute inset-0 inline-flex items-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v-muted)]">
              Antes
            </span>
            <span data-depois className="absolute inset-0 inline-flex items-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v-blue-soft)] opacity-0">
              Depois
            </span>
          </div>
          <IllustrativeTag />
        </div>
        <ul className="space-y-2.5">
          {LINHAS.map((l) => (
            <li key={l.t} data-linha>
              <div data-card className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--v-blue)]/20 text-xs font-semibold text-[var(--v-blue-soft)]">
                  {l.t[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{l.t}</p>
                  <p className="truncate text-xs text-[var(--v-muted)]">{l.d}</p>
                </div>
                <span data-ok className="grid size-6 place-items-center rounded-full bg-[var(--v-green)]/15 text-[var(--v-green)] opacity-0">
                  <CheckCheck className="size-3.5" aria-hidden />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { Play, Target, Sparkles, Rocket, type LucideIcon } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const PASSOS: { n: string; t: string; d: string; Icon: LucideIcon }[] = [
  { n: '01', t: 'Acesse as aulas', d: 'Entre na área do produto e assista às aulas em vídeo.', Icon: Play },
  { n: '02', t: 'Aprenda na prática', d: 'Veja os recursos do WhatsApp Business funcionando e aplique no seu atendimento.', Icon: Target },
  { n: '03', t: 'Tire suas dúvidas com a assistência de IA', d: 'Travou em algum ponto? Pergunte durante o aprendizado, sem esperar.', Icon: Sparkles },
  { n: '04', t: 'Coloque em prática', d: 'Leve o que aprendeu para as conversas reais com os seus clientes.', Icon: Rocket },
];

/** Linha vertical que "se enche" conforme a pessoa rola; cada passo acende ao ser alcançado. */
export function Timeline() {
  const root = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        '[data-fill]',
        { scaleY: 0 },
        { scaleY: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 65%', end: 'bottom 60%', scrub: 0.5 } },
      );
      gsap.utils.toArray<HTMLElement>('[data-passo]', el).forEach((p) => {
        gsap.fromTo(
          p,
          { opacity: 0.35 },
          { opacity: 1, ease: 'none', scrollTrigger: { trigger: p, start: 'top 75%', end: 'top 55%', scrub: true } },
        );
        gsap.fromTo(
          p.querySelector('[data-no]'),
          { backgroundColor: 'rgb(7 13 27)', borderColor: 'rgb(255 255 255 / 0.12)' },
          { backgroundColor: 'rgb(47 123 255)', borderColor: 'rgb(122 167 255)', ease: 'none',
            scrollTrigger: { trigger: p, start: 'top 65%', end: 'top 55%', scrub: true } },
        );
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <ol ref={root} className="relative space-y-12 sm:space-y-16">
      <div aria-hidden className="absolute bottom-4 left-[1.4rem] top-4 w-px bg-white/10 sm:left-[1.65rem]">
        <div data-fill className="h-full w-full origin-top bg-gradient-to-b from-[var(--v-blue)] to-[var(--v-green)]" />
      </div>
      {PASSOS.map(({ n, t, d, Icon }) => (
        <li key={n} data-passo className="relative flex gap-5 sm:gap-8">
          <span
            data-no
            className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-[#070d1b] text-white sm:size-14"
          >
            <Icon className="size-4 sm:size-5" aria-hidden />
          </span>
          <div className="pt-0.5 sm:pt-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--v-blue-soft)]">{n}</p>
            <h3 className="mt-1 text-lg font-semibold leading-snug sm:text-2xl">{t}</h3>
            <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-[var(--v-muted)]">{d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

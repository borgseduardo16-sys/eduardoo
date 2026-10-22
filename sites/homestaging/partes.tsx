'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { PROJETOS, SERVICOS, WHATSAPP_URL } from './dados';

const D = 'font-[family-name:var(--font-is)]';

/** Marca (diamante em traço) redesenhada a partir da marca de água das fotos. ⚠ Trocar pelo ficheiro oficial. */
export function Logo({ className = 'h-8 w-auto', claro = false, animar = false }: { className?: string; claro?: boolean; animar?: boolean }) {
  const cor = claro ? '#f3efe8' : '#1d1f1d';
  const p = { pathLength: 1, fill: 'none', strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="40 50 530 410" className={`${animar ? 'marca' : ''} ${className}`} aria-hidden>
      <path className="d2" d="M120 205 L360 205 L385 275 L235 440 L65 258 Z" stroke={claro ? 'rgb(243 239 232 / .4)' : '#b08d57'} strokeWidth="9" {...p} />
      <path d="M155 78 L120 78 L60 188 L300 445 L545 188 L475 78 L215 78" stroke={cor} strokeWidth="14" {...p} />
      <path d="M215 80 L545 188 M60 188 L345 125" stroke={cor} strokeWidth="14" {...p} />
      <circle cx="185" cy="78" r="12" stroke={cor} strokeWidth="9" {...p} />
    </svg>
  );
}

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41" />
    </svg>
  );
}

/** Antes → depois. No desktop a rolagem faz a "cortina"; no telemóvel há um botão para alternar. */
export function AntesDepois() {
  const [ver, setVer] = useState<'antes' | 'depois'>('depois');
  return (
    <div className="wipe relative h-full w-full" data-ver={ver}>
      <div className="frame absolute inset-0 overflow-hidden rounded-[2px]">
        <Foto id="depois" alt="Depois: a cozinha preparada, com mesa posta, plantas e fruta sobre a bancada" posicao="45% 60%" className="absolute inset-0" />
        <div className="camada-antes absolute inset-0">
          <Foto id="antes" alt="Antes: a mesma cozinha vazia, só com os móveis fixos" posicao="40% 55%" className="absolute inset-0" />
        </div>
        <span className="linha pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-gesso shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" aria-hidden>
          <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-gesso/80 bg-grafite/30 text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-gesso backdrop-blur-md">5D</span>
        </span>
        <span className="rot-antes absolute right-5 top-5 rounded-full bg-gesso/90 px-3.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] backdrop-blur">Antes</span>
        <span className="rot-depois absolute left-5 top-5 rounded-full bg-grafite/85 px-3.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-gesso backdrop-blur">Depois</span>
      </div>
      <div className="so-lite absolute bottom-4 left-1/2 flex -translate-x-1/2 rounded-full bg-gesso/90 p-1 shadow-lg backdrop-blur" role="group" aria-label="Ver antes ou depois">
        {(['antes', 'depois'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={ver === v} onClick={() => setVer(v)}
            className={`h-10 rounded-full px-5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${ver === v ? 'bg-grafite text-gesso' : 'text-grafite'}`}>{v}</button>
        ))}
      </div>
    </div>
  );
}

/** Frase que acende palavra a palavra com a rolagem (no telemóvel aparece inteira). */
export function Palavras({ texto, destaque = [] }: { texto: string; destaque?: string[] }) {
  const ps = texto.split(' ');
  const n = ps.length;
  return (
    <p data-progress className={`${D} text-[2.1rem] leading-[1.12] tracking-[-0.01em] sm:text-5xl lg:text-[4.1rem]`}>
      {ps.map((w, i) => (
        <span key={i} className={`pal ${destaque.includes(w.replace(/[.,]/g, '')) ? 'italic text-musgo' : ''}`}
          style={{ opacity: `calc(.14 + .86 * clamp(0, (var(--p, 0) - .18) * ${(n * 2.6).toFixed(2)} - ${i}, 1))` }}>
          {w}{i < n - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  );
}

/** Trilho horizontal de projetos: no desktop anda com a rolagem; no telemóvel desliza com o dedo. */
export function Projetos() {
  return (
    <section id="projetos" data-progress="stick" className="relative bg-carvao text-gesso" style={{ height: `${PROJETOS.length * 70 + 80}vh` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden py-16">
        <div className="rolador">
          <ul className="trilho flex w-max items-stretch gap-[3vw] pl-5 pr-[6vw] sm:pl-10" style={{ ['--curso' as string]: `-${PROJETOS.length * 49 + 40 - 100 + 6}vw` }}>
            <li className="flex w-[78vw] shrink-0 flex-col justify-between py-2 sm:w-[37vw]">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-gesso/55">Projetos · Porto</p>
              <div>
                <h2 className={`${D} text-[3.2rem] leading-[0.95] tracking-[-0.02em] sm:text-[5.6rem]`}>Divisão a <em className="text-menta">divisão</em>.</h2>
                <p className="mt-6 max-w-sm text-base leading-relaxed text-gesso/70">Fotografias reais de imóveis preparados pela equipa. <span className="so-lite">Deslize para o lado.</span><span className="hidden md:inline">Continue a rolar.</span></p>
              </div>
              <div className="h-px w-full overflow-hidden bg-gesso/15"><div className="barra h-full bg-latao" /></div>
            </li>
            {PROJETOS.map((p, i) => (
              <li key={p.id} className="group relative w-[84vw] shrink-0 sm:w-[46vw]">
                <figure className="flex h-full flex-col">
                  <div className="relative h-[52svh] overflow-hidden sm:h-[62svh]">
                    <Foto id={p.id} alt={`${p.divisao}: ${p.d}`} posicao={p.pos} className="trilho-foto absolute inset-0 transition-[filter] duration-700" />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-carvao/70 to-transparent" aria-hidden />
                    <span className={`${D} pointer-events-none absolute bottom-3 left-5 whitespace-nowrap text-[3.4rem] italic leading-none text-gesso sm:bottom-4 sm:left-7 sm:text-[5.2rem]`} aria-hidden>{p.divisao}</span>
                  </div>
                  <figcaption className="mt-5 flex items-start justify-between gap-6">
                    <span>
                      <span className={`${D} block text-2xl sm:text-3xl`}>{p.t}</span>
                      <span className="mt-1 block max-w-md text-sm leading-relaxed text-gesso/60">{p.d}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums tracking-[0.2em] text-gesso/45">{String(i + 1).padStart(2, '0')} / {String(PROJETOS.length).padStart(2, '0')}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Lista editorial de serviços; no desktop, uma fotografia segue o cursor. */
export function ServicosLista() {
  const ref = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState<number | null>(null);
  const mover = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onMouseMove={mover} onMouseLeave={() => setAtivo(null)} className="relative"
      style={ativo === null ? undefined : ({ '--o': 1, '--s': 1, '--r': `${ativo % 2 ? 4 : -4}deg` } as React.CSSProperties)}>
      <ol className="border-t border-grafite/15">
        {SERVICOS.map((s, i) => (
          <li key={s.t}>
            <a href="#proposta" onMouseEnter={() => setAtivo(i)} onFocus={() => setAtivo(i)} onBlur={() => setAtivo(null)}
              className="linha-s group relative grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-b border-grafite/15 py-7 sm:grid-cols-[5rem_1fr_1fr_auto] sm:py-9">
              <span className="text-xs tabular-nums tracking-[0.2em] text-pedra">{String(i + 1).padStart(2, '0')}</span>
              <span className={`t-s ${D} text-[1.9rem] leading-[1.05] sm:text-[2.8rem] lg:text-[3.4rem]`}>{s.t}</span>
              <span className="col-span-2 col-start-2 max-w-md text-[0.9375rem] leading-relaxed text-pedra sm:col-span-1 sm:col-start-3">{s.d}</span>
              <ArrowUpRight className="seta col-start-3 row-start-1 size-6 text-musgo sm:col-start-4" aria-hidden />
            </a>
          </li>
        ))}
      </ol>
      <div className="cursor-foto pointer-events-none absolute z-10 hidden aspect-[4/5] w-64 overflow-hidden shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45)] [@media(hover:hover)_and_(min-width:1024px)]:block" aria-hidden>
        {SERVICOS.map((s, i) => (
          <Foto key={s.t} id={s.img} alt="" posicao={s.pos} className={`absolute inset-0 transition-opacity duration-500 ${ativo === i ? 'opacity-100' : 'opacity-0'}`} />
        ))}
      </div>
    </div>
  );
}

/** Botão flutuante do WhatsApp: some no topo e quando a proposta ou o contacto estão no ecrã. */
export function WhatsFlutuante() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const topo = document.getElementById('inicio');
    const alvos = ['proposta', 'contacto'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    let passou = false;
    const visiveis = new Set<Element>();
    const atualizar = () => setMostrar(passou && visiveis.size === 0);
    const a = new IntersectionObserver(([e]) => { passou = !e.isIntersecting; atualizar(); }, { rootMargin: '0px 0px -60% 0px' });
    const b = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? visiveis.add(e.target) : visiveis.delete(e.target))); atualizar(); });
    if (topo) a.observe(topo);
    alvos.forEach((x) => b.observe(x));
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  return (
    <a href={WHATSAPP_URL} target="_blank" rel="noopener" aria-label="Falar connosco pelo WhatsApp" tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-grafite px-4 font-medium text-gesso shadow-[0_14px_40px_-12px_rgb(0_0_0/0.6)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

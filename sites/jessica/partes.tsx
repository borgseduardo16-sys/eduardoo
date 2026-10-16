'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { PORTFOLIO, SERVICOS, WHATSAPP_URL } from './dados';

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.31l-.35-.21-3.57.94.95-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.66 5.8.66 12.07c0 2 .52 3.96 1.52 5.69L.57 23.6l5.97-1.57a11.33 11.33 0 0 0 5.43 1.38h.01c6.27 0 11.38-5.1 11.38-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

/** Ornamento fino: linha – losango – linha. */
export function Ornamento({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 12" aria-hidden className={className} fill="none" stroke="currentColor">
      <path d="M0 6 H66" strokeWidth=".8" /><path d="M94 6 H160" strokeWidth=".8" />
      <path d="M80 1 L85 6 L80 11 L75 6 Z" strokeWidth=".9" />
      <circle cx="70" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="90" cy="6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Medalhão com a logo real da cliente e texto circular girando em volta. */
export function Medalhao({ className = '', texto }: { className?: string; texto: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 200 200" aria-hidden className="gira absolute inset-0 h-full w-full text-ouro">
        <defs><path id="circ" d="M100,100 m-90,0 a90,90 0 1,1 180,0 a90,90 0 1,1 -180,0" /></defs>
        <text fontFamily='"Marcellus", serif' fontSize="9.5" letterSpacing="4.4" fill="currentColor"><textPath href="#circ">{texto}</textPath></text>
      </svg>
      <Foto id="logo" alt="Logo Jéssica Fernanda Cerimonialista" className="absolute inset-[13%] rounded-full shadow-[0_20px_50px_-20px_rgb(110_80_30/0.6)]" />
    </div>
  );
}

/** Carrossel do portfólio: rolagem nativa com encaixe (arraste no celular, setas no computador). */
export function Carrossel() {
  const ref = useRef<HTMLUListElement>(null);
  const mover = (dir: number) => ref.current?.scrollBy({ left: dir * Math.min(window.innerWidth * 0.7, 420), behavior: 'smooth' });
  return (
    <div className="relative">
      <ul ref={ref} className="trilho-s" data-lenis-prevent aria-label="Portfólio">
        {PORTFOLIO.map((p, i) => (
          <li key={p.img} className="card-p">
            <figure>
              <div className="moldura arco relative aspect-[3/4.2] overflow-hidden shadow-[0_30px_60px_-36px_rgb(43_36_32/0.5)]">
                <Foto id={p.img} alt={`${p.t}. ${p.d}`} posicao={p.pos} className="absolute inset-0" />
              </div>
              <figcaption className="mt-5 text-center">
                <p className="font-serif text-base italic text-ouro">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="mt-1 font-[family-name:var(--font-marcel)] text-xl leading-snug">{p.t}</h3>
                <p className="mt-1 text-sm text-pedra">{p.d}</p>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className="mx-auto mt-8 hidden max-w-7xl justify-end gap-3 px-10 md:flex">
        <button type="button" onClick={() => mover(-1)} aria-label="Fotos anteriores" className="grid size-12 place-items-center rounded-full border border-tinta/25 transition-colors hover:border-ouro hover:text-ouro"><ArrowLeft className="size-5" aria-hidden /></button>
        <button type="button" onClick={() => mover(1)} aria-label="Próximas fotos" className="grid size-12 place-items-center rounded-full border border-tinta/25 transition-colors hover:border-ouro hover:text-ouro"><ArrowRight className="size-5" aria-hidden /></button>
      </div>
    </div>
  );
}

/** Serviços em abas: lista grande à esquerda, foto e itens do serviço escolhido à direita. */
export function ServicosAbas() {
  const [i, setI] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tecla = (e: React.KeyboardEvent, k: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const n = (k + (e.key === 'ArrowDown' ? 1 : -1) + SERVICOS.length) % SERVICOS.length;
    setI(n);
    refs.current[n]?.focus();
  };
  const s = SERVICOS[i];
  return (
    <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div role="tablist" aria-label="Serviços" className="flex flex-col divide-y divide-tinta/12 border-y border-tinta/12">
        {SERVICOS.map((x, k) => (
          <button
            key={x.t}
            ref={(el) => { refs.current[k] = el; }}
            id={`aba-${k}`}
            role="tab"
            aria-selected={k === i}
            aria-controls="painel-serv"
            tabIndex={k === i ? 0 : -1}
            onClick={() => setI(k)}
            onKeyDown={(e) => tecla(e, k)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setI(k)}
            className={`aba group flex min-h-24 items-center gap-5 py-6 text-left ${k === i ? 'text-ouro' : 'text-tinta hover:text-ouro'}`}
          >
            <span className="font-serif text-lg italic">{String(k + 1).padStart(2, '0')}</span>
            <span>
              <span className="block font-[family-name:var(--font-marcel)] text-2xl leading-tight sm:text-3xl">{x.t}</span>
              <span className="mt-1 block font-serif text-lg italic text-pedra">{x.sub}</span>
            </span>
            <ArrowRight className={`ml-auto size-5 shrink-0 transition-transform duration-500 ${k === i ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`} aria-hidden />
          </button>
        ))}
      </div>
      <div id="painel-serv" role="tabpanel" aria-labelledby={`aba-${i}`} className="relative min-h-[28rem]">
        <div className="arco papel absolute inset-0 overflow-hidden shadow-[0_40px_80px_-44px_rgb(43_36_32/0.6)]">
          {SERVICOS.map((x, k) => (
            <Foto key={x.t} id={x.img} alt="" posicao={x.pos} className={`painel-foto absolute inset-0 ${k === i ? 'ativo' : ''}`} />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-noite/90 via-noite/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-7 text-papel sm:p-9">
            <p className="font-[family-name:var(--font-marcel)] text-2xl sm:text-3xl">{s.t}</p>
            <ul className="mt-4 space-y-2 text-[0.9375rem] text-papel/85">
              {s.itens.map((it) => <li key={it} className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-ouro-claro" aria-hidden />{it}</li>)}
            </ul>
            <a href="#orcamento" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-papel/40 px-5 text-sm transition-colors hover:bg-papel hover:text-noite">Consultar este serviço <ArrowRight className="size-4" aria-hidden /></a>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão flutuante do WhatsApp: some quando o orçamento ou o contato já estão na tela. */
export function WhatsFlutuante() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const topo = document.getElementById('inicio');
    const alvos = ['orcamento', 'contato'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
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
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      aria-label="Falar com a Jéssica pelo WhatsApp"
      tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-cacau px-4 font-medium text-papel shadow-[0_14px_40px_-12px_rgb(77_59_48/0.8)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

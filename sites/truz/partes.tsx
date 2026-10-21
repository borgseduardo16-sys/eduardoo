'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { CATEGORIAS, GALERIA, WHATSAPP_URL } from './dados';

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.31l-.35-.21-3.57.94.95-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.66 5.8.66 12.07c0 2 .52 3.96 1.52 5.69L.57 23.6l5.97-1.57a11.33 11.33 0 0 0 5.43 1.38h.01c6.27 0 11.38-5.1 11.38-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

/** Balão desenhado em SVG (gradiente, brilho e nó), nada de formas chapadas. */
export function Balao({ cor = '#bcd5e8', chrome = false, className = '', style }: { cor?: string; chrome?: boolean; className?: string; style?: React.CSSProperties }) {
  const id = `g${cor.replace('#', '')}${chrome ? 'c' : ''}`;
  return (
    <svg viewBox="0 0 100 130" aria-hidden className={className} style={style}>
      <defs>
        <radialGradient id={id} cx="35%" cy="28%" r="75%">
          <stop offset="0" stopColor="#ffffff" stopOpacity={chrome ? 0.95 : 0.7} />
          <stop offset={chrome ? '.18' : '.22'} stopColor={cor} />
          <stop offset="1" stopColor={chrome ? '#8f6d2a' : cor} stopOpacity={chrome ? 1 : 0.88} />
        </radialGradient>
      </defs>
      <path d="M50 4 C20 4 6 28 6 52 C6 84 32 110 50 112 C68 110 94 84 94 52 C94 28 80 4 50 4 Z" fill={`url(#${id})`} />
      <path d="M44 112 L50 120 L56 112 Z" fill={cor} opacity=".95" />
      <path d="M50 120 C46 124 54 126 50 130" stroke="#b9ad9d" strokeWidth="1" fill="none" />
      <ellipse cx="32" cy="30" rx="8" ry="14" fill="#fff" opacity={chrome ? 0.55 : 0.3} transform="rotate(-24 32 30)" />
    </svg>
  );
}

/** Cacho de balões (orgânico) para os cantos do hero e das secções. */
export function CachoBaloes({ className = '', espelho = false }: { className?: string; espelho?: boolean }) {
  const itens: { cor: string; chrome?: boolean; x: number; y: number; w: number; r: number; d: number; a: number }[] = [
    { cor: '#bcd5e8', x: 0, y: 30, w: 96, r: -8, d: 7, a: 0 },
    { cor: '#f1d9c3', x: 62, y: 0, w: 84, r: 6, d: 8, a: -2 },
    { cor: '#c9a45c', chrome: true, x: 40, y: 66, w: 56, r: -4, d: 6, a: -1 },
    { cor: '#e3eff8', x: 112, y: 54, w: 70, r: 10, d: 9, a: -3 },
    { cor: '#8aa08b', x: 12, y: 112, w: 52, r: 4, d: 7.5, a: -4 },
    { cor: '#f3e1d8', x: 90, y: 112, w: 60, r: -6, d: 8.5, a: -5 },
  ];
  return (
    <div aria-hidden className={`pointer-events-none relative ${className}`} style={{ transform: espelho ? 'scaleX(-1)' : undefined }}>
      {itens.map((b, i) => (
        <Balao key={i} cor={b.cor} chrome={b.chrome} className="flutua absolute" style={{ left: b.x, top: b.y, width: b.w, ['--r' as string]: `${b.r}deg`, ['--d' as string]: `${b.d}s`, ['--a' as string]: `${b.a}s` }} />
      ))}
    </div>
  );
}

/** Galeria em colunas com filtro e visualização ampliada (<dialog>, teclado e setas). */
export function Galeria() {
  const [cat, setCat] = useState<(typeof CATEGORIAS)[number]>('Todos');
  const [aberto, setAberto] = useState<number | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const lista = GALERIA.filter((g) => cat === 'Todos' || g.cat === cat);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (aberto !== null && !d.open) d.showModal();
    if (aberto === null && d.open) d.close();
  }, [aberto]);

  const ir = (dir: number) => setAberto((a) => (a === null ? a : (a + dir + lista.length) % lista.length));
  const item = aberto !== null ? lista[aberto] : null;

  return (
    <>
      <div className="mb-10 flex flex-wrap justify-center gap-2.5" role="group" aria-label="Filtrar fotografias">
        {CATEGORIAS.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
            className={`min-h-11 rounded-full border px-5 text-sm font-medium transition-colors duration-300 ${cat === c ? 'border-azul-esc bg-azul-esc text-creme' : 'border-tinta/20 hover:border-azul-esc/60'}`}>{c}</button>
        ))}
      </div>
      <ul className="colunas">
        {lista.map((g, i) => (
          <li key={g.id} className="item-g">
            <button type="button" onClick={() => setAberto(i)} aria-label={`Ampliar: ${g.t}`} className="group relative block w-full overflow-hidden rounded-[26px] text-left shadow-[0_30px_60px_-38px_rgb(47_42_38/0.55)]">
              <div className="relative w-full overflow-hidden" style={{ aspectRatio: g.ratio }}>
                <Foto id={g.id} alt={`${g.t}. ${g.d}`} posicao={g.pos} className="foto-g absolute inset-0" />
              </div>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-noite/80 to-transparent p-5 pt-14 text-creme opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 max-lg:opacity-100">
                <span className="block font-[family-name:var(--font-fr)] text-lg leading-snug">{g.t}</span>
                <span className="mt-0.5 block text-xs uppercase tracking-[0.18em] text-creme/70">{g.cat}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={dlg} className="lb" aria-label="Fotografia ampliada" onClose={() => setAberto(null)}
        onClick={(e) => { if (e.target === e.currentTarget) setAberto(null); }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') ir(1); if (e.key === 'ArrowLeft') ir(-1); }}>
        {item && (
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 px-4 py-6 sm:px-16" onClick={(e) => { if (e.target === e.currentTarget) setAberto(null); }}>
            <div className="lb-foto relative w-full max-w-4xl flex-1 overflow-hidden rounded-3xl" key={item.id}>
              <Foto id={item.id} alt={`${item.t}. ${item.d}`} className="absolute inset-0 !bg-contain bg-center" posicao="center" />
            </div>
            <div className="max-w-2xl text-center">
              <p className="font-[family-name:var(--font-fr)] text-2xl">{item.t}</p>
              <p className="mt-1 text-sm text-creme/70">{item.d}{'credito' in item && item.credito ? ` · ${item.credito}` : ''}</p>
            </div>
            <button type="button" onClick={() => setAberto(null)} aria-label="Fechar" className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-creme/10 hover:bg-creme/20"><X className="size-5" aria-hidden /></button>
            <button type="button" onClick={() => ir(-1)} aria-label="Anterior" className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-creme/10 hover:bg-creme/20 sm:left-6"><ArrowLeft className="size-5" aria-hidden /></button>
            <button type="button" onClick={() => ir(1)} aria-label="Seguinte" className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-creme/10 hover:bg-creme/20 sm:right-6"><ArrowRight className="size-5" aria-hidden /></button>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Botão flutuante do WhatsApp: some quando o orçamento ou o contacto já estão no ecrã. */
export function WhatsFlutuante() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const topo = document.getElementById('inicio');
    const alvos = ['orcamento', 'contacto'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
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
      aria-label="Falar connosco pelo WhatsApp"
      tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-azul-esc px-4 font-medium text-creme shadow-[0_14px_40px_-12px_rgb(75_115_146/0.8)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

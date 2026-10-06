'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { ABRE_MIN, ACABAMENTOS, AMBIENTES, FECHA_MIN, WHATSAPP_URL } from './dados';

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.31l-.35-.21-3.57.94.95-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.66 5.8.66 12.07c0 2 .52 3.96 1.52 5.69L.57 23.6l5.97-1.57a11.33 11.33 0 0 0 5.43 1.38h.01c6.27 0 11.38-5.1 11.38-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

/** Marca da Lignum (dois chevrons) desenhada em SVG: se traça sozinha ao carregar. */
export function MarcaChevrons({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="200 150 420 420" aria-hidden className={`marca ${className}`} fill="none" stroke="currentColor" strokeWidth="62" strokeLinejoin="round">
      <path d="M440 215 L305 335 L415 420" pathLength={1} />
      <path d="M430 300 L545 395 L410 510" pathLength={1} />
    </svg>
  );
}

/** "Aberto agora / Fechado" pelo horário de Brasília (seg–sex, 07:00–18:00). */
export function StatusAberto({ className = '' }: { className?: string }) {
  const [aberto, setAberto] = useState<boolean | null>(null);
  useEffect(() => {
    const calcular = () => {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
      const min = Number(v('hour')) * 60 + Number(v('minute'));
      setAberto(!['Sat', 'Sun'].includes(v('weekday')) && min >= ABRE_MIN && min < FECHA_MIN);
    };
    calcular();
    const id = window.setInterval(calcular, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="relative flex size-2">
        {aberto && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${aberto === null ? 'bg-pedra' : aberto ? 'bg-emerald-500' : 'bg-pedra'}`} />
      </span>
      {aberto === null ? 'Seg a sex, 07:00 – 18:00' : aberto ? 'Aberto agora · fecha às 18:00' : 'Fechado agora · seg a sex, 07:00 – 18:00'}
    </span>
  );
}

/** Ambientes em lista grande; no desktop a foto flutua seguindo o cursor, no celular cada linha traz a miniatura. */
export function ListaAmbientes() {
  const caixa = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState<number | null>(null);
  const alvo = useRef({ x: 0, y: 0 });
  const atual = useRef({ x: 0, y: 0 });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      atual.current.x += (alvo.current.x - atual.current.x) * 0.14;
      atual.current.y += (alvo.current.y - atual.current.y) * 0.14;
      if (caixa.current) caixa.current.style.transform = `translate3d(${atual.current.x}px, ${atual.current.y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    if (ativo !== null) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ativo]);

  return (
    <div
      className="relative"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        alvo.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      }}
      onPointerLeave={() => setAtivo(null)}
    >
      <ul className="border-t border-ink/15">
        {AMBIENTES.map((a, i) => (
          <li key={a.t}>
            <a
              href="#orcamento"
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                const r = e.currentTarget.closest('.relative')!.getBoundingClientRect();
                alvo.current = { x: e.clientX - r.left, y: e.clientY - r.top };
                if (ativo === null) atual.current = { ...alvo.current };
                setAtivo(i);
              }}
              className="group flex items-center gap-5 border-b border-ink/15 py-6 sm:py-8"
            >
              <Foto id={a.img} alt="" className="size-16 shrink-0 rounded-xl md:hidden" />
              <span className="font-serif text-sm italic text-ouro-esc">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-3xl font-light leading-tight transition-[transform,color] duration-500 ease-[var(--ease-out-soft)] group-hover:translate-x-2 group-hover:text-ouro-esc sm:text-5xl lg:text-6xl">{a.t}</span>
                <span className="mt-1 block text-sm text-pedra sm:text-base">{a.d}</span>
              </span>
              <ArrowUpRight className="size-6 shrink-0 text-pedra transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-ouro-esc" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <div
        ref={caixa}
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 z-20 hidden h-[22rem] w-[17rem] overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.5)] transition-[opacity,scale] duration-500 ease-[var(--ease-out-soft)] md:block ${ativo === null ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}
      >
        {AMBIENTES.map((a, i) => (
          <Foto key={a.img} id={a.img} alt="" className={`absolute inset-0 transition-opacity duration-500 ${ativo === i ? 'opacity-100' : 'opacity-0'}`} />
        ))}
      </div>
    </div>
  );
}

/** Acabamentos: toque/clique em um para ver a amostra ampliada a partir das fotos reais. */
export function Acabamentos() {
  const [i, setI] = useState(0);
  const a = ACABAMENTOS[i];
  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[26px] bg-ink lg:aspect-auto lg:min-h-[28rem]">
        {ACABAMENTOS.map((x, k) => (
          <Foto
            key={x.id}
            id={x.img}
            alt={k === i ? `Amostra ampliada: ${x.nome}` : ''}
            className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)] ${k === i ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
            style={{ backgroundSize: `${x.zoom}%`, backgroundPosition: x.pos }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-6 pt-20 text-paper">
          <p className="font-serif text-3xl font-light">{a.nome}</p>
          <p className="mt-1 max-w-sm text-sm text-paper/80">{a.desc}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Acabamentos" className="flex flex-col gap-2.5">
        {ACABAMENTOS.map((x, k) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={k === i}
            onClick={() => setI(k)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setI(k)}
            className={`group flex min-h-16 items-center gap-4 rounded-2xl border p-3 text-left transition-[background-color,border-color] duration-300 ${k === i ? 'border-ink bg-ink text-paper' : 'border-ink/15 hover:border-ink/40'}`}
          >
            <Foto id={x.img} alt="" className="size-12 shrink-0 rounded-xl" style={{ backgroundSize: `${x.zoom * 1.4}%`, backgroundPosition: x.pos }} />
            <span className="flex-1">
              <span className="block font-semibold">{x.nome}</span>
            </span>
            <span className={`font-serif text-sm italic ${k === i ? 'text-ouro' : 'text-pedra'}`}>{String(k + 1).padStart(2, '0')}</span>
          </button>
        ))}
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
      aria-label="Falar com a Lignum pelo WhatsApp"
      tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-ouro px-4 font-semibold text-ink shadow-[0_14px_40px_-10px_rgb(232_200_103/0.8)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

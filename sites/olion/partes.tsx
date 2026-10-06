'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Foto } from '../_kit/ui';
import { FUNCIONAMENTO, FUSO, OCASIOES, WHATSAPP_URL } from './dados';

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.31l-.35-.21-3.57.94.95-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.66 5.8.66 12.07c0 2 .52 3.96 1.52 5.69L.57 23.6l5.97-1.57a11.33 11.33 0 0 0 5.43 1.38h.01c6.27 0 11.38-5.1 11.38-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

/** Arco (símbolo da casa) desenhado em SVG: se traça sozinho ao carregar. */
export function Arco({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 130" aria-hidden className={`marca ${className}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M10 125 V50 A40 40 0 0 1 90 50 V125" pathLength={1} />
      <path d="M24 125 V52 A26 26 0 0 1 76 52 V125" pathLength={1} />
    </svg>
  );
}

/** "Aberto agora / Fechado" pelo horário de Mato Grosso. */
export function StatusAberto({ className = '' }: { className?: string }) {
  const [aberto, setAberto] = useState<boolean | null>(null);
  useEffect(() => {
    const calcular = () => {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
      const min = Number(v('hour')) * 60 + Number(v('minute'));
      const [a, f] = FUNCIONAMENTO[v('weekday')] ?? [0, 0];
      setAberto(min >= a && min < f);
    };
    calcular();
    const id = window.setInterval(calcular, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="relative flex size-2">
        {aberto && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${aberto ? 'bg-emerald-500' : 'bg-pedra'}`} />
      </span>
      {aberto === null ? 'Seg a sáb, 08:00 – 17:00' : aberto ? 'Atendendo agora' : 'Fora do horário de atendimento'}
    </span>
  );
}

/** Ocasiões em lista grande; no desktop a foto flutua seguindo o cursor, no celular cada linha traz a miniatura. */
export function ListaOcasioes({ claro = false }: { claro?: boolean }) {
  const c = claro
    ? { borda: 'border-noite/15', n: 'text-ouro-esc', hov: 'group-hover:text-ouro-esc', desc: 'text-pedra', seta: 'text-pedra' }
    : { borda: 'border-marfim/20', n: 'text-ouro', hov: 'group-hover:text-ouro', desc: 'text-marfim/65', seta: 'text-marfim/50' };
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
      <ul className={`border-t ${c.borda}`}>
        {OCASIOES.map((a, i) => (
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
              className={`group flex items-center gap-5 border-b ${c.borda} py-6 sm:py-9`}
            >
              <Foto id={a.img} alt="" className="arco-s h-20 w-14 shrink-0 md:hidden" />
              <span className={`font-serif text-sm italic ${c.n}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className={`block font-serif text-3xl font-light leading-tight transition-[transform,color] duration-500 ease-[var(--ease-out-soft)] group-hover:translate-x-2 ${c.hov} sm:text-5xl lg:text-6xl`}>{a.t}</span>
                <span className={`mt-1 block max-w-xl text-sm sm:text-base ${c.desc}`}>{a.d}</span>
              </span>
              <ArrowUpRight className={`size-6 shrink-0 transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 ${c.seta} ${c.hov}`} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <div
        ref={caixa}
        aria-hidden
        className={`arco-s pointer-events-none absolute left-0 top-0 z-20 hidden h-[24rem] w-[17rem] overflow-hidden shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] transition-[opacity,scale] duration-500 ease-[var(--ease-out-soft)] md:block ${ativo === null ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}
        style={{ borderRadius: '999px 999px 20px 20px' }}
      >
        {OCASIOES.map((a, i) => (
          <Foto key={a.img} id={a.img} alt="" className={`absolute inset-0 transition-opacity duration-500 ${ativo === i ? 'opacity-100' : 'opacity-0'}`} />
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
      aria-label="Falar com a Casa Olion pelo WhatsApp"
      tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-ouro px-4 font-semibold text-noite shadow-[0_14px_40px_-10px_rgb(220_192_138/0.8)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

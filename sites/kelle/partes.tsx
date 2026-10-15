'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { FUNCIONAMENTO, FUSO, WHATSAPP_URL } from './dados';

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.8-1.31l-.35-.21-3.57.94.95-3.48-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.46-9.44 2.52 0 4.9.99 6.68 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.21-4.24 9.43-9.45 9.43zm8.04-17.47A11.3 11.3 0 0 0 12.04.7C5.77.7.66 5.8.66 12.07c0 2 .52 3.96 1.52 5.69L.57 23.6l5.97-1.57a11.33 11.33 0 0 0 5.43 1.38h.01c6.27 0 11.38-5.1 11.38-11.37 0-3.04-1.18-5.9-3.33-8.04z" />
    </svg>
  );
}

/** Monograma KG: anel duplo, letras serifadas entrelaçadas e um pequeno losango. */
export function Monograma({ className = '', cor = 'currentColor' }: { className?: string; cor?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className}>
      <circle cx="60" cy="60" r="56" fill="none" stroke={cor} strokeWidth="1" />
      <circle cx="60" cy="60" r="51" fill="none" stroke={cor} strokeWidth="0.5" strokeDasharray="1.2 3" />
      <text x="47" y="74" textAnchor="middle" fontFamily='"Cormorant Garamond", Georgia, serif' fontSize="46" fontWeight="300" fill={cor}>K</text>
      <text x="72" y="80" textAnchor="middle" fontFamily='"Cormorant Garamond", Georgia, serif' fontStyle="italic" fontSize="44" fontWeight="300" fill={cor}>G</text>
      <path d="M60 14 l3 3 -3 3 -3 -3z M60 100 l3 3 -3 3 -3 -3z" fill={cor} />
    </svg>
  );
}

/** Selo com texto circular girando em volta do monograma. */
export function SeloGiratorio({ texto, className = '' }: { texto: string; className?: string }) {
  return (
    <div className={/\b(absolute|fixed)\b/.test(className) ? className : `relative ${className}`} aria-hidden>
      <svg viewBox="0 0 200 200" className="gira absolute inset-0 h-full w-full">
        <defs><path id="circ" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" /></defs>
        <text fontFamily='"Plus Jakarta Sans", sans-serif' fontSize="12.5" letterSpacing="5.2" fontWeight="600" fill="currentColor">
          <textPath href="#circ">{texto}</textPath>
        </text>
      </svg>
      <Monograma className="absolute inset-[24%]" />
    </div>
  );
}

/** Ornamento fino: linha – losango – linha. */
export function Ornamento({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 12" aria-hidden className={className} fill="none" stroke="currentColor">
      <path d="M0 6 H66" strokeWidth=".8" />
      <path d="M94 6 H160" strokeWidth=".8" />
      <path d="M80 1 L85 6 L80 11 L75 6 Z" strokeWidth=".9" />
      <circle cx="70" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="90" cy="6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Estrelas({ className = 'size-4' }: { className?: string }) {
  return (
    <span className="inline-flex gap-0.5 text-ouro" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`${className} fill-current`} />)}
    </span>
  );
}

/** "Atendendo agora" pelo horário de Mato Grosso do Sul. */
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
        {aberto && <span className="absolute inline-flex size-full animate-ping rounded-full bg-salvia opacity-70" />}
        <span className={`relative inline-flex size-2 rounded-full ${aberto ? 'bg-salvia-esc' : 'bg-pedra'}`} />
      </span>
      {aberto === null ? 'Seg a sex, 08:00 – 18:00' : aberto ? 'Atendendo agora' : 'Fora do horário de atendimento'}
    </span>
  );
}

/** Botão flutuante do WhatsApp: some quando o orçamento ou o contato já estão na tela. */
export function WhatsFlutuante() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const topo = document.getElementById('inicio') ?? document.getElementById('inicio-m');
    const alvos = ['orcamento', 'contato'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    let passou = false;
    const visiveis = new Set<Element>();
    const atualizar = () => setMostrar(passou && visiveis.size === 0);
    const a = new IntersectionObserver(([e]) => { passou = !e.isIntersecting; atualizar(); }, { rootMargin: '0px 0px -60% 0px' });
    const b = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? visiveis.add(e.target) : visiveis.delete(e.target))); atualizar(); });
    const ativo = [document.getElementById('inicio'), document.getElementById('inicio-m')].find((el) => el && el.offsetParent !== null) ?? topo;
    if (ativo) a.observe(ativo);
    alvos.forEach((x) => b.observe(x));
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      aria-label="Falar com a Kelle pelo WhatsApp"
      tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-salvia-esc px-4 font-medium text-papel shadow-[0_14px_40px_-12px_rgb(77_91_71/0.8)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

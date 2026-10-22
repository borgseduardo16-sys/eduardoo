'use client';

import { useEffect, useRef, useState } from 'react';
import { Foto } from '../_kit/ui';
import { ROLO, urlWhats } from './textos';
import { useLingua, useT } from './lingua';

const B = 'font-[family-name:var(--font-bd)]';
const C = 'font-[family-name:var(--font-cg)]';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.3em]';

/** Coração em três traços (como o letreiro da loja). ⚠ Redesenhado a partir da fotografia — trocar pelo ficheiro oficial. */
export function Coracao({ className = '', desenhar = false, cor = '#b4955a', espessura = 3 }: { className?: string; desenhar?: boolean; cor?: string; espessura?: number }) {
  const p = { pathLength: 1, fill: 'none', stroke: cor, strokeWidth: espessura, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg viewBox="0 0 200 190" className={`${desenhar ? 'desenha' : ''} ${className}`} aria-hidden>
      <path d="M58 176 C 54 150, 66 138, 92 160 C 140 122, 196 92, 190 50 C 185 14, 136 6, 104 44 C 96 18, 62 4, 30 16 C 2 28, 4 70, 22 98 C 36 120, 50 132, 58 140" {...p} />
      <path d="M62 182 C 60 156, 70 146, 96 166 C 146 126, 200 96, 194 54 C 189 18, 140 12, 106 50 C 98 24, 64 10, 34 22 C 8 34, 10 74, 26 102" {...p} strokeWidth={espessura * 0.7} />
      <path d="M52 170 C 50 146, 62 134, 88 154 C 134 118, 186 88, 182 50 C 178 22, 132 14, 102 52" {...p} strokeWidth={espessura * 0.55} />
    </svg>
  );
}

export function Logo({ claro = false, className = '' }: { claro?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Coracao className="h-9 w-auto" espessura={2} cor={claro ? '#dcc796' : '#b4955a'} />
      <span className={`leading-[0.85] tracking-[0.02em] ${claro ? 'text-marfim' : 'text-tinta'}`}>
        <span className="block text-[1.05rem] font-light lowercase">heart</span>
        <span className="block pl-3 text-[1.05rem] font-light lowercase">made</span>
      </span>
    </span>
  );
}

export function IconeWhats({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.41" />
    </svg>
  );
}

/** Botão PT/EN do cabeçalho. */
export function TrocaLingua({ claro = false }: { claro?: boolean }) {
  const { trocar } = useLingua();
  const t = useT();
  return (
    <button type="button" onClick={trocar} aria-label={t.trocar} title={t.trocar}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold tracking-[0.18em] transition-colors ${claro ? 'border-marfim/30 text-marfim hover:border-marfim' : 'border-tinta/20 hover:border-tinta/60'}`}>
      <span>{t.sigla}</span><span className="opacity-35">/</span><span className="opacity-55">{t.outra}</span>
    </button>
  );
}

/** Frase que acende palavra a palavra com a rolagem (no telemóvel aparece inteira). */
export function Palavras({ texto, destaque }: { texto: string; destaque: string[] }) {
  const ps = texto.split(' ');
  const n = ps.length;
  return (
    <p data-progress className={`${B} text-[1.9rem] leading-[1.2] sm:text-[2.8rem] lg:text-[3.5rem]`}>
      {ps.map((w, i) => (
        <span key={`${i}-${w}`} className={`pal ${destaque.includes(w.replace(/[.,:]/g, '').toLowerCase()) ? 'italic text-ouro' : ''}`}
          style={{ opacity: `calc(.13 + .87 * clamp(0, (var(--p, 0) - .16) * ${(n * 2.5).toFixed(2)} - ${i}, 1))` }}>
          {w}{i < n - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  );
}

/** O mesmo jardim de dia e de noite: no desktop a rolagem acende as velas; no telemóvel, as duas fotos seguidas. */
export function DiaNoite() {
  const t = useT().diaNoite;
  return (
    <section id="jardim" data-progress="stick" className="dn-sec relative bg-noite text-marfim" style={{ height: '320vh' }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div className="so-desk absolute inset-0">
          <div className="dn-palco absolute inset-0 overflow-hidden"><Foto id="dia" alt="O jardim ao fim da tarde: mesas em veludo verde-oliva, castiçais e um candeeiro de papel sobre o obelisco" posicao="50% 42%" className="dn-foto filme absolute inset-0" /></div>
          <div className="dn-palco dn-noite absolute inset-0 overflow-hidden"><Foto id="noite" alt="O mesmo jardim à noite, iluminado por velas e luzes nas mesas" posicao="50% 62%" className="dn-foto filme absolute inset-0" /></div>
          <div className="absolute inset-0 bg-gradient-to-r from-noite/80 via-noite/30 to-transparent" aria-hidden />
          <p className={`${rotulo} absolute left-10 top-28 text-ouro-claro lg:left-16`}>{t.kicker}</p>
          <div className="dn-t1 absolute bottom-20 left-10 max-w-xl lg:left-16">
            <h2 className={`${B} text-[3.4rem] italic leading-[1] lg:text-[5rem]`}>{t.t1}</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-marfim/80">{t.d1}</p>
          </div>
          <div className="dn-t2 absolute bottom-20 left-10 max-w-xl lg:left-16">
            <h2 className={`${B} text-[3.4rem] italic leading-[1] text-ouro-claro lg:text-[5rem]`}>{t.t2}</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-marfim/80">{t.d2}</p>
          </div>
        </div>
        <div className="so-lite px-5 py-20">
          <p className={`${rotulo} text-ouro-claro`}>{t.kicker}</p>
          {(['dia', 'noite'] as const).map((id, i) => (
            <figure key={id} className="mt-10">
              <Foto id={id} alt={i ? 'O mesmo jardim à noite, iluminado por velas' : 'O jardim ao fim da tarde, com mesas em veludo verde-oliva'} posicao="50% 60%" className="filme aspect-[4/5] w-full" />
              <figcaption className="mt-6">
                <span className={`${B} block text-[2.3rem] italic leading-[1.05] ${i ? 'text-ouro-claro' : ''}`}>{i ? t.t2 : t.t1}</span>
                <span className="mt-3 block text-base leading-relaxed text-marfim/75">{i ? t.d2 : t.d1}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Rolo de filme: no desktop anda de lado com a rolagem; no telemóvel desliza com o dedo. */
export function Rolo() {
  const t = useT().rolo;
  const trilho = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    const medir = () => el.style.setProperty('--curso', `${Math.min(0, window.innerWidth - el.scrollWidth)}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <section id="historias" data-progress="stick" className="relative bg-floresta text-marfim" style={{ height: '420vh' }}>
      <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden py-14">
        <div className="rolador">
          <div ref={trilho} className="trilho flex w-max items-center gap-10 pl-5 pr-10 sm:gap-16 sm:pl-10 lg:pl-16">
            <div className="flex w-[80vw] shrink-0 flex-col justify-center sm:w-[34vw]">
              <p className={`${rotulo} text-ouro-claro`}>{t.kicker}</p>
              <h2 className={`${B} mt-6 text-[3.4rem] leading-[0.95] sm:text-[5.5rem]`}>{t.titulo} <em className="text-ouro-claro">{t.em}</em></h2>
              <p className="mt-6 max-w-sm text-base leading-relaxed text-marfim/70">{t.sub}</p>
              <p className="mt-10 text-[0.6875rem] uppercase tracking-[0.28em] text-marfim/50"><span className="so-lite-i">{t.dica} →</span><span className="so-desk-i">{t.continue} ↓</span></p>
              <div className="mt-6 h-px w-48 overflow-hidden bg-marfim/15"><div className="barra h-full bg-ouro" /></div>
            </div>
            <div className="pelicula relative flex shrink-0 gap-5 px-5 py-10 shadow-[0_50px_100px_-40px_rgb(0_0_0/0.8)] sm:gap-7 sm:px-7">
              <div className="furos absolute inset-x-0 top-2.5" aria-hidden />
              <div className="furos absolute inset-x-0 bottom-2.5" aria-hidden />
              {ROLO.map((f, i) => (
                <figure key={f.id} className="shrink-0">
                  <p className="mb-2 flex justify-between font-mono text-[0.625rem] tracking-[0.2em] text-[#e09a3c]/85" aria-hidden>
                    <span>HEARTMADE 400</span><span>▸ {String(i * 2 + 12)}A</span>
                  </p>
                  <div className="filme relative aspect-[3/4] h-[48svh] overflow-hidden sm:h-[56svh]">
                    <Foto id={f.id} alt={t.fotos[f.id]} posicao={f.pos} className="quadro-foto absolute inset-0" />
                  </div>
                  <figcaption className={`${C} mt-3 max-w-[30ch] text-xl italic text-marfim/85`}>{t.fotos[f.id]}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Serviços: no desktop, a fotografia ao lado troca conforme o serviço que está a meio do ecrã. */
export function Servicos() {
  const t = useT().servicos;
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const itens = lista.current?.querySelectorAll<HTMLElement>('[data-i]');
    if (!itens) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setAtivo(Number((e.target as HTMLElement).dataset.i)); }), { rootMargin: '-45% 0px -45% 0px' });
    itens.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);
  return (
    <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
      <div className="relative hidden lg:block">
        <div className="sticky top-28 h-[calc(100svh-9rem)] overflow-hidden">
          {t.itens.map((s, i) => (
            <Foto key={s.t} id={s.img} alt="" posicao={s.pos} className={`serv-foto filme absolute inset-0 ${ativo === i ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-0'}`} />
          ))}
          <span className={`${B} absolute bottom-6 left-6 text-[7rem] italic leading-none text-marfim/90`} aria-hidden>{String(ativo + 1).padStart(2, '0')}</span>
        </div>
      </div>
      <ol ref={lista}>
        {t.itens.map((s, i) => (
          <li key={s.t} data-i={i} data-ativo={ativo === i ? 1 : 0} className="serv-item flex min-h-0 flex-col justify-center border-t border-tinta/15 py-10 lg:min-h-[62svh] lg:py-0">
            <Foto id={s.img} alt="" posicao={s.pos} className="filme mb-7 aspect-[4/3] w-full lg:hidden" />
            <span className={`${C} text-2xl italic text-ouro`}>{['I', 'II', 'III', 'IV'][i]}.</span>
            <h3 className={`${B} mt-3 text-[2.4rem] leading-[1.02] sm:text-[3.4rem]`}>{s.t}</h3>
            <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-pedra">{s.d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Estilos em separadores: troca as provas fotográficas e o texto. */
export function Estilos() {
  const t = useT().estilos;
  const [i, setI] = useState(0);
  const e = t.itens[i];
  return (
    <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
      <div>
        <div role="tablist" aria-label={t.kicker} className="flex flex-col border-t border-tinta/15">
          {t.itens.map((x, k) => (
            <button key={x.t} role="tab" type="button" aria-selected={i === k} onClick={() => setI(k)}
              className={`group flex items-baseline gap-5 border-b border-tinta/15 py-6 text-left transition-colors ${i === k ? 'text-tinta' : 'text-tinta/40 hover:text-tinta/75'}`}>
              <span className="text-xs tabular-nums tracking-[0.2em]">{String(k + 1).padStart(2, '0')}</span>
              <span className={`${B} text-[2.1rem] leading-none sm:text-[3rem] ${i === k ? 'italic' : ''}`}>{x.t}</span>
            </button>
          ))}
        </div>
        <p key={`d${i}`} role="tabpanel" className="troca mt-8 max-w-md text-[1.0625rem] leading-relaxed text-pedra">{e.d}</p>
      </div>
      <div key={i} className="relative mx-auto h-[30rem] w-full max-w-[34rem] sm:h-[38rem]">
        <div className="troca prova absolute left-0 top-0 w-[64%] bg-[#fbf8f1] p-3 pb-12" style={{ rotate: '-3deg', ['--r0' as string]: '-8deg' }}>
          <Foto id={e.fotos[0]} alt={`${e.t}: ${e.d}`} posicao="50% 50%" className="filme aspect-[3/4] w-full" />
          <span className={`${C} absolute bottom-3 left-4 text-xl italic text-tinta/70`}>{e.t}</span>
        </div>
        <div className="troca prova absolute bottom-0 right-0 w-[56%] bg-[#fbf8f1] p-3 pb-10" style={{ rotate: '4deg', ['--r0' as string]: '10deg', animationDelay: '.15s' }}>
          <Foto id={e.fotos[1]} alt="" posicao="50% 50%" className="filme aspect-[3/4] w-full" />
        </div>
      </div>
    </div>
  );
}

/** Botão flutuante do WhatsApp: some no topo e quando a proposta ou o contacto estão no ecrã. */
export function WhatsFlutuante() {
  const t = useT();
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
    <a href={urlWhats(t.whatsOla)} target="_blank" rel="noopener" aria-label="WhatsApp" tabIndex={mostrar ? 0 : -1}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-oliva px-4 font-medium text-marfim shadow-[0_14px_40px_-12px_rgb(0_0_0/0.6)] transition-[transform,opacity] duration-500 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 sm:bottom-7 sm:right-7 sm:pl-4 sm:pr-5 ${mostrar ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <IconeWhats className="size-6" />
      <span className="hidden text-sm sm:inline">WhatsApp</span>
    </a>
  );
}

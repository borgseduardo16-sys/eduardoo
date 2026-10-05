'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, CheckCheck, Phone, Tag, Zap } from 'lucide-react';
import { LazyMotion, domAnimation, m, useMotionValue, useSpring, useTransform } from 'motion/react';

/*
 * Smartphone em 3D (CSS 3D, com a interface em HTML de verdade): é a "prova
 * visual" do que o produto ensina — conversa organizada, resposta rápida e
 * etiqueta. Tudo aqui é ILUSTRATIVO (empresa fictícia "Sua Empresa").
 */

type Msg =
  | { de: 'cliente' | 'empresa'; texto: string; hora: string; rapida?: boolean }
  | { de: 'etiqueta'; texto: string };

const ROTEIRO: Msg[] = [
  { de: 'cliente', texto: 'Oi! Vocês fazem orçamento?', hora: '09:41' },
  { de: 'empresa', texto: 'Olá! Tudo bem? Já te atendo — me conta o que você precisa.', hora: '09:41', rapida: true },
  { de: 'etiqueta', texto: 'Novo cliente' },
  { de: 'cliente', texto: 'Preciso de um orçamento para esta semana.', hora: '09:42' },
  { de: 'empresa', texto: 'Claro! Vou te enviar as opções agora.', hora: '09:42' },
];

function useRoteiro() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = window.setTimeout(() => setN(ROTEIRO.length), 0);
      return () => window.clearTimeout(id);
    }
    const ids: number[] = [];
    [1100, 2300, 3300, 4400, 5800].forEach((ms, i) => ids.push(window.setTimeout(() => setN(i + 1), ms)));
    return () => ids.forEach(clearTimeout);
  }, []);
  return n;
}

function Bolha({ msg }: { msg: Msg }) {
  if (msg.de === 'etiqueta') {
    return (
      <div className="v-pop flex justify-center py-0.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--v-green)]/15 px-2 py-0.5 text-[0.625rem] font-medium text-[var(--v-green)]">
          <Tag className="size-2.5" aria-hidden />
          {msg.texto}
        </span>
      </div>
    );
  }
  const minha = msg.de === 'empresa';
  return (
    <div className={`v-pop flex ${minha ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-[0.6875rem] leading-snug ${
          minha ? 'rounded-br-md bg-[#0e3a8f] text-white' : 'rounded-bl-md bg-white/[0.08] text-white/90'
        }`}
      >
        {msg.rapida && (
          <span className="mb-0.5 flex items-center gap-1 text-[0.5625rem] font-medium text-[var(--v-blue-soft)]">
            <Zap className="size-2.5" aria-hidden /> Resposta rápida
          </span>
        )}
        {msg.texto}
        <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[0.5rem] text-white/50">
          {msg.hora}
          {minha && <CheckCheck className="size-2.5 text-[var(--v-blue-soft)]" aria-hidden />}
        </span>
      </div>
    </div>
  );
}

export function PhoneStage() {
  const n = useRoteiro();
  const stage = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 90, damping: 18 });
  const sy = useSpring(py, { stiffness: 90, damping: 18 });
  // Inclinação base (-14° / 6°) + até ±7° seguindo o mouse.
  const ry = useTransform(sx, [-1, 1], [-21, -7]);
  const rx = useTransform(sy, [-1, 1], [12, 0]);

  const aoMover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  const digitando = n > 0 && n < ROTEIRO.length && ROTEIRO[n]?.de === 'empresa';

  return (
    <LazyMotion features={domAnimation} strict>
      <div
        ref={stage}
        onPointerMove={aoMover}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
        aria-hidden
        className="relative mx-auto w-[min(72vw,17rem)] sm:w-[18rem] [perspective:1400px]"
      >
        {/* Reflexo/piso: dá apoio ao objeto flutuante. */}
        <div className="absolute -bottom-6 left-1/2 h-10 w-[75%] -translate-x-1/2 rounded-[50%] bg-[var(--v-blue)]/30 blur-2xl" />

        <m.div style={{ rotateY: ry, rotateX: rx, transformStyle: 'preserve-3d' }} className="relative">
          <div className="v-float" style={{ ['--dur' as string]: '7s' }}>
            {/* Corpo do aparelho */}
            <div className="relative rounded-[2.4rem] border border-white/15 bg-gradient-to-b from-[#16203a] to-[#060a14] p-[7px] shadow-[0_40px_80px_-20px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.04),inset_0_1px_0_rgb(255_255_255/0.2)]">
              <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2rem] bg-[#070d1b]">
                {/* ilha */}
                <div className="absolute left-1/2 top-2 z-20 h-4 w-14 -translate-x-1/2 rounded-full bg-black" />
                {/* cabeçalho */}
                <div className="relative z-10 flex items-center gap-2 border-b border-white/[0.07] bg-[#0b1630]/90 px-3 pb-2 pt-8">
                  <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[var(--v-blue)] to-[var(--v-deep)] text-[0.625rem] font-bold">
                    SE
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-[0.6875rem] font-semibold">
                      Sua Empresa
                      <BadgeCheck className="size-3 text-[var(--v-green)]" aria-hidden />
                    </p>
                    <p className="text-[0.5625rem] text-white/50">conta comercial</p>
                  </div>
                  <Phone className="size-3.5 text-white/40" aria-hidden />
                </div>
                {/* conversa */}
                <div className="flex h-[calc(100%-4.2rem)] flex-col justify-end gap-1.5 bg-[radial-gradient(circle_at_30%_0%,rgb(47_123_255/0.10),transparent_60%)] p-2.5">
                  {ROTEIRO.slice(0, n).map((msg, i) => (
                    <Bolha key={i} msg={msg} />
                  ))}
                  {digitando && (
                    <div className="v-pop flex justify-end">
                      <div className="flex gap-1 rounded-2xl rounded-br-md bg-[#0e3a8f]/70 px-3 py-2">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="v-dot size-1 rounded-full bg-white" style={{ animationDelay: `${d * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* vidro */}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.07)_0%,transparent_35%)]" />
              </div>
            </div>

            {/* Cartões flutuantes em profundidade (translateZ) */}
            <div
              className="v-float absolute -left-3 top-[20%] sm:-left-14"
              style={{ ['--z' as string]: '70px', ['--dur' as string]: '5.5s', ['--delay' as string]: '-1s' }}
            >
              <Chip icone={<Zap className="size-3.5" />} titulo="Resposta rápida" sub="enviada na hora" />
            </div>
            <div
              className="v-float absolute -right-3 top-[33%] sm:-right-16"
              style={{ ['--z' as string]: '90px', ['--dur' as string]: '6.5s', ['--delay' as string]: '-3s' }}
            >
              <Chip icone={<Tag className="size-3.5" />} titulo="Etiqueta" sub="Novo cliente" verde />
            </div>
            <div
              className="v-float absolute -bottom-5 left-4 sm:-bottom-4 sm:-left-8"
              style={{ ['--z' as string]: '50px', ['--dur' as string]: '7.5s', ['--delay' as string]: '-2s' }}
            >
              <Chip icone={<CheckCheck className="size-3.5" />} titulo="Conversa organizada" sub="nada se perde" />
            </div>
          </div>
        </m.div>
      </div>
    </LazyMotion>
  );
}

function Chip({ icone, titulo, sub, verde }: { icone: React.ReactNode; titulo: string; sub: string; verde?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1630]/80 px-2.5 py-2 shadow-[0_12px_30px_-8px_rgb(0_0_0/0.8)] backdrop-blur-md">
      <span className={`grid size-6 place-items-center rounded-lg ${verde ? 'bg-[var(--v-green)]/15 text-[var(--v-green)]' : 'bg-[var(--v-blue)]/20 text-[var(--v-blue-soft)]'}`}>
        {icone}
      </span>
      <span className="leading-tight">
        <span className="block text-[0.6875rem] font-semibold">{titulo}</span>
        <span className="block text-[0.5625rem] text-white/50">{sub}</span>
      </span>
    </div>
  );
}

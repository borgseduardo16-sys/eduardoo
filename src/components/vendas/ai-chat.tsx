'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { useInViewOnce } from './use-in-view';
import { IllustrativeTag } from './illustrative-tag';

const PERGUNTA = 'Como organizo meus contatos no WhatsApp Business?';
const RESPOSTA =
  'Uma boa saída é usar etiquetas para separar os contatos por etapa do atendimento — por exemplo: novos contatos, em conversa e finalizados. Quer que eu explique o passo a passo?';

/** Conversa de exemplo: a pergunta é digitada, a assistência "pensa" e a resposta aparece escrevendo. */
export function AiChat() {
  const [ref, visto] = useInViewOnce<HTMLDivElement>('0px 0px -20% 0px');
  const [fase, setFase] = useState<'ocioso' | 'perguntando' | 'pensando' | 'respondendo' | 'fim'>('ocioso');
  const [p, setP] = useState(0);
  const [r, setR] = useState(0);
  const iniciou = useRef(false);

  useEffect(() => {
    if (!visto || iniciou.current) return;
    iniciou.current = true;
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ids: number[] = [];
    const later = (fn: () => void, ms: number) => ids.push(window.setTimeout(fn, ms));
    if (reduz) {
      later(() => { setP(PERGUNTA.length); setR(RESPOSTA.length); setFase('fim'); }, 0);
      return () => ids.forEach(clearTimeout);
    }
    later(() => setFase('perguntando'), 300);
    const ti = 300 + 250;
    for (let i = 1; i <= PERGUNTA.length; i++) later(() => setP(i), ti + i * 32);
    const t1 = ti + PERGUNTA.length * 32 + 500;
    later(() => setFase('pensando'), t1);
    const t2 = t1 + 1300;
    later(() => setFase('respondendo'), t2);
    for (let i = 1; i <= RESPOSTA.length; i++) later(() => setR(i), t2 + i * 18);
    later(() => setFase('fim'), t2 + RESPOSTA.length * 18 + 100);
    return () => ids.forEach(clearTimeout);
  }, [visto]);

  const mostrouPergunta = fase !== 'ocioso' && fase !== 'perguntando';
  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_30%_20%,rgb(47_123_255/0.2),transparent_65%)]" />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#070d1b]/90 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-[var(--v-blue)]/20 text-[var(--v-blue-soft)]">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Assistência de IA</p>
              <p className="flex items-center gap-1.5 text-xs text-[var(--v-muted)]">
                <span className="relative flex size-1.5">
                  <span className="v-ping absolute inline-flex size-full rounded-full bg-[var(--v-green)]" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[var(--v-green)]" />
                </span>
                incluída no produto
              </p>
            </div>
          </div>
          <IllustrativeTag />
        </div>

        <div className="min-h-[19rem] space-y-4 p-4 sm:min-h-[21rem] sm:p-5" aria-live="polite">
          {fase !== 'ocioso' && (
            <div className="flex justify-end">
              <p className={`max-w-[88%] rounded-2xl rounded-br-md bg-[#0e3a8f] px-4 py-2.5 text-sm leading-relaxed ${fase === 'perguntando' ? 'v-caret' : ''}`}>
                {PERGUNTA.slice(0, p)}
              </p>
            </div>
          )}
          {fase === 'pensando' && (
            <div className="flex gap-1.5 px-1 py-2" aria-label="Assistência está escrevendo">
              {[0, 1, 2].map((d) => (
                <span key={d} className="v-dot size-1.5 rounded-full bg-[var(--v-blue-soft)]" style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </div>
          )}
          {(fase === 'respondendo' || fase === 'fim') && mostrouPergunta && (
            <div className="flex gap-3">
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--v-blue)]/20 text-[var(--v-blue-soft)]">
                <Sparkles className="size-3.5" aria-hidden />
              </span>
              <p className={`max-w-[92%] rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.05] px-4 py-3 text-sm leading-relaxed ${fase === 'respondendo' ? 'v-caret' : ''}`}>
                {RESPOSTA.slice(0, r)}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.08] p-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-2 pl-4 pr-2" aria-hidden>
            <span className="flex-1 text-sm text-[var(--v-muted)]">Pergunte sobre o que está aprendendo…</span>
            <span className="grid size-8 place-items-center rounded-xl bg-[var(--v-blue)] text-white">
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Clock } from 'lucide-react';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { CountUp } from './count-up';
import { IllustrativeTag } from './illustrative-tag';

const FILA = [
  { quem: 'Cliente · orçamento', texto: 'Oi, ainda tem disponível?', quando: 'agora', x: 0 },
  { quem: 'Cliente · dúvida', texto: 'Boa tarde! Alguém por aí?', quando: 'há 40 min', x: 14 },
  { quem: 'Cliente · pedido', texto: 'Consegue me responder hoje?', quando: 'há 2 h', x: -8 },
  { quem: 'Cliente · preço', texto: 'Vi o anúncio. Quanto custa?', quando: 'há 5 h', x: 10 },
  { quem: 'Cliente · retorno', texto: 'Esqueci de te perguntar uma coisa…', quando: 'ontem', x: -12 },
];

/** Caixa de entrada desorganizada: as conversas se acumulam enquanto o contador sobe. */
export function Inbox() {
  return (
    <div className="relative mx-auto w-full min-w-0 max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--v-muted)]">Conversas aguardando resposta</p>
        <span className="grid min-w-9 place-items-center rounded-full bg-white/10 px-2.5 py-1 text-sm font-semibold tabular-nums">
          <CountUp to={12} duration={2.2} />
        </span>
      </div>

      <RevealGroup as="ul" className="relative space-y-2.5" stagger={0.16}>
        {FILA.map((c) => (
          <RevealItem as="li" key={c.texto}>
            <div
              className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3.5 backdrop-blur-sm sm:translate-x-[var(--x)]"
              style={{ ['--x' as string]: `${c.x}px` }}
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-[var(--v-muted)]">
                ?
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--v-muted)]">{c.quem}</p>
                <p className="truncate text-sm">{c.texto}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-[var(--v-muted)]">
                <Clock className="size-3" aria-hidden />
                {c.quando}
              </span>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* Fade: sugere que a fila continua. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 h-24 bg-gradient-to-t from-[var(--v-bg)] to-transparent" />
      <div className="mt-2 flex justify-center">
        <IllustrativeTag />
      </div>
    </div>
  );
}

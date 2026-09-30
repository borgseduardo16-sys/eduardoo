'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

export type ViewsBucket = {
  /** Primeiro dia do intervalo ('AAAA-MM-DD'). */
  from: string;
  /** Último dia do intervalo (igual a `from` quando a barra é um dia). */
  to: string;
  /** Null = antes de a contagem existir ("sem dado", não zero). */
  value: number | null;
};

const DIA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const CURTA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const LONGA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const data = (iso: string) => new Date(`${iso}T00:00:00Z`);

function rotulo(b: ViewsBucket): string {
  return b.from === b.to ? DIA.format(data(b.from)) : `${CURTA.format(data(b.from))} a ${CURTA.format(data(b.to))}`;
}

function valorTexto(v: number | null): string {
  if (v === null) return 'sem dado';
  return `${v} ${v === 1 ? 'visualização' : 'visualizações'}`;
}

/** Topo "redondo" do eixo: 1, 2, 5 × 10^k, com o meio também inteiro. */
function escala(max: number): { top: number; ticks: number[] } {
  const metade = Math.max(1, max / 2);
  const pot = 10 ** Math.floor(Math.log10(metade));
  const passo = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= metade) ?? 10 * pot;
  return { top: passo * 2, ticks: [0, passo, passo * 2] };
}

/**
 * Visualizações ao longo do período — barras simples, uma série (Fase 23).
 *
 * Uma parada de Tab no gráfico inteiro; setas/Home/End passam de barra em
 * barra e a dica anuncia o valor (a mesma que aparece ao passar o mouse ou
 * tocar). Dias antes de a contagem existir aparecem hachurados como "sem
 * dado" — nunca como zero. Todo número daqui também está na tabela logo
 * abaixo do gráfico, então a dica ajuda, mas não é o único caminho.
 */
export function ViewsChart({ buckets, countingSince }: { buckets: ViewsBucket[]; countingSince: string | null }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const idDica = useId();
  const n = buckets.length;
  if (n === 0) return null;

  const max = Math.max(0, ...buckets.map((b) => b.value ?? 0));
  const { top, ticks } = escala(max);
  const semDado = buckets.findIndex((b) => b.value !== null);
  const nulos = semDado === -1 ? n : semDado;
  const larguraEixo = top >= 10_000 ? 'w-11' : 'w-8';
  const recuo = top >= 10_000 ? 'ml-11' : 'ml-8';

  const mover = (i: number) => setAtivo(Math.min(n - 1, Math.max(0, i)));
  const b = ativo !== null ? buckets[ativo] : undefined;
  const esquerda = ativo !== null ? ((ativo + 0.5) / n) * 100 : 0;

  const meio = n >= 14 ? Math.floor((n - 1) / 2) : null;

  return (
    <div className="space-y-1.5">
      <div
        role="group"
        aria-roledescription="gráfico de barras"
        aria-label={`Visualizações por ${buckets[0]!.from === buckets[0]!.to ? 'dia' : 'semana'}. Use as setas para percorrer as barras.`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); mover((ativo ?? -1) + 1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); mover((ativo ?? n) - 1); }
          else if (e.key === 'Home') { e.preventDefault(); mover(0); }
          else if (e.key === 'End') { e.preventDefault(); mover(n - 1); }
          else if (e.key === 'Escape') setAtivo(null);
        }}
        onBlur={() => setAtivo(null)}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAtivo(null); }}
        className={cn('relative h-40 rounded-[0.25rem] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface)]', recuo)}
      >
        {/* grade: linhas finas, sólidas, só nos valores do eixo */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute inset-x-0 border-t border-[var(--border)]"
            style={{ bottom: `${(t / top) * 100}%` }}
            aria-hidden
          >
            <span
              className={cn(
                'absolute -translate-y-1/2 text-right pr-2 text-[0.6875rem] leading-none tabular-nums text-[var(--content-subtle)]',
                larguraEixo,
              )}
              style={{ right: '100%' }}
            >
              {t.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}

        {nulos > 0 && (
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${(nulos / n) * 100}%`,
              backgroundImage: 'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 6px)',
            }}
            aria-hidden
          />
        )}

        <ol className="absolute inset-0 flex items-end" aria-hidden>
          {buckets.map((bk, i) => (
            <li
              key={bk.from}
              className={cn(
                'relative h-full flex-1 flex items-end justify-center px-px',
                // coluna ativa ganha um fundo leve: dá para ver qual dia está
                // selecionado mesmo quando ele não tem barra (zero)
                ativo === i && 'bg-[color-mix(in_oklch,var(--content)_6%,transparent)]',
              )}
              onPointerEnter={() => setAtivo(i)}
              onPointerDown={() => setAtivo(i)}
            >
              {bk.value !== null && bk.value > 0 && (
                <span
                  className={cn(
                    'block w-full max-w-6 rounded-t-[4px] bg-[var(--color-brand-500)] transition-[filter]',
                    ativo === i && 'brightness-125',
                  )}
                  style={{ height: `${(bk.value / top) * 100}%` }}
                />
              )}
            </li>
          ))}
        </ol>

        {b && (
          <div
            id={idDica}
            className="pointer-events-none absolute bottom-full mb-2 z-10 whitespace-nowrap rounded-[0.5rem] border bg-[var(--surface-raised)] px-2.5 py-1.5 text-[0.75rem] shadow-sm"
            style={
              esquerda < 20
                ? { left: 0 }
                : esquerda > 80
                  ? { right: 0 }
                  : { left: `${esquerda}%`, transform: 'translateX(-50%)' }
            }
          >
            <span className="block font-semibold text-[0.875rem] text-[var(--content)]">
              {b.value === null ? 'Sem dado' : b.value.toLocaleString('pt-BR')}
            </span>
            <span className="block text-[var(--content-muted)]">
              {b.value === null
                ? `${rotulo(b)} · contagem começou em ${countingSince ? LONGA.format(data(countingSince)) : '—'}`
                : `${b.value === 1 ? 'visualização' : 'visualizações'} · ${rotulo(b)}`}
            </span>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {b ? `${rotulo(b)}: ${valorTexto(b.value)}` : ''}
        </p>
      </div>

      <div className={cn('relative h-4 text-[0.6875rem] tabular-nums text-[var(--content-subtle)]', recuo)} aria-hidden>
        <span className="absolute left-0">{CURTA.format(data(buckets[0]!.from))}</span>
        {meio !== null && (
          <span className="absolute -translate-x-1/2" style={{ left: `${((meio + 0.5) / n) * 100}%` }}>
            {CURTA.format(data(buckets[meio]!.from))}
          </span>
        )}
        <span className="absolute right-0">{CURTA.format(data(buckets[n - 1]!.to))}</span>
      </div>
    </div>
  );
}

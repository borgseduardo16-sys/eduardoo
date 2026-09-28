import { Star } from 'lucide-react';
import { formatRating, reviewCountLabel } from '@/lib/reviews/format';
import { cn } from '@/lib/utils';

/**
 * "★ 4,8 · 17 avaliações".
 *
 * Só renderiza com pelo menos uma avaliação real — sem avaliação não existe
 * "0,0 ★": quem chama mostra o estado vazio próprio do contexto.
 */
export function RatingSummaryLine({
  average,
  count,
  className,
  size = 'md',
}: {
  average: string | null;
  count: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const nota = formatRating(average);
  if (!nota || count <= 0) return null;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 tabular-nums',
        size === 'sm' && 'text-[0.8125rem]',
        size === 'md' && 'text-[0.9375rem]',
        size === 'lg' && 'text-[1.125rem]',
        className,
      )}
    >
      <Star
        className={cn('text-[var(--accent)] shrink-0', size === 'lg' ? 'size-5' : 'size-4')}
        fill="currentColor"
        aria-hidden
      />
      <span className="font-semibold">{nota}</span>
      <span className="sr-only">de 5</span>
      <span className="text-[var(--content-muted)]" aria-hidden>
        ·
      </span>
      <span className="text-[var(--content-muted)]">{reviewCountLabel(count)}</span>
    </p>
  );
}

/**
 * Distribuição das notas (5 → 1). Só vale mostrar a partir de algumas
 * avaliações: com uma ou duas, as barras não dizem nada além da média.
 */
export function RatingDistribution({
  distribution,
  count,
  className,
}: {
  distribution: [number, number, number, number, number];
  count: number;
  className?: string;
}) {
  if (count < 3) return null;

  return (
    <dl className={cn('space-y-1.5 max-w-xs', className)} aria-label="Distribuição das notas">
      {[5, 4, 3, 2, 1].map((nota) => {
        const n = distribution[nota - 1];
        const pct = count > 0 ? Math.round((n / count) * 100) : 0;
        return (
          <div key={nota} className="flex items-center gap-2.5 text-[0.8125rem]">
            <dt className="w-16 shrink-0 text-[var(--content-muted)] tabular-nums">
              {nota} {nota === 1 ? 'estrela' : 'estrelas'}
            </dt>
            <dd className="flex-1 flex items-center gap-2.5">
              <span className="relative h-1.5 flex-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden" aria-hidden>
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-6 text-right tabular-nums text-[var(--content-muted)]">{n}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Estrelas de uma avaliação individual, com o valor por extenso para leitor de tela. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} role="img" aria-label={`Nota ${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= rating ? 'size-3.5 text-[var(--accent)]' : 'size-3.5 text-[var(--border-strong)]'}
          fill={n <= rating ? 'currentColor' : 'none'}
          aria-hidden
        />
      ))}
    </span>
  );
}

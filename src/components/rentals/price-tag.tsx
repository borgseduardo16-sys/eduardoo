import { priceHeadline, type PriceSummary } from '@/lib/rentals/pricing';
import { cn } from '@/lib/utils';

/**
 * Preço de um anúncio em cartões, listas e prévias (Parte 12): o mensal
 * quando existe ("R$ 300 /mês", com "Também por hora" embaixo se o anúncio
 * aceita os dois), senão a entrada do temporário ("R$ 50 /hora" ou
 * "R$ 120 por até 5 horas"). Vem das colunas derivadas de `spaces` — o
 * mesmo valor que o servidor cobra.
 */
export function PriceTag({
  summary,
  className,
  showSecondary = true,
}: {
  summary: PriceSummary;
  className?: string;
  showSecondary?: boolean;
}) {
  const h = priceHeadline(summary);
  if (!h) {
    return <span className={cn('text-[0.875rem] text-[var(--content-muted)]', className)}>Sem preço definido</span>;
  }
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span>
        <span className="font-semibold tabular-nums">{h.amount}</span>
        <span className="text-[var(--content-muted)] text-[0.875rem]"> {h.suffix.trim()}</span>
      </span>
      {showSecondary && h.secondary && (
        <span className="text-[0.75rem] text-[var(--content-subtle)]">· {h.secondary}</span>
      )}
    </span>
  );
}

/** Mesmo texto, sem marcação — para aria-label, prévia de link e imagem de compartilhamento. */
export function priceText(summary: PriceSummary): string {
  const h = priceHeadline(summary);
  if (!h) return 'Sem preço definido';
  return `${h.amount}${h.suffix.startsWith('/') ? h.suffix : h.suffix}`;
}

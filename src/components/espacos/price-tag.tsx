import { priceHeadline, type PriceSummary } from '@/lib/spaces/price';
import { cn } from '@/lib/utils';

/**
 * Preço de um anúncio em cartões, listas e prévias: "R$ 300,00 /mês". Vem da
 * coluna `price_monthly_cents` de `spaces` — o mesmo valor que o servidor cobra.
 */
export function PriceTag({ summary, className }: { summary: PriceSummary; className?: string }) {
  const h = priceHeadline(summary);
  if (!h) {
    return <span className={cn('text-[0.875rem] text-[var(--content-muted)]', className)}>Sem preço definido</span>;
  }
  return (
    <span className={cn('inline-flex items-baseline gap-x-1', className)}>
      <span className="font-semibold tabular-nums">{h.amount}</span>
      <span className="text-[var(--content-muted)] text-[0.875rem]">{h.suffix}</span>
    </span>
  );
}

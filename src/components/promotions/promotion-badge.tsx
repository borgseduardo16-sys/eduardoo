import { Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Identidade visual de Destaque/Turbo — pedido explícito: discreta, sem
 * neon, sem gradiente, sem efeito chamativo. A hierarquia (Turbo > Destaque)
 * fica só no PESO visual (contorno fino vs. preenchido), nunca em cor
 * berrante — as duas usam a mesma cor de marca (`--accent`).
 */
export function PromotionBadge({
  type,
  size = 'sm',
  className,
  ...rest
}: {
  type: 'destaque' | 'turbo';
  size?: 'sm' | 'xs';
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const isTurbo = type === 'turbo';
  const Icon = isTurbo ? Zap : Star;
  const label = isTurbo ? 'Turbo' : 'Destaque';

  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 rounded-[0.375rem] font-medium leading-none whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-1 text-[0.6875rem]' : 'px-2 py-1 text-[0.75rem]',
        isTurbo
          ? 'bg-[var(--accent)] text-[var(--accent-content)]'
          : 'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/25',
        className,
      )}
    >
      <Icon className={size === 'xs' ? 'size-2.5' : 'size-3'} aria-hidden fill={isTurbo ? 'currentColor' : 'none'} />
      {label}
    </span>
  );
}

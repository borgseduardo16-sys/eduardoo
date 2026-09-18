import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Etiqueta de status.
 *
 * Retangulo com canto levemente arredondado, nao pilula — reservamos o
 * formato de pilula para chip de FILTRO (algo que se toca), nao para rotulo
 * informativo. Ter tudo em pilula e um dos jeitos mais rapidos de uma tela
 * parecer gerada em serie.
 *
 * A cor nunca e o unico sinal: o texto do proprio rotulo (`label`) sempre
 * diz o estado por extenso, para quem nao distingue as cores.
 */
const badge = cva(
  'inline-flex items-center gap-1.5 px-2 py-1 rounded-[0.375rem] text-[0.75rem] font-medium leading-none whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-sunken)] text-[var(--content-muted)]',
        accent: 'bg-[var(--accent-subtle)] text-[var(--accent)]',
        positive: 'bg-[color-mix(in_oklch,var(--color-positive)_14%,transparent)] text-[var(--color-positive)]',
        caution: 'bg-[color-mix(in_oklch,var(--color-caution)_16%,transparent)] text-[color-mix(in_oklch,var(--color-caution)_75%,var(--content))]',
        critical: 'bg-[color-mix(in_oklch,var(--color-critical)_10%,transparent)] text-[var(--color-critical)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  /** Ponto solido antes do texto — reforça o estado sem depender só da cor de fundo. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export { badge as badgeVariants };

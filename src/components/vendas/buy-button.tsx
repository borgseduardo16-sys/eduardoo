import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkoutHref } from './config';

/**
 * Botão de compra. Sempre aponta para `checkoutHref` (config.ts).
 * O brilho que atravessa o botão no hover é CSS puro (`.v-shine`).
 */
export function BuyButton({
  children,
  size = 'lg',
  variant = 'solid',
  className,
  location,
}: {
  children: React.ReactNode;
  size?: 'md' | 'lg';
  variant?: 'solid' | 'ghost';
  className?: string;
  /** Onde o botão está na página — vai para data-attribute (útil para medir cliques depois). */
  location: string;
}) {
  return (
    <a
      href={checkoutHref}
      data-buy={location}
      {...(checkoutHref.startsWith('http') ? { rel: 'noopener' } : {})}
      className={cn(
        'v-shine group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full font-semibold tracking-tight',
        'transition-[transform,box-shadow,background-color] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
        size === 'lg' ? 'h-14 px-8 text-[0.9375rem] sm:text-base' : 'h-11 px-5 text-sm',
        variant === 'solid'
          ? 'bg-[var(--v-blue)] text-white shadow-[0_8px_30px_-8px_rgb(47_123_255/0.65),inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-[#4a8bff] hover:shadow-[0_14px_40px_-8px_rgb(47_123_255/0.75),inset_0_1px_0_rgb(255_255_255/0.3)]'
          : 'border border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10',
        className,
      )}
    >
      <span className="relative z-10">{children}</span>
      <ArrowRight
        className="relative z-10 size-4 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1"
        aria-hidden
      />
    </a>
  );
}

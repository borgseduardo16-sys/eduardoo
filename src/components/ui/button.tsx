import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const button = cva(
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
    'transition-[background-color,border-color,color,opacity,transform] duration-150 ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'active:scale-[0.985] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-subtle)]',
        secondary:
          'bg-[var(--surface-raised)] text-[var(--content)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
        ghost: 'text-[var(--content)] hover:bg-[var(--surface-sunken)]',
        quiet: 'text-[var(--content-muted)] hover:text-[var(--content)] hover:bg-[var(--surface-sunken)]',
        critical: 'bg-[var(--color-critical)] text-white hover:opacity-90',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm rounded-[var(--radius-field)] [&_svg]:size-4',
        md: 'h-11 px-5 text-[0.9375rem] rounded-[var(--radius-field)] [&_svg]:size-4',
        lg: 'h-13 px-6 text-base rounded-[var(--radius-field)] [&_svg]:size-5',
        icon: 'size-10 rounded-[var(--radius-field)] [&_svg]:size-5',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  block,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      // Anuncia o estado de carregamento para leitores de tela, que nao veem o spinner.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export { button as buttonVariants };

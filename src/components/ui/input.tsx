import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'w-full h-11 px-3.5 rounded-[var(--radius-field)]',
        'bg-[var(--surface)] text-[var(--content)]',
        'border border-[var(--border-strong)]',
        'placeholder:text-[var(--content-subtle)]',
        'transition-colors duration-150',
        'hover:border-[var(--content-subtle)]',
        'focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20',
        'aria-[invalid=true]:border-[var(--color-critical)] aria-[invalid=true]:ring-[var(--color-critical)]/20',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        // 16px evita o zoom automatico do Safari no iPhone ao focar o campo.
        'text-base md:text-[0.9375rem]',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full min-h-28 px-3.5 py-3 rounded-[var(--radius-field)]',
        'bg-[var(--surface)] text-[var(--content)]',
        'border border-[var(--border-strong)]',
        'placeholder:text-[var(--content-subtle)]',
        'transition-colors duration-150 resize-y',
        'hover:border-[var(--content-subtle)]',
        'focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20',
        'aria-[invalid=true]:border-[var(--color-critical)]',
        'text-base md:text-[0.9375rem]',
        className,
      )}
      {...props}
    />
  );
}

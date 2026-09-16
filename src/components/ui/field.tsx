import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Campo de formulario acessivel.
 *
 * Amarra label, descricao e erro ao input por id — sem isso o leitor de tela
 * anuncia "campo de edicao" e mais nada. O erro usa role="alert" para ser lido
 * assim que aparece.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--content)]">
          {label}
        </label>
        {optional && <span className="text-2xs text-[var(--content-subtle)]">opcional</span>}
      </div>

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
            'aria-invalid': error ? true : undefined,
          })
        : children}

      {hint && !error && (
        <p id={hintId} className="text-[0.8125rem] text-[var(--content-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}

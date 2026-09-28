import { Info } from 'lucide-react';
import type { TrustSignal } from '@/lib/safety/trust';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/**
 * Sinais de confiança de um perfil (Fase 21).
 *
 * Cada sinal é tocável e abre a explicação do que ele significa — selo que
 * não se explica é decoração. Usa `<details>`/`<summary>` nativos: funciona
 * sem JavaScript, o leitor de tela anuncia "expandido/recolhido" sozinho e
 * o teclado já sabe abrir com Enter/Espaço.
 *
 * Só recebe sinais reais (`buildTrustSignals`). O que não existe não aparece
 * — nunca um "✗ Telefone não verificado" para quem está olhando de fora.
 */
export function TrustSignalList({
  signals,
  className,
  compact = false,
}: {
  signals: TrustSignal[];
  className?: string;
  /** Linhas mais baixas, para caber em card de solicitação. */
  compact?: boolean;
}) {
  if (signals.length === 0) return null;

  return (
    <ul className={cn(compact ? 'space-y-0.5' : 'space-y-1', className)}>
      {signals.map((s) => (
        <li key={s.key}>
          <details className="group">
            <summary
              className={cn(
                'flex items-center gap-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden',
                '-mx-2 px-2 rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
                compact ? 'py-1 text-[0.8125rem]' : 'py-1.5 text-[0.9375rem]',
              )}
            >
              <Icon
                name={s.icon}
                className={cn(
                  'size-4 shrink-0',
                  s.group === 'verification' ? 'text-[var(--color-positive)]' : 'text-[var(--content-subtle)]',
                )}
              />
              <span className="min-w-0 flex-1">{s.label}</span>
              <Info
                className="size-3.5 shrink-0 text-[var(--content-subtle)] group-open:text-[var(--accent)]"
                aria-hidden
              />
              <span className="sr-only">— o que isso significa</span>
            </summary>
            <p
              className={cn(
                'pl-6.5 pr-2 text-[var(--content-muted)] leading-relaxed animate-rise',
                compact ? 'pb-1.5 text-[0.75rem]' : 'pb-2 text-[0.8125rem]',
              )}
            >
              {s.explanation}
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}

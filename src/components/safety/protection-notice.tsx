import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { liveProtections, OFF_PLATFORM_RISKS } from '@/lib/safety/protection';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/**
 * Bloco de proteção — o incentivo a fechar pela plataforma.
 *
 * Renderiza apenas `liveProtections()`: itens que ainda dependem de fase ou de
 * política não aparecem. Assim o texto nunca promete mais do que existe, sem
 * depender de alguém lembrar de revisar.
 *
 * Três variantes, para três momentos diferentes da jornada:
 *   - `compact`  rodapé de conversa e de anúncio
 *   - `card`     antes de confirmar a reserva
 *   - `full`     página de proteção
 */
export function ProtectionNotice({
  variant = 'card',
  className,
}: {
  variant?: 'compact' | 'card' | 'full';
  className?: string;
}) {
  const protections = liveProtections();

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex gap-2.5 items-start rounded-[var(--radius-field)] border p-3',
          'bg-[var(--accent-subtle)] border-[color-mix(in_oklch,var(--accent)_25%,transparent)]',
          className,
        )}
      >
        <ShieldCheck className="size-4 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
        <p className="text-[0.8125rem] leading-relaxed text-[var(--content-muted)]">
          <strong className="text-[var(--content)] font-medium">
            Combine e pague pela MyPlace.
          </strong>{' '}
          A conversa fica registrada e você pode denunciar ou bloquear se algo der errado.
          Fora daqui, não conseguimos ajudar.{' '}
          <Link href="/protecao" className="text-[var(--accent)] underline underline-offset-2">
            Entenda
          </Link>
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn(
        'rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5',
        variant === 'card' && 'bg-[var(--surface-sunken)]',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <ShieldCheck className="size-5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
        <div className="space-y-1">
          <h2 className="font-semibold">Fechando pela MyPlace, você tem</h2>
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
            Nada disso existe em uma combinação feita por fora.
          </p>
        </div>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {protections.map((p) => (
          <li key={p.key} className="flex gap-3">
            <Icon
              name={p.icon}
              className="size-4 mt-0.5 shrink-0 text-[var(--accent)]"
            />
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-[0.9375rem] font-medium">{p.title}</h3>
              <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                {p.description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {variant === 'full' && (
        <div className="pt-5 border-t space-y-4">
          <h3 className="font-semibold text-[0.9375rem]">O que você perde fechando por fora</h3>
          <ul className="space-y-3">
            {OFF_PLATFORM_RISKS.map((r) => (
              <li key={r.key} className="flex gap-3">
                <span
                  aria-hidden
                  className="shrink-0 mt-2 size-1.5 rounded-full bg-[var(--color-critical)]"
                />
                <div className="space-y-0.5">
                  <h4 className="text-[0.9375rem] font-medium">{r.title}</h4>
                  <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                    {r.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

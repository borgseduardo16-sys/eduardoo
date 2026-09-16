import Link from 'next/link';
import { computeTrustProfile, type TrustInput, type TrustProfile } from '@/lib/safety/trust';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

const LEVEL_STYLE: Record<TrustProfile['level'], { bg: string; fg: string }> = {
  novo: { bg: 'var(--surface-sunken)', fg: 'var(--content-muted)' },
  em_construcao: { bg: 'var(--surface-sunken)', fg: 'var(--content-muted)' },
  estabelecido: {
    bg: 'color-mix(in oklch, var(--color-positive) 12%, transparent)',
    fg: 'var(--color-positive)',
  },
  consolidado: {
    bg: 'color-mix(in oklch, var(--color-positive) 16%, transparent)',
    fg: 'var(--color-positive)',
  },
  sob_revisao: {
    bg: 'color-mix(in oklch, var(--color-critical) 12%, transparent)',
    fg: 'var(--color-critical)',
  },
};

/**
 * Sinais de confiança de um perfil.
 *
 * Mostra o que foi verificado e quanto histórico a pessoa tem na plataforma —
 * que é exatamente o que ela perde ao negociar por fora. É a razão econômica
 * para ficar, e por isso aparece com destaque em vez de ficar escondido no
 * perfil.
 *
 * Não é nota de 0 a 100 de propósito: número único convida a comparar
 * "87 contra 84", o que passa uma precisão que o dado não tem.
 */
export function TrustBadges({
  input,
  variant = 'full',
  className,
}: {
  input: TrustInput;
  variant?: 'inline' | 'full';
  className?: string;
}) {
  const trust = computeTrustProfile(input);
  const style = LEVEL_STYLE[trust.level];

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-pill)] text-[0.75rem] font-medium"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          {trust.levelLabel}
        </span>
        {trust.signals
          .filter((s) => s.tone === 'positive')
          .slice(0, 2)
          .map((s) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-1 text-[0.75rem] text-[var(--content-muted)]"
            >
              <Icon name={s.icon} className="size-3.5" />
              {s.label}
            </span>
          ))}
      </div>
    );
  }

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-1.5">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] text-[0.8125rem] font-medium"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          {trust.levelLabel}
        </span>
        <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          {trust.levelHint}
        </p>
      </div>

      <ul className="space-y-2">
        {trust.signals.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[0.875rem]">
            <Icon
              name={s.icon}
              className={cn(
                'size-4 shrink-0',
                s.tone === 'positive' && 'text-[var(--color-positive)]',
                s.tone === 'caution' && 'text-[var(--color-caution)]',
                s.tone === 'neutral' && 'text-[var(--content-subtle)]',
              )}
            />
            <span className={s.tone === 'caution' ? 'text-[var(--content-muted)]' : undefined}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Lista de verificações pendentes, mostrada ao dono do perfil.
 * Enquadrada como benefício ("quem aluga confia mais") e não como cobrança.
 */
export function TrustChecklist({ input, className }: { input: TrustInput; className?: string }) {
  const trust = computeTrustProfile(input);
  if (trust.missing.length === 0) return null;

  return (
    <section className={cn('rounded-[var(--radius-card)] border p-5 space-y-4', className)}>
      <header className="space-y-1">
        <h2 className="font-semibold">
          Conta verificada{' '}
          <span className="text-[var(--content-subtle)] font-normal text-[0.875rem]">
            {trust.verificationsDone} de {trust.verificationsTotal}
          </span>
        </h2>
        <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          Conta verificada aparece em destaque para quem procura espaço — e é o que faz
          alguém escolher o seu anúncio em vez de outro.
        </p>
      </header>

      <ul className="space-y-3">
        {trust.missing.map((m) => (
          <li key={m.key} className="flex gap-3">
            <span
              aria-hidden
              className="shrink-0 mt-1.5 size-1.5 rounded-full bg-[var(--content-subtle)]"
            />
            <div className="space-y-0.5">
              <h3 className="text-[0.9375rem] font-medium">{m.label}</h3>
              <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                {m.why}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/minha-conta/verificacao"
        className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
      >
        Verificar minha conta
      </Link>
    </section>
  );
}

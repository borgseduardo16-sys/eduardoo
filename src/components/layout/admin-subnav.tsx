import Link from 'next/link';
import { cn } from '@/lib/utils';

const ITENS = [
  { key: 'denuncias', href: '/admin/denuncias', label: 'Denúncias' },
  { key: 'usuarios', href: '/admin/usuarios', label: 'Usuários' },
] as const;

/** Navegação do painel administrativo — mesmo padrão visual do OwnerSubnav. */
export function AdminSubnav({
  active,
  queueCount,
}: {
  active: (typeof ITENS)[number]['key'];
  /** Denúncias abertas — mostrado como contador, não como pílula colorida sozinha. */
  queueCount?: number;
}) {
  return (
    <nav aria-label="Seção do painel administrativo" className="flex gap-5 border-b -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      {ITENS.map((item) => {
        const selecionado = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={selecionado ? 'page' : undefined}
            className={cn(
              'relative shrink-0 flex items-center gap-1.5 py-3 text-[0.9375rem] transition-colors',
              selecionado
                ? 'font-medium text-[var(--content)]'
                : 'text-[var(--content-muted)] hover:text-[var(--content)]',
            )}
          >
            {item.label}
            {item.key === 'denuncias' && Boolean(queueCount) && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[0.25rem] bg-[var(--accent)] text-[var(--accent-content)] text-[0.625rem] font-semibold tabular-nums">
                {queueCount}
              </span>
            )}
            {selecionado && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--accent)] rounded-full" aria-hidden />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

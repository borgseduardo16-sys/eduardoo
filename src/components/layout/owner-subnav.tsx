import Link from 'next/link';
import { cn } from '@/lib/utils';

const ITENS = [
  { key: 'espacos', href: '/meus-espacos', label: 'Meus espaços' },
  { key: 'solicitacoes', href: '/meus-espacos/solicitacoes', label: 'Solicitações' },
  { key: 'financeiro', href: '/meus-espacos/financeiro', label: 'Financeiro' },
] as const;

/**
 * Navegação entre as seções do painel do proprietário.
 *
 * Sublinhado, não pílula — a área já usa pílula para os filtros DENTRO de
 * cada seção ("Ativos", "Pausados"...); usar o mesmo formato aqui misturaria
 * "em que seção eu estou" com "que filtro escolhi", que são decisões
 * diferentes. Cada item é uma rota de verdade (Server Component, sem estado
 * de aba no cliente) — voltar e recarregar funcionam como deveriam.
 */
export function OwnerSubnav({
  active,
  pendingCount,
}: {
  active: (typeof ITENS)[number]['key'];
  /** Solicitações aguardando resposta — mostrado como contador, não como pílula colorida sozinha. */
  pendingCount?: number;
}) {
  return (
    <nav aria-label="Seção do painel" className="flex gap-5 border-b -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
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
            {item.key === 'solicitacoes' && Boolean(pendingCount) && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[0.25rem] bg-[var(--accent)] text-[var(--accent-content)] text-[0.625rem] font-semibold tabular-nums">
                {pendingCount}
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

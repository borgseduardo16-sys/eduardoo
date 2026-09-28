import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Paginação "anteriores / próximas".
 *
 * Sem total de páginas de propósito: a lista pede uma linha a mais do que
 * mostra para saber se há próxima (`hasMore`), sem um COUNT(*) a cada
 * página — que é o que fica caro quando a lista cresce.
 *
 * Links comuns (não botões): cada página tem URL própria, funciona sem
 * JavaScript e o "voltar" do navegador faz o que se espera.
 */
export function Pager({
  page,
  hasMore,
  href,
  label,
  className,
}: {
  page: number;
  hasMore: boolean;
  /** Monta a URL de uma página (executa no servidor). */
  href: (page: number) => string;
  /** Do que é a lista — vira o nome acessível da navegação. */
  label: string;
  className?: string;
}) {
  if (page <= 1 && !hasMore) return null;

  const base =
    'inline-flex items-center gap-1 h-10 px-3.5 rounded-[var(--radius-field)] border text-[0.875rem] font-medium transition-colors';

  return (
    <nav aria-label={`Páginas de ${label}`} className={cn('flex items-center justify-between gap-3 pt-2', className)}>
      {page > 1 ? (
        <Link href={href(page - 1)} scroll={false} className={cn(base, 'hover:bg-[var(--surface-sunken)]')}>
          <ChevronLeft className="size-4" aria-hidden />
          Anteriores
        </Link>
      ) : (
        <span />
      )}
      <span className="text-[0.8125rem] text-[var(--content-subtle)] tabular-nums">Página {page}</span>
      {hasMore ? (
        <Link href={href(page + 1)} scroll={false} className={cn(base, 'hover:bg-[var(--surface-sunken)]')}>
          Próximas
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import type { PublicPriceHistory } from '@/lib/spaces/price-history';

function dataCurta(iso: string, anoAtual: number): string {
  const [ano, mes, dia] = iso.split('-');
  return Number(ano) === anoAtual ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

/**
 * "Histórico de preço" na página do anúncio (Fase 23) — só existe quando o
 * preço mudou de verdade depois da publicação. Lista simples, não gráfico:
 * com poucos pontos, uma linha por mudança é mais clara (e funciona igual no
 * celular e no leitor de tela).
 */
export function PriceHistory({ history }: { history: PublicPriceHistory }) {
  const anoAtual = new Date().getFullYear();
  return (
    <section aria-labelledby="historico-preco-titulo" className="space-y-3" data-testid="historico-preco">
      <h2 id="historico-preco-titulo" className="font-semibold">
        Histórico de preço
      </h2>
      <ol className="rounded-[var(--radius-card)] border divide-y">
        {history.points.map((p, i) => (
          <li key={`${p.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.9375rem]">
            <span className="text-[var(--content-muted)] tabular-nums">
              {dataCurta(p.date, anoAtual)}
              {p.isPublication && <span className="text-[0.8125rem]"> · publicação</span>}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {p.deltaCents != null && (
                <span
                  className="inline-flex items-center gap-1 text-[0.8125rem]"
                  style={{ color: p.deltaCents < 0 ? 'var(--color-positive)' : 'var(--content-muted)' }}
                >
                  {p.deltaCents < 0 ? (
                    <TrendingDown className="size-3.5" aria-hidden />
                  ) : (
                    <TrendingUp className="size-3.5" aria-hidden />
                  )}
                  <span className="sr-only">{p.deltaCents < 0 ? 'caiu' : 'subiu'}</span>
                  {formatBRL(Math.abs(p.deltaCents))}
                </span>
              )}
              <span className="font-medium">{formatBRL(p.priceCents)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[0.75rem] text-[var(--content-subtle)]">
        Valores mensais registrados a cada alteração feita pelo proprietário depois da publicação.
      </p>
    </section>
  );
}

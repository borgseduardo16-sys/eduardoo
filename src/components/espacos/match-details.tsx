import { Check, ChevronDown, Minus, X } from 'lucide-react';
import type { MatchResult, MatchStatus } from '@/lib/search/match';

const ICONE: Record<MatchStatus, { Icon: typeof Check; cor: string; leitor: string }> = {
  sim: { Icon: Check, cor: 'var(--color-positive)', leitor: 'Atende:' },
  parcial: { Icon: Minus, cor: 'var(--color-caution)', leitor: 'Atende em parte:' },
  nao: { Icon: X, cor: 'var(--content-subtle)', leitor: 'Não atende:' },
};

/**
 * "X% compatível" com a explicação (Fase 23).
 *
 * Fica FORA do link do card — um <details> dentro de <a> abriria o
 * anúncio em vez da explicação. A explicação lista os critérios que a
 * pessoa informou, atendidos ou não, sem pesos nem fórmula; e diz o que o
 * número não é.
 */
export function MatchDetails({ match }: { match: MatchResult }) {
  const atende = match.items.filter((i) => i.status === 'sim').length;
  return (
    <details className="group mt-1.5" data-testid="compatibilidade" data-percent={match.percent}>
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 text-[0.8125rem] rounded-[var(--radius-field)]">
        <span className="font-semibold tabular-nums text-[var(--accent)]">{match.percent}% compatível</span>
        <span className="text-[var(--content-muted)]">com a sua busca</span>
        <ChevronDown className="size-3.5 text-[var(--content-subtle)] transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 space-y-2 text-[0.8125rem]">
        <p className="text-[var(--content-muted)]">
          {atende === match.items.length
            ? 'Atende a tudo o que você informou:'
            : `Atende a ${atende} de ${match.items.length} pontos do que você informou:`}
        </p>
        <ul className="space-y-1">
          {match.items.map((item) => {
            const { Icon, cor, leitor } = ICONE[item.status];
            return (
              <li key={item.text} className="flex items-start gap-1.5">
                <Icon className="size-3.5 mt-0.5 shrink-0" style={{ color: cor }} aria-hidden />
                <span>
                  <span className="sr-only">{leitor} </span>
                  {item.text}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
          Mede só o quanto o anúncio bate com o que você buscou, pelo que o próprio anúncio informa. Não é
          avaliação do espaço nem do proprietário.
        </p>
      </div>
    </details>
  );
}

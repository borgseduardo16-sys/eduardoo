import Link from 'next/link';
import type { SimilarSpace } from '@/lib/spaces/similar';
import { ResultCard } from './result-card';

/**
 * "Espaços semelhantes" na página do anúncio (Fase 23). Mesma faixa
 * horizontal de "Recomendados" da busca, com o card de sempre. Cada card
 * diz em palavras por que apareceu (tipo, distância, preço,
 * características) — nada de porcentagem aqui, que é da busca.
 */
export function SimilarSpaces({
  spaces,
  coverUrls,
  favoriteIds,
  loggedIn,
  title,
  description,
  searchHref,
}: {
  spaces: SimilarSpace[];
  coverUrls: Map<string, string>;
  favoriteIds: Set<string>;
  loggedIn: boolean;
  title: string;
  description: string;
  /** Busca com os mesmos critérios, onde dá para ver mais e criar um alerta. */
  searchHref: string;
}) {
  return (
    <section id="semelhantes" aria-labelledby="semelhantes-titulo" className="space-y-3 scroll-mt-20" data-testid="espacos-semelhantes">
      <div className="space-y-1">
        <h2 id="semelhantes-titulo" className="font-semibold text-[1.125rem]">{title}</h2>
        <p className="text-[0.875rem] text-[var(--content-muted)]">{description}</p>
      </div>
      {spaces.length > 0 && (
        <ul className="flex gap-4 overflow-x-auto -mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0 pb-1 snap-x snap-mandatory [&>li]:w-[15.5rem] [&>li]:shrink-0 [&>li]:snap-start">
          {spaces.map((s) => (
            <ResultCard
              key={s.id}
              space={s}
              coverUrl={s.coverPath ? (coverUrls.get(s.coverPath) ?? null) : null}
              favorited={favoriteIds.has(s.id)}
              loggedIn={loggedIn}
              note={s.reasons.slice(0, 3).join(' · ')}
              titleAs="h3"
            />
          ))}
        </ul>
      )}
      <Link href={searchHref} className="inline-block text-[0.875rem] font-medium text-[var(--accent)] underline underline-offset-4">
        Ver mais espaços assim e criar um alerta
      </Link>
    </section>
  );
}

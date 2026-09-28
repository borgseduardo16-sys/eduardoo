import 'server-only';
import { cache } from 'react';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { reviews } from '@/db/schema';

/**
 * Reputação por pessoa (Fase 21).
 *
 * Tudo derivado das avaliações reais, na hora da leitura — não existe coluna
 * de "média do usuário" que alguém possa editar. A consulta usa o índice
 * `reviews_reviewed_user_idx (reviewed_user_id, kind, created_at)`, então o
 * custo cresce com as avaliações DAQUELA pessoa, não com a tabela inteira.
 *
 * Mesma regra de arredondamento da média do anúncio: uma casa decimal,
 * arredondada uma única vez no banco (ver `src/lib/reviews/format.ts`).
 * Avaliação oculta pela moderação não entra em nada.
 */

export type RatingSummary = {
  count: number;
  /** Média já arredondada pelo banco, ex.: "4.7". Null sem avaliação. */
  average: string | null;
  /** Quantidade por nota: posição 0 = 1 estrela … posição 4 = 5 estrelas. */
  distribution: [number, number, number, number, number];
};

export type Reputation = {
  /** Recebidas como proprietário (quem alugou avaliou o espaço dele). */
  asOwner: RatingSummary;
  /** Recebidas como locatário (o proprietário avaliou quem alugou). */
  asRenter: RatingSummary;
  /** As duas juntas. */
  overall: RatingSummary;
};

function vazio(): RatingSummary {
  return { count: 0, average: null, distribution: [0, 0, 0, 0, 0] };
}

type Linha = {
  grupo: number;
  kind: 'renter_to_space' | 'owner_to_renter' | null;
  rating: number | null;
  n: number;
  media: string | null;
};

/**
 * Uma consulta só, com GROUPING SETS: por (tipo, nota) para a distribuição,
 * por tipo para a média de cada papel, e o total geral. `GROUPING()` diz de
 * qual nível é cada linha (0 = tipo+nota, 1 = só tipo, 3 = geral).
 */
export const getReputation = cache(async (userId: string): Promise<Reputation> => {
  const linhas = (await db.execute(sql`
    SELECT GROUPING(kind, rating)::int AS grupo,
           kind::text AS kind,
           rating,
           COUNT(*)::int AS n,
           ROUND(AVG(rating)::numeric, 1)::text AS media
    FROM reviews
    WHERE reviewed_user_id = ${userId} AND hidden_at IS NULL
    GROUP BY GROUPING SETS ((kind, rating), (kind), ())
  `)) as unknown as Linha[];

  const rep: Reputation = { asOwner: vazio(), asRenter: vazio(), overall: vazio() };
  const alvo = (kind: Linha['kind']) => (kind === 'renter_to_space' ? rep.asOwner : rep.asRenter);

  for (const l of linhas) {
    if (l.grupo === 0 && l.kind && l.rating) {
      const resumo = alvo(l.kind);
      resumo.distribution[l.rating - 1] = l.n;
      rep.overall.distribution[l.rating - 1] += l.n;
    } else if (l.grupo === 1 && l.kind) {
      const resumo = alvo(l.kind);
      resumo.count = l.n;
      resumo.average = l.n > 0 ? l.media : null;
    } else if (l.grupo === 3) {
      rep.overall.count = l.n;
      rep.overall.average = l.n > 0 ? l.media : null;
    }
  }
  return rep;
});

/**
 * Resumo de várias pessoas de uma vez, num papel só — para listas (ex.:
 * solicitações do proprietário mostrando a reputação de cada interessado)
 * sem uma consulta por linha.
 */
export async function getRatingSummaries(
  userIds: readonly string[],
  kind: 'renter_to_space' | 'owner_to_renter',
): Promise<Map<string, { count: number; average: string | null }>> {
  const unicos = [...new Set(userIds)];
  const mapa = new Map<string, { count: number; average: string | null }>();
  if (unicos.length === 0) return mapa;

  const rows = await db
    .select({
      userId: reviews.reviewedUserId,
      count: sql<number>`count(*)::int`,
      average: sql<string | null>`ROUND(AVG(${reviews.rating})::numeric, 1)::text`,
    })
    .from(reviews)
    .where(and(inArray(reviews.reviewedUserId, unicos), eq(reviews.kind, kind), isNull(reviews.hiddenAt)))
    .groupBy(reviews.reviewedUserId);

  for (const r of rows) mapa.set(r.userId, { count: r.count, average: r.average });
  return mapa;
}

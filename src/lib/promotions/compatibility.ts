import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { spaces } from '@/db/schema';

/**
 * Compatibilidade entre um espaco e a busca em andamento.
 *
 * O pedido fala em "características compatíveis com o perfil/busca do
 * usuário" citando quartos, vagas, casa/apartamento e estado de
 * conservação — campos que este marketplace (espaços ociosos: garagem,
 * depósito, galpão, sala, vaga) não tem, porque não é um app de aluguel
 * residencial. As dimensões reais usadas aqui são as que a busca desta
 * aplicação de fato tem: tipo, cidade, bairro, faixa de preço,
 * disponibilidade agora, e as características (`features`) marcadas no
 * anúncio. Cada uma soma 1 ponto quando a BUSCA pediu aquele critério E o
 * espaço bate com ele — pedir nada numa dimensão não soma nem desconta.
 */
export type CompatibilityContext = {
  type?: string | null;
  cityFilter?: string | null;
  districtFilter?: string | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  availableNow?: boolean;
  featureKeys?: readonly string[];
};

/**
 * Sem nenhum criterio de busca (navegação livre, sem filtro nenhum), não
 * há contra o que medir compatibilidade — a promoção volta a valer sem
 * porta de elegibilidade, mesmo comportamento de antes desta regra.
 */
export function hasSearchContext(ctx: CompatibilityContext): boolean {
  return Boolean(
    ctx.type
    || ctx.cityFilter
    || ctx.districtFilter
    || ctx.priceMinCents != null
    || ctx.priceMaxCents != null
    || ctx.availableNow
    || ctx.featureKeys?.length,
  );
}

/** Correlacionado à linha de `spaces` da consulta externa (mesmo padrão de `promotionTierExpr`). */
export function compatibilityScoreExpr(ctx: CompatibilityContext): SQL<number> {
  const tipo = ctx.type
    ? sql`(CASE WHEN ${spaces.type}::text = ${ctx.type} THEN 1 ELSE 0 END)`
    : sql`0`;

  const cidade = ctx.cityFilter
    ? sql`(CASE WHEN ${spaces.city} ILIKE ${ctx.cityFilter} THEN 1 ELSE 0 END)`
    : sql`0`;

  const bairro = ctx.districtFilter
    ? sql`(CASE WHEN ${spaces.district} ILIKE ${ctx.districtFilter} THEN 1 ELSE 0 END)`
    : sql`0`;

  const preco = ctx.priceMinCents != null || ctx.priceMaxCents != null
    ? sql`(CASE WHEN
        ${ctx.priceMinCents != null ? sql`${spaces.priceMonthlyCents} >= ${ctx.priceMinCents}` : sql`true`}
        AND
        ${ctx.priceMaxCents != null ? sql`${spaces.priceMonthlyCents} <= ${ctx.priceMaxCents}` : sql`true`}
        THEN 1 ELSE 0 END)`
    : sql`0`;

  const disponivel = ctx.availableNow
    ? sql`(CASE WHEN ${spaces.availableFrom} <= CURRENT_DATE THEN 1 ELSE 0 END)`
    : sql`0`;

  const caracteristicas = ctx.featureKeys?.length
    ? sql`(SELECT count(*)::int FROM space_features sf
        WHERE sf.space_id = ${spaces.id} AND sf.feature_key = ANY(ARRAY[${sql.join(
          ctx.featureKeys.map((k) => sql`${k}`),
          sql`, `,
        )}]))`
    : sql`0`;

  return sql<number>`(${tipo} + ${cidade} + ${bairro} + ${preco} + ${disponivel} + ${caracteristicas})`;
}

/** Mesma cidade da busca — regra própria do Turbo, mais estrita que a pontuação geral. */
export function sameCityAsSearchExpr(ctx: CompatibilityContext): SQL<boolean> {
  if (!ctx.cityFilter) return sql<boolean>`false`;
  return sql<boolean>`(${spaces.city} ILIKE ${ctx.cityFilter})`;
}

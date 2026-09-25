/**
 * Pontuação de compatibilidade entre um espaço recém-publicado e o padrão de
 * favoritos de uma pessoa (Fase 18.3 — "novo espaço compatível").
 *
 * Puro, sem banco: recebe o padrão já agregado (ver
 * `listFavoritePatternsForType` em favorites/queries.ts) e o espaço novo, e
 * devolve um número de 0 a 100. Tipo e cidade já são exigidos como
 * igualdade exata em quem monta o `FavoritePattern` (é o portão, não
 * pontuação) — aqui só entram as dimensões que admitem grau: preço e
 * características.
 *
 * Bedroom/vaga count do pedido original não existe neste marketplace (não é
 * aluguel residencial) — mesma constatação já registrada em
 * `promotions/compatibility.ts` para a busca "Recomendados para você".
 */

export type FavoritePatternForType = {
  userId: string;
  /** Menor e maior preço entre os espaços que a pessoa favoritou deste tipo+cidade. */
  minPriceCents: number;
  maxPriceCents: number;
  /** União das características desses espaços favoritados. */
  featureKeys: string[];
};

export type NewSpaceForCompatibility = {
  priceMonthlyCents: number;
  featureKeys: string[];
};

const PRICE_WEIGHT = 70;
const FEATURE_WEIGHT = 30;

/** Metade da banda de preço nunca fica mais estreita que 15% do centro — cobre o caso de 1 favorito só. */
const MIN_HALF_WIDTH_FRACTION = 0.15;
/** Além da banda observada, ainda há tolerância até 60% a mais antes de zerar. */
const TOLERANCE_MULTIPLIER = 1.6;

/**
 * 100 quando o preço cai dentro da faixa que a pessoa já demonstrou
 * aceitar (com folga), decaindo linearmente até 0 quanto mais longe.
 */
function priceScore(pattern: FavoritePatternForType, newPriceCents: number): number {
  const midpoint = (pattern.minPriceCents + pattern.maxPriceCents) / 2;
  const observedHalfWidth = (pattern.maxPriceCents - pattern.minPriceCents) / 2;
  const halfWidth = Math.max(observedHalfWidth, midpoint * MIN_HALF_WIDTH_FRACTION);
  const tolerantHalfWidth = halfWidth * TOLERANCE_MULTIPLIER;

  const distance = Math.abs(newPriceCents - midpoint);
  if (distance <= halfWidth) return 100;
  if (distance >= tolerantHalfWidth) return 0;

  const fracao = (tolerantHalfWidth - distance) / (tolerantHalfWidth - halfWidth);
  return Math.round(fracao * 100);
}

/** % das características que a pessoa procura (nos favoritos) que o espaço novo também tem. */
function featureScore(pattern: FavoritePatternForType, newSpace: NewSpaceForCompatibility): number {
  if (pattern.featureKeys.length === 0) return 100; // sem dado, nao penaliza
  const novasChaves = new Set(newSpace.featureKeys);
  const sobreposicao = pattern.featureKeys.filter((k) => novasChaves.has(k)).length;
  return Math.round((sobreposicao / pattern.featureKeys.length) * 100);
}

export const COMPATIBILITY_THRESHOLD = 80;

export function computeCompatibilityScore(
  pattern: FavoritePatternForType,
  newSpace: NewSpaceForCompatibility,
): number {
  const preco = priceScore(pattern, newSpace.priceMonthlyCents);
  const features = featureScore(pattern, newSpace);
  return Math.round((preco * PRICE_WEIGHT + features * FEATURE_WEIGHT) / 100);
}

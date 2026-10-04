import type { SpaceTypeKey } from './types';

/**
 * "Espaços semelhantes" (Fase 23) — parte pura: quais tipos contam como
 * parecidos e como ordenar os candidatos. Critérios reais do anúncio (tipo,
 * região/distância, faixa de preço, características), nunca aleatório.
 *
 * A distância é sempre entre pontos APROXIMADOS (os mesmos do mapa
 * público) — nada aqui usa o endereço exato.
 */

/** Tipos que servem para a mesma necessidade. O próprio tipo vale mais. */
export const RELATED_TYPES: Record<SpaceTypeKey, readonly SpaceTypeKey[]> = {
  vaga_carro: ['garagem', 'estacionamento'],
  vaga_moto: ['vaga_carro', 'garagem', 'estacionamento'],
  estacionamento: ['vaga_carro', 'garagem'],
  garagem: ['vaga_carro', 'estacionamento'],
  deposito: ['galpao', 'quarto', 'garagem'],
  galpao: ['deposito', 'terreno'],
  sala: ['escritorio', 'loja'],
  escritorio: ['sala'],
  loja: ['sala'],
  oficina: ['galpao', 'garagem'],
  terreno: ['galpao'],
  espaco_eventos: ['area_lazer'],
  area_lazer: ['espaco_eventos', 'terreno'],
  quarto: ['deposito'],
  outro: [],
};

/** Até onde procurar, e a faixa de preço aceita (em relação ao preço do anúncio). */
export const SIMILAR_LIMITS = {
  maxDistanceMeters: 25_000,
  /** 50% a 160% do preço do anúncio (em pontos-base, conta só com inteiros). */
  minPriceBps: 5_000,
  maxPriceBps: 16_000,
} as const;

export type SimilarBase = {
  type: string;
  /** NULL enquanto o anúncio não tem valor mensal definido (rascunho). */
  priceMonthlyCents: number | null;
  featureKeys: readonly string[];
  city: string | null;
  district: string | null;
};

export type SimilarCandidate = SimilarBase & {
  /** Null quando o anúncio base não tem ponto no mapa. */
  distanceMeters: number | null;
};

export function similarTypes(type: string): SpaceTypeKey[] {
  const rel = RELATED_TYPES[type as SpaceTypeKey];
  return rel ? [type as SpaceTypeKey, ...rel] : [type as SpaceTypeKey];
}

function mesmoTexto(a: string | null, b: string | null): boolean {
  return Boolean(a && b && a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0);
}

/**
 * Pontua um candidato (0–100) e diz, em palavras, por que ele é parecido.
 * Pesos fixos: tipo 30, proximidade 30, preço 20, características 20.
 */
export function similarityScore(base: SimilarBase, c: SimilarCandidate): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (c.type === base.type) {
    score += 30;
    reasons.push('Mesmo tipo');
  } else if (similarTypes(base.type).includes(c.type as SpaceTypeKey)) {
    score += 15;
    reasons.push('Tipo parecido');
  }

  if (c.distanceMeters != null) {
    // A distância em si já aparece no card ("≈ 300 m"); aqui só pontua.
    score += 30 * Math.max(0, 1 - c.distanceMeters / SIMILAR_LIMITS.maxDistanceMeters);
  } else if (mesmoTexto(c.district, base.district) && mesmoTexto(c.city, base.city)) {
    score += 20;
    reasons.push('No mesmo bairro');
  } else if (mesmoTexto(c.city, base.city)) {
    score += 10;
    reasons.push('Na mesma cidade');
  }

  // Preço só entra na conta quando os dois anúncios têm valor mensal definido.
  if (base.priceMonthlyCents != null && c.priceMonthlyCents != null) {
    const diferenca = (c.priceMonthlyCents - base.priceMonthlyCents) / base.priceMonthlyCents;
    score += 20 * Math.max(0, 1 - Math.abs(diferenca) / 0.5);
    if (Math.abs(diferenca) <= 0.15) reasons.push('Preço parecido');
    else if (diferenca < 0) reasons.push('Mais em conta');
  }

  if (base.featureKeys.length > 0) {
    const comuns = c.featureKeys.filter((k) => base.featureKeys.includes(k)).length;
    score += (20 * comuns) / base.featureKeys.length;
    if (comuns > 0) reasons.push(comuns === 1 ? '1 característica em comum' : `${comuns} características em comum`);
  }

  return { score: Math.round(score * 10) / 10, reasons };
}

/** Ordena do mais parecido ao menos; empate vai para o mais perto. */
export function rankSimilar<T extends SimilarCandidate>(base: SimilarBase, candidates: readonly T[], limit: number): (T & { reasons: string[] })[] {
  return candidates
    .map((c) => ({ c, ...similarityScore(base, c) }))
    .sort((a, b) => b.score - a.score || (a.c.distanceMeters ?? Infinity) - (b.c.distanceMeters ?? Infinity))
    .slice(0, limit)
    .map(({ c, reasons }) => ({ ...c, reasons }));
}

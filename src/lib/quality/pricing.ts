/**
 * Sugestão de valor de aluguel (Fase 17) — deriva do score já calculado em
 * `scoring.ts`, sem nenhuma chamada de IA nova: é aritmética sobre
 * comparáveis reais (outros anúncios publicados) e sobre a classificação
 * já obtida.
 *
 * É DINHEIRO — vale a mesma regra inegociável de `money.ts`: inteiro em
 * centavos, nunca float. As multiplicações por fator (score/extras) usam
 * basis points e arredondamento em inteiro, na mesma ordem que o CHECK do
 * banco reconfere (`sqa_price_ideal_matches_formula` em
 * `src/db/schema/quality.ts`) — a ordem importa tanto quanto o valor.
 *
 * Deliberadamente SEM o "micro-ajuste por rua" do pedido original
 * (+-5% por logradouro mais/menos valorizado): não existe dado real de
 * valorização por rua neste marketplace, e inventar um número aqui seria
 * exatamente o tipo de coisa que este projeto nunca faz.
 */
import type { QualityClassification } from './scoring';

export type PriceComparable = { priceMonthlyCents: number; sizeM2: number };

export type PriceSuggestionInput = {
  comparables: PriceComparable[];
  /** Metragem deste anúncio — filtra comparáveis a +-20%. Sem filtro de tamanho se for null (poucos anúncios preenchem). */
  thisSizeM2: number | null;
  classification: QualityClassification;
  /** 0-10, o mesmo extrasScore já calculado em scoring.ts — reaproveitado, não recalculado. */
  extrasScore: number;
};

export type PriceSuggestion = {
  comparablesCount: number;
  lowConfidence: boolean;
  baseCents: number | null;
  scoreFactorBps: number | null;
  extrasFactorBps: number | null;
  idealCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  marketWarning: 'acima_da_media' | 'abaixo_da_media' | null;
};

const MIN_COMPARABLES_FOR_CONFIDENCE = 5;
const SIZE_TOLERANCE = 0.2;

const SCORE_FACTOR_BPS: Record<QualityClassification, number> = {
  economico: 7000,
  medio: 10000,
  alto_padrao: 12000,
  luxo: 15000,
};

/** `cents × bps / 10000`, arredondado — mesma ideia de `applyBps` em money.ts. */
function applyBpsToCents(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 10000 (extrasScore=0) a 11500 (extrasScore=10) — mesma fórmula que o CHECK `sqa_price_extras_factor_matches_score` refaz. */
function extrasFactorBpsFor(extrasScore: number): number {
  const hundredths = Math.round(extrasScore * 100);
  return 10_000 + Math.round((hundredths * 3) / 2);
}

export function computePriceSuggestion(input: PriceSuggestionInput): PriceSuggestion {
  const pool =
    input.thisSizeM2 != null && input.thisSizeM2 > 0
      ? input.comparables.filter(
          (c) => c.sizeM2 >= input.thisSizeM2! * (1 - SIZE_TOLERANCE) && c.sizeM2 <= input.thisSizeM2! * (1 + SIZE_TOLERANCE),
        )
      : input.comparables;

  const comparablesCount = pool.length;
  const lowConfidence = comparablesCount < MIN_COMPARABLES_FOR_CONFIDENCE;

  if (comparablesCount === 0) {
    return {
      comparablesCount,
      lowConfidence: true,
      baseCents: null,
      scoreFactorBps: null,
      extrasFactorBps: null,
      idealCents: null,
      minCents: null,
      maxCents: null,
      marketWarning: null,
    };
  }

  const baseCents = Math.round(median(pool.map((c) => c.priceMonthlyCents)));
  const scoreFactorBps = SCORE_FACTOR_BPS[input.classification];
  const extrasFactorBps = extrasFactorBpsFor(input.extrasScore);

  const idealCents = applyBpsToCents(applyBpsToCents(baseCents, scoreFactorBps), extrasFactorBps);
  const minCents = applyBpsToCents(idealCents, 9_000);
  const maxCents = applyBpsToCents(idealCents, 11_000);

  let marketWarning: PriceSuggestion['marketWarning'] = null;
  if (idealCents * 10_000 > baseCents * 15_000) marketWarning = 'acima_da_media';
  else if (idealCents * 10_000 < baseCents * 7_000) marketWarning = 'abaixo_da_media';

  return {
    comparablesCount,
    lowConfidence,
    baseCents,
    scoreFactorBps,
    extrasFactorBps,
    idealCents,
    minCents,
    maxCents,
    marketWarning,
  };
}

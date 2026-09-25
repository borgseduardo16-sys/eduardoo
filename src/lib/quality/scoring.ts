/**
 * Motor de classificação de padrão do espaço (Fase 16).
 *
 * Modulo puro — sem banco, sem rede, testavel isolado (mesmo espirito de
 * money.ts). Cada ingrediente (leitura de foto pela IA, anuncios
 * comparaveis, contagem de caracteristicas) e coletado pela action e
 * passado aqui ja pronto; esta funcao so faz a conta.
 *
 * Formula (adaptada do pedido original — "quartos"/"banheiros" nao existem
 * neste marketplace de espacos ociosos, entao Estrutura/Extras usam o que
 * de fato existe no anuncio: metragem, pe-direito e o catalogo de
 * caracteristicas ja usado em toda a base):
 *
 *   baseScore  = fotos*0.45 + localizacao*0.25 + estrutura*0.15 + extras*0.15
 *   finalScore = clamp(0, 10, baseScore * fatorConservacao * fatorIdade * fatorReforma)
 *
 * O banco reconfere essa mesma aritmetica via CHECK
 * (`sqa_base_score_matches_components` / `sqa_final_score_matches_formula`
 * em `src/db/schema/quality.ts`) — o que sai daqui precisa bater exatamente
 * com o que o Postgres aceita.
 */

export type ConservationState = 'ruim' | 'regular' | 'bom' | 'muito_bom' | 'excelente';
export type QualityClassification = 'economico' | 'medio' | 'alto_padrao' | 'luxo';

export class InvalidAssessmentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssessmentInputError';
  }
}

const CONSERVATION_FACTOR: Record<ConservationState, number> = {
  ruim: 0.8,
  regular: 0.9,
  bom: 1.0,
  muito_bom: 1.05,
  excelente: 1.1,
};

const CONSERVATION_RANK: Record<ConservationState, number> = {
  ruim: 0,
  regular: 1,
  bom: 2,
  muito_bom: 3,
  excelente: 4,
};

export const CONSERVATION_LABEL: Record<ConservationState, string> = {
  ruim: 'ruim',
  regular: 'regular',
  bom: 'bom',
  muito_bom: 'muito bom',
  excelente: 'excelente',
};

const CLASSIFICATION_LABEL: Record<QualityClassification, string> = {
  economico: 'Econômico',
  medio: 'Médio',
  alto_padrao: 'Alto padrão',
  luxo: 'Luxo',
};

function clamp(min: number, max: number, v: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Arredondamento em 2 casas — mesma convenção do ROUND(numeric, 2) do
 * Postgres. NUNCA faça `Math.round(a*0.45 + b*0.25 + ...) / 100` direto:
 * somar floats multiplicados por peso fracionário e só depois escalar por
 * 100 pode empurrar um valor que deveria cair exatamente em X,XX5 pro lado
 * errado (ex.: o resultado matemático 2.385 vira 238.49999999999997 em
 * ponto flutuante, arredondando pra 2.38 em vez de 2.39 — confirmado batendo
 * a saída deste módulo contra os CHECKs do banco antes desta versão).
 *
 * A correção é a mesma ideia de `money.ts`: fazer a soma em INTEIROS
 * (centésimos), nunca em float fracionário, e só voltar a ponto flutuante
 * na divisão final — cada termo já entra arredondado a centésimos
 * (`Math.round(v*100)`, seguro porque v não é ele mesmo uma fronteira de
 * arredondamento) multiplicado por um peso em centésimos (inteiro exato).
 */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** `v` escalado e arredondado a um inteiro de centésimos — seguro quando `v` não é, ele mesmo, uma fronteira de arredondamento. */
function toHundredths(v: number): number {
  return Math.round(v * 100);
}

/**
 * Soma ponderada arredondada em 2 casas, feita inteiramente em inteiros de
 * centésimos (ver nota em `round2`). `weightHundredths` é o peso em
 * centésimos (0,45 → 45); `offsetHundredths` cobre termos que já são um
 * inteiro exato de centésimos (ex.: uma penalidade `contagem * 40`).
 */
function weightedRound2(terms: Array<{ value: number; weightHundredths: number }>, offsetHundredths = 0): number {
  const scaledSum = terms.reduce((acc, t) => acc + toHundredths(t.value) * t.weightHundredths, offsetHundredths);
  return Math.round(scaledSum / 100) / 100;
}

/** Produto de fatores de 2 casas (ex.: base × conservação × idade × reforma), arredondado em 2 casas com a mesma segurança. */
function productRound2(factors: number[]): number {
  const scaled = factors.reduce((acc, f) => acc * toHundredths(f), 1);
  const divisor = 100 ** (factors.length - 1);
  return Math.round(scaled / divisor) / 100;
}

function assertScore(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw new InvalidAssessmentInputError(`${field} precisa estar entre 0 e 10 (veio ${value}).`);
  }
}

// ---------------------------------------------------------------------------
// Fotos (45%) — vem da leitura de IA em src/lib/quality/vision.ts
// ---------------------------------------------------------------------------

export type PhotosScoreInput = {
  acabamento: number;
  modernidade: number;
  sinaisDeDesgasteCount: number;
};

/**
 * Acabamento pesa mais que modernidade (o que importa num deposito/galpao e
 * o estado real, nao "estilo"). Cada sinal de desgaste desconta 0,4, ate um
 * teto de 5 sinais — sinal de desgaste numero 20 nao deveria contar mais
 * que o quinto.
 */
export function computePhotosScore(input: PhotosScoreInput): number {
  assertScore(input.acabamento, 'acabamento');
  assertScore(input.modernidade, 'modernidade');
  const penaltyCount = clamp(0, 5, input.sinaisDeDesgasteCount);
  const raw = weightedRound2(
    [
      { value: input.acabamento, weightHundredths: 60 },
      { value: input.modernidade, weightHundredths: 40 },
    ],
    -penaltyCount * 40, // cada sinal desconta 0,40 — contagem já é inteira, sem risco de arredondamento
  );
  return clamp(0, 10, raw);
}

// ---------------------------------------------------------------------------
// Localização (25%) — sem API de mercado imobiliário (nao existe uma real
// para este tipo de espaço), usa comparaveis REAIS ja publicados na mesma
// cidade e do mesmo tipo. O preco por m² deste anuncio relativo a mediana
// dos comparaveis funciona como um proxy honesto de "padrao da regiao /
// coerencia com o imovel" — nunca um numero inventado pela IA.
// ---------------------------------------------------------------------------

export type LocationComparable = { priceMonthlyCents: number; sizeM2: number };

export type LocationScoreInput = {
  /** Preço por m² deste anúncio. null quando o anúncio não tem metragem informada. */
  thisPricePerM2: number | null;
  /** Outros anúncios PUBLICADOS do mesmo tipo, na mesma cidade (nunca inclui o próprio). */
  comparables: LocationComparable[];
};

const MIN_COMPARABLES = 3;

export function computeLocationScore(input: LocationScoreInput): { score: number; note: string } {
  const perM2 = input.comparables
    .filter((c) => c.sizeM2 > 0 && c.priceMonthlyCents > 0)
    .map((c) => c.priceMonthlyCents / c.sizeM2);

  if (perM2.length < MIN_COMPARABLES || input.thisPricePerM2 == null) {
    return {
      score: 5,
      note: 'dados insuficientes de anúncios comparáveis nesta cidade — nota neutra (5,0)',
    };
  }

  const sorted = [...perM2].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  const ratio = median > 0 ? input.thisPricePerM2 / median : 1;
  const score = round2(clamp(0, 10, 5 + (ratio - 1) * 10));
  return {
    score,
    note: `comparado a ${perM2.length} anúncio(s) do mesmo tipo, na mesma cidade`,
  };
}

// ---------------------------------------------------------------------------
// Estrutura (15%) — metragem/pé-direito + características de categoria
// "estrutura" (coberto, iluminação, energia, água, banheiro, seco e
// ventilado, piso de concreto, mobiliado).
// ---------------------------------------------------------------------------

export type StructureScoreInput = {
  estruturaFeatureCount: number;
  /** Quantas características de categoria "estrutura" se aplicam a este tipo de espaço. */
  estruturaFeatureTotal: number;
  ceilingHeightM: number | null;
};

export function computeStructureScore(input: StructureScoreInput): number {
  const featurePoints =
    input.estruturaFeatureTotal > 0
      ? (clamp(0, input.estruturaFeatureTotal, input.estruturaFeatureCount) / input.estruturaFeatureTotal) * 8
      : 4; // nenhuma característica de estrutura se aplica a este tipo — nota neutra nesta parte
  // Pé-direito >= 2m não soma nem penaliza; acima disso, até +2 pontos (4m ou mais).
  const ceilingPoints = input.ceilingHeightM != null ? clamp(0, 2, (input.ceilingHeightM - 2) * 1) : 1;
  return round2(clamp(0, 10, featurePoints + ceilingPoints));
}

// ---------------------------------------------------------------------------
// Extras (15%) — mesmo catálogo de características, categorias
// "seguranca"/"acesso"/"veiculo", normalizado pelo que de fato se aplica ao
// tipo do espaço (appliesTo da tabela `features`).
// ---------------------------------------------------------------------------

export type ExtrasScoreInput = {
  selectedApplicableCount: number;
  applicableCount: number;
};

export function computeExtrasScore(input: ExtrasScoreInput): number {
  if (input.applicableCount <= 0) return 5;
  return round2(clamp(0, 10, (clamp(0, input.applicableCount, input.selectedApplicableCount) / input.applicableCount) * 10));
}

// ---------------------------------------------------------------------------
// Fatores (conservação/idade/reforma) e validação IA vs proprietário
// ---------------------------------------------------------------------------

/** Diferença de 2+ degraus na escala (ex.: "excelente" vs "ruim") é divergência real, não opinião. */
const DIVERGENCE_THRESHOLD = 2;

function resolveConservationFactor(
  userState: ConservationState,
  aiState: ConservationState,
): { factor: number; divergent: boolean } {
  const rankDiff = Math.abs(CONSERVATION_RANK[userState] - CONSERVATION_RANK[aiState]);
  if (rankDiff >= DIVERGENCE_THRESHOLD) {
    // A IA discorda o bastante do dono para o sistema não confiar cegamente
    // na autodeclaração — usa o fator do que a IA viu nas fotos.
    return { factor: CONSERVATION_FACTOR[aiState], divergent: true };
  }
  return { factor: CONSERVATION_FACTOR[userState], divergent: false };
}

export function computeAgeFactor(ageYears: number): number {
  if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 200) {
    throw new InvalidAssessmentInputError(`Idade do espaço inválida: ${ageYears}.`);
  }
  if (ageYears <= 5) return 1.1;
  if (ageYears <= 15) return 1.0;
  if (ageYears <= 30) return 0.9;
  return 0.8;
}

function classify(finalScore: number): QualityClassification {
  if (finalScore < 4) return 'economico';
  if (finalScore < 7) return 'medio';
  if (finalScore < 9) return 'alto_padrao';
  return 'luxo';
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

export type AiFindingsInput = {
  acabamento: number;
  modernidade: number;
  conservacaoPercebida: ConservationState;
  sinaisDeDesgaste: string[];
  resumo: string;
};

export type ComputeAssessmentInput = {
  conservationState: ConservationState;
  ageYears: number;
  renovatedRecently: boolean;
  aiFindings: AiFindingsInput;
  location: LocationScoreInput;
  structure: StructureScoreInput;
  extras: ExtrasScoreInput;
};

export type ComputedAssessment = {
  photosScore: number;
  locationScore: number;
  structureScore: number;
  extrasScore: number;
  baseScore: number;
  conservationFactor: number;
  ageFactor: number;
  renovationFactor: number;
  finalScore: number;
  classification: QualityClassification;
  userAiDivergent: boolean;
  explanation: string;
};

function composeExplanation(params: {
  classification: QualityClassification;
  finalScore: number;
  aiFindings: AiFindingsInput;
  userState: ConservationState;
  divergent: boolean;
  ageYears: number;
  ageFactor: number;
  renovatedRecently: boolean;
  locationNote: string;
}): string {
  const { classification, finalScore, aiFindings, userState, divergent, ageYears, ageFactor, renovatedRecently, locationNote } = params;
  const parts: string[] = [];

  parts.push(
    `Classificado como ${CLASSIFICATION_LABEL[classification]} (nota ${finalScore.toFixed(2)} de 10).`,
  );
  parts.push(aiFindings.resumo);
  if (aiFindings.sinaisDeDesgaste.length > 0) {
    parts.push(`Sinais de desgaste identificados nas fotos: ${aiFindings.sinaisDeDesgaste.join('; ')}.`);
  }
  if (divergent) {
    parts.push(
      `O estado de conservação informado ("${CONSERVATION_LABEL[userState]}") diverge bastante do que a IA percebeu nas fotos ("${CONSERVATION_LABEL[aiFindings.conservacaoPercebida]}") — foi usado o fator mais cauteloso dos dois.`,
    );
  } else {
    parts.push(`Estado de conservação considerado: ${CONSERVATION_LABEL[userState]}.`);
  }
  parts.push(
    `Idade informada: ${ageYears} ano(s), o que ${ageFactor > 1 ? 'aumenta' : ageFactor < 1 ? 'reduz' : 'não altera'} a nota final.`,
  );
  if (renovatedRecently) {
    parts.push('Reforma recente declarada, o que aumenta a nota final em 10%.');
  }
  parts.push(`Localização: ${locationNote}.`);

  return parts.join(' ');
}

export function computeQualityAssessment(input: ComputeAssessmentInput): ComputedAssessment {
  const photosScore = computePhotosScore({
    acabamento: input.aiFindings.acabamento,
    modernidade: input.aiFindings.modernidade,
    sinaisDeDesgasteCount: input.aiFindings.sinaisDeDesgaste.length,
  });
  const { score: locationScore, note: locationNote } = computeLocationScore(input.location);
  const structureScore = computeStructureScore(input.structure);
  const extrasScore = computeExtrasScore(input.extras);

  // weightedRound2, não `photos*0.45 + ... ` direto — ver a nota em round2().
  // O CHECK `sqa_base_score_matches_components` no banco refaz esta MESMA
  // conta a partir das colunas já gravadas; precisa bater exatamente.
  const baseScore = weightedRound2([
    { value: photosScore, weightHundredths: 45 },
    { value: locationScore, weightHundredths: 25 },
    { value: structureScore, weightHundredths: 15 },
    { value: extrasScore, weightHundredths: 15 },
  ]);

  const { factor: conservationFactor, divergent: userAiDivergent } = resolveConservationFactor(
    input.conservationState,
    input.aiFindings.conservacaoPercebida,
  );
  const ageFactorValue = computeAgeFactor(input.ageYears);
  const renovationFactor = input.renovatedRecently ? 1.1 : 1.0;

  // productRound2, pelo mesmo motivo — o CHECK `sqa_final_score_matches_formula` refaz o produto.
  const finalScore = clamp(0, 10, productRound2([baseScore, conservationFactor, ageFactorValue, renovationFactor]));
  const classification = classify(finalScore);

  const explanation = composeExplanation({
    classification,
    finalScore,
    aiFindings: input.aiFindings,
    userState: input.conservationState,
    divergent: userAiDivergent,
    ageYears: input.ageYears,
    ageFactor: ageFactorValue,
    renovatedRecently: input.renovatedRecently,
    locationNote,
  });

  return {
    photosScore,
    locationScore,
    structureScore,
    extrasScore,
    baseScore,
    conservationFactor,
    ageFactor: ageFactorValue,
    renovationFactor,
    finalScore,
    classification,
    userAiDivergent,
    explanation,
  };
}

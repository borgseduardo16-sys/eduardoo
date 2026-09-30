import { z } from 'zod';
import { parseBRLToCents, addToleranceCents, InvalidAmountError } from '@/lib/money';
import type { SpaceTypeKey } from '@/lib/spaces/types';
import { normalizeSameLength } from './rules';
import {
  emptyInterpretation,
  NEED_FEATURE_KEYS,
  NEED_LIMITS,
  NEED_SPACE_TYPES,
  PURPOSES,
  UNSUPPORTED_NEEDS,
  VEHICLE_REQUIRED_FEATURE,
  VEHICLES,
  type NeedFeatureKey,
  type NeedInterpretation,
} from './vocabulary';

/**
 * Formato que a IA precisa devolver na busca por necessidade (Fase 23).
 *
 * Tudo que vira filtro é ENUM fechado: a IA escolhe entre os tipos,
 * características e veículos que existem, e não consegue criar outro. Os
 * campos livres (local, valores, datas) passam por `fromAiOutput`, que
 * confere cada um contra o texto que a pessoa escreveu — a IA não pode
 * "achar" um bairro ou um orçamento que não estava lá.
 *
 * Módulo puro: sem SDK, sem rede. O pedido à API mora em `ai.ts`.
 */
export const NeedAiSchema = z.object({
  tipos: z
    .array(z.enum(NEED_SPACE_TYPES))
    .describe('Tipos de espaço que atendem ao pedido, do mais adequado ao menos. Vazio se o texto não permitir saber.'),
  veiculo: z.enum(VEHICLES).nullable().describe('Veículo que a pessoa quer guardar, se houver.'),
  finalidade: z.enum(PURPOSES).nullable().describe('Para que a pessoa quer o espaço, se der para saber.'),
  caracteristicas: z
    .array(z.enum(NEED_FEATURE_KEYS))
    .describe('Somente características que a pessoa PEDIU. Nunca acrescente uma que ela não mencionou.'),
  local: z
    .string()
    .nullable()
    .describe('Bairro, cidade ou ponto de referência exatamente como escrito no texto. Null se não houver.'),
  perto_de_mim: z.boolean().describe('true se a pessoa pediu algo perto de onde ela está agora.'),
  preco_maximo: z
    .string()
    .nullable()
    .describe('Valor máximo por mês em reais, só dígitos e vírgula decimal (ex.: "300" ou "299,90"). Null se não houver.'),
  preco_minimo: z.string().nullable().describe('Valor mínimo por mês em reais, mesmo formato. Quase sempre null.'),
  preco_aproximado: z.boolean().describe('true se o valor veio com "cerca de", "uns", "por volta de".'),
  area_minima_m2: z.number().int().nullable().describe('Área mínima em m², se a pessoa informou. Null se não.'),
  data_inicio: z
    .string()
    .nullable()
    .describe('Quando a pessoa quer começar, no formato AAAA-MM-DD. Null se não disse.'),
  comecar_agora: z.boolean().describe('true se a pessoa precisa para já, hoje ou com urgência.'),
  duracao_meses: z.number().int().nullable().describe('Por quantos meses, se disse. Null se não.'),
  barato: z.boolean().describe('true se a pessoa pediu algo barato ou em conta.'),
  nao_suportado: z
    .array(z.enum(UNSUPPORTED_NEEDS))
    .describe('Pedidos que os anúncios não informam (internet, acessibilidade, animais, ar-condicionado).'),
});

export type NeedAiOutput = z.infer<typeof NeedAiSchema>;

function reaisParaCentavos(valor: string | null): number | null {
  if (!valor) return null;
  try {
    const cents = parseBRLToCents(valor);
    if (cents < NEED_LIMITS.minPriceCents || cents > NEED_LIMITS.maxPriceCents) return null;
    return cents;
  } catch (err) {
    if (err instanceof InvalidAmountError) return null;
    throw err;
  }
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Toda palavra (3+ letras) do local precisa estar no texto original. */
function localEstaNoTexto(local: string, textoNorm: string): boolean {
  const palavras = normalizeSameLength(local).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
  if (palavras.length === 0) return false;
  return palavras.every((p) => new RegExp(`\\b${p}\\b`).test(textoNorm));
}

/**
 * Converte e VALIDA a saída da IA. O que não passar na validação é
 * descartado (vira null), nunca "consertado" para parecer certo.
 */
export function fromAiOutput(raw: NeedAiOutput, ctx: { today: string; text: string }): NeedInterpretation {
  const out = emptyInterpretation();
  const textoNorm = normalizeSameLength(ctx.text);
  const temDigito = /\d/.test(ctx.text);

  out.types = [...new Set(raw.tipos)].slice(0, 4) as SpaceTypeKey[];
  out.vehicle = raw.veiculo;
  out.purpose = raw.finalidade;
  const features = new Set<NeedFeatureKey>(raw.caracteristicas);
  if (raw.veiculo) {
    const exigida = VEHICLE_REQUIRED_FEATURE[raw.veiculo];
    if (exigida) features.add(exigida);
  }
  out.featureKeys = [...features].slice(0, 8);

  const local = raw.local?.trim().slice(0, 80) ?? null;
  out.location = local && localEstaNoTexto(local, textoNorm) ? local : null;
  out.nearMe = raw.perto_de_mim;

  // Número só vale se a pessoa escreveu algum número.
  if (temDigito) {
    const max = reaisParaCentavos(raw.preco_maximo);
    out.priceMaxCents = max != null && raw.preco_aproximado
      ? addToleranceCents(max, NEED_LIMITS.approxToleranceBps)
      : max;
    out.priceApprox = out.priceMaxCents != null && raw.preco_aproximado;
    out.priceMinCents = reaisParaCentavos(raw.preco_minimo);
    if (out.priceMinCents != null && out.priceMaxCents != null && out.priceMinCents > out.priceMaxCents) {
      out.priceMinCents = null;
    }
    const area = raw.area_minima_m2;
    out.sizeMinM2 = area != null && area > 0 && area <= NEED_LIMITS.maxSizeM2 ? area : null;
  }

  const data = raw.data_inicio;
  const limite = addDays(ctx.today, NEED_LIMITS.maxStartDays);
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    if (data === ctx.today) out.startNow = true;
    else if (data > ctx.today && data <= limite) out.startDate = data;
  }
  out.startNow ||= raw.comecar_agora;

  const duracao = raw.duracao_meses;
  out.durationMonths = duracao != null && duracao >= 1 && duracao <= NEED_LIMITS.maxDurationMonths ? duracao : null;
  out.cheap = raw.barato;
  out.unsupported = [...new Set(raw.nao_suportado)];
  return out;
}

/**
 * Junta a interpretação por regras com a da IA.
 *
 * - Tipo, veículo e finalidade: a IA leu a frase inteira, então manda — as
 *   regras só preenchem o que ela deixou vazio.
 * - Números, datas e local: as regras mandam quando acharam algo (leitura
 *   determinística de "R$ 300" é mais confiável que a de um modelo); a IA
 *   só completa o que as regras não acharam.
 * - Características e "não suportado": união.
 */
export function mergeInterpretations(rules: NeedInterpretation, ai: NeedInterpretation): NeedInterpretation {
  const priceFromRules = rules.priceMaxCents != null || rules.priceMinCents != null;
  return {
    types: ai.types.length > 0 ? ai.types : rules.types,
    vehicle: ai.vehicle ?? rules.vehicle,
    purpose: ai.purpose ?? rules.purpose,
    featureKeys: [...new Set([...rules.featureKeys, ...ai.featureKeys])],
    location: rules.location ?? ai.location,
    nearMe: rules.nearMe || ai.nearMe,
    priceMinCents: priceFromRules ? rules.priceMinCents : ai.priceMinCents,
    priceMaxCents: priceFromRules ? rules.priceMaxCents : ai.priceMaxCents,
    priceApprox: priceFromRules ? rules.priceApprox : ai.priceApprox,
    sizeMinM2: rules.sizeMinM2 ?? ai.sizeMinM2,
    radiusMeters: rules.radiusMeters,
    startDate: rules.startDate ?? (rules.startNow ? null : ai.startDate),
    startNow: rules.startNow || (!rules.startDate && ai.startNow),
    durationMonths: rules.durationMonths ?? ai.durationMonths,
    cheap: rules.cheap || ai.cheap,
    unsupported: [...new Set([...rules.unsupported, ...ai.unsupported])],
  };
}

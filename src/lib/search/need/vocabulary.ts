import type { SpaceTypeKey } from '@/lib/spaces/types';

/**
 * Vocabulário da busca por necessidade (Fase 23).
 *
 * Módulo puro: sem banco, sem rede. É o mesmo dicionário para o intérprete
 * por regras e para validar o que a IA devolver — a IA só pode escolher
 * valores que existem aqui, nunca criar um tipo, característica ou veículo
 * novo.
 */

export const VEHICLES = ['moto', 'carro', 'utilitario', 'caminhao', 'bicicleta', 'barco', 'trailer'] as const;
export type Vehicle = (typeof VEHICLES)[number];

export const VEHICLE_LABEL: Record<Vehicle, string> = {
  moto: 'Moto',
  carro: 'Carro',
  utilitario: 'Van ou utilitário',
  caminhao: 'Caminhão',
  bicicleta: 'Bicicleta',
  barco: 'Barco ou jet ski',
  trailer: 'Trailer ou reboque',
};

export const PURPOSES = ['guardar_veiculo', 'armazenar', 'estoque', 'trabalho', 'comercio', 'oficina'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABEL: Record<Purpose, string> = {
  guardar_veiculo: 'Guardar veículo',
  armazenar: 'Guardar objetos',
  estoque: 'Estoque',
  trabalho: 'Trabalhar ou atender',
  comercio: 'Vender ou abrir negócio',
  oficina: 'Oficina ou produção',
};

/**
 * Pedidos que nenhum anúncio informa hoje. A busca não finge filtrar por
 * eles: mostra que não conseguiu considerar.
 */
export const UNSUPPORTED_NEEDS = ['internet', 'acessibilidade', 'animais', 'ar_condicionado'] as const;
export type UnsupportedNeed = (typeof UNSUPPORTED_NEEDS)[number];

export const UNSUPPORTED_LABEL: Record<UnsupportedNeed, string> = {
  internet: 'internet',
  acessibilidade: 'acessibilidade',
  animais: 'animais',
  ar_condicionado: 'ar-condicionado',
};

/**
 * Chaves do catálogo `features` que a busca pode pedir. O servidor ainda
 * confere contra o catálogo ATIVO do banco antes de usar.
 */
export const NEED_FEATURE_KEYS = [
  'coberto', 'fechado', 'portao', 'acesso_24h', 'camera', 'alarme', 'portaria', 'iluminacao',
  'energia', 'agua', 'banheiro', 'seco_ventilado', 'piso_concreto', 'acesso_carro', 'acesso_moto',
  'acesso_caminhao', 'carga_descarga', 'elevador', 'terreo', 'mobiliado',
] as const;
export type NeedFeatureKey = (typeof NEED_FEATURE_KEYS)[number];

/** Tipos que a busca pode pedir. "Outro" não é pedido de ninguém. */
export const NEED_SPACE_TYPES = [
  'vaga_carro', 'vaga_moto', 'garagem', 'deposito', 'galpao', 'sala', 'escritorio', 'loja', 'terreno', 'quarto',
] as const satisfies readonly SpaceTypeKey[];

/** Onde cada veículo cabe, do mais específico para o mais genérico. */
export const VEHICLE_TYPES: Record<Vehicle, readonly SpaceTypeKey[]> = {
  moto: ['vaga_moto', 'garagem', 'vaga_carro'],
  carro: ['vaga_carro', 'garagem'],
  utilitario: ['garagem', 'vaga_carro', 'galpao', 'terreno'],
  caminhao: ['galpao', 'terreno'],
  bicicleta: ['vaga_moto', 'garagem', 'deposito'],
  barco: ['garagem', 'galpao', 'terreno'],
  trailer: ['garagem', 'galpao', 'terreno'],
};

/** Característica que o veículo exige de verdade (não só "combina"). */
export const VEHICLE_REQUIRED_FEATURE: Partial<Record<Vehicle, NeedFeatureKey>> = {
  caminhao: 'acesso_caminhao',
};

export const PURPOSE_TYPES: Record<Exclude<Purpose, 'guardar_veiculo'>, readonly SpaceTypeKey[]> = {
  armazenar: ['deposito', 'quarto', 'garagem'],
  estoque: ['deposito', 'galpao'],
  trabalho: ['sala', 'escritorio'],
  comercio: ['loja', 'sala'],
  oficina: ['galpao', 'garagem'],
};

/** Resultado da interpretação — só valores da lista acima, nunca texto livre da IA. */
export type NeedInterpretation = {
  /** Vazio = qualquer tipo. */
  types: SpaceTypeKey[];
  vehicle: Vehicle | null;
  purpose: Purpose | null;
  featureKeys: NeedFeatureKey[];
  /** Bairro, cidade ou referência, como a pessoa escreveu (vai para o resolvedor de local). */
  location: string | null;
  nearMe: boolean;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  /** "cerca de R$ 300": o teto já inclui a folga, e a interface diz isso. */
  priceApprox: boolean;
  sizeMinM2: number | null;
  /** Raio pedido ("até 3 km"), em metros. */
  radiusMeters: number | null;
  /** 'AAAA-MM-DD'. Null = sem data pedida. */
  startDate: string | null;
  startNow: boolean;
  /** Informativo: o aluguel é mensal e sem prazo mínimo, então não vira filtro. */
  durationMonths: number | null;
  /** "barato", "em conta" → ordenar pelo menor preço. */
  cheap: boolean;
  unsupported: UnsupportedNeed[];
};

export function emptyInterpretation(): NeedInterpretation {
  return {
    types: [], vehicle: null, purpose: null, featureKeys: [], location: null, nearMe: false,
    priceMinCents: null, priceMaxCents: null, priceApprox: false, sizeMinM2: null, radiusMeters: null,
    startDate: null, startNow: false, durationMonths: null, cheap: false, unsupported: [],
  };
}

/**
 * Algum critério que FILTRA ou ordena? Período e "não dá para filtrar"
 * são só informação — sozinhos, não mudam o resultado.
 */
export function hasFilterCriterion(i: NeedInterpretation): boolean {
  return (
    i.types.length > 0 || i.featureKeys.length > 0 || i.location != null || i.nearMe ||
    i.priceMinCents != null || i.priceMaxCents != null || i.sizeMinM2 != null || i.radiusMeters != null ||
    i.startDate != null || i.startNow || i.cheap
  );
}

/** Limites de sanidade — valor fora disso é descartado, não "corrigido". */
export const NEED_LIMITS = {
  maxTextLength: 300,
  minPriceCents: 1_000,
  maxPriceCents: 100_000_000,
  maxSizeM2: 100_000,
  maxDurationMonths: 60,
  minRadiusMeters: 500,
  maxRadiusMeters: 50_000,
  /** Até quantos dias à frente uma data de início vale. */
  maxStartDays: 365,
  /** Folga de "cerca de R$ X": 10%. */
  approxToleranceBps: 1_000,
} as const;

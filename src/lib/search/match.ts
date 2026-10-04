import { formatBRL } from '@/lib/money';
import { formatDistance } from '@/lib/spaces/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { VEHICLE_LABEL, type Vehicle } from './need/vocabulary';
import { earliestStartDate, type SpaceBlockPublic } from '@/lib/spaces/start-dates';

/**
 * "X% compatível" (Fase 23).
 *
 * Significa SÓ isto: quanto do que a pessoa informou na busca o anúncio
 * atende, pelos dados que o próprio anúncio tem. Não é "melhor espaço", nem
 * confiança, nem bom negócio — e nunca decide quem aparece: a lista de
 * resultados é a mesma com ou sem o número.
 *
 * Regras (documentadas em docs/BUSCA.md §Compatibilidade):
 *
 * - Só entram critérios que a pessoa INFORMOU. Critério não informado não
 *   soma nem desconta. Com menos de 2 critérios o número não aparece — com
 *   um só, "100%" não diria nada.
 * - Pesos: localização 30, tipo 20, preço 20, características 20,
 *   disponibilidade 10, veículo 10, tamanho 10. O percentual é
 *   pontos obtidos ÷ pontos possíveis dos critérios informados.
 * - Arredonda PARA BAIXO: 99,6% aparece como 99%, nunca como 100%.
 *   100% só quando tudo que foi informado bate.
 * - Dado que o anúncio não tem conta como NÃO atendido, e a explicação diz
 *   "não consta no anúncio" — não inventa que o espaço tem, nem que não tem.
 *
 * Módulo puro: o mesmo cálculo roda nos testes.
 */

export const MATCH_WEIGHTS = {
  localizacao: 30,
  tipo: 20,
  preco: 20,
  caracteristicas: 20,
  disponibilidade: 10,
  veiculo: 10,
  tamanho: 10,
} as const;

/** Distância (busca por ponto sem raio): até 2 km vale tudo; de 20 km em diante, nada. */
const DISTANCIA_CHEIA_M = 2_000;
const DISTANCIA_ZERO_M = 20_000;

export const MIN_CRITERIA_TO_SHOW = 2;

export type MatchLocation =
  | { kind: 'district'; district: string; city: string | null }
  | { kind: 'city'; city: string }
  | { kind: 'point'; radiusMeters: number | null };

export type MatchCriteria = {
  types: SpaceTypeKey[];
  vehicle: Vehicle | null;
  location: MatchLocation | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  featureKeys: string[];
  sizeMinM2: number | null;
  /** 'AAAA-MM-DD': quando a pessoa quer começar (hoje, se pediu "agora"). */
  startBy: string | null;
};

export type MatchSpace = {
  type: string;
  district: string | null;
  city: string | null;
  priceMonthlyCents: number | null;
  /** TODAS as características marcadas no anúncio. */
  featureKeys: string[];
  /** `numeric` chega como texto do driver. */
  sizeM2: string | null;
  /** Até o ponto de referência, pela localização APROXIMADA (pública). */
  distanceMeters: number | null;
  /** Primeiro dia em que um aluguel pode começar (já com os bloqueios). Null = sem data. */
  earliestStart: string | null;
};

export type MatchStatus = 'sim' | 'parcial' | 'nao';
export type MatchItem = { status: MatchStatus; text: string };
export type MatchResult = {
  percent: number;
  items: MatchItem[];
  criteriaCount: number;
};

/** Frase de cada característica na explicação ("✓ É coberto"). */
const FRASE_CARACTERISTICA: Record<string, string> = {
  coberto: 'É coberto',
  fechado: 'É fechado ou trancado',
  portao: 'Tem portão',
  acesso_24h: 'Tem acesso 24 horas',
  camera: 'Tem câmera de segurança',
  alarme: 'Tem alarme',
  portaria: 'Tem portaria ou vigilância',
  iluminacao: 'Tem iluminação',
  energia: 'Tem tomada ou energia',
  agua: 'Tem água',
  banheiro: 'Tem banheiro',
  seco_ventilado: 'É seco e ventilado',
  piso_concreto: 'Tem piso de concreto',
  acesso_carro: 'Tem acesso para carro',
  acesso_moto: 'Tem acesso para moto',
  acesso_caminhao: 'Tem acesso para caminhão',
  carga_descarga: 'Tem área de carga e descarga',
  elevador: 'Tem elevador',
  terreo: 'Fica no térreo',
  mobiliado: 'É mobiliado',
};

/** Como o anúncio mostra que aceita o veículo. Veículo sem sinal verificável não entra na conta. */
const SINAL_DO_VEICULO: Partial<Record<Vehicle, { types: string[]; feature: string }>> = {
  moto: { types: ['vaga_moto'], feature: 'acesso_moto' },
  carro: { types: ['vaga_carro'], feature: 'acesso_carro' },
  caminhao: { types: [], feature: 'acesso_caminhao' },
};

function mesmoTexto(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return n(a) === n(b);
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function computeMatch(
  space: MatchSpace,
  c: MatchCriteria,
  featureLabels: Map<string, string>,
): MatchResult | null {
  const items: MatchItem[] = [];
  let pontos = 0;
  let possiveis = 0;
  let criterios = 0;

  const somar = (peso: number, fracao: number, item: MatchItem) => {
    criterios++;
    possiveis += peso;
    pontos += peso * Math.max(0, Math.min(1, fracao));
    items.push(item);
  };

  // Localização
  if (c.location) {
    const loc = c.location;
    if (loc.kind === 'district') {
      const ok = mesmoTexto(space.district, loc.district) && (!loc.city || mesmoTexto(space.city, loc.city));
      somar(MATCH_WEIGHTS.localizacao, ok ? 1 : 0, ok
        ? { status: 'sim', text: `Fica no bairro ${space.district}` }
        : { status: 'nao', text: `Fica em outro bairro${space.district ? ` (${space.district})` : ''}` });
    } else if (loc.kind === 'city') {
      const ok = mesmoTexto(space.city, loc.city);
      somar(MATCH_WEIGHTS.localizacao, ok ? 1 : 0, ok
        ? { status: 'sim', text: `Fica em ${space.city}` }
        : { status: 'nao', text: `Fica em outra cidade${space.city ? ` (${space.city})` : ''}` });
    } else if (space.distanceMeters != null) {
      const d = space.distanceMeters;
      const fracao = loc.radiusMeters != null
        ? (d <= loc.radiusMeters ? 1 : 0)
        : d <= DISTANCIA_CHEIA_M ? 1 : d >= DISTANCIA_ZERO_M ? 0 : (DISTANCIA_ZERO_M - d) / (DISTANCIA_ZERO_M - DISTANCIA_CHEIA_M);
      somar(MATCH_WEIGHTS.localizacao, fracao, {
        status: fracao >= 1 ? 'sim' : fracao > 0 ? 'parcial' : 'nao',
        text: `Fica a cerca de ${formatDistance(d)} do local buscado`,
      });
    }
  }

  // Tipo
  if (c.types.length > 0) {
    const ok = c.types.includes(space.type as SpaceTypeKey);
    const nome = spaceTypeLabel(space.type as SpaceTypeKey);
    somar(MATCH_WEIGHTS.tipo, ok ? 1 : 0, ok
      ? { status: 'sim', text: `É do tipo que você procura (${nome.toLowerCase()})` }
      : { status: 'nao', text: `É ${nome.toLowerCase()}, não ${c.types.map((t) => spaceTypeLabel(t).toLowerCase()).join(' ou ')}` });
  }

  // Preço
  if (c.priceMinCents != null || c.priceMaxCents != null) {
    const p = space.priceMonthlyCents;
    if (p == null) {
      // O orçamento da busca é mensal; anúncio sem valor mensal definido não tem como comparar.
      somar(MATCH_WEIGHTS.preco, 0, { status: 'nao', text: 'Sem valor mensal definido neste anúncio' });
    } else {
    const acima = c.priceMaxCents != null && p > c.priceMaxCents;
    const abaixo = c.priceMinCents != null && p < c.priceMinCents;
    somar(MATCH_WEIGHTS.preco, acima || abaixo ? 0 : 1, acima
      ? { status: 'nao', text: `Custa ${formatBRL(p)}, acima do orçamento informado` }
      : abaixo
        ? { status: 'nao', text: `Custa ${formatBRL(p)}, abaixo da faixa informada` }
        : { status: 'sim', text: 'Está dentro do orçamento informado' });
    }
  }

  // Características: proporcional ao que bateu.
  if (c.featureKeys.length > 0) {
    const tem = c.featureKeys.filter((k) => space.featureKeys.includes(k));
    criterios++;
    possiveis += MATCH_WEIGHTS.caracteristicas;
    pontos += (MATCH_WEIGHTS.caracteristicas * tem.length) / c.featureKeys.length;
    for (const k of c.featureKeys) {
      const label = featureLabels.get(k) ?? k;
      items.push(space.featureKeys.includes(k)
        ? { status: 'sim', text: FRASE_CARACTERISTICA[k] ?? `Tem ${label.toLowerCase()}` }
        : { status: 'nao', text: `Não consta no anúncio: ${label.toLowerCase()}` });
    }
  }

  // Veículo: só quando o anúncio tem como mostrar (tipo ou característica).
  if (c.vehicle) {
    const sinal = SINAL_DO_VEICULO[c.vehicle];
    if (sinal) {
      const ok = sinal.types.includes(space.type) || space.featureKeys.includes(sinal.feature);
      const nome = VEHICLE_LABEL[c.vehicle].toLowerCase();
      // Se o mesmo sinal já foi pedido como característica, não conta duas vezes.
      if (!c.featureKeys.includes(sinal.feature)) {
        somar(MATCH_WEIGHTS.veiculo, ok ? 1 : 0, ok
          ? { status: 'sim', text: `Serve para ${nome}` }
          : { status: 'nao', text: `Não consta no anúncio que aceita ${nome}` });
      }
    }
  }

  // Tamanho
  if (c.sizeMinM2 != null) {
    const area = space.sizeM2 != null ? Number(space.sizeM2) : null;
    somar(MATCH_WEIGHTS.tamanho, area != null && area >= c.sizeMinM2 ? 1 : 0, area == null
      ? { status: 'nao', text: 'O anúncio não informa a área' }
      : area >= c.sizeMinM2
        ? { status: 'sim', text: `Tem ${String(area).replace('.', ',')} m²` }
        : { status: 'nao', text: `Tem ${String(area).replace('.', ',')} m², menos que o pedido` });
  }

  // Disponibilidade
  if (c.startBy) {
    const ok = space.earliestStart != null && space.earliestStart <= c.startBy;
    somar(MATCH_WEIGHTS.disponibilidade, ok ? 1 : 0, ok
      ? { status: 'sim', text: 'Está disponível na data pedida' }
      : space.earliestStart
        ? { status: 'nao', text: `Só pode começar a partir de ${dataCurta(space.earliestStart)}` }
        : { status: 'nao', text: 'O anúncio não informa quando fica disponível' });
  }

  if (criterios < MIN_CRITERIA_TO_SHOW || possiveis === 0) return null;
  // Para baixo, sempre: nunca arredonda para um número melhor do que é. E
  // 100% é regra, não conta: só quando TUDO que foi informado bateu — assim
  // nenhum resíduo de ponto flutuante vira "100%".
  const tudoAtendido = items.every((i) => i.status === 'sim');
  const bruto = Math.floor((pontos / possiveis) * 100 + 1e-9);
  const percent = tudoAtendido ? 100 : Math.min(99, bruto);
  return { percent, items, criteriaCount: criterios };
}

/**
 * Primeiro dia em que uma locação pode começar: disponível a partir de, hoje e
 * fora dos bloqueios do calendário. Sem "disponível a partir de" no anúncio, `null`.
 */
export function earliestStartFrom(
  availableFrom: string | null,
  blocks: readonly SpaceBlockPublic[],
  today: string,
): string | null {
  if (!availableFrom) return null;
  return earliestStartDate({ today, availableFrom, blocks });
}

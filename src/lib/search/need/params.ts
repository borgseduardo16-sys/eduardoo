import { centsToInputString, formatBRL, parseBRLToCents, InvalidAmountError } from '@/lib/money';
import { SPACE_TYPES, spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import {
  UNSUPPORTED_LABEL,
  UNSUPPORTED_NEEDS,
  VEHICLE_LABEL,
  VEHICLES,
  PURPOSES,
  type NeedInterpretation,
  type Purpose,
  type UnsupportedNeed,
  type Vehicle,
} from './vocabulary';

/**
 * Interpretação ↔ parâmetros da URL de /espacos (Fase 23).
 *
 * A busca por necessidade não tem estado escondido: o que foi entendido
 * vira os MESMOS parâmetros da busca comum (tipo, onde, preço,
 * características…), mais alguns informativos. Assim a página de
 * resultados, os filtros, a paginação e o link compartilhado funcionam
 * sem nada especial — e a pessoa pode tirar qualquer critério com um toque.
 *
 * Módulo puro (roda nos testes sem servidor).
 */

export type SearchParamsRecord = Record<string, string | undefined>;

/** Parâmetros que só a busca por necessidade usa. */
export const NEED_ONLY_PARAMS = [
  'busca', 'tipos', 'veiculo', 'finalidade', 'periodo', 'areaMin', 'inicio', 'aprox', 'perto',
  'naoFiltra', 'ignorado', 'ia', 'texto', 'ondeCampo',
] as const;

export type NeedUrlOptions = {
  /** Local já resolvido para texto (ex.: "Centro, Colatina"). */
  onde: string | null;
  /**
   * O que a pessoa digitou no campo "Onde?", se digitou. É o que o campo
   * mostra de novo na página de resultados — nunca o local tirado da frase,
   * que numa nova busca passaria por cima do local da frase nova.
   */
  ondeCampo: string | null;
  /** Coordenada do GPS, quando a pessoa já tinha liberado. */
  gps: { lat: number; lng: number } | null;
  aiFailed: boolean;
  residual: string[];
};

export function interpretationToParams(
  text: string,
  i: NeedInterpretation,
  opts: NeedUrlOptions,
): URLSearchParams {
  const p = new URLSearchParams();
  p.set('busca', text);

  if (i.types.length === 1) p.set('tipo', i.types[0]!);
  else if (i.types.length > 1) p.set('tipos', i.types.join(','));

  if (i.vehicle) p.set('veiculo', i.vehicle);
  if (i.purpose) p.set('finalidade', i.purpose);

  if (opts.gps && (i.nearMe || !opts.onde)) {
    p.set('lat', String(opts.gps.lat));
    p.set('lng', String(opts.gps.lng));
    p.set('raio', String(i.radiusMeters ?? 5000));
  } else {
    if (opts.onde) p.set('onde', opts.onde);
    if (i.nearMe && !opts.onde) p.set('perto', '1');
    if (i.radiusMeters && opts.onde) p.set('raio', String(i.radiusMeters));
  }

  if (opts.ondeCampo) p.set('ondeCampo', opts.ondeCampo);
  if (i.featureKeys.length > 0) p.set('caracteristicas', i.featureKeys.join(','));
  if (i.priceMinCents != null) p.set('precoMin', centsToInputString(i.priceMinCents));
  if (i.priceMaxCents != null) p.set('precoMax', centsToInputString(i.priceMaxCents));
  if (i.priceApprox && i.priceMaxCents != null) p.set('aprox', '1');
  if (i.sizeMinM2 != null) p.set('areaMin', String(i.sizeMinM2));
  if (i.startNow) p.set('disponivel', '1');
  else if (i.startDate) p.set('inicio', i.startDate);
  if (i.durationMonths != null) p.set('periodo', String(i.durationMonths));
  if (i.cheap) p.set('ordenar', 'price_asc');
  if (i.unsupported.length > 0) p.set('naoFiltra', i.unsupported.join(','));
  if (opts.residual.length > 0) p.set('ignorado', opts.residual.slice(0, 6).join(','));
  if (opts.aiFailed) p.set('ia', 'indisponivel');
  return p;
}

// ---------------------------------------------------------------------------
// Leitura segura dos parâmetros (vêm da URL: qualquer um pode escrever)
// ---------------------------------------------------------------------------

export function parseTypesParam(v: string | undefined): SpaceTypeKey[] {
  if (!v) return [];
  const validos = v
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is SpaceTypeKey => (SPACE_TYPES as readonly string[]).includes(t));
  return [...new Set(validos)].slice(0, 6);
}

export function parseVehicleParam(v: string | undefined): Vehicle | null {
  return v && (VEHICLES as readonly string[]).includes(v) ? (v as Vehicle) : null;
}

export function parsePurposeParam(v: string | undefined): Purpose | null {
  return v && (PURPOSES as readonly string[]).includes(v) ? (v as Purpose) : null;
}

export function parseSizeParam(v: string | undefined): number | null {
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

/** Data 'AAAA-MM-DD' válida e não passada; senão null. */
export function parseStartParam(v: string | undefined, today: string): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v < today ? null : v;
}

function parseMonthsParam(v: string | undefined): number | null {
  if (!v || !/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 60 ? n : null;
}

function precoOuNulo(v: string | undefined): number | null {
  if (!v) return null;
  try {
    return parseBRLToCents(v);
  } catch (err) {
    if (err instanceof InvalidAmountError) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Resumo do que foi entendido ("Resultados para: …")
// ---------------------------------------------------------------------------

export type NeedChip = {
  /** Estável, para teste e para `key`. */
  id: string;
  label: string;
  /** URL de /espacos sem este critério. */
  removeHref: string;
};

export type NeedSummary = {
  text: string;
  chips: NeedChip[];
  /** Linhas informativas (não são filtro). */
  notes: string[];
  nearMeWithoutLocation: boolean;
  aiUnavailable: boolean;
  ignored: string[];
};

function semParametros(sp: SearchParamsRecord, remover: string[], ajustar?: (p: URLSearchParams) => void): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && !remover.includes(k) && k !== 'pagina') p.set(k, v);
  }
  ajustar?.(p);
  const qs = p.toString();
  return qs ? `/espacos?${qs}` : '/espacos';
}

function listaComOu(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} ou ${itens[itens.length - 1]}`;
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Monta o resumo a partir da URL ATUAL — não do que foi entendido lá
 * atrás. Se a pessoa tirou um critério ou mexeu nos filtros, o resumo
 * acompanha, e nunca mostra um critério que não está valendo.
 */
export function needSummaryFromParams(
  sp: SearchParamsRecord,
  ctx: { today: string; featureLabels: Map<string, string> },
): NeedSummary | null {
  const text = sp.busca?.trim();
  if (!text) return null;

  const chips: NeedChip[] = [];
  const notes: string[] = [];

  const veiculo = parseVehicleParam(sp.veiculo);
  if (veiculo) chips.push({ id: 'veiculo', label: VEHICLE_LABEL[veiculo], removeHref: semParametros(sp, ['veiculo']) });

  const tipos = sp.tipo && (SPACE_TYPES as readonly string[]).includes(sp.tipo)
    ? [sp.tipo as SpaceTypeKey]
    : parseTypesParam(sp.tipos);
  if (tipos.length > 0) {
    const nomes = tipos.map((t, i) => (i === 0 ? spaceTypeLabel(t) : spaceTypeLabel(t).toLowerCase()));
    chips.push({ id: 'tipo', label: listaComOu(nomes), removeHref: semParametros(sp, ['tipo', 'tipos']) });
  }

  if (sp.lat && sp.lng) {
    chips.push({ id: 'local', label: 'Perto de você', removeHref: semParametros(sp, ['lat', 'lng', 'raio', 'perto']) });
  } else if (sp.onde) {
    chips.push({ id: 'local', label: sp.onde, removeHref: semParametros(sp, ['onde', 'raio', 'ondeCampo']) });
  }
  if (sp.raio && /^\d+$/.test(sp.raio) && (sp.onde || sp.lat)) {
    const m = Number(sp.raio);
    const label = m >= 1000 ? `Até ${String(m / 1000).replace('.', ',')} km` : `Até ${m} m`;
    chips.push({ id: 'raio', label, removeHref: semParametros(sp, ['raio']) });
  }

  const texto = sp.texto?.trim().slice(0, 80);
  if (texto) {
    chips.push({ id: 'texto', label: `“${texto}” no título ou no local`, removeHref: semParametros(sp, ['texto']) });
  }

  const caracteristicas = (sp.caracteristicas ?? '').split(',').filter(Boolean);
  for (const key of caracteristicas) {
    const label = ctx.featureLabels.get(key);
    if (!label) continue;
    chips.push({
      id: `caracteristica:${key}`,
      label,
      removeHref: semParametros(sp, [], (p) => {
        const resto = caracteristicas.filter((k) => k !== key);
        if (resto.length > 0) p.set('caracteristicas', resto.join(','));
        else p.delete('caracteristicas');
      }),
    });
  }

  const min = precoOuNulo(sp.precoMin);
  const max = precoOuNulo(sp.precoMax);
  if (min != null || max != null) {
    const label = min != null && max != null
      ? `De ${formatBRL(min)} a ${formatBRL(max)}`
      : max != null
        ? `Até ${formatBRL(max)}${sp.aprox === '1' ? ' (valor aproximado)' : ''}`
        : `A partir de ${formatBRL(min!)}`;
    chips.push({ id: 'preco', label, removeHref: semParametros(sp, ['precoMin', 'precoMax', 'aprox']) });
  }

  const area = parseSizeParam(sp.areaMin);
  if (area != null) chips.push({ id: 'area', label: `A partir de ${area} m²`, removeHref: semParametros(sp, ['areaMin']) });

  if (sp.disponivel === '1') {
    chips.push({ id: 'inicio', label: 'Para começar agora', removeHref: semParametros(sp, ['disponivel']) });
  } else {
    const inicio = parseStartParam(sp.inicio, ctx.today);
    if (inicio) {
      chips.push({ id: 'inicio', label: `Começar até ${dataCurta(inicio)}`, removeHref: semParametros(sp, ['inicio']) });
    }
  }

  const meses = parseMonthsParam(sp.periodo);
  if (meses != null) {
    notes.push(
      `Por ${meses === 1 ? '1 mês' : `${meses} meses`}: o aluguel aqui é mensal e sem prazo mínimo — dá para encerrar pelo app quando não precisar mais.`,
    );
  }

  const naoFiltra = (sp.naoFiltra ?? '')
    .split(',')
    .filter((n): n is UnsupportedNeed => (UNSUPPORTED_NEEDS as readonly string[]).includes(n));
  if (naoFiltra.length > 0) {
    const nomes = naoFiltra.map((n) => UNSUPPORTED_LABEL[n]);
    notes.push(`Não dá para filtrar por ${listaComOu(nomes)}: os anúncios não informam isso. Vale perguntar ao proprietário.`);
  }

  const ignored = (sp.ignorado ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= 40)
    .slice(0, 6);

  return {
    text: text.slice(0, 300),
    chips,
    notes,
    nearMeWithoutLocation: sp.perto === '1' && !sp.lat && !sp.onde,
    aiUnavailable: sp.ia === 'indisponivel',
    ignored,
  };
}

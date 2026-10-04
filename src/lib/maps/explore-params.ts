import { MAP_CATEGORY_KEYS, parseCategoriesParam, type MapCategoryKey } from '@/lib/spaces/categories';

/**
 * Parâmetros do mapa de exploração — módulo puro (servidor e navegador).
 *
 * O navegador manda o enquadramento (`w,s,e,n`), o zoom e os filtros; o
 * servidor valida TUDO aqui antes de tocar no banco. Preço, distância e
 * categorias são só FILTROS de busca (nenhum valor de cobrança passa por aqui).
 */

/** Distâncias do filtro, em metros. `null` = qualquer distância. */
export const RADIUS_OPTIONS_M = [1000, 2000, 5000, 10000] as const;
/** Raio inicial ao abrir o mapa: ~2 km em volta da pessoa. */
export const DEFAULT_RADIUS_M = 2000;

/** Atalhos de preço máximo do filtro, em centavos (R$ 100, 200, 300). */
export const PRICE_PRESETS_CENTS = [10000, 20000, 30000] as const;

/** Acima disto o mapa agrupa em círculos com contagem em vez de desenhar cada espaço. */
export const MAX_INDIVIDUAL_PINS = 60;
/** Quantos Destaques/bem avaliados aparecem fora do raio escolhido. */
export const MAX_OUTSIDE_PINS = 12;
/** Teto de Destaques desenhados sempre, mesmo com o mapa agrupado. */
export const MAX_PROMOTED_PINS = 20;
/** Lado do quadrado de agrupamento, em pixels de tela. */
export const CLUSTER_CELL_PX = 80;

export type ExploreBBox = { west: number; south: number; east: number; north: number };

export type ExploreQuery = {
  bbox: ExploreBBox;
  zoom: number;
  /** Ponto de referência (a pessoa ou o centro buscado). Sem ele não existe "raio". */
  center: { lat: number; lng: number } | null;
  /** Raio em metros em volta do ponto de referência; `null` = qualquer distância. */
  radiusMeters: number | null;
  priceMaxCents: number | null;
  categories: MapCategoryKey[];
  availableNow: boolean;
};

export type ParseResult = { ok: true; value: ExploreQuery } | { ok: false; message: string };

function num(v: string | null): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Arredonda para ~110 m: a posição da pessoa vira "localização aproximada" antes de sair do aparelho. */
export function roundApprox(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function parseExploreQuery(params: URLSearchParams): ParseResult {
  const west = num(params.get('w'));
  const south = num(params.get('s'));
  const east = num(params.get('e'));
  const north = num(params.get('n'));
  if (west == null || south == null || east == null || north == null) {
    return { ok: false, message: 'Informe a área do mapa (w, s, e, n).' };
  }
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    return { ok: false, message: 'Área do mapa inválida.' };
  }

  const zoomBruto = num(params.get('z'));
  const zoom = Math.min(22, Math.max(0, zoomBruto ?? 12));

  const lat = num(params.get('lat'));
  const lng = num(params.get('lng'));
  const center =
    lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;

  const raioBruto = num(params.get('raio'));
  const radiusMeters =
    center && raioBruto != null && Number.isInteger(raioBruto) && raioBruto >= 100 && raioBruto <= 50_000 ? raioBruto : null;

  const precoBruto = num(params.get('preco'));
  const priceMaxCents =
    precoBruto != null && Number.isInteger(precoBruto) && precoBruto >= 1 && precoBruto <= 100_000_000 ? precoBruto : null;

  return {
    ok: true,
    value: {
      bbox: { west, south, east, north },
      zoom,
      center,
      radiusMeters,
      priceMaxCents,
      categories: parseCategoriesParam(params.get('tipos')),
      availableNow: params.get('disp') === '1',
    },
  };
}

/** Monta a query string do mapa (o inverso de `parseExploreQuery`). */
export function buildExploreQuery(q: ExploreQuery): string {
  const p = new URLSearchParams();
  p.set('w', q.bbox.west.toFixed(5));
  p.set('s', q.bbox.south.toFixed(5));
  p.set('e', q.bbox.east.toFixed(5));
  p.set('n', q.bbox.north.toFixed(5));
  p.set('z', q.zoom.toFixed(2));
  if (q.center) {
    p.set('lat', String(roundApprox(q.center.lat)));
    p.set('lng', String(roundApprox(q.center.lng)));
    if (q.radiusMeters) p.set('raio', String(q.radiusMeters));
  }
  if (q.priceMaxCents) p.set('preco', String(q.priceMaxCents));
  if (q.categories.length > 0 && q.categories.length < MAP_CATEGORY_KEYS.length) p.set('tipos', q.categories.join(','));
  if (q.availableNow) p.set('disp', '1');
  return p.toString();
}

/**
 * Lado de um quadrado de agrupamento em graus de longitude: `CLUSTER_CELL_PX`
 * pixels de tela naquele zoom (o mundo tem 256 · 2^zoom pixels de largura).
 */
export function clusterCellDegrees(zoom: number): number {
  return (360 / 2 ** zoom) * (CLUSTER_CELL_PX / 256);
}

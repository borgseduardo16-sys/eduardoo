import 'server-only';
import { scaleCentsByBps } from '@/lib/money';
import { listPublishedSpaces, type PublicSpace } from './queries';
import { rankSimilar, similarTypes, SIMILAR_LIMITS } from './similar-rank';

export type SimilarSpace = PublicSpace & { reasons: string[] };

/**
 * Espaços parecidos com um anúncio (Fase 23), para a página do espaço e
 * para as alternativas quando ele está ocupado.
 *
 * Reaproveita a busca pública (`listPublishedSpaces`): só anúncio
 * publicado, só ponto aproximado, nada que a busca normal não mostraria.
 * Filtro duro: tipo igual ou parecido, até 25 km (ou mesma cidade, se o
 * anúncio não tem ponto no mapa) e preço entre 50% e 160% do dele. Dentro
 * disso, ordena por `rankSimilar` (tipo, distância, preço, características).
 */
export async function listSimilarSpaces(
  space: {
    id: string;
    type: string;
    priceMonthlyCents: number | null;
    city: string | null;
    district: string | null;
    approxLat: number | null;
    approxLng: number | null;
    featureKeys: readonly string[];
  },
  opts: { availableNow: boolean; limit?: number },
): Promise<SimilarSpace[]> {
  const ponto = space.approxLat != null && space.approxLng != null ? { lat: space.approxLat, lng: space.approxLng } : null;
  if (!ponto && !space.city) return [];

  const candidatos = await listPublishedSpaces({
    types: similarTypes(space.type),
    point: ponto,
    radiusMeters: ponto ? SIMILAR_LIMITS.maxDistanceMeters : null,
    cityFilter: ponto ? null : space.city,
    // Faixa de preço só para anúncio com preço mensal (Parte 12).
    priceMinCents: space.priceMonthlyCents != null ? scaleCentsByBps(space.priceMonthlyCents, SIMILAR_LIMITS.minPriceBps, 'baixo') : null,
    priceMaxCents: space.priceMonthlyCents != null ? scaleCentsByBps(space.priceMonthlyCents, SIMILAR_LIMITS.maxPriceBps, 'cima') : null,
    availableNow: opts.availableNow,
    sort: ponto ? 'distance' : 'recent',
    limit: 40,
  });

  return rankSimilar(
    {
      type: space.type,
      priceMonthlyCents: space.priceMonthlyCents,
      featureKeys: space.featureKeys,
      city: space.city,
      district: space.district,
    },
    candidatos.filter((c) => c.id !== space.id),
    opts.limit ?? 4,
  );
}

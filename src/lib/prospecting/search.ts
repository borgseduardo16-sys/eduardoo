import 'server-only';
import { searchTextPlaces, extractCity, extractState, type RawPlace } from './places-client';
import { classifyWebsite } from './website-classifier';
import { BRAZILIAN_STATES, findStateByName, citiesForRegion, citiesForCountry } from './locations';
import type { LocationScope, ProspectCompany, SearchFilters } from './types';

/**
 * Limites de uma execucao de busca.
 *
 * A Places API nao tem um jeito de pedir "todo o Brasil" numa chamada so —
 * expandimos em varias consultas por cidade (ver locations.ts) e paramos por
 * um destes tres motivos, o que vier primeiro: (1) leads suficientes
 * encontrados, (2) numero de consultas esgotado, (3) tempo esgotado. O tempo
 * existe porque isto roda dentro de uma Server Action com timeout de
 * execucao — sem limite, uma busca "Brasil inteiro" nunca terminaria dentro
 * do tempo de uma requisicao HTTP.
 */
const MAX_QUERIES_PER_SEARCH = 40;
const MAX_PAGES_PER_QUERY = 3;
const PAGE_TOKEN_DELAY_MS = 2000;
const TIME_BUDGET_MS = 50_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQueries(niche: string, locationLabel: string, scope: LocationScope): string[] {
  if (scope === 'city') return [`${niche} em ${locationLabel}`];

  if (scope === 'state') {
    const state = findStateByName(locationLabel);
    if (!state) return [`${niche} em ${locationLabel}`];
    return state.cities.map((city) => `${niche} em ${city} - ${state.uf}`);
  }

  if (scope === 'region') {
    const region = BRAZILIAN_STATES.find(
      (s) => s.region.toLowerCase() === locationLabel.trim().toLowerCase(),
    )?.region;
    const cities = region ? citiesForRegion(region) : [];
    if (cities.length === 0) return [`${niche} em ${locationLabel}`];
    return cities.map((city) => `${niche} em ${city}`);
  }

  // country
  return citiesForCountry().map((city) => `${niche} em ${city}`);
}

export type SearchRunResult = {
  companies: ProspectCompany[];
  companiesAnalyzed: number;
  leadsFound: number;
  discardedSite: number;
  discardedMenu: number;
  discardedCatalog: number;
  discardedScheduling: number;
  discardedOther: number;
  /** true quando paramos por esgotar o orcamento de consultas/tempo, nao por falta de resultado. */
  budgetExhausted: boolean;
};

function toProspectCompany(place: RawPlace): Omit<ProspectCompany, 'leadStatus' | 'discardReason' | 'confidence'> {
  const rating = typeof place.rating === 'number' ? place.rating : null;
  const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : null;
  const classified = classifyWebsite(place.websiteUri ?? null);

  return {
    googlePlaceId: place.id,
    name: place.displayName?.text ?? 'Nome não encontrado',
    category: place.primaryTypeDisplayName?.text ?? null,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    address: place.formattedAddress ?? null,
    city: extractCity(place),
    state: extractState(place),
    rating,
    reviewCount,
    mapsUrl: place.googleMapsUri ?? null,
    websiteRaw: place.websiteUri ?? null,
    websiteClassification: classified.classification,
    classificationDetail: classified.detailPt,
    whatsappUrl: classified.extracted?.whatsapp ?? null,
    instagramUrl: classified.extracted?.instagram ?? null,
    facebookUrl: classified.extracted?.facebook ?? null,
  };
}

/**
 * Executa a busca completa: consulta a Places API, classifica cada empresa e
 * aplica os filtros de avaliacao/nota. Para assim que `requestedQuantity`
 * leads validos forem encontrados ou o orcamento de consultas se esgotar.
 */
export async function runProspectSearch(filters: SearchFilters): Promise<SearchRunResult> {
  const queries = buildQueries(filters.nicheKeyword, filters.locationLabel, filters.locationScope).slice(
    0,
    MAX_QUERIES_PER_SEARCH,
  );

  const seen = new Set<string>();
  const companies: ProspectCompany[] = [];
  let companiesAnalyzed = 0;
  let leadsFound = 0;
  let discardedSite = 0;
  let discardedMenu = 0;
  let discardedCatalog = 0;
  let discardedScheduling = 0;
  let discardedOther = 0;
  let budgetExhausted = false;

  const startedAt = Date.now();
  const timeIsUp = () => Date.now() - startedAt > TIME_BUDGET_MS;

  queryLoop: for (const query of queries) {
    if (leadsFound >= filters.requestedQuantity) break;
    if (timeIsUp()) {
      budgetExhausted = true;
      break;
    }

    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      if (page > 0) {
        if (timeIsUp()) {
          budgetExhausted = true;
          break queryLoop;
        }
        await sleep(PAGE_TOKEN_DELAY_MS);
      }

      const { places, nextPageToken } = await searchTextPlaces(query, { pageToken });

      for (const place of places) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        companiesAnalyzed++;

        const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : null;
        const rating = typeof place.rating === 'number' ? place.rating : null;

        if (filters.minReviews > 0 && (reviewCount === null || reviewCount < filters.minReviews)) {
          continue;
        }
        if (filters.minRating !== null && (rating === null || rating < filters.minRating)) {
          continue;
        }

        const base = toProspectCompany(place);
        const classified = classifyWebsite(place.websiteUri ?? null);

        if (classified.isFunctionalSite) {
          switch (classified.discardBucket) {
            case 'site':
              discardedSite++;
              break;
            case 'menu':
              discardedMenu++;
              break;
            case 'catalog':
              discardedCatalog++;
              break;
            case 'scheduling':
              discardedScheduling++;
              break;
            default:
              discardedOther++;
          }
          companies.push({
            ...base,
            leadStatus: 'discarded',
            discardReason: classified.detailPt,
            confidence: null,
          });
        } else {
          leadsFound++;
          companies.push({
            ...base,
            leadStatus: 'valid',
            discardReason: null,
            confidence: classified.isAmbiguous ? 'verificacao_recomendada' : 'sem_presenca',
          });
        }

        if (leadsFound >= filters.requestedQuantity) break;
      }

      if (leadsFound >= filters.requestedQuantity) break;
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }
  }

  return {
    companies,
    companiesAnalyzed,
    leadsFound,
    discardedSite,
    discardedMenu,
    discardedCatalog,
    discardedScheduling,
    discardedOther,
    budgetExhausted,
  };
}

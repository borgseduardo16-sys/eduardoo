import 'server-only';
import { requireIntegration } from '@/lib/env';

/**
 * Cliente da Places API (New) do Google — a unica fonte de dado de empresa
 * usada pela prospeccao. Nenhuma empresa, telefone, avaliacao ou link e
 * inventado: tudo aqui vem literalmente da resposta da API.
 *
 * Endpoint novo (nao o legado "Places API"), porque e o unico que devolve
 * `websiteUri` diretamente na busca por texto, sem uma chamada de Details por
 * empresa — importante para conseguir analisar centenas de empresas sem
 * estourar cota. Campos de "Pro tier" (site, telefone) custam mais por
 * chamada do que os basicos — custo aceito pelo produto: sem `websiteUri` a
 * regra central (empresa tem ou nao site) nao existe.
 *
 * Doc: https://developers.google.com/maps/documentation/places/web-service/text-search
 */

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'nextPageToken',
].join(',');

export type RawPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
};

type SearchTextResponse = {
  places?: RawPlace[];
  nextPageToken?: string;
};

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

/**
 * Busca por texto, uma pagina por chamada (ate 20 resultados). Para a
 * proxima pagina, chame de novo com `pageToken` — a propria Google exige uma
 * pequena espera antes do token ficar valido, tratada pelo chamador
 * (`search.ts`), nao aqui.
 */
export async function searchTextPlaces(
  query: string,
  opts: { pageToken?: string } = {},
): Promise<{ places: RawPlace[]; nextPageToken: string | null }> {
  const { GOOGLE_PLACES_API_KEY } = requireIntegration('places');

  const body: Record<string, unknown> = opts.pageToken
    ? { pageToken: opts.pageToken }
    : {
        textQuery: query,
        languageCode: 'pt-BR',
        regionCode: 'BR',
        pageSize: 20,
      };

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new PlacesApiError(
      `Google Places API respondeu ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as SearchTextResponse;
  return { places: data.places ?? [], nextPageToken: data.nextPageToken ?? null };
}

function componentByType(place: RawPlace, type: string): string | null {
  return place.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? null;
}

export function extractCity(place: RawPlace): string | null {
  return (
    componentByType(place, 'administrative_area_level_2') ??
    componentByType(place, 'locality') ??
    componentByType(place, 'sublocality')
  );
}

export function extractState(place: RawPlace): string | null {
  return componentByType(place, 'administrative_area_level_1');
}

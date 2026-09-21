import type { WebsiteClassification } from './website-classifier';

export type LocationScope = 'city' | 'state' | 'region' | 'country';

export type SearchFilters = {
  niche: string;
  nicheKeyword: string;
  locationLabel: string;
  locationScope: LocationScope;
  minReviews: number;
  minRating: number | null;
  requestedQuantity: number;
};

/** Empresa normalizada, ja com o resultado da classificacao aplicado. */
export type ProspectCompany = {
  googlePlaceId: string;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string | null;
  websiteRaw: string | null;
  websiteClassification: WebsiteClassification;
  classificationDetail: string;
  whatsappUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  leadStatus: 'valid' | 'discarded';
  discardReason: string | null;
  confidence: 'sem_presenca' | 'verificacao_recomendada' | null;
};

export type SearchProgressStage =
  | 'analisando'
  | 'verificando_presenca'
  | 'eliminando_sites'
  | 'aplicando_filtros'
  | 'preparando';

export const SEARCH_STAGE_LABELS: Record<SearchProgressStage, string> = {
  analisando: 'Analisando empresas...',
  verificando_presenca: 'Verificando presença digital...',
  eliminando_sites: 'Eliminando empresas com sites...',
  aplicando_filtros: 'Aplicando filtros...',
  preparando: 'Preparando seus leads...',
};

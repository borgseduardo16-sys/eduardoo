import 'server-only';
import { lookupCep } from '@/lib/maps/cep-lookup';
import { CepError, onlyDigits } from '@/lib/maps/cep';
import { geocodeAddress } from '@/lib/maps/geocoding';
import { matchKnownLocation } from './queries';

/**
 * Resolve o campo "Onde?" da busca — que pode ser cidade, bairro, endereco,
 * CEP ou ponto de referencia (Parte 3, secao 4) — num ponto de referencia
 * real, sem nunca inventar coordenada.
 *
 * Ordem de tentativa, da mais barata (sem rede) para a mais cara:
 *
 *   1. Parece CEP (8 digitos)?      -> consulta de CEP (BrasilAPI/ViaCEP)
 *   2. Bate com cidade/bairro real
 *      que ja tem anuncio publicado? -> filtro direto no banco, sem rede
 *   3. Nenhum dos dois              -> geocodificacao (Google/MapTiler/Nominatim)
 *
 * Se tudo falhar, devolve `source: 'unresolved'` com o texto original: quem
 * chama ainda tenta uma busca por texto simples (titulo/cidade/bairro) em vez
 * de mostrar tela vazia — ver searchPublishedSpaces.
 */

export type LocationResolution = {
  /** Ponto de referencia real. Existe para GPS, CEP com coordenada, e endereco geocodificado. */
  point: { lat: number; lng: number } | null;
  /** Filtro direto por cidade/bairro, quando o local bateu com dado real do banco. */
  cityFilter: string | null;
  districtFilter: string | null;
  /** O que mostrar na interface. */
  label: string | null;
  source: 'gps' | 'cep' | 'city_match' | 'geocoded' | 'unresolved' | 'none';
  /** true quando o texto tinha cara de CEP mas o CEP nao existe. */
  cepNotFound: boolean;
};

const VAZIO: LocationResolution = {
  point: null, cityFilter: null, districtFilter: null, label: null,
  source: 'none', cepNotFound: false,
};

function pareceCep(texto: string): boolean {
  return onlyDigits(texto).length === 8;
}

export async function resolveLocation(input: {
  lat?: number | null;
  lng?: number | null;
  onde?: string | null;
}): Promise<LocationResolution> {
  // 1. Coordenada direta (GPS do navegador) — nao ha o que resolver.
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    return {
      ...VAZIO,
      point: { lat: input.lat, lng: input.lng },
      label: 'perto de você',
      source: 'gps',
    };
  }

  const onde = input.onde?.trim();
  if (!onde) return VAZIO;

  // 2. CEP.
  if (pareceCep(onde)) {
    try {
      const r = await lookupCep(onde);
      const label = [r.city, r.state].filter(Boolean).join(', ') || onde;
      return {
        point: r.approx ?? null,
        cityFilter: r.approx ? null : r.city, // sem coordenada, ainda filtra pela cidade do CEP
        districtFilter: null,
        label,
        source: 'cep',
        cepNotFound: false,
      };
    } catch (err: unknown) {
      if (err instanceof CepError && err.reason === 'nao_encontrado') {
        return { ...VAZIO, label: onde, cepNotFound: true };
      }
      // Servico de CEP fora do ar: cai para tratar como texto comum abaixo,
      // em vez de travar a busca por causa de um CEP que nem foi o essencial.
    }
  }

  // 3. Bate com cidade/bairro que ja tem anuncio real.
  const conhecido = await matchKnownLocation(onde);
  if (conhecido) {
    const label = conhecido.kind === 'city'
      ? [conhecido.city, conhecido.state].filter(Boolean).join(', ')
      : [conhecido.district, conhecido.city].filter(Boolean).join(', ');
    return {
      point: null,
      cityFilter: conhecido.kind === 'city' ? conhecido.city : (conhecido.city ?? null),
      districtFilter: conhecido.kind === 'district' ? conhecido.district : null,
      label,
      source: 'city_match',
      cepNotFound: false,
    };
  }

  // 4. Geocodificacao — so chega aqui quando os passos gratuitos nao acharam nada.
  const geo = await geocodeAddress(onde);
  if (geo) {
    return {
      point: { lat: geo.lat, lng: geo.lng },
      cityFilter: null,
      districtFilter: null,
      label: geo.label,
      source: 'geocoded',
      cepNotFound: false,
    };
  }

  // 5. Nada resolveu. Quem chama ainda tenta busca por texto simples.
  return { ...VAZIO, label: onde, source: 'unresolved' };
}

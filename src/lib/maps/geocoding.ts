import 'server-only';
import { serverEnv, isIntegrationConfigured } from '@/lib/env';

/**
 * Geocodificacao: texto livre (endereco, cidade, ponto de referencia) -> coordenada.
 *
 * ESCOLHA DO PROVEDOR — em camadas, reaproveitando o que o projeto ja tem:
 *
 *   1. Google Geocoding API, se `GEOCODING_PROVIDER=google` e
 *      `GOOGLE_GEOCODING_API_KEY` estiverem definidos. Melhor cobertura de
 *      endereco no Brasil; e o que a documentacao (docs/SETUP.md) ja
 *      descreve como o caminho para producao com volume.
 *
 *   2. MapTiler Geocoding API, se `GEOCODING_PROVIDER=maptiler`. Reaproveita a
 *      MESMA chave `NEXT_PUBLIC_MAPTILER_KEY` que ja existe para os tiles do
 *      mapa — quem configurou o MapTiler para o mapa nao precisa criar outra
 *      conta para ganhar geocodificacao tambem.
 *
 *   3. Nominatim (OpenStreetMap), sem chave nenhuma, quando nenhum dos dois
 *      acima esta configurado. E o mesmo raciocinio ja aplicado aos tiles do
 *      mapa em `config.ts`: uma fonte gratuita que funciona de verdade desde
 *      o primeiro dia, mas cuja politica de uso
 *      (https://operations.osmfoundation.org/policies/nominatim/) pede
 *      trafego leve e nao e pensada para um marketplace com volume — por
 *      isso o limite de 1 consulta por segundo abaixo, e por isso
 *      `isUsingFreeGeocoding()` existe: para a interface poder dizer a
 *      verdade sobre em que pe isso esta.
 *
 * Falha aqui NUNCA vira erro para quem busca. Retorna `null`, o log fica com
 * o motivo tecnico, e quem chama cai para a busca por texto (cidade/bairro
 * batendo direto no banco) — ver src/lib/spaces/resolve-location.ts.
 */

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** Nome legivel do lugar encontrado, para mostrar "Buscando perto de X". */
  label: string;
  source: 'google' | 'maptiler' | 'nominatim';
};

/** Caixa delimitadora do Brasil. Resultado fora disso e descartado. */
const BRASIL = { minLat: -33.75, maxLat: 5.27, minLng: -73.99, maxLng: -34.79 };

function dentroDoBrasil(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= BRASIL.minLat && lat <= BRASIL.maxLat &&
    lng >= BRASIL.minLng && lng <= BRASIL.maxLng
  );
}

// ---------------------------------------------------------------------------
// Cache em memoria — mesma razao do cache de CEP: reduz carga na fonte
// gratuita e acelera buscas repetidas ("Colatina" e digitado centenas de
// vezes por dia num marketplace regional).
// ---------------------------------------------------------------------------

type Entrada = { at: number; value: GeocodeResult | null };
const cache = new Map<string, Entrada>();
const TTL_OK = 7 * 24 * 60 * 60 * 1_000; // lugar nao muda de coordenada
const TTL_MISS = 60 * 60 * 1_000;
const MAX_ENTRADAS = 5_000;

function chaveCache(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function lerCache(chave: string): Entrada | undefined {
  const hit = cache.get(chave);
  if (!hit) return undefined;
  const ttl = hit.value ? TTL_OK : TTL_MISS;
  if (Date.now() - hit.at > ttl) {
    cache.delete(chave);
    return undefined;
  }
  return hit;
}

function gravarCache(chave: string, value: GeocodeResult | null) {
  if (cache.size >= MAX_ENTRADAS) {
    const primeiro = cache.keys().next();
    if (!primeiro.done) cache.delete(primeiro.value);
  }
  cache.set(chave, { at: Date.now(), value });
}

/** Usado pelos testes. */
export function clearGeocodeCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Limitador de 1 requisicao/segundo para o Nominatim — exigencia da
// politica de uso deles, nao escolha nossa. Os provedores pagos nao passam
// por aqui: o limite deles e por conta.
// ---------------------------------------------------------------------------

let proximaLiberacao = 0;
async function aguardarVezDoNominatim() {
  const agora = Date.now();
  const espera = Math.max(0, proximaLiberacao - agora);
  proximaLiberacao = Math.max(agora, proximaLiberacao) + 1_100;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

const TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Provedores
// ---------------------------------------------------------------------------

async function viaGoogle(query: string, key: string): Promise<GeocodeResult | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('region', 'br');
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('key', key);

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`google geocoding HTTP ${res.status}`);

  const data = (await res.json()) as {
    status: string;
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
  };
  if (data.status === 'ZERO_RESULTS') return null;
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`google geocoding status ${data.status}`);
  }

  const r = data.results[0]!;
  const { lat, lng } = r.geometry.location;
  if (!dentroDoBrasil(lat, lng)) return null;
  return { lat, lng, label: r.formatted_address, source: 'google' };
}

async function viaMapTiler(query: string, key: string): Promise<GeocodeResult | null> {
  const url = new URL(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set('key', key);
  url.searchParams.set('country', 'br');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'pt');

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`maptiler geocoding HTTP ${res.status}`);

  const data = (await res.json()) as {
    features?: { place_name?: string; text?: string; center: [number, number] }[];
  };
  const feat = data.features?.[0];
  if (!feat) return null;

  const [lng, lat] = feat.center;
  if (!dentroDoBrasil(lat, lng)) return null;
  return { lat, lng, label: feat.place_name ?? feat.text ?? query, source: 'maptiler' };
}

async function viaNominatim(query: string): Promise<GeocodeResult | null> {
  await aguardarVezDoNominatim();

  const base = process.env.GEOCODING_NOMINATIM_BASE ?? 'https://nominatim.openstreetmap.org';
  const url = new URL(`${base}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('limit', '1');
  url.searchParams.set('accept-language', 'pt-BR');

  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: 'application/json',
      // Exigencia da politica de uso do Nominatim: identificar quem chama.
      // https://operations.osmfoundation.org/policies/nominatim/
      'user-agent': `MyPlace/1.0 (+${serverEnv.NEXT_PUBLIC_SITE_URL})`,
    },
  });
  if (!res.ok) throw new Error(`nominatim HTTP ${res.status}`);

  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const first = data[0];
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!dentroDoBrasil(lat, lng)) return null;
  return { lat, lng, label: first.display_name, source: 'nominatim' };
}

// ---------------------------------------------------------------------------

/** true quando a geocodificacao esta na fonte gratuita, sem volume garantido. */
export function isUsingFreeGeocoding(): boolean {
  return !isIntegrationConfigured('geocoding');
}

/**
 * Converte texto livre em coordenada. Nunca lanca — falha vira `null`.
 *
 * Nao chame para todo caractere digitado: e para ser acionado por uma busca
 * explicita (Enter/clique), nunca por tecla. Ver o debounce e o gatilho no
 * componente de busca.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const termo = query.trim();
  if (termo.length < 3) return null;

  const chave = chaveCache(termo);
  const emCache = lerCache(chave);
  if (emCache) return emCache.value;

  const provider = serverEnv.GEOCODING_PROVIDER;
  const consulta = termo.toLowerCase().includes('brasil') ? termo : `${termo}, Brasil`;

  try {
    let resultado: GeocodeResult | null;

    if (provider === 'google' && serverEnv.GOOGLE_GEOCODING_API_KEY) {
      resultado = await viaGoogle(consulta, serverEnv.GOOGLE_GEOCODING_API_KEY);
    } else if (provider === 'maptiler' && serverEnv.NEXT_PUBLIC_MAPTILER_KEY) {
      resultado = await viaMapTiler(consulta, serverEnv.NEXT_PUBLIC_MAPTILER_KEY);
    } else {
      resultado = await viaNominatim(consulta);
    }

    gravarCache(chave, resultado);
    return resultado;
  } catch (err) {
    // Servico de geocodificacao fora do ar nao pode derrubar a busca: quem
    // chama cai para o filtro de texto direto no banco.
    console.error(`[geocoding] falha ao geocodificar "${termo}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

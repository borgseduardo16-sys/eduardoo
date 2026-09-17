import 'server-only';
import { CepError, normalizeCep, onlyDigits, type CepResult } from './cep';

/**
 * Consulta de CEP. So roda no servidor.
 *
 * ESCOLHA DO SERVICO — nenhum dos dois exige chave, conta ou cartao:
 *
 *   1. BrasilAPI (`/api/cep/v2`) — primaria. Agrega varias fontes (Correios,
 *      ViaCEP, Open CEP) e responde pela primeira que acertar, entao encontra
 *      CEP novo que ainda nao entrou nas bases secundarias. Projeto aberto,
 *      mantido pela comunidade, sem limite publicado por chave.
 *
 *   2. ViaCEP — reserva. Esta no ar desde 2014 e e a base usada por boa parte
 *      do comercio eletronico brasileiro. Nao publica limite formal, mas pede
 *      uso "moderado" — por isso o cache abaixo.
 *
 * Ter as duas nao e exagero: o passo de localizacao nao pode travar porque um
 * servico gratuito saiu do ar. Se as duas falharem, a pessoa digita na mao —
 * o CEP nunca foi obrigatorio.
 *
 * Nenhuma das duas devolve coordenada confiavel no plano gratuito, e CEP no
 * Brasil pode cobrir uma rua inteira. Por isso a coordenada vem do GPS ou do
 * pin que a pessoa arrasta — nunca do CEP.
 *
 * As bases sao configuraveis por variavel de ambiente para dois casos reais:
 * apontar para um proxy interno (se um dia precisarmos de cache proprio) e
 * apontar para um servidor local nos testes automatizados. O padrao e sempre
 * o servico publico de verdade.
 */

const BRASILAPI_BASE = process.env.CEP_BRASILAPI_BASE ?? 'https://brasilapi.com.br';
const VIACEP_BASE = process.env.CEP_VIACEP_BASE ?? 'https://viacep.com.br';

/**
 * Tempo maximo POR fonte. Cada uma tem o seu relogio de proposito: um timeout
 * unico para as duas faria a reserva receber um sinal ja abortado sempre que a
 * primaria demorasse — ou seja, a reserva nunca seria consultada de verdade.
 */
const TIMEOUT_MS = 4_000;

// ---------------------------------------------------------------------------
// Cache em memoria
// ---------------------------------------------------------------------------

/*
 * CEP muda muito pouco, e a mesma rua e consultada por varias pessoas. Um
 * cache simples aqui derruba o volume nos servicos gratuitos sem precisar de
 * Redis nesta fase.
 *
 * Vive no processo: reiniciar o servidor limpa, e cada instancia tem o seu.
 * Para o volume desta fase isso basta. Quando houver varias instancias, o
 * lugar de trocar e aqui — nada mais no codigo muda.
 */
type Entry = { at: number; value: CepResult | null };
const cache = new Map<string, Entry>();
const TTL_OK = 24 * 60 * 60 * 1_000;
const TTL_MISS = 60 * 60 * 1_000;
const MAX_ENTRIES = 5_000;

function readCache(cep: string): Entry | undefined {
  const hit = cache.get(cep);
  if (!hit) return undefined;
  const ttl = hit.value ? TTL_OK : TTL_MISS;
  if (Date.now() - hit.at > ttl) {
    cache.delete(cep);
    return undefined;
  }
  return hit;
}

function writeCache(cep: string, value: CepResult | null) {
  if (cache.size >= MAX_ENTRIES) {
    // Descarta o mais antigo: Map preserva ordem de insercao.
    const primeiro = cache.keys().next();
    if (!primeiro.done) cache.delete(primeiro.value);
  }
  cache.set(cep, { at: Date.now(), value });
}

/** Usado pelos testes para comecar de um estado conhecido. */
export function clearCepCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------

/** Lancado quando a fonte nao encontrou o CEP (diferente de estar fora do ar). */
class NotFound extends Error {}

async function fromBrasilApi(cep: string, signal: AbortSignal): Promise<CepResult> {
  const res = await fetch(`${BRASILAPI_BASE}/api/cep/v2/${cep}`, {
    signal,
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new Error(`brasilapi HTTP ${res.status}`);

  const data = (await res.json()) as {
    cep?: string;
    state?: string;
    city?: string;
    neighborhood?: string | null;
    street?: string | null;
    location?: {
      coordinates?: { latitude?: string | number | null; longitude?: string | number | null };
    };
  };

  if (!data.state || !data.city) throw new Error('brasilapi devolveu resposta incompleta');

  /*
   * A v2 devolve `location.coordinates` para parte dos CEPs — e a unica fonte
   * de coordenada que temos sem chave de geocodificacao. Usamos SO para
   * centralizar o mapa, e descartamos qualquer valor fora do Brasil ou nao
   * numerico em vez de confiar no que veio.
   */
  const lat = Number(data.location?.coordinates?.latitude);
  const lng = Number(data.location?.coordinates?.longitude);
  const dentroDoBrasil =
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -33.75 && lat <= 5.27 && lng >= -73.99 && lng <= -34.79;

  return {
    cep: normalizeCep(data.cep ?? cep) ?? cep,
    state: data.state.toUpperCase(),
    city: data.city,
    district: data.neighborhood ?? '',
    street: data.street ?? '',
    ...(dentroDoBrasil ? { approx: { lat, lng } } : {}),
    source: 'brasilapi',
  };
}

async function fromViaCep(cep: string, signal: AbortSignal): Promise<CepResult> {
  const res = await fetch(`${VIACEP_BASE}/ws/${cep}/json/`, {
    signal,
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`viacep HTTP ${res.status}`);

  const data = (await res.json()) as {
    erro?: boolean | string;
    uf?: string;
    localidade?: string;
    bairro?: string | null;
    logradouro?: string | null;
  };

  // ViaCEP responde 200 com `{"erro": true}` quando o CEP nao existe.
  if (data.erro) throw new NotFound();
  if (!data.uf || !data.localidade) throw new Error('viacep devolveu resposta incompleta');

  return {
    cep: normalizeCep(cep) ?? cep,
    state: data.uf.toUpperCase(),
    city: data.localidade,
    district: data.bairro ?? '',
    street: data.logradouro ?? '',
    source: 'viacep',
  };
}

// ---------------------------------------------------------------------------
// Entrada publica
// ---------------------------------------------------------------------------

/**
 * Consulta um CEP nos servicos reais, com cache.
 *
 * Lanca `CepError` com o motivo — quem chama traduz para mensagem. Nunca
 * devolve endereco inventado: se as fontes nao responderam, e `indisponivel`,
 * e nao um endereco em branco que pareceria valido.
 */
export async function lookupCep(raw: string): Promise<CepResult> {
  const digits = onlyDigits(raw);
  if (digits.length !== 8) throw new CepError('formato');

  const cached = readCache(digits);
  if (cached) {
    if (cached.value) return cached.value;
    throw new CepError('nao_encontrado');
  }

  const falhas: string[] = [];

  for (const fonte of [fromBrasilApi, fromViaCep]) {
    try {
      const value = await fonte(digits, AbortSignal.timeout(TIMEOUT_MS));
      writeCache(digits, value);
      return value;
    } catch (err) {
      if (err instanceof NotFound) {
        /*
         * A primaria agrega varias bases. Quando ELA diz que nao existe, nao
         * ha por que perguntar a reserva — e um CEP inexistente, nao uma fonte
         * fora do ar.
         */
        writeCache(digits, null);
        throw new CepError('nao_encontrado');
      }
      falhas.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Detalhe tecnico vai para o log; a pessoa ve a mensagem curta.
  console.error(`[cep] nenhuma fonte respondeu para ${digits}: ${falhas.join(' | ')}`);
  throw new CepError('indisponivel');
}

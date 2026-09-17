/**
 * Busca de endereco por CEP.
 *
 * Usa a BrasilAPI, que agrega varias fontes (incluindo os Correios) e nao
 * exige chave nem cadastro. Em caso de falha, cai para o ViaCEP — as duas sao
 * gratuitas, e ter duas evita que a etapa de localizacao pare quando uma sai
 * do ar.
 *
 * O CEP preenche o endereco por texto. A COORDENADA nao vem daqui: ela vem do
 * GPS do navegador ou do pin que a pessoa arrasta no mapa. CEP no Brasil pode
 * cobrir uma rua inteira, e um ponto errado no mapa e pior que nenhum.
 */

export type CepResult = {
  cep: string;
  state: string;
  city: string;
  district: string;
  street: string;
};

export class CepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CepError';
  }
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

export function formatCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function fetchBrasilApi(cep: string, signal: AbortSignal): Promise<CepResult> {
  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal });
  if (!res.ok) throw new CepError(res.status === 404 ? 'CEP não encontrado.' : 'Falha na consulta.');

  const data = (await res.json()) as {
    cep: string; state: string; city: string; neighborhood?: string; street?: string;
  };
  return {
    cep: data.cep,
    state: data.state,
    city: data.city,
    district: data.neighborhood ?? '',
    street: data.street ?? '',
  };
}

async function fetchViaCep(cep: string, signal: AbortSignal): Promise<CepResult> {
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
  if (!res.ok) throw new CepError('Falha na consulta.');

  const data = (await res.json()) as {
    erro?: boolean | string; uf: string; localidade: string; bairro: string; logradouro: string;
  };
  if (data.erro) throw new CepError('CEP não encontrado.');

  return {
    cep,
    state: data.uf,
    city: data.localidade,
    district: data.bairro ?? '',
    street: data.logradouro ?? '',
  };
}

/**
 * Consulta um CEP. Lanca `CepError` com mensagem pronta para a interface.
 *
 * O timeout de 6 segundos existe para a etapa nao ficar travada quando o
 * servico esta lento: passando disso, a pessoa preenche na mao.
 */
export async function lookupCep(rawCep: string): Promise<CepResult> {
  const cep = onlyDigits(rawCep);
  if (cep.length !== 8) throw new CepError('CEP precisa ter 8 dígitos.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    return await fetchBrasilApi(cep, controller.signal);
  } catch (primeira) {
    if (primeira instanceof CepError && primeira.message === 'CEP não encontrado.') {
      clearTimeout(timeout);
      throw primeira;
    }
    try {
      return await fetchViaCep(cep, controller.signal);
    } catch {
      throw new CepError(
        'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

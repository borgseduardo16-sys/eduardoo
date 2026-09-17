/**
 * CEP — parte que roda nos dois lados.
 *
 * Este modulo e puro de proposito: nao faz requisicao e nao guarda segredo,
 * entao o navegador pode importar para formatar o campo enquanto a pessoa
 * digita. A consulta de verdade fica em `cep-lookup.ts` (`server-only`) e e
 * exposta pela rota `/api/cep/[cep]`.
 *
 * Por que a consulta nao sai do navegador:
 *  1. O servidor precisa confirmar o endereco na hora de salvar. Se a unica
 *     consulta acontecesse no cliente, bastaria um POST forjado para gravar
 *     "Sao Paulo/SP" num CEP do Espirito Santo.
 *  2. Um cache no servidor atende varias pessoas com a mesma consulta, o que
 *     mantem o volume baixo nos servicos gratuitos que usamos.
 */

export type CepResult = {
  /** Sempre normalizado com hifen: `29700-000`. */
  cep: string;
  state: string;
  city: string;
  district: string;
  street: string;
  /**
   * Centro APROXIMADO do CEP, quando a fonte devolve. Serve so para
   * recentralizar o mapa: e o centroide da faixa de CEP, que pode cobrir uma
   * rua inteira. Nunca vira o ponto do anuncio — quem marca o ponto e a
   * pessoa, arrastando o pino.
   */
  approx?: { lat: number; lng: number };
  /** Qual servico respondeu. Vai para o log, nao para a interface. */
  source?: 'brasilapi' | 'viacep';
};

/** Motivo da falha. A interface escolhe a mensagem a partir daqui. */
export type CepFailure = 'formato' | 'nao_encontrado' | 'indisponivel';

export const CEP_MESSAGES: Record<CepFailure, string> = {
  formato: 'CEP precisa ter 8 dígitos.',
  nao_encontrado: 'CEP não encontrado.',
  indisponivel: 'Não conseguimos consultar o CEP agora. Tente novamente.',
};

export class CepError extends Error {
  constructor(readonly reason: CepFailure) {
    super(CEP_MESSAGES[reason]);
    this.name = 'CepError';
  }
}

export function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/** Formata enquanto digita: `29700000` e `29700-000` viram `29700-000`. */
export function formatCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Forma canonica guardada e devolvida pela API: 8 digitos com hifen. */
export function normalizeCep(v: string): string | null {
  const d = onlyDigits(v);
  if (d.length !== 8) return null;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** true quando ja da para consultar. Evita bater no servico a cada tecla. */
export function isCepComplete(v: string): boolean {
  return onlyDigits(v).length === 8;
}

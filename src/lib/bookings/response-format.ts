/**
 * Taxa e tempo de resposta do proprietário — regras e textos (Fase 22).
 *
 * Módulo puro: recebe as contagens já apuradas no banco
 * (`response-stats.ts`) e decide o que pode ser mostrado. Nada aqui inventa
 * número: sem dado suficiente, a resposta é `null` e a tela não mostra nada
 * — ausência de histórico não vira sinal negativo.
 *
 * O QUE CONTA
 *
 * - Respondida: a solicitação recebeu aceite ou recusa (`responded_at`
 *   preenchido). Inclui a recusa automática de quem pediu o mesmo espaço
 *   quando outro interessado é aceito — para quem pediu, é uma resposta.
 * - Sem resposta: venceu sem aceite nem recusa (7 dias, configurável em
 *   `booking.request_expiry_days`).
 * - Fica de fora: o que ainda está dentro do prazo e o que quem pediu
 *   cancelou antes da resposta — o proprietário não teve a chance inteira.
 *
 * Janela: últimos 12 meses, para comportamento antigo não pesar para sempre.
 */

export const RESPONSE_WINDOW_DAYS = 365;
/** Mínimo de solicitações decididas (respondidas + vencidas) para mostrar a taxa. */
export const MIN_DECIDED_FOR_RATE = 3;
/** Mínimo de respostas para mostrar o tempo típico. */
export const MIN_ANSWERED_FOR_TIME = 3;

export type ResponseStats = {
  /** Respondidas + vencidas sem resposta, na janela. */
  decided: number;
  /** Respondidas (aceitas ou recusadas), na janela. */
  answered: number;
  /** Mediana, em segundos, entre a solicitação e a resposta. `null` sem respostas. */
  medianSeconds: number | null;
};

export type ResponseTimeBucket = 'hour' | 'few_hours' | 'day' | 'days';

const HORA = 60 * 60;

/**
 * Faixa em vez de número exato: "em poucas horas" diz o que importa sem
 * fingir uma precisão que 5 ou 10 respostas não têm.
 */
export function responseTimeBucket(seconds: number): ResponseTimeBucket {
  if (seconds <= HORA) return 'hour';
  if (seconds <= 6 * HORA) return 'few_hours';
  if (seconds <= 24 * HORA) return 'day';
  return 'days';
}

export const RESPONSE_TIME_LABEL: Record<ResponseTimeBucket, string> = {
  hour: 'em até 1 hora',
  few_hours: 'em poucas horas',
  day: 'em até 1 dia',
  days: 'em alguns dias',
};

/**
 * Porcentagem inteira, arredondada PARA BAIXO: 199 de 200 é 99%, nunca
 * "100%" com uma solicitação sem resposta. `null` abaixo do mínimo.
 */
export function responseRatePercent(stats: ResponseStats): number | null {
  if (stats.decided < MIN_DECIDED_FOR_RATE) return null;
  return Math.floor((stats.answered * 100) / stats.decided);
}

/** Faixa do tempo típico, ou `null` quando ainda não há respostas suficientes. */
export function typicalResponseBucket(stats: ResponseStats): ResponseTimeBucket | null {
  if (stats.answered < MIN_ANSWERED_FOR_TIME || stats.medianSeconds == null) return null;
  return responseTimeBucket(stats.medianSeconds);
}

function solicitacoes(n: number): string {
  return n === 1 ? '1 solicitação' : `${n} solicitações`;
}

/** Explicação da taxa, com as contagens reais por trás do número. */
export function responseRateExplanation(stats: ResponseStats): string {
  return (
    `Nos últimos 12 meses, respondeu ${stats.answered} de ${solicitacoes(stats.decided)} — ` +
    'aceitando ou recusando. Pedidos cancelados por quem pediu antes da resposta não entram na conta.'
  );
}

/** Explicação do tempo típico (mediana). */
export function responseTimeExplanation(stats: ResponseStats): string {
  return (
    'Tempo entre a solicitação e a resposta nos últimos 12 meses: metade das respostas chegou ' +
    `dentro desse prazo. Calculado a partir de ${stats.answered} respostas.`
  );
}

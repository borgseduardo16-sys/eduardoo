/**
 * Situação da renovação mensal de um aluguel (Fase 23) — módulo puro.
 *
 * Tudo sai das cobranças reais gravadas pelo webhook do gateway; nada aqui
 * muda status: é só leitura para a tela. Datas 'AAAA-MM-DD'.
 */

export type RenewalCharge = {
  id: string;
  dueDate: string;
  amountCents: number;
  status: string;
  paidAt: string | null;
  invoiceUrl: string | null;
};

export type RenewalState = 'em_dia' | 'aguardando' | 'atrasada' | 'recusada' | 'encerrada';

export const RENEWAL_STATE_LABEL: Record<RenewalState, string> = {
  em_dia: 'Em dia',
  aguardando: 'Aguardando pagamento',
  atrasada: 'Em atraso',
  recusada: 'Pagamento recusado',
  encerrada: 'Encerrada',
};

const ABERTAS = ['pending', 'overdue'];
const PAGAS = ['confirmed', 'received'];

/** Soma meses mantendo o dia, e cai no último dia quando o mês é mais curto (31/01 + 1 → 28/02). */
export function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

function menosUmDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeRenewal(
  input: {
    bookingStatus: string;
    subscriptionStatus: string | null;
    subscriptionNextDueDate: string | null;
    subscriptionAmountCents: number | null;
    charges: readonly RenewalCharge[];
  },
  today: string,
): {
  state: RenewalState;
  /** Próxima cobrança: a em aberto mais antiga, ou a data que a assinatura ainda vai gerar. */
  next: { dueDate: string; amountCents: number; invoiceUrl: string | null; generated: boolean } | null;
  /** Último dia coberto pelas mensalidades já pagas (cada uma cobre um mês a partir do vencimento). */
  paidThrough: string | null;
} {
  const pagas = input.charges.filter((c) => PAGAS.includes(c.status)).map((c) => c.dueDate).sort();
  const ultimaPaga = pagas[pagas.length - 1];
  const paidThrough = ultimaPaga ? menosUmDia(addMonthsIso(ultimaPaga, 1)) : null;

  const encerrada =
    ['ended', 'cancelled', 'rejected', 'expired'].includes(input.bookingStatus) ||
    ['cancelled', 'expired'].includes(input.subscriptionStatus ?? '');
  if (encerrada) return { state: 'encerrada', next: null, paidThrough };

  const abertas = input.charges.filter((c) => ABERTAS.includes(c.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const maisRecente = [...input.charges].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];

  let state: RenewalState = 'em_dia';
  if (
    input.subscriptionStatus === 'past_due' ||
    abertas.some((c) => c.status === 'overdue' || c.dueDate < today)
  ) {
    state = 'atrasada';
  } else if (maisRecente?.status === 'failed') {
    state = 'recusada';
  } else if (abertas.length > 0) {
    state = 'aguardando';
  }

  // Recusada: o caminho para resolver é a própria cobrança (link do gateway).
  const aberta = abertas[0] ?? (state === 'recusada' ? maisRecente : undefined);
  const next = aberta
    ? { dueDate: aberta.dueDate, amountCents: aberta.amountCents, invoiceUrl: aberta.invoiceUrl, generated: true }
    : input.subscriptionNextDueDate && input.subscriptionAmountCents
      ? { dueDate: input.subscriptionNextDueDate, amountCents: input.subscriptionAmountCents, invoiceUrl: null, generated: false }
      : null;

  return { state, next, paidThrough };
}

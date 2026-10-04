/**
 * Janela do pagamento pendente — módulo puro (servidor e navegador).
 *
 * Quando a cobrança do mês falha (cartão recusado, Pix não pago até o
 * vencimento), a locação NÃO é encerrada na hora: a pessoa tem uma janela
 * TOTAL de 2 horas para regularizar. O banco grava o prazo na reserva
 * (`payment_issue_deadline_at`, sempre início + 120 min, conferido por CHECK)
 * e quem encerra, se o prazo passar, é `release_expired_rentals` — pelo
 * relógio do banco, nunca pelo do aparelho.
 *
 * Durante a janela a pessoa pode tentar de novo no cartão ou pagar por Pix; se
 * regularizar, a locação segue como se nada tivesse acontecido.
 */

/** Janela TOTAL para regularizar o pagamento. Igual ao CHECK `bookings_payment_window`. */
export const PAYMENT_WINDOW_MINUTES = 120;

export type PaymentWindowState = {
  deadlineAt: Date;
  /** Milissegundos que faltam (0 quando já passou). */
  remainingMs: number;
  over: boolean;
};

export function paymentWindowState(deadlineAt: Date, now: Date): PaymentWindowState {
  const remainingMs = Math.max(0, deadlineAt.getTime() - now.getTime());
  return { deadlineAt, remainingMs, over: remainingMs === 0 };
}

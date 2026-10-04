/**
 * Prazos do fluxo de locação — módulo puro (servidor e navegador).
 *
 * Quem VALE é o banco: o prazo de resposta (24 h), o prazo para pagar (24 h)
 * e a janela do pagamento pendente (2 h) são gravados na própria reserva, com
 * o relógio do banco, e quem encerra o que venceu é `release_expired_rentals`.
 * O que está aqui só decide QUANDO avisar e COMO escrever o prazo.
 */
import { addDaysToDate, brDate, brTime } from '@/lib/time';

/** Quantas horas antes do fim do prazo de resposta o proprietário é lembrado. */
export const REQUEST_EXPIRING_NOTICE_HOURS = 4;

/** Quantas horas antes do fim do prazo de pagamento o locatário é lembrado. */
export const PAYMENT_EXPIRING_NOTICE_HOURS = 4;

/** Quantos minutos antes do fim da janela de 2 h o "último aviso" sai. */
export const PAYMENT_WINDOW_NOTICE_MINUTES = 30;

/**
 * Prazo em linguagem de gente: "hoje às 15:30", "amanhã às 09:00" ou
 * "21/11 às 13:00" — sempre hora de Brasília, relativo ao dia de `now`.
 */
export function formatDeadline(deadline: Date, now: Date): string {
  const dia = brDate(deadline);
  const hoje = brDate(now);
  const hora = brTime(deadline);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === addDaysToDate(hoje, 1)) return `amanhã às ${hora}`;
  const [, mes, d] = dia.split('-');
  return `${d}/${mes} às ${hora}`;
}

/** "3 h 20 min", "45 min", "menos de 1 min" — o tempo que falta, para contagens e avisos. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'prazo encerrado';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return 'menos de 1 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

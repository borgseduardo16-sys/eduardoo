import type { BadgeProps } from '@/components/ui/badge';
import type { BookingStatus } from './queries';

type Tone = NonNullable<BadgeProps['tone']>;

/**
 * Rótulo por extenso + tom do Badge — nunca só a cor, sempre o texto também.
 *
 * Os estados são organizados sem redundância:
 *   solicitação → pendente, aceita, recusada, expirada
 *   locação     → aguardando início, ativa, pagamento pendente, encerrada, cancelada
 * "Aceita" e "aguardando pagamento" são a MESMA situação para quem aluga (falta
 * pagar); o banco distingue só se a pessoa já abriu o pagamento. "Aguardando
 * início" não é um estado gravado: é uma locação ativa cuja data ainda não chegou.
 */
export const BOOKING_STATUS_INFO: Record<BookingStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Solicitação pendente', tone: 'caution' },
  approved: { label: 'Aceita — falta pagar', tone: 'positive' },
  rejected: { label: 'Recusada', tone: 'neutral' },
  expired: { label: 'Expirada', tone: 'neutral' },
  awaiting_payment: { label: 'Aceita — falta pagar', tone: 'positive' },
  active: { label: 'Ativa', tone: 'positive' },
  past_due: { label: 'Pagamento pendente', tone: 'critical' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  ended: { label: 'Encerrada', tone: 'neutral' },
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_INFO[status as BookingStatus]?.label ?? status;
}

/**
 * Selo da locação para a tela: o estado do banco, com "Aguardando início"
 * quando a locação já está paga mas a data de início ainda não chegou.
 * `today` é a data de HOJE em Brasília (`brDate(new Date())`).
 */
export function bookingBadge(
  b: { status: string; startDate: string },
  today: string,
): { label: string; tone: Tone } {
  if (b.status === 'active' && b.startDate > today) return { label: 'Aguardando início', tone: 'accent' };
  const info = BOOKING_STATUS_INFO[b.status as BookingStatus];
  return info ?? { label: b.status, tone: 'neutral' };
}

/** Por que a locação terminou (ou nem chegou a valer), em português simples. */
export function endReasonLabel(reason: string | null): string | null {
  switch (reason) {
    case 'cancelled_by_renter':
      return 'Encerrada por quem alugava';
    case 'cancelled_by_owner':
      return 'Cancelada pelo proprietário';
    case 'payment_not_received':
      return 'Encerrada por falta de pagamento';
    case 'request_not_answered':
      return 'O proprietário não respondeu a tempo';
    case 'owner_end_request':
      return 'Encerrada a pedido do proprietário';
    default:
      return null;
  }
}

export function formatBookingDate(value: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

/** "21/11/2026" a partir de `YYYY-MM-DD` — sem passar por Date, então sem risco de fuso. */
export function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Próximo vencimento, no formato pedido: "21/11/2026" — e, quando o horário é
 * conhecido de verdade, "21/11/2026 às 13:00". O Asaas trabalha com data de
 * vencimento SEM hora; por isso o horário só aparece onde existe de fato
 * (prazos que o próprio banco grava: pagar o aceite, regularizar em 2 h).
 */
export function formatDueDate(iso: string | null, time?: string | null): string {
  if (!iso) return '—';
  return time ? `${formatDateShort(iso)} às ${time}` : formatDateShort(iso);
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

/** Dias de `today` até uma data `YYYY-MM-DD` (calendário, sem fuso). Negativo = já passou. */
export function daysUntil(iso: string, today: string): number {
  return dayNumber(iso) - dayNumber(today);
}

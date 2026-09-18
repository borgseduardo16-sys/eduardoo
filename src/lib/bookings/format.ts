import type { BadgeProps } from '@/components/ui/badge';
import type { BookingStatus } from './queries';

/** Rotulo por extenso + tom do Badge — nunca so a cor, sempre o texto tambem. */
export const BOOKING_STATUS_INFO: Record<BookingStatus, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  requested: { label: 'Aguardando resposta', tone: 'caution' },
  approved: { label: 'Aceita', tone: 'positive' },
  rejected: { label: 'Recusada', tone: 'neutral' },
  expired: { label: 'Expirada', tone: 'neutral' },
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'caution' },
  active: { label: 'Ativa', tone: 'positive' },
  past_due: { label: 'Pagamento atrasado', tone: 'critical' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  ended: { label: 'Encerrada', tone: 'neutral' },
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_INFO[status as BookingStatus]?.label ?? status;
}

export function formatBookingDate(value: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

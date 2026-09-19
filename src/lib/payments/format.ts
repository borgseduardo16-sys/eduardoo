import type { BadgeProps } from '@/components/ui/badge';

/** Rotulo por extenso + tom do Badge para o status de uma cobranca (`payments.status`). */
export const PAYMENT_STATUS_INFO: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  pending: { label: 'Aguardando pagamento', tone: 'caution' },
  confirmed: { label: 'Confirmado', tone: 'positive' },
  received: { label: 'Recebido', tone: 'positive' },
  overdue: { label: 'Atrasado', tone: 'critical' },
  refunded: { label: 'Estornado', tone: 'neutral' },
  partially_refunded: { label: 'Estornado parcialmente', tone: 'neutral' },
  chargeback: { label: 'Contestado', tone: 'critical' },
  failed: { label: 'Recusado', tone: 'critical' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function paymentStatusLabel(status: string | null): string {
  if (!status) return '—';
  return PAYMENT_STATUS_INFO[status]?.label ?? status;
}

/** Rotulo por extenso + tom do Badge para o status de um repasse (`payouts.status`). */
export const PAYOUT_STATUS_INFO: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  pending: { label: 'Pendente', tone: 'caution' },
  scheduled: { label: 'Agendado', tone: 'caution' },
  settled: { label: 'Pago', tone: 'positive' },
  failed: { label: 'Falhou', tone: 'critical' },
  reversed: { label: 'Revertido', tone: 'critical' },
};

export function payoutStatusLabel(status: string): string {
  return PAYOUT_STATUS_INFO[status]?.label ?? status;
}

/** Rotulo por extenso para o status de uma assinatura (`subscriptions.status`). */
export const SUBSCRIPTION_STATUS_INFO: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  pending_authorization: { label: 'Aguardando confirmação do pagamento', tone: 'caution' },
  active: { label: 'Ativa', tone: 'positive' },
  past_due: { label: 'Pagamento atrasado', tone: 'critical' },
  paused: { label: 'Pausada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  expired: { label: 'Expirada', tone: 'neutral' },
};

export function subscriptionStatusLabel(status: string | null): string {
  if (!status) return '—';
  return SUBSCRIPTION_STATUS_INFO[status]?.label ?? status;
}

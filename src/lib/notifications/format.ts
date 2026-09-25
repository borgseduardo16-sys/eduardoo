import {
  CircleCheck, CircleX, Ban, Wallet, Clock, MessageCircle, Star, ShieldCheck, Info, Bell,
  type LucideIcon,
} from 'lucide-react';

/** Ícone e tom por tipo de notificação — mesmo padrão de BOOKING_STATUS_INFO. */
export const NOTIFICATION_TYPE_INFO: Record<string, { icon: LucideIcon; tone: 'positive' | 'caution' | 'critical' | 'neutral' }> = {
  space_published: { icon: CircleCheck, tone: 'positive' },
  space_rejected: { icon: CircleX, tone: 'critical' },
  booking_requested: { icon: Clock, tone: 'neutral' },
  booking_approved: { icon: CircleCheck, tone: 'positive' },
  booking_rejected: { icon: CircleX, tone: 'neutral' },
  booking_cancelled: { icon: Ban, tone: 'neutral' },
  payment_confirmed: { icon: Wallet, tone: 'positive' },
  payment_upcoming: { icon: Clock, tone: 'caution' },
  payment_failed: { icon: Wallet, tone: 'critical' },
  payout_settled: { icon: Wallet, tone: 'positive' },
  new_message: { icon: MessageCircle, tone: 'neutral' },
  review_received: { icon: Star, tone: 'positive' },
  report_resolved: { icon: ShieldCheck, tone: 'neutral' },
  account_notice: { icon: Info, tone: 'neutral' },
};

export function notificationIcon(type: string): LucideIcon {
  return NOTIFICATION_TYPE_INFO[type]?.icon ?? Bell;
}

/** "há 3 minutos" / "há 2 dias" — sem depender de nenhuma lib nova. */
export function formatRelativeTime(value: Date, now = new Date()): string {
  const segundos = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
  if (segundos < 60) return 'agora mesmo';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(value);
}

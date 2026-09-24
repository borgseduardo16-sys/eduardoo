import type { BadgeProps } from '@/components/ui/badge';

export const PROMOTION_TYPE_LABEL = { destaque: 'Destaque', turbo: 'Turbo' } as const;

/** Rotulo por extenso + tom do Badge — mesmo padrao de BOOKING_STATUS_INFO. */
export const PROMOTION_STATUS_INFO: Record<
  'scheduled' | 'active' | 'expired' | 'cancelled',
  { label: string; tone: NonNullable<BadgeProps['tone']> }
> = {
  scheduled: { label: 'Agendada', tone: 'caution' },
  active: { label: 'Ativa agora', tone: 'positive' },
  expired: { label: 'Expirada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

export const PROMOTION_SOURCE_LABEL = {
  premium_benefit: 'Benefício Premium',
  purchase: 'Compra avulsa',
} as const;

/** Data curta para badge/aviso — "25 de set." */
export function formatPromotionDateShort(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(value);
}

/** Data por extenso — mesmo formato usado em bookings/format.ts. */
export function formatPromotionDateLong(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(value);
}

/** Data e hora — "24 de set. às 18:32", para início/término na área de gerenciamento. */
export function formatPromotionDateTime(value: Date): string {
  const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(value);
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);
  return `${data} às ${hora}`;
}

/** Duração contratada, a partir do intervalo real (funciona pra benefício grátis e compra avulsa igual). */
export function formatPromotionDuration(startedAt: Date, expiresAt: Date): string {
  const horas = Math.round((expiresAt.getTime() - startedAt.getTime()) / (60 * 60 * 1000));
  if (horas % 24 === 0 && horas >= 24) {
    const dias = horas / 24;
    return dias === 1 ? '1 dia' : `${dias} dias`;
  }
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

/** Tempo restante até expirar — "termina em 3h" / "termina em 2 dias" — só faz sentido pra promoção ainda ativa. */
export function formatTimeRemaining(expiresAt: Date, now = new Date()): string {
  const msRestante = expiresAt.getTime() - now.getTime();
  if (msRestante <= 0) return 'encerrando';
  const horas = msRestante / (60 * 60 * 1000);
  if (horas >= 24) {
    const dias = Math.ceil(horas / 24);
    return `termina em ${dias === 1 ? '1 dia' : `${dias} dias`}`;
  }
  if (horas >= 1) {
    const h = Math.floor(horas);
    return `termina em ${h}h`;
  }
  const minutos = Math.max(1, Math.round(msRestante / (60 * 1000)));
  return `termina em ${minutos} min`;
}

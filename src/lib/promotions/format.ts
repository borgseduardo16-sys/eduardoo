export const PROMOTION_TYPE_LABEL = { destaque: 'Destaque', turbo: 'Turbo' } as const;

/** Data curta para badge/aviso — "25 de set." */
export function formatPromotionDateShort(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(value);
}

/** Data por extenso — mesmo formato usado em bookings/format.ts. */
export function formatPromotionDateLong(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(value);
}

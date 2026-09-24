/**
 * Catalogo de precos da compra avulsa de Destaque/Turbo.
 *
 * Valores fixos, definidos pelo usuario — "nao criar precos diferentes dos
 * definidos nesta etapa". Por isso vivem em codigo, nao em `platform_settings`
 * (que e para valor ainda-a-decidir ou sujeito a mudar sem aviso, como a taxa
 * da plataforma — este catalogo e o oposto disso).
 */

export type DestaqueDurationDays = 1 | 3 | 5;
export type TurboDurationHours = 1 | 5 | 12 | 24;

export type PromotionPriceOption = {
  /** Duracao em horas — unidade unica usada no banco (`promotion_purchases.duration_hours`). */
  durationHours: number;
  /** So para exibir na interface, na unidade natural de cada modalidade. */
  label: string;
  priceCents: number;
};

export const DESTAQUE_PRICE_OPTIONS: readonly PromotionPriceOption[] = [
  { durationHours: 24, label: '1 dia', priceCents: 1290 },
  { durationHours: 72, label: '3 dias', priceCents: 1990 },
  { durationHours: 120, label: '5 dias', priceCents: 2490 },
];

export const TURBO_PRICE_OPTIONS: readonly PromotionPriceOption[] = [
  { durationHours: 1, label: '1 hora', priceCents: 990 },
  { durationHours: 5, label: '5 horas', priceCents: 1590 },
  { durationHours: 12, label: '12 horas', priceCents: 1990 },
  { durationHours: 24, label: '24 horas', priceCents: 2790 },
];

export function priceOptionsFor(type: 'destaque' | 'turbo'): readonly PromotionPriceOption[] {
  return type === 'destaque' ? DESTAQUE_PRICE_OPTIONS : TURBO_PRICE_OPTIONS;
}

/**
 * Confere se (tipo, duracao, preco) bate EXATAMENTE com uma opcao do
 * catalogo — nunca confia no preco que a tela mandou, so no que foi
 * escolhido. Usado na action antes de cobrar qualquer coisa.
 */
export function findPriceOption(
  type: 'destaque' | 'turbo',
  durationHours: number,
): PromotionPriceOption | null {
  return priceOptionsFor(type).find((o) => o.durationHours === durationHours) ?? null;
}

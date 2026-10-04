import { formatBRL, formatBRLShort, formatBps, ownerNetFor } from '@/lib/money';

/**
 * Preço de um anúncio — módulo puro (servidor e navegador).
 *
 * O marketplace aluga só por MÊS: o anúncio tem um preço mensal, em centavos
 * inteiros, definido pelo proprietário. É o mesmo valor que o servidor cobra
 * (o banco confere: `bookings_rent_matches_space`).
 */
export type PriceSummary = {
  priceMonthlyCents: number | null;
};

/** O preço de cartões, listas e mapa: "R$ 300,00" + "/mês". `null` quando o anúncio ainda não tem preço. */
export function priceHeadline(s: PriceSummary): { amount: string; suffix: string } | null {
  if (s.priceMonthlyCents == null) return null;
  return { amount: formatBRL(s.priceMonthlyCents), suffix: '/mês' };
}

/** Mesmo texto, sem marcação — para aria-label, prévia de link e imagem de compartilhamento. */
export function priceText(s: PriceSummary): string {
  const h = priceHeadline(s);
  return h ? `${h.amount}${h.suffix}` : 'Sem preço definido';
}

/**
 * A frase da criação do anúncio: "Você receberá R$ 291 por mês. Esse valor já
 * considera a taxa de serviço de 3%." — o líquido do proprietário, calculado
 * pela mesma conta do repasse (src/lib/money.ts), nunca digitado.
 */
export function ownerReceivesPhrase(priceCents: number, ownerFeeBps: number): string {
  const { netCents } = ownerNetFor(priceCents, ownerFeeBps);
  return `Você receberá ${formatBRLShort(netCents)} por mês. Esse valor já considera a taxa de serviço de ${formatBps(ownerFeeBps)}.`;
}

import { formatBRL, formatBRLShort, formatBps, ownerNetFor, type OwnerFeeDecision, type OwnerFeePolicy } from '@/lib/money';

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
 * A frase da criação do anúncio: "Você receberá R$ 294 por mês. Já descontada a
 * taxa de serviço de 2%." — o líquido do proprietário, calculado pela mesma
 * conta do repasse (src/lib/money.ts), nunca digitado.
 */
export function ownerReceivesPhrase(priceCents: number, ownerFeeBps: number): string {
  const { netCents } = ownerNetFor(priceCents, ownerFeeBps);
  return `Você receberá ${formatBRLShort(netCents)} por mês. Já descontada a taxa de serviço de ${formatBps(ownerFeeBps)}.`;
}

export type OwnerFeeNote =
  /** Premium pago: a taxa reduzida está valendo neste valor. */
  | { kind: 'reduced'; text: string }
  /** Premium pago, mas o aluguel está abaixo do piso: vale a taxa padrão, e a pessoa precisa saber por quê. */
  | { kind: 'below_floor'; text: string }
  /** Sem Premium e o valor já alcança o piso: o que o Premium mudaria (o texto leva ao /premium). */
  | { kind: 'upsell'; text: string };

/**
 * Explica a taxa do proprietário neste valor, conforme a situação dele. `null`
 * quando não há nada a dizer (sem Premium e abaixo do piso, ou sem taxa reduzida
 * configurada). Só texto — quem decide a taxa é o servidor.
 */
export function ownerFeeNote(opts: {
  priceCents: number;
  premiumFinancial: boolean;
  decision: OwnerFeeDecision;
  policy: OwnerFeePolicy;
}): OwnerFeeNote | null {
  const { priceCents, premiumFinancial, decision, policy } = opts;
  if (policy.premiumBps >= policy.standardBps) return null;
  const piso = formatBRL(policy.premiumMinRentCents);
  if (decision.reduced) {
    return { kind: 'reduced', text: `Taxa reduzida do Premium: ${formatBps(policy.premiumBps)} em vez de ${formatBps(policy.standardBps)}.` };
  }
  if (premiumFinancial && decision.belowFloor) {
    return {
      kind: 'below_floor',
      text: `A taxa reduzida de ${formatBps(policy.premiumBps)} do Premium vale para aluguéis a partir de ${piso}. Neste valor, a taxa é a padrão, de ${formatBps(policy.standardBps)}.`,
    };
  }
  if (!premiumFinancial && priceCents >= policy.premiumMinRentCents) {
    const { netCents } = ownerNetFor(priceCents, policy.premiumBps);
    return { kind: 'upsell', text: `No Premium a taxa cai para ${formatBps(policy.premiumBps)} (aluguéis a partir de ${piso}): você receberia ${formatBRLShort(netCents)} por mês.` };
  }
  return null;
}

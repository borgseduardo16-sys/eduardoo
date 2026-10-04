/**
 * Datas de início de uma locação — módulo puro (servidor e navegador).
 *
 * O bloqueio do calendário fecha dias para o INÍCIO de locações novas, como um
 * calendário de entrada: quem já está dentro continua, e uma locação que começa
 * antes de um bloqueio futuro não é afetada por ele. A mesma regra vale para a
 * solicitação, para a busca por disponibilidade e para o calendário da tela —
 * a busca nunca mostra como disponível algo que a solicitação recusaria.
 */
import { addDaysToDate } from '@/lib/time';

export type SpaceBlockPublic = { startsOn: string; endsOn: string };

/** O bloqueio que cobre o DIA DE INÍCIO pedido, se houver. */
export function blockCoveringStart(start: string, blocks: readonly SpaceBlockPublic[]): SpaceBlockPublic | null {
  return blocks.find((b) => b.startsOn <= start && start <= b.endsOn) ?? null;
}

/**
 * Primeira data em que uma locação pode começar: hoje ou depois, não antes de
 * "disponível a partir de", e fora de qualquer bloqueio. Sem "disponível a
 * partir de", o anúncio não informa quando fica disponível: `null`.
 */
export function earliestStartDate(input: {
  today: string;
  availableFrom: string | null;
  blocks: readonly SpaceBlockPublic[];
}): string {
  let inicio = input.today;
  if (input.availableFrom && input.availableFrom > inicio) inicio = input.availableFrom;
  // Cada passada que cai num bloqueio pula para o dia seguinte ao fim dele;
  // blocos encadeados (10–12 e 13–15) resolvem em passadas seguidas.
  for (let i = 0; i <= input.blocks.length; i++) {
    const cobrindo = blockCoveringStart(inicio, input.blocks);
    if (!cobrindo) break;
    inicio = addDaysToDate(cobrindo.endsOn, 1);
  }
  return inicio;
}

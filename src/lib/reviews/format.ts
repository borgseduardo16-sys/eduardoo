/**
 * Exibição de nota — regra única do app inteiro (Fase 21).
 *
 * A média é calculada e arredondada UMA vez, no banco, com uma casa decimal:
 * `ROUND(AVG(rating)::numeric, 1)`, metade para cima (4,65 → 4,7;
 * 4,6666 → 4,7). Aqui só se troca o ponto pela vírgula — nenhuma conta com
 * float, que arredonda errado em casos como 4,35.toFixed(1) === "4.3".
 *
 * Módulo puro: usado por componentes de servidor e de cliente.
 */

/**
 * "4.7" → "4,7". Aceita o texto que o driver devolve para `numeric`
 * (inclusive "4.70" da coluna `spaces.rating_avg`, que tem 2 casas de
 * escala). Se um dia chegar valor com mais casas, arredonda em décimos pela
 * mesma regra do banco — só o dígito dos centésimos decide.
 */
export function formatRating(value: string | null | undefined): string | null {
  if (value == null) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const centesimos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0').slice(0, 2));
  const decimos = Math.floor((centesimos + 5) / 10);
  return `${Math.floor(decimos / 10)},${decimos % 10}`;
}

export function reviewCountLabel(count: number): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? 'avaliação' : 'avaliações'}`;
}

/** "4,8 ★ · 17 avaliações" — só faz sentido com pelo menos uma avaliação. */
export function ratingSummaryLabel(average: string | null, count: number): string | null {
  const nota = formatRating(average);
  if (!nota || count <= 0) return null;
  return `${nota} ★ · ${reviewCountLabel(count)}`;
}

/**
 * Data aproximada de uma avaliação ("março de 2026"). Dia exato não ajuda
 * quem lê e ajuda a cruzar a avaliação com uma reserva específica.
 */
export function reviewMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date);
}

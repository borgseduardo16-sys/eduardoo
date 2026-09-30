/**
 * Datas de calendário no fuso do app (São Paulo).
 *
 * O servidor roda em UTC: depois das 21h em Brasília, `toISOString()` já é
 * "amanhã". Tudo que é DIA para a pessoa (hoje, começo de mês, "disponível a
 * partir de") usa esta função. Módulo puro.
 */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

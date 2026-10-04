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

/**
 * "Hoje" em Brasília como expressão SQL, para consultas que comparam com colunas `date`.
 *
 * Não use `CURRENT_DATE` no app: ele segue o fuso do banco (UTC, também no Supabase) e, depois das 21h em
 * Brasília, já é "amanhã" — um bloqueio que termina hoje sumia da lista, e "disponível a partir de hoje"
 * enxergava anúncios de amanhã. Use com `sql.raw(HOJE_BR_SQL)`; é uma constante nossa, nunca texto de usuário.
 */
export const HOJE_BR_SQL = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/**
 * Formatação de perfil — módulo puro (servidor e cliente).
 */

/** Nome para exibir quando a pessoa não informou nenhum. */
export function displayNameOr(publicName: string | null | undefined, fallback = 'Usuário da MyPlace'): string {
  return publicName?.trim() || fallback;
}

/** "Na MyPlace desde março de 2026". */
export function memberSinceLabel(createdAt: Date): string {
  const mes = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(createdAt);
  return `Na MyPlace desde ${mes}`;
}

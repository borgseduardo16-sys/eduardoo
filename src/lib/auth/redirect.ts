/**
 * Validação de destino de redirecionamento.
 *
 * Fica fora de actions.ts porque um arquivo 'use server' só pode exportar
 * funções async — e esta precisa ser chamada de forma síncrona, inclusive em
 * Route Handlers.
 *
 * Bloqueia "open redirect": sem esta checagem, um link como
 * /entrar?next=https://site-falso.com levaria o usuário recém-autenticado para
 * fora do domínio, o que é a base de um golpe de phishing convincente.
 */
export function isSafeRedirect(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  // "//host" e "/\host" são tratados como URL absoluta por alguns navegadores.
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  if (path.includes('://')) return false;
  // Caracteres de controle podem quebrar o cabeçalho Location.
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  return true;
}

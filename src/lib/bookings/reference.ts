/**
 * Codigo curto de uma reserva (ex.: MP-7F3K9Q) — para suporte, comprovante e
 * o que a pessoa le em voz alta ao telefone. Mesmo alfabeto sem caracteres
 * ambiguos usado em `spaces/slug.ts` (sem 0/O, 1/I/L).
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function buildBookingReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const sufixo = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `MP-${sufixo}`;
}

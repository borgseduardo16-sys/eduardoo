import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Compara dois tokens em tempo constante.
 *
 * `!==` sai mais rapido quanto mais cedo os bytes divergem — um atacante
 * medindo a latencia da resposta consegue, byte a byte, descobrir o token
 * certo (timing attack). `timingSafeEqual` sempre compara todos os bytes,
 * mas exige os dois buffers do MESMO tamanho — por isso o `if` de tamanho
 * vem antes, e sozinho nao vaza informacao util (so "acertou o tamanho",
 * nao o conteudo).
 *
 * Compartilhado entre o webhook do Asaas e a rota de cron — os dois
 * autenticam um chamador de servidor por token fixo em header.
 */
export function timingSafeEqualStrings(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

/**
 * E-mail de um usuario a partir do id.
 *
 * `profiles` nao guarda e-mail de proposito (fica em `auth.users`, gerenciada
 * pelo Supabase Auth — ver o comentario em `src/db/schema/users.ts`). Isso
 * basta para tudo que ja existia: a sessao atual sempre traz o proprio
 * e-mail direto do token (`SessionUser.email` em `dal.ts`). Notificar OUTRA
 * pessoa (ex.: quem recebeu uma mensagem) precisa buscar o e-mail dela, que
 * nao esta na sessao de ninguem — daqui.
 *
 * `auth.users` nao tem tabela Drizzle propria (o schema `auth` fica de fora
 * de `drizzle-kit generate` por `schemaFilter: ['public']` em
 * drizzle.config.ts); consulta direta e o mesmo padrao ja usado em
 * `storage/actions.ts` e `spaces/actions.ts` para SQL que nao cabe no query builder.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const rows = await db.execute<{ email: string | null }>(
    sql`SELECT email FROM auth.users WHERE id = ${userId}`,
  );
  return rows[0]?.email ?? null;
}

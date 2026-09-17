import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { PG_CONNECTION_PARAMS } from './connection';

/**
 * Executor de migracoes.
 *
 * Usa uma conexao dedicada com max:1 porque o migrador roda DDL em transacao.
 * Aponte para a conexao DIRETA do Postgres (porta 5432 no Supabase), nunca
 * para o pooler — DDL via pgbouncer em transaction mode quebra.
 */
async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (ou DIRECT_DATABASE_URL) nao definida.');

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connection: PG_CONNECTION_PARAMS,
  });
  const db = drizzle(sql);

  console.log('→ aplicando migracoes de ./drizzle ...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✓ migracoes aplicadas com sucesso');

  await sql.end();
}

main().catch((err) => {
  console.error('✗ falha ao migrar:', err);
  process.exit(1);
});

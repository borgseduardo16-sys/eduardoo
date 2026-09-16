import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { serverEnv } from '@/lib/env';

/**
 * Conexao Postgres da aplicacao.
 *
 * Em serverless cada invocacao pode criar um processo novo, entao o pool fica
 * pequeno e reaproveitamos a instancia entre hot reloads em desenvolvimento.
 * Em producao aponte DATABASE_URL para o POOLER do Supabase (porta 6543).
 * As migracoes usam a conexao DIRETA (porta 5432) — ver src/db/migrate.ts.
 */
const globalForDb = globalThis as unknown as {
  __myplaceSql?: ReturnType<typeof postgres>;
};

function createConnection() {
  return postgres(serverEnv.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // pgbouncer em modo transaction nao suporta prepared statements nomeados.
    prepare: false,
  });
}

const client = globalForDb.__myplaceSql ?? createConnection();
if (process.env.NODE_ENV !== 'production') globalForDb.__myplaceSql = client;

export const db = drizzle(client, { schema, casing: 'snake_case' });
export { client as sqlClient };
export type Database = typeof db;

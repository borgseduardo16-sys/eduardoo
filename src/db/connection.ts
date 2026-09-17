/**
 * Parametros de conexao compartilhados por TODO acesso ao Postgres.
 *
 * Existe em modulo proprio — e nao dentro de client.ts — porque os scripts de
 * verificacao abrem conexao propria e nao podem importar client.ts, que e
 * `server-only`. Manter duas copias desta configuracao ja causou uma falha
 * real: os scripts quebraram contra um banco com PostGIS em `extensions`
 * enquanto a aplicacao funcionava.
 */

/**
 * O Supabase instala o PostGIS no schema `extensions`, nao em `public`.
 * Sem `extensions` no search_path, `ST_MakePoint`, `ST_DWithin` e o cast
 * `::geography` somem — e toda busca por distancia falha em producao,
 * funcionando em desenvolvimento, onde o PostGIS costuma estar em `public`.
 *
 * Schema inexistente no search_path e silenciosamente ignorado pelo Postgres,
 * entao a mesma string serve aos dois ambientes.
 */
export const PG_CONNECTION_PARAMS = {
  search_path: 'public, extensions',
} as const;

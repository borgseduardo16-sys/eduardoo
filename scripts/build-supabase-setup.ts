/**
 * Gera um arquivo SQL unico para colar no SQL Editor do Supabase.
 *
 * POR QUE ISTO EXISTE
 *
 * O jeito normal de aplicar o schema e `pnpm db:migrate`, que precisa da
 * DATABASE_URL — e essa string contem a senha do banco. Passar senha de
 * producao por conversa e uma pratica ruim, e neste ambiente ela nem
 * funcionaria: a politica de rede bloqueia conexao com *.supabase.co.
 *
 * Entao invertemos: em vez de a ferramenta ir ate o banco, o SQL vai ate o
 * painel. Nenhuma credencial sai das maos de quem e dono do projeto.
 *
 * O ARQUIVO GERADO TAMBEM SE REGISTRA
 *
 * O Drizzle controla o que ja foi aplicado em `drizzle.__drizzle_migrations`,
 * por hash SHA-256 do conteudo de cada arquivo .sql. Se o schema fosse criado
 * "por fora", um `pnpm db:migrate` futuro tentaria recriar tudo e quebraria.
 *
 * Por isso o arquivo gerado termina inserindo as mesmas linhas de controle que
 * o migrador inseriria. Depois de rodar este SQL, o banco fica indistinguivel
 * de um migrado pela ferramenta.
 *
 *   pnpm tsx scripts/build-supabase-setup.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'drizzle';
const OUT = 'supabase/setup.sql';

type JournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };

const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

/** Cada migracao lida uma vez: conteudo cru para o hash, corpo limpo para o SQL. */
const migracoes = journal.entries.map((entry) => {
  const raw = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
  return {
    ...entry,
    // O hash e do conteudo CRU do arquivo — precisa bater byte a byte com o
    // que o migrador calcularia, senao o registro nao serve para nada.
    hash: createHash('sha256').update(raw).digest('hex'),
    // Os marcadores de quebra sao comentarios SQL validos, mas sujam a leitura.
    body: raw.split('--> statement-breakpoint').join('').trimEnd(),
  };
});

const parts: string[] = [];

parts.push(`-- ============================================================================
-- MyPlace — configuracao completa do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- Roda uma vez so. Se rodar de novo por engano, a maior parte e protegida por
-- IF NOT EXISTS, mas o correto e rodar uma vez em um projeto novo e vazio.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de ${journal.entries.length}
-- migracoes ja testadas contra um Postgres real. Nao edite este arquivo a mao:
-- altere src/db/schema/, rode as migracoes, e gere de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;
`);

for (const { idx, tag, body } of migracoes) {
  parts.push(`
-- ============================================================================
-- Migracao ${idx}: ${tag}
-- ============================================================================

${body}
`);
}

// Registro final: as mesmas linhas que `pnpm db:migrate` teria gravado.
const registros = migracoes.map((m) => `  ('${m.hash}', ${m.when})`).join(',\n');

parts.push(`
-- ============================================================================
-- Controle de migracoes
--
-- Marca as migracoes acima como ja aplicadas, exatamente como o migrador do
-- Drizzle faria. Assim um \`pnpm db:migrate\` futuro aplica apenas o que for
-- novo, em vez de tentar recriar tudo.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT v.hash, v.created_at
FROM (VALUES
${registros}
) AS v(hash, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.hash = v.hash
);

-- ============================================================================
-- Pronto. Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
-- ============================================================================
`);

const sql = parts.join('\n');
writeFileSync(OUT, sql, 'utf8');

const linhas = sql.split('\n').length;
const kb = (Buffer.byteLength(sql, 'utf8') / 1024).toFixed(1);
console.log(`✓ ${OUT} gerado`);
console.log(`  ${migracoes.length} migracoes · ${linhas} linhas · ${kb} KB`);

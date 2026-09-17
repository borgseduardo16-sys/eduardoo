/**
 * Gera um arquivo SQL unico para colar no SQL Editor do Supabase.
 *
 * POR QUE ISTO EXISTE
 *
 * O jeito normal de aplicar o schema e `pnpm db:migrate`, que precisa da
 * DATABASE_URL — e essa string contem a senha do banco. Passar senha de
 * producao por conversa e pratica ruim, e neste ambiente ela nem funcionaria:
 * a politica de rede bloqueia conexao com *.supabase.co.
 *
 * Entao invertemos: em vez de a ferramenta ir ate o banco, o SQL vai ate o
 * painel. Nenhuma credencial sai das maos de quem e dono do projeto.
 *
 * O ARQUIVO E INCREMENTAL, E ESSA E A PARTE QUE IMPORTA
 *
 * Cada migracao vai dentro de um bloco que so executa se o hash dela ainda
 * NAO estiver em `drizzle.__drizzle_migrations` — a mesma tabela de controle
 * que o migrador do Drizzle usa.
 *
 * Sem isso o arquivo so servia para banco vazio: rodar de novo depois de
 * acrescentar uma migracao nova estourava em `type "account_status" already
 * exists`, porque tentava recriar tudo desde o inicio. Agora o mesmo arquivo
 * funciona nos dois casos — projeto novo aplica tudo, projeto existente
 * aplica so o que falta, e rodar duas vezes nao faz nada na segunda.
 *
 * Cada comando roda via EXECUTE, com o texto em dollar-quote proprio. E
 * dinamico de proposito: dentro de um bloco plpgsql, um comando estatico que
 * referencia tabela ainda inexistente falharia ao ser compilado, mesmo que o
 * comando anterior fosse criar essa tabela.
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

/**
 * O comando tem SQL de verdade, ou e so comentario?
 *
 * A checagem e por LINHA — remover comentarios com regex estragaria os corpos
 * de funcao, que tem `--` dentro de dollar-quote.
 */
function hasSql(statement: string): boolean {
  return statement
    .split('\n')
    .some((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('--');
    });
}

/** Tag de dollar-quote unica, para o texto nunca colidir com o delimitador. */
function tag(migration: number, statement: number): string {
  return `$mp_${migration}_${statement}$`;
}

const migracoes = journal.entries.map((entry) => {
  const raw = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8');
  return {
    ...entry,
    // Hash do conteudo CRU: precisa bater byte a byte com o que o migrador
    // calcularia, senao o registro nao serve para nada.
    hash: createHash('sha256').update(raw).digest('hex'),
    statements: raw
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(hasSql),
  };
});

const parts: string[] = [];

parts.push(`-- ============================================================================
-- MyPlace — schema do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Cada migracao so e aplicada se ainda nao
-- estiver registrada em drizzle.__drizzle_migrations. Projeto novo recebe
-- tudo; projeto que ja tem parte do schema recebe apenas o que falta.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de ${migracoes.length} migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

-- Tabela de controle. Precisa existir antes das checagens abaixo.
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
`);

for (const m of migracoes) {
  const corpo = m.statements
    .map((stmt, j) => `    EXECUTE ${tag(m.idx, j)}${stmt}${tag(m.idx, j)};`)
    .join('\n\n');

  parts.push(`
-- ----------------------------------------------------------------------------
-- Migracao ${m.idx}: ${m.tag}  (${m.statements.length} comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_${m.idx}$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${m.hash}'
  ) THEN
    RAISE NOTICE 'Migracao ${m.idx} (${m.tag}) ja aplicada — pulando.';
  ELSE
${corpo}

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('${m.hash}', ${m.when});

    RAISE NOTICE 'Migracao ${m.idx} (${m.tag}) aplicada.';
  END IF;
END
$mp_bloco_${m.idx}$;
`);
}

parts.push(`
-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de ${migracoes.length} migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
`);

const sql = parts.join('\n');
writeFileSync(OUT, sql, 'utf8');

const totalStatements = migracoes.reduce((n, m) => n + m.statements.length, 0);
console.log(`✓ ${OUT} gerado`);
console.log(
  `  ${migracoes.length} migracoes · ${totalStatements} comandos · ` +
    `${sql.split('\n').length} linhas · ${(Buffer.byteLength(sql, 'utf8') / 1024).toFixed(1)} KB`,
);

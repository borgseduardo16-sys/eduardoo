/**
 * O banco migrado bate com o schema do Drizzle?
 *
 * Compara, tabela por tabela, colunas (e se aceitam NULL), índices, CHECKs e
 * enums do schema TypeScript com o que realmente existe no Postgres. Pega o
 * que uma migração escrita à mão deixa para trás: coluna que ficou, índice que
 * não nasceu, CHECK com nome diferente. Roda contra o banco de DATABASE_URL
 * (ou PARITY_URL, para apontar para outro).
 *
 *   pnpm tsx scripts/verify-paridade.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });
import postgres from 'postgres';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema';

async function main() {
  const sql = postgres((process.env.PARITY_URL ?? process.env.DATABASE_URL)!, { max: 1, onnotice: () => {} });
  let problemas = 0;
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue;
    const cfg = getTableConfig(v);
    const tabela = cfg.name;
    const cols = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=${tabela}`;
    const noBanco = new Map(cols.map((c) => [c.column_name, c.is_nullable === 'YES']));
    const noTs = new Map(cfg.columns.map((c) => [c.name, !c.notNull]));
    for (const [n, nullable] of noTs) {
      if (!noBanco.has(n)) { console.log(`✗ ${tabela}.${n}: existe no schema, falta no banco`); problemas++; }
      else if (noBanco.get(n) !== nullable && !cfg.columns.find((c) => c.name === n)?.primary) { console.log(`✗ ${tabela}.${n}: nullable difere (ts=${nullable}, banco=${noBanco.get(n)})`); problemas++; }
    }
    for (const n of noBanco.keys()) if (!noTs.has(n)) { console.log(`✗ ${tabela}.${n}: existe no banco, falta no schema`); problemas++; }
    const idx = await sql<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=${tabela}`;
    const idxBanco = new Set(idx.map((i) => i.indexname));
    for (const i of cfg.indexes) { const n = i.config.name; if (n && !idxBanco.has(n)) { console.log(`✗ índice ${n} (${tabela}) falta no banco`); problemas++; } }
    const chk = await sql<{ conname: string }[]>`SELECT conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=${tabela} AND c.contype='c'`;
    const chkBanco = new Set(chk.map((c) => c.conname));
    for (const c of cfg.checks) { if (!chkBanco.has(c.name)) { console.log(`✗ CHECK ${c.name} (${tabela}) falta no banco`); problemas++; } }
    for (const n of chkBanco) if (!cfg.checks.find((c) => c.name === n)) console.log(`· CHECK só no banco (ok se de migração SQL): ${tabela}.${n}`);
  }
  // enums
  const enums = await sql<{ typname: string; vals: string[] }[]>`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS vals FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname`;
  const enumBanco = new Map(enums.map((e) => [e.typname, e.vals]));
  for (const v of Object.values(schema)) {
    const anyV = v as { enumName?: string; enumValues?: string[] };
    if (anyV && typeof anyV === 'object' && anyV.enumName && anyV.enumValues) {
      const b = enumBanco.get(anyV.enumName);
      if (!b) { console.log(`✗ enum ${anyV.enumName} falta no banco`); problemas++; continue; }
      const faltam = anyV.enumValues.filter((x) => !b.includes(x));
      if (faltam.length) { console.log(`✗ enum ${anyV.enumName}: faltam no banco ${faltam.join(',')}`); problemas++; }
      const sobram = b.filter((x) => !anyV.enumValues!.includes(x));
      if (sobram.length) console.log(`· enum ${anyV.enumName}: valores só no banco (legado): ${sobram.join(',')}`);
    }
  }
  console.log(problemas === 0 ? 'PARIDADE OK' : `${problemas} diferença(s)`);
  await sql.end();
  if (problemas > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

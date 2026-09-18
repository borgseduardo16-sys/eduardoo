import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';

/**
 * Leitura de `platform_settings`.
 *
 * As regras de negocio que podem mudar sem deploy (taxas, minimos, prazos)
 * moram no banco, nao em constante de codigo — ver docs/PAGAMENTOS.md. O
 * valor VIGENTE sempre manda; se a chave nao existir ainda, cai no `fallback`
 * em vez de quebrar a pagina.
 */
export async function settingInt(key: string, fallback: number): Promise<number> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  const n = Number(row?.value);
  return Number.isFinite(n) ? n : fallback;
}

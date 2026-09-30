import 'server-only';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { listingSuggestions, type ListingSuggestionContent } from '@/db/schema';
import { settingInt } from '@/lib/settings';

/**
 * Leitura das sugestões de IA de um anúncio (Fase 23). Sempre com o dono no
 * WHERE: a sugestão de um anúncio alheio não aparece nem com o id na URL.
 */

export type ListingSuggestionView = {
  id: string;
  status: 'ready' | 'partially_applied' | 'applied' | 'dismissed' | 'failed';
  content: ListingSuggestionContent | null;
  removedCount: number;
  appliedFields: string[];
  createdAt: Date;
};

/** A última sugestão pedida para este anúncio nos últimos 7 dias (qualquer situação). */
export async function getLatestListingSuggestion(spaceId: string, ownerId: string): Promise<ListingSuggestionView | null> {
  const [row] = await db
    .select({
      id: listingSuggestions.id,
      status: listingSuggestions.status,
      content: listingSuggestions.suggestion,
      removed: listingSuggestions.removedClaims,
      appliedFields: listingSuggestions.appliedFields,
      createdAt: listingSuggestions.createdAt,
    })
    .from(listingSuggestions)
    .where(and(
      eq(listingSuggestions.spaceId, spaceId),
      eq(listingSuggestions.ownerId, ownerId),
      gte(listingSuggestions.createdAt, sql`now() - interval '7 days'`),
    ))
    .orderBy(desc(listingSuggestions.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    content: row.content ?? null,
    removedCount: row.removed?.length ?? 0,
    appliedFields: row.appliedFields,
    createdAt: row.createdAt,
  };
}

export type ListingAiUsage = {
  usedLast24h: number;
  limitPerDay: number;
  /** Minutos até poder pedir de novo PARA ESTE anúncio (0 = já pode). */
  spaceCooldownLeftMinutes: number;
};

/**
 * Uso da ferramenta por este proprietário. As próprias linhas de
 * `listing_suggestions` são o contador — inclusive as que falharam: uma
 * chamada que deu erro também custou.
 */
export async function getListingAiUsage(ownerId: string, spaceId: string): Promise<ListingAiUsage> {
  const [limitPerDay, cooldownMin] = await Promise.all([
    settingInt('ai.listing_daily_limit_per_owner', 5),
    settingInt('ai.listing_space_cooldown_minutes', 10),
  ]);
  const [row] = await db.execute<{ usados: number; espera_seg: number | null }>(sql`
    SELECT
      (SELECT count(*)::int FROM listing_suggestions
        WHERE owner_id = ${ownerId} AND created_at > now() - interval '24 hours') AS usados,
      (SELECT EXTRACT(EPOCH FROM (max(created_at) + make_interval(mins => ${cooldownMin}) - now()))::int
        FROM listing_suggestions WHERE space_id = ${spaceId} AND owner_id = ${ownerId}) AS espera_seg
  `);
  const espera = Number(row?.espera_seg ?? 0);
  return {
    usedLast24h: Number(row?.usados ?? 0),
    limitPerDay,
    spaceCooldownLeftMinutes: espera > 0 ? Math.ceil(espera / 60) : 0,
  };
}

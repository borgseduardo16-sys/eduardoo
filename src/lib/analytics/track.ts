import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Contagem de visualizações e compartilhamentos de um anúncio (Fase 23).
 *
 * Só contador por dia (`space_daily_stats`): nenhuma linha diz quem viu,
 * de onde, nem a que horas. O proprietário recebe "128 visualizações",
 * nunca "fulano viu às 14:32".
 *
 * Não conta:
 * - o próprio dono olhando o anúncio;
 * - robôs e pré-visualizadores de link (pelo User-Agent);
 * - a mesma pessoa (mesmo IP) repetindo a visita do mesmo anúncio em
 *   30 minutos (compartilhamento: 10 por hora). O IP entra só num hash, e
 *   só no limitador de taxa, que expira sozinho — não vai para o banco.
 * - anúncio que não está aberto ao público.
 */

export type SpaceEvent = 'view' | 'share';

const ROBO = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|embed|headless|lighthouse|pingdom|monitor|curl|wget|python|java\/|go-http/i;

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return ROBO.test(userAgent);
}

function hashCurto(texto: string): string {
  return createHash('sha256').update(texto).digest('hex').slice(0, 24);
}

export async function recordSpaceEvent(
  spaceId: string,
  kind: SpaceEvent,
  ctx: { ip: string; userAgent: string | null; viewerId: string | null },
): Promise<{ counted: boolean; reason?: string }> {
  if (isLikelyBot(ctx.userAgent)) return { counted: false, reason: 'robo' };

  const [espaco] = await db.execute<{ owner_id: string }>(sql`
    SELECT owner_id FROM spaces
    WHERE id = ${spaceId} AND deleted_at IS NULL AND status IN ('published', 'rented', 'paused')
  `);
  if (!espaco) return { counted: false, reason: 'indisponivel' };
  if (ctx.viewerId && ctx.viewerId === espaco.owner_id) return { counted: false, reason: 'dono' };

  const quem = ctx.viewerId ? `u:${ctx.viewerId}` : `ip:${hashCurto(ctx.ip)}`;
  const limite = kind === 'view'
    ? await rateLimit(`estat:v:${hashCurto(`${quem}:${spaceId}`)}`, { limit: 1, windowSeconds: 1800 })
    : await rateLimit(`estat:s:${hashCurto(`${quem}:${spaceId}`)}`, { limit: 10, windowSeconds: 3600 });
  if (!limite.allowed) return { counted: false, reason: 'repetido' };

  if (kind === 'view') {
    await db.execute(sql`
      INSERT INTO space_daily_stats (space_id, day, views)
      VALUES (${spaceId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
      ON CONFLICT (space_id, day) DO UPDATE SET views = space_daily_stats.views + 1
    `);
  } else {
    await db.execute(sql`
      INSERT INTO space_daily_stats (space_id, day, shares)
      VALUES (${spaceId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
      ON CONFLICT (space_id, day) DO UPDATE SET shares = space_daily_stats.shares + 1
    `);
  }
  return { counted: true };
}

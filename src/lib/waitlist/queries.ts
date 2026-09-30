import 'server-only';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, waitlistEntries } from '@/db/schema';

/**
 * Leitura da lista de espera (Fase 23).
 *
 * Toda consulta de pessoa recebe o `userId` da sessão; a do proprietário só
 * devolve CONTAGEM — quem está esperando nunca é revelado a ninguém.
 */

export type WaitlistEntryView = {
  id: string;
  status: 'waiting' | 'notified' | 'left' | 'closed';
  joinedAt: Date;
  notifiedAt: Date | null;
};

/**
 * A entrada que importa para a página do anúncio: a que está esperando, ou
 * então o aviso mais recente (para dizer "você foi avisado em...").
 */
export async function getUserWaitlistEntry(spaceId: string, userId: string): Promise<WaitlistEntryView | null> {
  const [row] = await db
    .select({
      id: waitlistEntries.id,
      status: sql<WaitlistEntryView['status']>`${waitlistEntries.status}::text`,
      joinedAt: waitlistEntries.joinedAt,
      notifiedAt: waitlistEntries.notifiedAt,
    })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.spaceId, spaceId),
        eq(waitlistEntries.userId, userId),
        inArray(waitlistEntries.status, ['waiting', 'notified']),
      ),
    )
    .orderBy(sql`(${waitlistEntries.status} = 'waiting') DESC`, desc(waitlistEntries.joinedAt))
    .limit(1);
  return row ?? null;
}

export type UserWaitlistItem = {
  entryId: string;
  status: 'waiting' | 'notified';
  joinedAt: Date;
  notifiedAt: Date | null;
  spaceId: string;
  slug: string;
  title: string;
  spaceStatus: string;
  district: string | null;
  city: string | null;
  priceMonthlyCents: number;
  coverPath: string | null;
};

/**
 * Espaços que a pessoa está esperando, e os avisos dos últimos 30 dias (o
 * espaço voltou — ainda dá tempo de solicitar).
 */
export async function listUserWaitlist(userId: string): Promise<UserWaitlistItem[]> {
  const rows = await db
    .select({
      entryId: waitlistEntries.id,
      status: sql<'waiting' | 'notified'>`${waitlistEntries.status}::text`,
      joinedAt: waitlistEntries.joinedAt,
      notifiedAt: waitlistEntries.notifiedAt,
      spaceId: spaces.id,
      slug: spaces.slug,
      title: spaces.title,
      spaceStatus: sql<string>`${spaces.status}::text`,
      district: spaces.district,
      city: spaces.city,
      priceMonthlyCents: spaces.priceMonthlyCents,
      // `spaces.id` literal de proposito — ver a nota em spaces/queries.ts.
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
      )`,
    })
    .from(waitlistEntries)
    .innerJoin(spaces, eq(spaces.id, waitlistEntries.spaceId))
    .where(
      and(
        eq(waitlistEntries.userId, userId),
        isNull(spaces.deletedAt),
        or(
          eq(waitlistEntries.status, 'waiting'),
          and(
            eq(waitlistEntries.status, 'notified'),
            gt(waitlistEntries.notifiedAt, sql`now() - interval '30 days'`),
          ),
        ),
      ),
    )
    .orderBy(desc(waitlistEntries.joinedAt));
  return rows;
}

/** Quantas pessoas esperam cada espaço — só o número, para o proprietário. */
export async function countWaitingBySpace(spaceIds: string[]): Promise<Map<string, number>> {
  if (spaceIds.length === 0) return new Map();
  const rows = await db
    .select({ spaceId: waitlistEntries.spaceId, n: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(and(inArray(waitlistEntries.spaceId, spaceIds), eq(waitlistEntries.status, 'waiting')))
    .groupBy(waitlistEntries.spaceId);
  return new Map(rows.map((r) => [r.spaceId, r.n]));
}

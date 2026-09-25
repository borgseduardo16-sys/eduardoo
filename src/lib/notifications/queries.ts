import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';

/**
 * Leitura de notificacoes in-app.
 *
 * A fila em si (`notifications`) ja e escrita havia tempo por mensagens,
 * reservas, pagamentos e promocoes (ver os `db.insert(notifications)`
 * espalhados nessas actions) — este arquivo e so o lado que faltava: ler.
 */

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function listNotifications(userId: string, limit = 30): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      type: sql<string>`${notifications.type}::text`,
      title: notifications.title,
      body: notifications.body,
      linkPath: notifications.linkPath,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Notificação avulsa, para abrir direto pelo id — usada ao marcar/abrir uma notificação. */
export async function getNotification(id: string, userId: string): Promise<NotificationRow | null> {
  const [row] = await db
    .select({
      id: notifications.id,
      type: sql<string>`${notifications.type}::text`,
      title: notifications.title,
      body: notifications.body,
      linkPath: notifications.linkPath,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .limit(1);
  return row ?? null;
}

import 'server-only';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationPreferences, notifications } from '@/db/schema';
import { NOTIFICATION_CATEGORIES, isEssentialCategory, type NotificationCategory } from './categories';

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

const colunas = {
  id: notifications.id,
  type: sql<string>`${notifications.type}::text`,
  title: notifications.title,
  body: notifications.body,
  linkPath: notifications.linkPath,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

/** Não lidas, mais recentes primeiro (Fase 21: seção própria na central). */
export async function listUnreadNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  return db
    .select(colunas)
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export const READ_PAGE_SIZE = 20;

/** Lidas, paginadas — a lista que cresce sem parar é esta. */
export async function listReadNotifications(
  userId: string,
  page = 1,
  pageSize = READ_PAGE_SIZE,
): Promise<{ rows: NotificationRow[]; hasMore: boolean }> {
  const linhas = await db
    .select(colunas)
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return { rows: linhas.slice(0, pageSize), hasMore: linhas.length > pageSize };
}

export type CategoryPreference = { category: NotificationCategory; inApp: boolean; push: boolean; essential: boolean };

/** Preferências da pessoa, uma por categoria (sem linha gravada = tudo ligado). */
export async function getNotificationPreferences(userId: string): Promise<CategoryPreference[]> {
  const linhas = await db
    .select({
      category: notificationPreferences.category,
      inApp: notificationPreferences.inApp,
      push: notificationPreferences.push,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const mapa = new Map(linhas.map((l) => [l.category, l]));
  return NOTIFICATION_CATEGORIES.map((category) => {
    const essential = isEssentialCategory(category);
    const p = mapa.get(category);
    return {
      category,
      essential,
      inApp: essential ? true : (p?.inApp ?? true),
      push: essential ? true : (p?.push ?? true),
    };
  });
}


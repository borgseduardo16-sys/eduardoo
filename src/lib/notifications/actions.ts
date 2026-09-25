'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { getNotification } from './queries';

/**
 * Abre uma notificação: marca como lida (se ainda não estava) e leva pro
 * `linkPath` gravado nela — mesmo padrão de outras actions que terminam em
 * `redirect()` (ex.: `purchasePromotionAction`). Sem `linkPath`, volta pra
 * própria lista.
 */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const user = await requireUserOrThrow();
  const id = String(formData.get('notificationId') ?? '');

  const notificacao = await getNotification(id, user.id);
  if (!notificacao) redirect('/notificacoes');

  if (!notificacao.readAt) {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
    revalidatePath('/notificacoes');
  }

  redirect(notificacao.linkPath ?? '/notificacoes');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUserOrThrow();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  revalidatePath('/notificacoes');
}

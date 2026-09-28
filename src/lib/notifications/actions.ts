'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationPreferences, notifications } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { getNotification } from './queries';
import { NOTIFICATION_CATEGORIES, isEssentialCategory } from './categories';

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

/**
 * Marca UMA notificação como lida sem sair da central (Fase 21). O dono
 * está no WHERE: id de notificação de outra pessoa simplesmente não casa
 * com nada — não dá para ler nem mexer na central alheia.
 */
export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireUserOrThrow();
  const id = String(formData.get('notificationId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)));

  revalidatePath('/notificacoes');
}

export type PreferencesState = { ok: boolean; message?: string };

/**
 * Grava as preferências por categoria. Categoria essencial não é lida do
 * formulário — mesmo que alguém envie "desligar pagamentos", ela nem entra
 * no loop (e o CHECK do banco recusaria de qualquer forma).
 */
export async function updateNotificationPreferencesAction(
  _prev: PreferencesState | undefined,
  formData: FormData,
): Promise<PreferencesState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const agora = new Date();
  const linhas = NOTIFICATION_CATEGORIES.filter((c) => !isEssentialCategory(c)).map((category) => {
    const inApp = formData.get(`${category}:in_app`) === 'on';
    // Push sem central não faz sentido: se a categoria some da central, some do celular também.
    const push = inApp && formData.get(`${category}:push`) === 'on';
    return { userId: user.id, category, inApp, push, updatedAt: agora };
  });

  await db
    .insert(notificationPreferences)
    .values(linhas)
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.category],
      set: {
        inApp: sql`excluded.in_app`,
        push: sql`excluded.push`,
        updatedAt: agora,
      },
    });

  revalidatePath('/notificacoes/preferencias');
  return { ok: true, message: 'Preferências salvas.' };
}


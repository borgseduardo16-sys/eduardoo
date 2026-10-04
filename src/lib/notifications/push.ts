import 'server-only';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';
import { requireIntegration, isIntegrationConfigured } from '@/lib/env';

/**
 * Envio de notificação push de verdade — a que aparece no celular mesmo com
 * o app fechado, não só o sininho dentro do site (Fase 19).
 *
 * Sempre um EXTRA sobre a notificação in-app, nunca o único caminho: a linha
 * em `notifications` já foi gravada antes de chegar aqui (ver dispatch.ts), e
 * essa gravação sozinha já deixa a pessoa informada ao abrir o app. Por isso,
 * diferente de credenciais cujo recurso INTEIRO depende delas (Asaas, IA de
 * visão), aqui a ausência de configuração — ou uma inscrição expirada — nunca
 * derruba a ação que disparou a notificação; só significa que o toque no
 * celular não aconteceu desta vez. Mesmo espírito já usado no e-mail de
 * aviso de mensagem nova (`messaging/notify.ts`): sem Resend configurado, o
 * chat continua funcionando, só não manda e-mail.
 */

export type PushPayload = { title: string; body: string; url: string };

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = requireIntegration('push');
  webpush.setVapidDetails(VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
}

export type RawPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Grava ou atualiza a inscrição — o mesmo `endpoint` reaparecendo é o próprio navegador renovando. */
export async function saveSubscription(
  userId: string,
  sub: RawPushSubscription,
  userAgent: string | null,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, lastSeenAt: new Date() },
    });
}

export async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function countUserPushSubscriptions(userId: string): Promise<number> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}

/**
 * Manda o push para TODOS os dispositivos inscritos da pessoa. Nunca lança —
 * best-effort puro. Uma inscrição que o navegador já revogou (404/410,
 * confirmado no próprio protocolo Web Push) é apagada na hora, autolimpeza
 * no mesmo espírito de `sweepExpiredBookings`.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isIntegrationConfigured('push')) return;

  try {
    ensureVapid();
  } catch (err) {
    console.error('[push] VAPID mal configurado:', err);
    return;
  }

  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error('[push] falha ao enviar para uma inscrição:', sub.id, err);
        }
      }
    }),
  );
}

'use server';

import 'server-only';
import { headers } from 'next/headers';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { isIntegrationConfigured } from '@/lib/env';
import { saveSubscription, removeSubscriptionByEndpoint, type RawPushSubscription } from './push';

export type PushActionState = { ok: boolean; message?: string };

/** Chamada direto do componente cliente (não é um `<form action>`) — mesmo padrão de `markConversationReadAction`. */
export async function subscribeToPushAction(sub: RawPushSubscription): Promise<PushActionState> {
  const user = await requireUserOrThrow();

  if (!isIntegrationConfigured('push')) {
    return { ok: false, message: 'Notificação push ainda não está configurada neste ambiente.' };
  }

  const h = await headers();
  await saveSubscription(user.id, sub, h.get('user-agent'));
  return { ok: true };
}

export async function unsubscribeFromPushAction(endpoint: string): Promise<PushActionState> {
  await requireUserOrThrow();
  await removeSubscriptionByEndpoint(endpoint);
  return { ok: true };
}

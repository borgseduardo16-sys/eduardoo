'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import postgres from 'postgres';
import { db } from '@/db/client';
import { spaces, waitlistEntries } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { rateLimit } from '@/lib/rate-limit';
import { getSpaceAvailability } from '@/lib/spaces/availability';

const { PostgresError } = postgres;

export type WaitlistActionState = { ok: boolean; message?: string };

const schema = z.object({ spaceId: z.string().uuid('Espaço inválido.') });

function pgError(err: unknown): InstanceType<typeof PostgresError> | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/**
 * Entrar na lista de espera (Fase 23).
 *
 * Só para espaço que está indisponível AGORA — entrar na fila de um espaço
 * que já pode ser solicitado não faria sentido. O `userId` vem da sessão,
 * nunca do formulário; a trigger `waitlist_entries_guard` ainda recusa o
 * próprio dono e quem tem bloqueio com ele, e o índice único parcial recusa
 * a segunda entrada (duplo clique, duas abas).
 */
export async function joinWaitlistAction(
  _prev: WaitlistActionState | undefined,
  formData: FormData,
): Promise<WaitlistActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para entrar na lista de espera.' };
  }

  const parsed = schema.safeParse({ spaceId: formData.get('spaceId') });
  if (!parsed.success) return { ok: false, message: 'Espaço inválido.' };
  const { spaceId } = parsed.data;

  const limite = await rateLimit(`waitlist:${user.id}`, { limit: 20, windowSeconds: 3600 });
  if (!limite.allowed) return { ok: false, message: 'Muitas tentativas seguidas. Tente de novo mais tarde.' };

  const [space] = await db
    .select({ ownerId: spaces.ownerId, slug: spaces.slug })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  const disponibilidade = space ? await getSpaceAvailability(spaceId) : null;
  if (!space || !disponibilidade) return { ok: false, message: 'Espaço não encontrado.' };
  if (space.ownerId === user.id) return { ok: false, message: 'Este espaço é seu.' };
  if (disponibilidade.openForRequests) {
    return { ok: false, message: 'Este espaço já está disponível: você pode enviar a solicitação agora.' };
  }
  if (!['rented', 'paused', 'published'].includes(disponibilidade.status)) {
    return { ok: false, message: 'Este anúncio não está mais ativo.' };
  }

  try {
    await db.insert(waitlistEntries).values({ userId: user.id, spaceId });
  } catch (err) {
    const pg = pgError(err);
    if (pg?.code === '23505' && pg.constraint_name === 'waitlist_entries_one_waiting_per_user_space') {
      return { ok: true, message: 'Você já está na lista de espera deste espaço.' };
    }
    if (pg?.constraint_name === 'waitlist_entries_not_blocked') {
      return { ok: false, message: 'Não é possível entrar na lista de espera deste espaço.' };
    }
    throw err;
  }

  revalidatePath(`/espacos/${space.slug}`);
  revalidatePath('/favoritos');
  return { ok: true, message: 'Pronto. Avisaremos quando o espaço voltar a ficar disponível.' };
}

/** Sair da lista. A entrada fica registrada como `left` — sair não apaga história. */
export async function leaveWaitlistAction(
  _prev: WaitlistActionState | undefined,
  formData: FormData,
): Promise<WaitlistActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const parsed = schema.safeParse({ spaceId: formData.get('spaceId') });
  if (!parsed.success) return { ok: false, message: 'Espaço inválido.' };
  const { spaceId } = parsed.data;

  const saidas = await db
    .update(waitlistEntries)
    .set({ status: 'left', leftAt: new Date() })
    .where(
      and(
        eq(waitlistEntries.spaceId, spaceId),
        eq(waitlistEntries.userId, user.id),
        eq(waitlistEntries.status, 'waiting'),
      ),
    )
    .returning({ id: waitlistEntries.id });

  if (saidas.length === 0) return { ok: false, message: 'Você não está na lista de espera deste espaço.' };

  const [space] = await db.select({ slug: spaces.slug }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (space) revalidatePath(`/espacos/${space.slug}`);
  revalidatePath('/favoritos');
  return { ok: true, message: 'Você saiu da lista de espera.' };
}

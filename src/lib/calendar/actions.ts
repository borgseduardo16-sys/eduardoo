'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import postgres from 'postgres';
import { db } from '@/db/client';
import { auditLogs, spaceAvailabilityBlocks, spaces } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { rateLimit } from '@/lib/rate-limit';

const { PostgresError } = postgres;

export type CalendarActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

const createSchema = z
  .object({
    spaceId: z.string().uuid('Espaço inválido.'),
    startsOn: isoDate,
    endsOn: isoDate,
    reason: z.enum(['manutencao', 'uso_proprio', 'viagem', 'outro'], { error: 'Escolha um motivo.' }),
    note: z.string().trim().max(200, 'Use até 200 caracteres.').optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'O fim precisa ser igual ou depois do início.' })
  .refine((v) => v.startsOn >= new Date().toISOString().slice(0, 10), {
    path: ['startsOn'],
    message: 'O bloqueio não pode começar no passado.',
  })
  .refine(
    (v) => (Date.parse(`${v.endsOn}T00:00:00Z`) - Date.parse(`${v.startsOn}T00:00:00Z`)) / 86_400_000 <= 366,
    { path: ['endsOn'], message: 'Um bloqueio pode ter no máximo um ano. Para tirar o anúncio do ar, pause-o.' },
  );

function pgError(err: unknown): InstanceType<typeof PostgresError> | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/**
 * Bloquear datas (Fase 23). Só o dono — a posse é conferida no banco, na
 * mesma consulta. As regras que envolvem concorrência (dois bloqueios
 * sobrepostos, bloqueio por cima de reserva vigente) moram na trigger
 * `space_availability_blocks_guard`, que tranca a linha do espaço: duas abas
 * ao mesmo tempo nunca passam as duas.
 */
export async function createAvailabilityBlockAction(
  _prev: CalendarActionState | undefined,
  formData: FormData,
): Promise<CalendarActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const parsed = createSchema.safeParse({
    spaceId: formData.get('spaceId'),
    startsOn: formData.get('startsOn'),
    endsOn: formData.get('endsOn'),
    reason: formData.get('reason'),
    note: formData.get('note') || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? 'form');
      (fieldErrors[k] ??= []).push(issue.message);
    }
    return { ok: false, fieldErrors, message: parsed.error.issues[0]?.message };
  }
  const { spaceId, startsOn, endsOn, reason, note } = parsed.data;

  const limite = await rateLimit(`calendar-block:${user.id}`, { limit: 30, windowSeconds: 3600 });
  if (!limite.allowed) return { ok: false, message: 'Muitas alterações seguidas. Tente de novo em instantes.' };

  const [space] = await db
    .select({ id: spaces.id, slug: spaces.slug })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id), isNull(spaces.deletedAt)))
    .limit(1);
  if (!space) return { ok: false, message: 'Espaço não encontrado.' };

  let bloqueioId: string;
  try {
    const [row] = await db
      .insert(spaceAvailabilityBlocks)
      .values({ spaceId, startsOn, endsOn, reason, note: note || null, createdBy: user.id })
      .returning({ id: spaceAvailabilityBlocks.id });
    bloqueioId = row!.id;
  } catch (err) {
    const pg = pgError(err);
    if (pg?.constraint_name === 'space_availability_blocks_no_overlap') {
      return { ok: false, message: 'Já existe um bloqueio que cobre parte dessas datas.' };
    }
    if (pg?.constraint_name === 'space_availability_blocks_no_booking') {
      return {
        ok: false,
        message:
          'Há uma reserva vigente nessas datas. Como o aluguel é mensal e sem data para terminar, não dá para bloquear o período de quem está alugando.',
      };
    }
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.dates_blocked',
    entityType: 'space',
    entityId: spaceId,
    metadata: { blockId: bloqueioId, startsOn, endsOn, reason },
  });

  revalidatePath(`/meus-espacos/${spaceId}/calendario`);
  revalidatePath(`/espacos/${space.slug}`);
  return { ok: true, message: 'Datas bloqueadas.' };
}

/** Desfazer um bloqueio. A linha fica registrada como cancelada, com data. */
export async function cancelAvailabilityBlockAction(
  _prev: CalendarActionState | undefined,
  formData: FormData,
): Promise<CalendarActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const parsed = z.object({ blockId: z.string().uuid() }).safeParse({ blockId: formData.get('blockId') });
  if (!parsed.success) return { ok: false, message: 'Bloqueio não encontrado.' };

  // Posse no WHERE: bloqueio de espaço alheio não é encontrado, nem cancelado.
  const [alvo] = await db
    .select({ id: spaceAvailabilityBlocks.id, spaceId: spaces.id, slug: spaces.slug })
    .from(spaceAvailabilityBlocks)
    .innerJoin(spaces, eq(spaces.id, spaceAvailabilityBlocks.spaceId))
    .where(
      and(
        eq(spaceAvailabilityBlocks.id, parsed.data.blockId),
        eq(spaces.ownerId, user.id),
        isNull(spaceAvailabilityBlocks.cancelledAt),
      ),
    )
    .limit(1);
  if (!alvo) return { ok: false, message: 'Bloqueio não encontrado.' };

  await db
    .update(spaceAvailabilityBlocks)
    .set({ cancelledAt: new Date() })
    .where(and(eq(spaceAvailabilityBlocks.id, alvo.id), isNull(spaceAvailabilityBlocks.cancelledAt)));

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.dates_unblocked',
    entityType: 'space',
    entityId: alvo.spaceId,
    metadata: { blockId: alvo.id },
  });

  revalidatePath(`/meus-espacos/${alvo.spaceId}/calendario`);
  revalidatePath(`/espacos/${alvo.slug}`);
  return { ok: true, message: 'Bloqueio desfeito.' };
}

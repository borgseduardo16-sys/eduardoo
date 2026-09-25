'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '@/db/client';
import { bookings, spaces, reviews, notifications } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { createReviewSchema } from './schemas';

/** Mesmo desembrulho de PostgresError usado em bookings/actions.ts — ver o comentário lá. */
const { PostgresError } = postgres;
type PgError = InstanceType<typeof PostgresError>;

export type ReviewActionState = { ok: boolean; message?: string };

/**
 * Cria uma avaliação (locatário avalia o espaço, ou proprietário avalia o
 * locatário) depois que o aluguel encerra.
 *
 * A autorização de verdade é a trigger `validate_review` no banco (migração
 * 0001): reserva precisa estar `ended`, e o autor precisa ser quem a trigger
 * espera pro `kind` escolhido. As checagens aqui são só pra devolver uma
 * mensagem legível em vez de deixar a exceção crua do Postgres subir —
 * mesmo raciocínio de "DAL/action é a UX, a constraint é a garantia real"
 * usado no resto do projeto.
 */
export async function createReviewAction(
  _prev: ReviewActionState | undefined,
  formData: FormData,
): Promise<ReviewActionState> {
  const user = await requireUserOrThrow();

  const parsed = createReviewSchema.safeParse({
    bookingId: formData.get('bookingId'),
    kind: formData.get('kind'),
    rating: formData.get('rating'),
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, kind, rating, comment } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      spaceId: bookings.spaceId,
      spaceTitle: spaces.title,
      spaceSlug: spaces.slug,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || (booking.ownerId !== user.id && booking.renterId !== user.id)) {
    return { ok: false, message: 'Reserva não encontrada.' };
  }
  if (booking.status !== 'ended') {
    return { ok: false, message: 'Só é possível avaliar depois que o aluguel é encerrado.' };
  }

  const souLocatario = booking.renterId === user.id;
  if (kind === 'renter_to_space' && !souLocatario) {
    return { ok: false, message: 'Só o locatário avalia o espaço.' };
  }
  if (kind === 'owner_to_renter' && souLocatario) {
    return { ok: false, message: 'Só o proprietário avalia o locatário.' };
  }

  try {
    await db.insert(reviews).values({
      bookingId,
      kind,
      authorId: user.id,
      spaceId: kind === 'renter_to_space' ? booking.spaceId : null,
      targetUserId: kind === 'owner_to_renter' ? booking.renterId : null,
      rating,
      comment: comment || null,
    });
  } catch (err) {
    const pg = err instanceof PostgresError ? err : err instanceof Error && err.cause instanceof PostgresError ? (err.cause as PgError) : null;
    if (pg?.code === '23505') {
      return { ok: false, message: 'Você já avaliou isto.' };
    }
    throw err;
  }

  const alvoId = kind === 'renter_to_space' ? booking.ownerId : booking.renterId;
  await db.insert(notifications).values({
    userId: alvoId,
    type: 'review_received',
    title: kind === 'renter_to_space' ? 'Seu espaço recebeu uma avaliação' : 'Você recebeu uma avaliação',
    body: `${rating} de 5 em "${booking.spaceTitle}"${comment ? ` — "${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}"` : ''}.`,
    linkPath: kind === 'renter_to_space' ? '/meus-espacos' : '/reservas',
    data: { bookingId },
  });

  revalidatePath('/reservas');
  revalidatePath('/meus-espacos/solicitacoes');
  if (kind === 'renter_to_space') revalidatePath(`/espacos/${booking.spaceSlug}`);

  return { ok: true, message: 'Avaliação enviada.' };
}

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '@/db/client';
import { bookings, spaces, reviews, auditLogs } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { notifyUser } from '@/lib/notifications/dispatch';
import { publicTextContactKinds } from '@/lib/safety/contact-detection';
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

  // Avaliacao e publica: telefone, e-mail, CPF ou link nao entram (Fase 21).
  if (comment && publicTextContactKinds(comment).length > 0) {
    return {
      ok: false,
      message: 'Tire telefone, e-mail, documento ou links do comentário — a avaliação fica pública.',
    };
  }

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

  let reviewId: string;
  try {
    const [criada] = await db.insert(reviews).values({
      bookingId,
      kind,
      authorId: user.id,
      spaceId: kind === 'renter_to_space' ? booking.spaceId : null,
      targetUserId: kind === 'owner_to_renter' ? booking.renterId : null,
      // Conferido de novo pela trigger `validate_review` contra a própria reserva.
      reviewedUserId: kind === 'renter_to_space' ? booking.ownerId : booking.renterId,
      rating,
      comment: comment || null,
    }).returning({ id: reviews.id });
    reviewId = criada.id;
  } catch (err) {
    const pg = err instanceof PostgresError ? err : err instanceof Error && err.cause instanceof PostgresError ? (err.cause as PgError) : null;
    if (pg?.code === '23505') {
      return { ok: false, message: 'Você já avaliou isto.' };
    }
    // RAISE da trigger `validate_review` (reserva nao encerrada, autor que
    // nao participou, alvo trocado): a checagem acima ja cobre o caso comum;
    // isto e a trava do banco respondendo em portugues para quem ve a tela.
    if (pg?.code === 'P0001' || pg?.code === '23514') {
      console.error('[reviews] avaliacao recusada pelo banco:', pg.message);
      return { ok: false, message: 'Não foi possível enviar sua avaliação para esta locação.' };
    }
    console.error('[reviews] falha ao gravar avaliacao:', err);
    return { ok: false, message: 'Não foi possível enviar sua avaliação agora. Tente novamente.' };
  }

  const alvoId = kind === 'renter_to_space' ? booking.ownerId : booking.renterId;

  // Trilha de auditoria (Fase 21): quem avaliou o que, sem copiar o texto.
  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'review.created',
    entityType: 'review',
    entityId: reviewId,
    metadata: { bookingId, kind, rating },
  });

  await notifyUser(db, {
    userId: alvoId,
    type: 'review_received',
    title: kind === 'renter_to_space' ? 'Seu espaço recebeu uma avaliação' : 'Você recebeu uma avaliação',
    body: `${rating} de 5 em "${booking.spaceTitle}"${comment ? ` — "${comment.slice(0, 80)}${comment.length > 80 ? '…' : ''}"` : ''}.`,
    // Leva direto para a avaliação no perfil de quem recebeu.
    linkPath: `/perfil/${alvoId}?papel=${kind === 'renter_to_space' ? 'proprietario' : 'locatario'}#avaliacoes`,
    data: { bookingId, reviewId },
  });

  revalidatePath('/reservas');
  revalidatePath(`/reservas/${bookingId}`);
  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath(`/perfil/${alvoId}`);
  if (kind === 'renter_to_space') revalidatePath(`/espacos/${booking.spaceSlug}`);

  return { ok: true, message: 'Avaliação enviada.' };
}

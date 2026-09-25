import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { reviews, profiles } from '@/db/schema';

/**
 * Leitura de avaliacoes.
 *
 * A nota media/contagem em si (`spaces.rating_avg`/`rating_count`) e mantida
 * por trigger (`refresh_space_rating`, migracao 0001) direto no INSERT/UPDATE/
 * DELETE de `reviews` — nunca recalculada aqui. Isso so le o que ja existe.
 */

export type SpaceReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  authorName: string | null;
};

/** Avaliacoes visiveis (nao ocultadas) de um anuncio — mais recentes primeiro. */
export async function listReviewsForSpace(spaceId: string, limit = 20): Promise<SpaceReviewRow[]> {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      authorName: profiles.fullName,
    })
    .from(reviews)
    .innerJoin(profiles, eq(profiles.id, reviews.authorId))
    .where(and(eq(reviews.spaceId, spaceId), eq(reviews.kind, 'renter_to_space'), isNull(reviews.hiddenAt)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/**
 * Ids de reserva que este autor ja avaliou, nesta modalidade — usado pelas
 * listas de reservas pra decidir "Avaliar" vs. "Você já avaliou", sem
 * consulta por linha (N+1).
 */
export async function listReviewedBookingIds(
  authorId: string,
  kind: 'renter_to_space' | 'owner_to_renter',
): Promise<Set<string>> {
  const rows = await db
    .select({ bookingId: reviews.bookingId })
    .from(reviews)
    .where(and(eq(reviews.authorId, authorId), eq(reviews.kind, kind)));
  return new Set(rows.map((r) => r.bookingId));
}

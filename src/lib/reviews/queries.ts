import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { reviews, profiles, spaces } from '@/db/schema';

/**
 * Leitura de avaliacoes.
 *
 * A nota media/contagem do anuncio (`spaces.rating_avg`/`rating_count`) e
 * mantida por trigger (`refresh_space_rating`) direto no INSERT/UPDATE/
 * DELETE de `reviews` — nunca recalculada aqui. A reputacao por pessoa sai
 * de `reputation.ts`. Isto so lista o que ja existe, paginado.
 *
 * Quem escreveu aparece pelo NOME PUBLICO (nome de exibicao ou primeiro
 * nome) — nunca o nome completo, que nao e dado publico (Fase 21).
 */

export const REVIEWS_PAGE_SIZE = 10;

export type ReviewAuthor = {
  id: string;
  /** Null quando a conta nao tem nome ou nao esta mais ativa. */
  publicName: string | null;
  avatarPath: string | null;
  /** So conta ativa tem perfil publico para onde linkar. */
  active: boolean;
};

export type ReviewRow = {
  id: string;
  kind: 'renter_to_space' | 'owner_to_renter';
  rating: number;
  comment: string | null;
  createdAt: Date;
  author: ReviewAuthor;
  /** Anuncio da locacao avaliada — so quando ainda esta publicado. */
  space: { title: string; slug: string } | null;
};

export type ReviewPage = { rows: ReviewRow[]; hasMore: boolean; page: number };

/** `?pagina=` vindo da URL → inteiro >= 1, sem confiar no que chegou. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

const autor = alias(profiles, 'review_author');

function selecao() {
  return {
    id: reviews.id,
    kind: reviews.kind,
    rating: reviews.rating,
    comment: reviews.comment,
    createdAt: reviews.createdAt,
    authorId: autor.id,
    authorPublicName: autor.publicName,
    authorAvatarPath: autor.avatarPath,
    authorActive: sql<boolean>`(${autor.status} = 'active' AND ${autor.deletedAt} IS NULL)`,
    spaceTitle: spaces.title,
    spaceSlug: spaces.slug,
    spacePublished: sql<boolean>`(${spaces.status} = 'published' AND ${spaces.deletedAt} IS NULL)`,
  };
}

type Bruta = {
  id: string;
  kind: 'renter_to_space' | 'owner_to_renter';
  rating: number;
  comment: string | null;
  createdAt: Date;
  authorId: string;
  authorPublicName: string | null;
  authorAvatarPath: string | null;
  authorActive: boolean;
  spaceTitle: string | null;
  spaceSlug: string | null;
  spacePublished: boolean | null;
};

function montar(linhas: Bruta[], page: number, pageSize: number): ReviewPage {
  const rows = linhas.slice(0, pageSize).map<ReviewRow>((r) => ({
    id: r.id,
    kind: r.kind,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    author: {
      id: r.authorId,
      // Conta suspensa/apagada: a avaliacao continua (veio de uma locacao
      // real), mas sem nome nem foto de quem nao esta mais na plataforma.
      publicName: r.authorActive ? r.authorPublicName : null,
      avatarPath: r.authorActive ? r.authorAvatarPath : null,
      active: r.authorActive,
    },
    space: r.spacePublished && r.spaceTitle && r.spaceSlug ? { title: r.spaceTitle, slug: r.spaceSlug } : null,
  }));
  return { rows, hasMore: linhas.length > pageSize, page };
}

/** Avaliacoes visiveis de um anuncio (quem alugou avaliando), mais recentes primeiro. */
export async function listReviewsForSpace(
  spaceId: string,
  { page = 1, pageSize = REVIEWS_PAGE_SIZE }: { page?: number; pageSize?: number } = {},
): Promise<ReviewPage> {
  const linhas = await db
    .select(selecao())
    .from(reviews)
    .innerJoin(autor, eq(autor.id, reviews.authorId))
    .leftJoin(spaces, eq(spaces.id, reviews.spaceId))
    .where(and(eq(reviews.spaceId, spaceId), eq(reviews.kind, 'renter_to_space'), isNull(reviews.hiddenAt)))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return montar(linhas as Bruta[], page, pageSize);
}

/**
 * Avaliacoes que uma pessoa RECEBEU num papel: como proprietario
 * (`renter_to_space`, de quem alugou os espacos dela) ou como locatario
 * (`owner_to_renter`, dos proprietarios de quem ela alugou).
 */
export async function listReviewsReceived(
  userId: string,
  kind: 'renter_to_space' | 'owner_to_renter',
  { page = 1, pageSize = REVIEWS_PAGE_SIZE }: { page?: number; pageSize?: number } = {},
): Promise<ReviewPage> {
  const linhas = await db
    .select(selecao())
    .from(reviews)
    .innerJoin(autor, eq(autor.id, reviews.authorId))
    .leftJoin(spaces, eq(spaces.id, reviews.spaceId))
    .where(and(eq(reviews.reviewedUserId, userId), eq(reviews.kind, kind), isNull(reviews.hiddenAt)))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return montar(linhas as Bruta[], page, pageSize);
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

/** Este autor ja avaliou esta reserva, nesta modalidade? (pagina de uma reserva so) */
export async function hasReviewedBooking(
  bookingId: string,
  authorId: string,
  kind: 'renter_to_space' | 'owner_to_renter',
): Promise<boolean> {
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.bookingId, bookingId), eq(reviews.authorId, authorId), eq(reviews.kind, kind)))
    .limit(1);
  return Boolean(row);
}

import 'server-only';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { favorites, spaces, spaceFeatures } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';
import type { FavoritePatternForType } from '@/lib/notifications/compatibility';

/**
 * Leitura de favoritos.
 *
 * Toda consulta aqui recebe o `userId` de quem esta pedindo e so devolve OS
 * FAVORITOS DAQUELE USUARIO — nunca um id de favorito solto que outra pessoa
 * poderia adivinhar. A escrita (`actions.ts`) segue a mesma regra.
 */

/** So os ids — leve, usado para pintar o coraçãozinho preenchido nos cards. */
export async function listUserFavoriteIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ spaceId: favorites.spaceId })
    .from(favorites)
    .where(eq(favorites.userId, userId));
  return new Set(rows.map((r) => r.spaceId));
}

export async function isFavorited(userId: string, spaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ spaceId: favorites.spaceId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.spaceId, spaceId)))
    .limit(1);
  return Boolean(row);
}

/** Quem favoritou este espaço — usado pelos alertas de preço/disponibilidade (Fase 18). */
export async function listFavoriterUserIds(spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: favorites.userId })
    .from(favorites)
    .where(eq(favorites.spaceId, spaceId));
  return rows.map((r) => r.userId);
}

/**
 * Padrão de favoritos por pessoa, agregado para o mesmo tipo+cidade de um
 * espaço recém-publicado — usado por "novo espaço compatível" (Fase 18.3).
 * Tipo e cidade são o portão (igualdade exata); o que volta aqui é só a
 * faixa de preço e a união de características dos espaços que a pessoa já
 * favoritou dentro desse portão, para o `computeCompatibilityScore` julgar.
 * Limite de 500 pessoas é so uma valvula de seguranca de custo de consulta —
 * o corte real de quem recebe notificação é a pontuação (ver compatibility.ts).
 */
export async function listFavoritePatternsForType(
  spaceType: string,
  city: string,
  excludeSpaceId: string,
  excludeUserId: string,
): Promise<FavoritePatternForType[]> {
  const rows = await db
    .select({
      userId: favorites.userId,
      minPriceCents: sql<number>`min(${spaces.priceMonthlyCents})::int`,
      maxPriceCents: sql<number>`max(${spaces.priceMonthlyCents})::int`,
      featureKeys: sql<string[]>`coalesce(
        array_agg(DISTINCT ${spaceFeatures.featureKey}) FILTER (WHERE ${spaceFeatures.featureKey} IS NOT NULL),
        '{}'
      )`,
    })
    .from(favorites)
    .innerJoin(spaces, eq(spaces.id, favorites.spaceId))
    .leftJoin(spaceFeatures, eq(spaceFeatures.spaceId, spaces.id))
    .where(
      and(
        sql`${spaces.type}::text = ${spaceType}`,
        eq(spaces.city, city),
        ne(spaces.id, excludeSpaceId),
        ne(favorites.userId, excludeUserId),
        isNull(spaces.deletedAt),
      ),
    )
    .groupBy(favorites.userId)
    .limit(500);

  return rows;
}

export type FavoriteSpace = {
  id: string;
  slug: string;
  type: string;
  title: string;
  district: string | null;
  city: string | null;
  state: string | null;
  priceMonthlyCents: number;
  status: string;
  approxLat: number | null;
  approxLng: number | null;
  coverPath: string | null;
  favoritedAt: Date;
  /** Preco no momento em que a pessoa favoritou. Null = favorito antigo, sem historico. */
  priceCentsAtFavorite: number | null;
  promotionType: 'destaque' | 'turbo' | null;
};

/**
 * Espaços favoritados pela pessoa, para a página /favoritos.
 *
 * Mostra mesmo o que não está mais `published` (pausado, por exemplo) — quem
 * favoritou sabe que salvou aquele anúncio; escondê-lo sem dizer nada seria
 * mais confuso do que mostrar com uma etiqueta de status. O que nunca
 * aparece é o que foi excluído de verdade (`deletedAt`), que nem existe mais.
 */
export async function listUserFavoriteSpaces(userId: string): Promise<FavoriteSpace[]> {
  const rows = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      type: sql<string>`${spaces.type}::text`,
      title: spaces.title,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      priceMonthlyCents: spaces.priceMonthlyCents,
      status: sql<string>`${spaces.status}::text`,
      approxLat: latOf(spaces.approxLocation),
      approxLng: lngOf(spaces.approxLocation),
      favoritedAt: favorites.createdAt,
      priceCentsAtFavorite: favorites.priceCentsAtFavorite,
      // `spaces.id` literal de proposito — ver a nota em spaces/queries.ts.
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
      )`,
      promotionType: sql<'destaque' | 'turbo' | null>`(
        SELECT p.type::text FROM promotions p
        WHERE p.space_id = spaces.id AND p.status = 'active'
        LIMIT 1
      )`,
    })
    .from(favorites)
    .innerJoin(spaces, eq(spaces.id, favorites.spaceId))
    .where(and(eq(favorites.userId, userId), isNull(spaces.deletedAt)))
    .orderBy(desc(favorites.createdAt));

  return rows as FavoriteSpace[];
}

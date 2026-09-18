import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { favorites, spaces } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';

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
      // `spaces.id` literal de proposito — ver a nota em spaces/queries.ts.
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
      )`,
    })
    .from(favorites)
    .innerJoin(spaces, eq(spaces.id, favorites.spaceId))
    .where(and(eq(favorites.userId, userId), isNull(spaces.deletedAt)))
    .orderBy(desc(favorites.createdAt));

  return rows as FavoriteSpace[];
}

'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { favorites, spaces } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';

export type FavoriteState = {
  ok: boolean;
  message?: string;
  /** Estado depois da acao — o cliente usa para confirmar o que o servidor gravou. */
  favorited?: boolean;
};

/**
 * Alterna favorito.
 *
 * Nao existe "editar favorito de outro usuario" para bloquear: a chave da
 * tabela e SEMPRE `(userId da sessao, spaceId)`. Nao recebemos um id de
 * favorito vindo do formulario — se recebessemos, alguem poderia mandar o
 * par (id-de-outro-usuario, spaceId) e mexer em favorito alheio. Aqui isso
 * e estruturalmente impossivel: o `userId` vem de `requireUserOrThrow()`,
 * nunca do cliente.
 */
export async function toggleFavoriteAction(formData: FormData): Promise<FavoriteState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para favoritar.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  if (!spaceId) return { ok: false, message: 'Espaço não encontrado.' };

  // Precisa existir e nao ter sido apagado — favoritar um id inventado nao
  // pode criar uma linha orfa na tabela.
  const [space] = await db
    .select({ id: spaces.id, deletedAt: spaces.deletedAt })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space || space.deletedAt) return { ok: false, message: 'Espaço não encontrado.' };

  const [jaFavoritado] = await db
    .select({ spaceId: favorites.spaceId })
    .from(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.spaceId, spaceId)))
    .limit(1);

  if (jaFavoritado) {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.spaceId, spaceId)));
    revalidatePath('/favoritos');
    revalidatePath('/espacos');
    return { ok: true, favorited: false };
  }

  await db.insert(favorites).values({ userId: user.id, spaceId }).onConflictDoNothing();
  revalidatePath('/favoritos');
  revalidatePath('/espacos');
  return { ok: true, favorited: true };
}

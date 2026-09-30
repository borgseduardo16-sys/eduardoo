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
    .select({ id: spaces.id, deletedAt: spaces.deletedAt, priceMonthlyCents: spaces.priceMonthlyCents })
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

  await db
    .insert(favorites)
    .values({ userId: user.id, spaceId, priceCentsAtFavorite: space.priceMonthlyCents })
    .onConflictDoNothing();
  revalidatePath('/favoritos');
  revalidatePath('/espacos');
  return { ok: true, favorited: true };
}

export type PriceAlertState = { ok: boolean; message?: string; enabled?: boolean };

/**
 * "Me avise quando o preço baixar" (Fase 23), por favorito.
 *
 * Mesma regra de `toggleFavoriteAction`: a chave é (usuário da sessão,
 * espaço) — não existe como mexer no aviso de outra pessoa. Religar parte do
 * preço de agora ("me avise a partir daqui"): uma queda que aconteceu com o
 * aviso desligado não vira notificação atrasada.
 */
export async function setPriceAlertAction(formData: FormData): Promise<PriceAlertState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para receber avisos.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  const enabled = formData.get('enabled') === '1';
  if (!/^[0-9a-f-]{36}$/i.test(spaceId)) return { ok: false, message: 'Espaço não encontrado.' };

  const [space] = await db
    .select({ priceMonthlyCents: spaces.priceMonthlyCents })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space) return { ok: false, message: 'Espaço não encontrado.' };

  const atualizados = await db
    .update(favorites)
    .set(
      enabled
        ? { priceAlert: true, priceAlertBaselineCents: space.priceMonthlyCents }
        : { priceAlert: false },
    )
    .where(and(eq(favorites.userId, user.id), eq(favorites.spaceId, spaceId)))
    .returning({ priceAlert: favorites.priceAlert });

  if (atualizados.length === 0) {
    return { ok: false, message: 'Favorite o espaço para receber avisos de preço.' };
  }

  revalidatePath('/favoritos');
  return { ok: true, enabled: atualizados[0].priceAlert };
}

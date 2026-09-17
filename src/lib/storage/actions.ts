'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaceImages, auditLogs } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedSpace, NotSpaceOwnerError } from '@/lib/spaces/queries';
import { MAX_PHOTOS } from '@/lib/spaces/schemas';
import {
  validateImage,
  buildImagePath,
  ImageValidationError,
  SPACE_IMAGES_BUCKET,
} from './images';

export type UploadState = {
  ok: boolean;
  message?: string;
  /** Quantas fotos o anuncio tem depois desta operacao. */
  count?: number;
};

/**
 * Envia uma foto para o anuncio.
 *
 * Ordem das checagens, e ela importa: primeiro confirmamos que quem envia e o
 * dono do anuncio, so depois lemos o arquivo. Ler antes significaria aceitar
 * 8 MB de upload de qualquer pessoa para so entao recusar.
 */
export async function uploadSpaceImageAction(formData: FormData): Promise<UploadState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente para enviar fotos.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');

  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    if (err instanceof NotSpaceOwnerError) {
      return { ok: false, message: 'Este anúncio não é seu.' };
    }
    return { ok: false, message: 'Anúncio não encontrado.' };
  }

  if (space.images.length >= MAX_PHOTOS) {
    return { ok: false, message: `Máximo de ${MAX_PHOTOS} fotos por anúncio.` };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, message: 'Nenhum arquivo recebido.' };
  }

  let image;
  try {
    image = await validateImage(file);
  } catch (err) {
    if (err instanceof ImageValidationError) return { ok: false, message: err.message };
    throw err;
  }

  const path = buildImagePath(user.id, spaceId, image.extension);
  const supabase = createAdminClient();

  const { error: uploadError } = await supabase.storage
    .from(SPACE_IMAGES_BUCKET)
    .upload(path, image.bytes, {
      contentType: image.mime,
      // O caminho ja tem um uuid: colisao seria bug nosso, nao concorrencia.
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    const msg = uploadError.message.toLowerCase();
    if (msg.includes('bucket not found')) {
      return {
        ok: false,
        message:
          'O armazenamento de fotos ainda não está configurado. Crie o bucket "space-images" no painel do Supabase.',
      };
    }
    console.error('[storage] upload falhou:', uploadError.message);
    return { ok: false, message: 'Não foi possível enviar a foto. Tente novamente.' };
  }

  // Posicao 0 = capa. A primeira foto enviada vira capa automaticamente.
  const [{ proxima } = { proxima: 0 }] = await db
    .select({ proxima: sql<number>`COALESCE(MAX(position) + 1, 0)::int` })
    .from(spaceImages)
    .where(eq(spaceImages.spaceId, spaceId));

  await db.insert(spaceImages).values({
    spaceId,
    storagePath: path,
    contentType: image.mime,
    sizeBytes: image.sizeBytes,
    width: image.width,
    height: image.height,
    position: proxima,
  });

  revalidatePath(`/anunciar/${spaceId}/fotos`);
  return { ok: true, count: space.images.length + 1 };
}

/** Remove uma foto do anuncio e do armazenamento. */
export async function deleteSpaceImageAction(formData: FormData): Promise<UploadState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  const imageId = String(formData.get('imageId') ?? '');

  try {
    await getOwnedSpace(spaceId, user.id);
  } catch {
    return { ok: false, message: 'Este anúncio não é seu.' };
  }

  // O `and` com spaceId impede apagar foto de outro anuncio passando um id solto.
  const [removida] = await db
    .delete(spaceImages)
    .where(and(eq(spaceImages.id, imageId), eq(spaceImages.spaceId, spaceId)))
    .returning({ path: spaceImages.storagePath });

  if (!removida) return { ok: false, message: 'Foto não encontrada.' };

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(SPACE_IMAGES_BUCKET).remove([removida.path]);
  if (error) {
    // A linha ja saiu do banco, entao a foto sumiu da interface. Um arquivo
    // orfao no bucket e problema de custo, nao de correcao — registramos.
    console.error('[storage] arquivo orfao:', removida.path, error.message);
  }

  await renumberPositions(spaceId);

  revalidatePath(`/anunciar/${spaceId}/fotos`);
  return { ok: true };
}

/**
 * Reordena as fotos. A primeira da lista vira a capa.
 * Recebe os ids na ordem desejada.
 */
export async function reorderSpaceImagesAction(formData: FormData): Promise<UploadState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou.' };
  }

  const spaceId = String(formData.get('spaceId') ?? '');
  const ordem = formData.getAll('imageIds').map(String);

  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch {
    return { ok: false, message: 'Este anúncio não é seu.' };
  }

  // A lista recebida tem que ser exatamente as fotos deste anuncio — nem a
  // mais, nem a menos. Assim um id estranho nao entra na reordenacao.
  const atuais = new Set(space.images.map((i) => i.id));
  if (ordem.length !== atuais.size || !ordem.every((id) => atuais.has(id))) {
    return { ok: false, message: 'A ordem enviada não corresponde às fotos do anúncio.' };
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of ordem.entries()) {
      await tx
        .update(spaceImages)
        .set({ position: index })
        .where(and(eq(spaceImages.id, id), eq(spaceImages.spaceId, spaceId)));
    }
  });

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'space.images_reordered',
    entityType: 'space',
    entityId: spaceId,
  });

  revalidatePath(`/anunciar/${spaceId}/fotos`);
  return { ok: true };
}

/** Deixa as posicoes sem buracos depois de uma exclusao. */
async function renumberPositions(spaceId: string) {
  await db.execute(sql`
    WITH ordenadas AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) - 1 AS nova
      FROM space_images WHERE space_id = ${spaceId}
    )
    UPDATE space_images si
    SET position = o.nova
    FROM ordenadas o
    WHERE si.id = o.id AND si.position <> o.nova
  `);
}

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { auditLogs, profiles } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { rateLimit } from '@/lib/rate-limit';
import { publicTextContactKinds } from '@/lib/safety/contact-detection';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPACE_IMAGES_BUCKET, buildAvatarPath, validateImage, ImageValidationError } from '@/lib/storage/images';
import { processAvatarImage, ImageProcessingError } from '@/lib/storage/process';

/**
 * Edição do próprio perfil (Fase 21).
 *
 * O que a pessoa PODE mudar: nome de exibição, apresentação (bio) e foto.
 * O que NÃO passa por aqui de jeito nenhum: nota, número de avaliações,
 * verificações, locações concluídas, papel, status — nem existem como campo
 * neste formulário, e o schema abaixo descarta qualquer outro campo que
 * chegue. No banco, a trigger `guard_profile_verification` é a segunda trava.
 */

export type ProfileActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<'displayName' | 'bio', string>>;
};

/** Nome que imita a plataforma engana quem conversa ("Suporte MyPlace pedindo Pix"). */
const NOMES_RESERVADOS = /(my\s*place|suporte|administra|moderador|equipe\s+oficial|oficial)/i;

function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const perfilSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40, 'Use no máximo 40 caracteres.')
    .refine((v) => v === '' || v.length >= 2, 'Use pelo menos 2 caracteres.')
    .refine((v) => !NOMES_RESERVADOS.test(semAcento(v)), 'Esse nome não pode ser usado — ele se parece com um nome da plataforma.')
    .refine((v) => publicTextContactKinds(v).length === 0, 'O nome não pode ter telefone, e-mail ou link.'),
  bio: z
    .string()
    .trim()
    .max(500, 'Use no máximo 500 caracteres.')
    .refine((v) => publicTextContactKinds(v).length === 0, 'Tire telefone, e-mail, documento ou links — a apresentação é pública.'),
});

export async function updateProfileAction(
  _prev: ProfileActionState | undefined,
  formData: FormData,
): Promise<ProfileActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const parsed = perfilSchema.safeParse({
    displayName: String(formData.get('displayName') ?? ''),
    bio: String(formData.get('bio') ?? ''),
  });
  if (!parsed.success) {
    const fe: ProfileActionState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] as 'displayName' | 'bio';
      fe[campo] ??= issue.message;
    }
    return { ok: false, message: 'Revise os campos destacados.', fieldErrors: fe };
  }

  const limite = await rateLimit(`profile-update:${user.id}`, { limit: 20, windowSeconds: 600 });
  if (!limite.allowed) return { ok: false, message: 'Muitas alterações seguidas. Aguarde alguns minutos.' };

  const displayName = parsed.data.displayName || null;
  const bio = parsed.data.bio || null;

  await db.update(profiles).set({ displayName, bio, updatedAt: new Date() }).where(eq(profiles.id, user.id));

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'profile.updated',
    entityType: 'profile',
    entityId: user.id,
    // Quais campos, não o conteúdo: o texto já está no perfil.
    metadata: { displayName: displayName !== null, bio: bio !== null },
  });

  revalidatePath('/minha-conta');
  revalidatePath('/minha-conta/perfil');
  revalidatePath(`/perfil/${user.id}`);
  return { ok: true, message: 'Perfil atualizado.' };
}

/** Envia (ou troca) a foto de perfil. */
export async function uploadAvatarAction(
  _prev: ProfileActionState | undefined,
  formData: FormData,
): Promise<ProfileActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const limite = await rateLimit(`avatar-upload:${user.id}`, { limit: 10, windowSeconds: 600 });
  if (!limite.allowed) return { ok: false, message: 'Muitos envios seguidos. Aguarde alguns minutos.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Escolha uma foto.' };

  let processada;
  try {
    const imagem = await validateImage(file);
    processada = await processAvatarImage(imagem.bytes, imagem.mime);
  } catch (err) {
    if (err instanceof ImageValidationError || err instanceof ImageProcessingError) {
      return { ok: false, message: err.message };
    }
    console.error('[perfil] foto de perfil: processamento falhou:', err);
    return { ok: false, message: 'Não foi possível processar a foto. Tente outro arquivo.' };
  }

  const [atual] = await db.select({ avatarPath: profiles.avatarPath }).from(profiles).where(eq(profiles.id, user.id)).limit(1);

  const caminho = buildAvatarPath(user.id, processada.extension);
  const supabase = createAdminClient();
  const envio = await supabase.storage.from(SPACE_IMAGES_BUCKET).upload(caminho, processada.bytes, {
    contentType: processada.mime,
    upsert: false,
    cacheControl: '3600',
  });
  if (envio.error) {
    console.error('[perfil] foto de perfil: upload falhou:', envio.error.message);
    return { ok: false, message: 'Não foi possível enviar a foto agora. Tente novamente.' };
  }

  await db.update(profiles).set({ avatarPath: caminho, updatedAt: new Date() }).where(eq(profiles.id, user.id));

  // A foto anterior sai do armazenamento (melhor esforço: falhar aqui não
  // desfaz a troca — sobraria só um arquivo órfão, privado).
  if (atual?.avatarPath && atual.avatarPath !== caminho && atual.avatarPath.startsWith(`${user.id}/avatar/`)) {
    await supabase.storage.from(SPACE_IMAGES_BUCKET).remove([atual.avatarPath]).catch(() => {});
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'profile.avatar_changed',
    entityType: 'profile',
    entityId: user.id,
  });

  revalidatePath('/minha-conta');
  revalidatePath('/minha-conta/perfil');
  revalidatePath(`/perfil/${user.id}`);
  return { ok: true, message: 'Foto atualizada.' };
}

/** Remove a foto de perfil (volta para a inicial do nome). */
export async function removeAvatarAction(): Promise<ProfileActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }

  const [atual] = await db.select({ avatarPath: profiles.avatarPath }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!atual?.avatarPath) return { ok: true, message: 'Você não tem foto de perfil.' };

  await db.update(profiles).set({ avatarPath: null, updatedAt: new Date() }).where(eq(profiles.id, user.id));
  if (atual.avatarPath.startsWith(`${user.id}/avatar/`)) {
    await createAdminClient().storage.from(SPACE_IMAGES_BUCKET).remove([atual.avatarPath]).catch(() => {});
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'profile.avatar_removed',
    entityType: 'profile',
    entityId: user.id,
  });

  revalidatePath('/minha-conta');
  revalidatePath('/minha-conta/perfil');
  revalidatePath(`/perfil/${user.id}`);
  return { ok: true, message: 'Foto removida.' };
}

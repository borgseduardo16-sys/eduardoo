'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { auditLogs, features, listingSuggestions, spaces } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { isIntegrationConfigured, IntegrationNotConfiguredError } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { settingInt } from '@/lib/settings';
import { consumeAiQuota } from '@/lib/ai/usage';
import { getOwnedSpace, NotSpaceOwnerError, SpaceNotFoundError } from '@/lib/spaces/queries';
import { contentStepSchema } from '@/lib/spaces/schemas';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { getListingAiUsage } from './queries';
import { guardListingSuggestion } from './guard';
import { LISTING_AI_MODEL, ListingAiError, suggestListingImprovements } from './ai';

export type ListingAiActionState = { ok: boolean; message?: string };

async function espacoDoDono(spaceId: string, userId: string) {
  try {
    return await getOwnedSpace(spaceId, userId);
  } catch (err) {
    if (err instanceof NotSpaceOwnerError || err instanceof SpaceNotFoundError) return null;
    throw err;
  }
}

const pedidoSchema = z.object({ spaceId: z.string().uuid() });

/**
 * "Melhorar anúncio": pede sugestões à IA (Fase 23).
 *
 * Nada no anúncio muda aqui. A resposta passa pela guarda de fatos e fica
 * guardada em `listing_suggestions`; o proprietário revisa e aceita campo
 * por campo depois. Limites: por proprietário por dia, intervalo mínimo por
 * anúncio e teto diário do app — os três em `platform_settings`.
 */
export async function requestListingSuggestionAction(
  _prev: ListingAiActionState | undefined,
  formData: FormData,
): Promise<ListingAiActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }
  const parsed = pedidoSchema.safeParse({ spaceId: formData.get('spaceId') });
  if (!parsed.success) return { ok: false, message: 'Anúncio inválido.' };
  const { spaceId } = parsed.data;

  const space = await espacoDoDono(spaceId, user.id);
  if (!space) return { ok: false, message: 'Anúncio não encontrado.' };
  if ((space.title?.trim().length ?? 0) < 10 || (space.description?.trim().length ?? 0) < 20) {
    return { ok: false, message: 'Escreva o título e a descrição do anúncio antes de pedir sugestões.' };
  }

  if (!isIntegrationConfigured('aiText')) {
    return { ok: false, message: 'As sugestões por IA ainda não estão disponíveis. O resto do anúncio funciona normalmente.' };
  }

  // Clique duplo não vira duas chamadas pagas.
  const cliqueDuplo = await rateLimit(`melhorar-anuncio:${user.id}`, { limit: 1, windowSeconds: 20 });
  if (!cliqueDuplo.allowed) return { ok: false, message: 'Já estamos preparando sugestões. Aguarde alguns segundos.' };

  const uso = await getListingAiUsage(user.id, spaceId);
  if (uso.usedLast24h >= uso.limitPerDay) {
    return { ok: false, message: `Você já pediu ${uso.limitPerDay} sugestões nas últimas 24 horas. Tente de novo amanhã.` };
  }
  if (uso.spaceCooldownLeftMinutes > 0) {
    return {
      ok: false,
      message: `Você pediu sugestões para este anúncio há pouco. Tente de novo em ${uso.spaceCooldownLeftMinutes} ${uso.spaceCooldownLeftMinutes === 1 ? 'minuto' : 'minutos'}.`,
    };
  }
  const teto = await settingInt('ai.listing_daily_limit', 300);
  if (!(await consumeAiQuota('listing', teto))) {
    return { ok: false, message: 'O limite diário de sugestões por IA do app foi atingido. Tente de novo amanhã.' };
  }

  const catalogo = await db.select({ key: features.key, label: features.label }).from(features);
  const rotulos = new Map(catalogo.map((f) => [f.key, f.label]));
  const sizeM2 = space.sizeM2 != null ? Number(space.sizeM2) : null;
  const ceilingHeightM = space.ceilingHeightM != null ? Number(space.ceilingHeightM) : null;
  const entrada = {
    typeLabel: spaceTypeLabel(space.type as SpaceTypeKey),
    title: space.title,
    description: space.description ?? '',
    features: space.featureKeys.map((k) => rotulos.get(k) ?? k),
    sizeM2,
    ceilingHeightM,
    rulesText: space.rulesText,
    allowedItems: space.allowedItems,
    forbiddenItems: space.forbiddenItems,
    accessHours: space.accessHours,
    district: space.district,
    city: space.city,
    photoCount: space.images.length,
  };

  try {
    const bruta = await suggestListingImprovements(entrada);
    const { content, removed } = guardListingSuggestion(
      bruta,
      {
        featureKeys: space.featureKeys,
        featureLabels: rotulos,
        sizeM2,
        ceilingHeightM,
        photoCount: space.images.length,
        ownerText: [space.title, space.description, space.rulesText, space.allowedItems, space.forbiddenItems, space.accessHours]
          .filter(Boolean)
          .join('\n'),
        district: space.district,
        city: space.city,
      },
      { title: space.title, description: space.description ?? '' },
    );
    await db.insert(listingSuggestions).values({
      spaceId,
      ownerId: user.id,
      status: 'ready',
      model: LISTING_AI_MODEL,
      inputSnapshot: entrada,
      suggestion: content,
      removedClaims: removed,
    });
  } catch (err) {
    if (err instanceof ListingAiError || err instanceof IntegrationNotConfiguredError) {
      console.warn(`[melhorar-anuncio] IA indisponível: ${err.message}`);
      await db.insert(listingSuggestions).values({
        spaceId, ownerId: user.id, status: 'failed', model: LISTING_AI_MODEL, inputSnapshot: entrada,
      });
      revalidatePath(`/meus-espacos/${spaceId}/melhorar`);
      return { ok: false, message: 'Não conseguimos gerar sugestões agora. Tente de novo em alguns minutos.' };
    }
    throw err;
  }

  revalidatePath(`/meus-espacos/${spaceId}/melhorar`);
  return { ok: true, message: 'Sugestões prontas. Revise abaixo e use só o que fizer sentido.' };
}

const aplicarSchema = z.object({
  suggestionId: z.string().uuid(),
  field: z.enum(['title', 'description']),
});

/**
 * Aceitar UMA parte da sugestão. O texto aplicado é o que está guardado
 * no banco (já passado pela guarda) — nunca o que o navegador mandar.
 */
export async function applyListingSuggestionAction(
  _prev: ListingAiActionState | undefined,
  formData: FormData,
): Promise<ListingAiActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }
  const parsed = aplicarSchema.safeParse({ suggestionId: formData.get('suggestionId'), field: formData.get('field') });
  if (!parsed.success) return { ok: false, message: 'Pedido inválido.' };
  const { suggestionId, field } = parsed.data;

  const [sug] = await db
    .select({
      spaceId: listingSuggestions.spaceId,
      content: listingSuggestions.suggestion,
      appliedFields: listingSuggestions.appliedFields,
      status: listingSuggestions.status,
    })
    .from(listingSuggestions)
    .where(and(eq(listingSuggestions.id, suggestionId), eq(listingSuggestions.ownerId, user.id)))
    .limit(1);
  if (!sug) return { ok: false, message: 'Sugestão não encontrada.' };
  if (!['ready', 'partially_applied'].includes(sug.status)) return { ok: false, message: 'Esta sugestão não está mais aberta.' };
  const texto = field === 'title' ? sug.content?.title : sug.content?.description;
  if (!texto) return { ok: false, message: 'Não há sugestão para este campo.' };
  if (sug.appliedFields.includes(field)) return { ok: true, message: 'Esta sugestão já foi aplicada.' };

  const space = await espacoDoDono(sug.spaceId, user.id);
  if (!space) return { ok: false, message: 'Anúncio não encontrado.' };

  const validado = contentStepSchema.safeParse({
    title: field === 'title' ? texto : space.title,
    description: field === 'description' ? texto : (space.description ?? ''),
  });
  if (!validado.success) return { ok: false, message: validado.error.issues[0]?.message ?? 'Texto inválido.' };

  const outroCampo = field === 'title' ? 'description' : 'title';
  const temOutro = Boolean(field === 'title' ? sug.content?.description : sug.content?.title);

  const aplicou = await db.transaction(async (tx) => {
    // Trava a sugestão: dois cliques no mesmo campo aplicam uma vez só.
    const [marcada] = await tx
      .update(listingSuggestions)
      .set({
        appliedFields: sql`array_append(${listingSuggestions.appliedFields}, ${field})`,
        status: sql`CASE WHEN ${!temOutro} OR ${outroCampo} = ANY(${listingSuggestions.appliedFields})
          THEN 'applied'::listing_suggestion_status ELSE 'partially_applied'::listing_suggestion_status END`,
        decidedAt: new Date(),
      })
      .where(and(
        eq(listingSuggestions.id, suggestionId),
        eq(listingSuggestions.ownerId, user.id),
        inArray(listingSuggestions.status, ['ready', 'partially_applied']),
        sql`NOT (${field} = ANY(${listingSuggestions.appliedFields}))`,
      ))
      .returning({ id: listingSuggestions.id });
    if (!marcada) return false;

    await tx
      .update(spaces)
      .set(field === 'title'
        ? { title: validado.data.title, updatedAt: new Date() }
        : { description: validado.data.description, updatedAt: new Date() })
      .where(and(eq(spaces.id, sug.spaceId), eq(spaces.ownerId, user.id)));

    await tx.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: 'space.ai_suggestion_applied',
      entityType: 'space',
      entityId: sug.spaceId,
      metadata: { suggestionId, field },
    });
    return true;
  });
  if (!aplicou) return { ok: true, message: 'Esta sugestão já foi aplicada.' };

  revalidatePath(`/meus-espacos/${sug.spaceId}/melhorar`);
  revalidatePath('/meus-espacos');
  revalidatePath(`/espacos/${space.slug}`);
  return { ok: true, message: field === 'title' ? 'Título atualizado no anúncio.' : 'Descrição atualizada no anúncio.' };
}

const descartarSchema = z.object({ suggestionId: z.string().uuid() });

export async function dismissListingSuggestionAction(
  _prev: ListingAiActionState | undefined,
  formData: FormData,
): Promise<ListingAiActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  }
  const parsed = descartarSchema.safeParse({ suggestionId: formData.get('suggestionId') });
  if (!parsed.success) return { ok: false, message: 'Pedido inválido.' };

  const [row] = await db
    .update(listingSuggestions)
    .set({ status: 'dismissed', decidedAt: new Date() })
    .where(and(
      eq(listingSuggestions.id, parsed.data.suggestionId),
      eq(listingSuggestions.ownerId, user.id),
      inArray(listingSuggestions.status, ['ready', 'partially_applied']),
    ))
    .returning({ spaceId: listingSuggestions.spaceId });
  if (!row) return { ok: false, message: 'Sugestão não encontrada.' };
  revalidatePath(`/meus-espacos/${row.spaceId}/melhorar`);
  return { ok: true, message: 'Sugestões descartadas. O anúncio continua como estava.' };
}

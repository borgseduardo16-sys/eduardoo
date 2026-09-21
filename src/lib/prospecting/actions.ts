'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { prospectLeads, prospectSearches } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { IntegrationNotConfiguredError } from '@/lib/env';
import { searchFormSchema, savedStatusSchema } from './schemas';
import { runProspectSearch } from './search';
import type { LocationScope } from './types';

export type SearchActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Roda a busca de prospeccao de ponta a ponta: cria o registro da busca,
 * consulta a Places API, classifica cada empresa, grava tudo e so entao
 * redireciona para os resultados — o redirecionamento em si so acontece se
 * nada falhar, para nao levar a uma tela de resultados vazia por engano.
 */
export async function runSearchAction(
  _prev: SearchActionState,
  formData: FormData,
): Promise<SearchActionState> {
  const user = await requireUserOrThrow();

  const raw = {
    niche: formData.get('niche'),
    locationLabel: formData.get('locationLabel'),
    locationScope: formData.get('locationScope'),
    minReviews: formData.get('minReviews') || 0,
    minRating: formData.get('minRating') || null,
    requestedQuantity: formData.get('requestedQuantity'),
  };

  const parsed = searchFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: 'Revise os campos destacados.', fieldErrors };
  }

  const filters = parsed.data;

  const [search] = await db
    .insert(prospectSearches)
    .values({
      userId: user.id,
      niche: filters.niche,
      nicheKeyword: filters.niche,
      locationLabel: filters.locationLabel,
      locationScope: filters.locationScope as LocationScope,
      minReviews: filters.minReviews,
      minRating: filters.minRating !== null && filters.minRating !== undefined ? String(filters.minRating) : null,
      requestedQuantity: filters.requestedQuantity,
      status: 'running',
    })
    .returning({ id: prospectSearches.id });

  try {
    const result = await runProspectSearch({
      niche: filters.niche,
      nicheKeyword: filters.niche,
      locationLabel: filters.locationLabel,
      locationScope: filters.locationScope as LocationScope,
      minReviews: filters.minReviews,
      minRating: filters.minRating ?? null,
      requestedQuantity: filters.requestedQuantity,
    });

    if (result.companies.length > 0) {
      const rows = result.companies.map((c) => ({
        searchId: search.id,
        userId: user.id,
        googlePlaceId: c.googlePlaceId,
        name: c.name,
        category: c.category,
        phone: c.phone,
        address: c.address,
        city: c.city,
        state: c.state,
        rating: c.rating !== null ? String(c.rating) : null,
        reviewCount: c.reviewCount,
        mapsUrl: c.mapsUrl,
        websiteRaw: c.websiteRaw,
        websiteClassification: c.websiteClassification,
        classificationDetail: c.classificationDetail,
        whatsappUrl: c.whatsappUrl,
        instagramUrl: c.instagramUrl,
        facebookUrl: c.facebookUrl,
        leadStatus: c.leadStatus,
        discardReason: c.discardReason,
        confidence: c.confidence,
      }));

      for (const batch of chunk(rows, 500)) {
        await db.insert(prospectLeads).values(batch).onConflictDoNothing();
      }
    }

    await db
      .update(prospectSearches)
      .set({
        status: 'completed',
        companiesAnalyzed: result.companiesAnalyzed,
        leadsFound: result.leadsFound,
        discardedSite: result.discardedSite,
        discardedMenu: result.discardedMenu,
        discardedCatalog: result.discardedCatalog,
        discardedScheduling: result.discardedScheduling,
        discardedOther: result.discardedOther,
        completedAt: new Date(),
      })
      .where(eq(prospectSearches.id, search.id));
  } catch (err) {
    const message =
      err instanceof IntegrationNotConfiguredError
        ? err.message
        : err instanceof Error
          ? `Falha ao consultar o Google Places: ${err.message}`
          : 'Falha inesperada ao buscar empresas.';

    await db
      .update(prospectSearches)
      .set({ status: 'failed', errorMessage: message, completedAt: new Date() })
      .where(eq(prospectSearches.id, search.id));

    return { ok: false, message };
  }

  redirect(`/prospectar/${search.id}`);
}

export type LeadActionState = { ok: boolean; message?: string };

/** Salva/remove um lead de "Meus Leads". Ao salvar pela primeira vez, status vira "novo". */
export async function toggleSaveLeadAction(leadId: string): Promise<LeadActionState> {
  const user = await requireUserOrThrow();

  const [lead] = await db
    .select({ id: prospectLeads.id, isSaved: prospectLeads.isSaved })
    .from(prospectLeads)
    .where(and(eq(prospectLeads.id, leadId), eq(prospectLeads.userId, user.id)))
    .limit(1);
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };

  await db
    .update(prospectLeads)
    .set({
      isSaved: !lead.isSaved,
      savedStatus: !lead.isSaved ? 'novo' : null,
      updatedAt: new Date(),
    })
    .where(eq(prospectLeads.id, leadId));

  revalidatePath('/leads');
  revalidatePath(`/prospectar`);
  return { ok: true };
}

export async function updateLeadStatusAction(
  leadId: string,
  status: string,
): Promise<LeadActionState> {
  const user = await requireUserOrThrow();
  const parsedStatus = savedStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, message: 'Status inválido.' };

  const result = await db
    .update(prospectLeads)
    .set({ savedStatus: parsedStatus.data, isSaved: true, updatedAt: new Date() })
    .where(and(eq(prospectLeads.id, leadId), eq(prospectLeads.userId, user.id)))
    .returning({ id: prospectLeads.id });

  if (result.length === 0) return { ok: false, message: 'Lead não encontrado.' };

  revalidatePath('/leads');
  return { ok: true };
}

export async function updateLeadNotesAction(
  leadId: string,
  notes: string,
): Promise<LeadActionState> {
  const user = await requireUserOrThrow();
  if (notes.length > 4000) return { ok: false, message: 'Observação muito longa.' };

  const result = await db
    .update(prospectLeads)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(and(eq(prospectLeads.id, leadId), eq(prospectLeads.userId, user.id)))
    .returning({ id: prospectLeads.id });

  if (result.length === 0) return { ok: false, message: 'Lead não encontrado.' };

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

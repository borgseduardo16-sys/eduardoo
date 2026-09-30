'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import postgres from 'postgres';
import { db } from '@/db/client';
import { features, savedSearches } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { rateLimit } from '@/lib/rate-limit';
import { alertLabel, canonicalCriteria } from './criteria';
import { criteriaFromSearch } from './from-search';
import { alertPlanFor } from './queries';

const { PostgresError } = postgres;

export type AlertActionState = { ok: boolean; message?: string; alertId?: string; limitReached?: boolean };

function pgError(err: unknown): InstanceType<typeof PostgresError> | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

async function rotulosDoCatalogo(): Promise<Map<string, string>> {
  const rows = await db.select({ key: features.key, label: features.label }).from(features);
  return new Map(rows.map((r) => [r.key, r.label]));
}

function mensagemDeLimite(limite: number, premium: boolean): string {
  return premium
    ? `Você já tem ${limite} alertas ativos, o limite do Premium. Pause ou exclua um em Meus alertas.`
    : `Você já tem ${limite === 1 ? '1 alerta ativo' : `${limite} alertas ativos`}, o limite da conta gratuita. Pause ou exclua um em Meus alertas. No Premium são até 20.`;
}

const saveSchema = z.object({
  /** A query string da busca que está na tela — reinterpretada aqui, nunca usada como veio. */
  search: z.string().max(2000),
  alertId: z.string().uuid().optional(),
});

/**
 * Criar um alerta a partir da busca atual — ou, com `alertId`, trocar os
 * critérios de um alerta existente pelos da busca atual (é assim que se
 * edita: a própria tela de busca é o editor, sem um formulário paralelo).
 */
export async function saveSearchAlertAction(
  _prev: AlertActionState | undefined,
  formData: FormData,
): Promise<AlertActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para criar um alerta.' };
  }

  const parsed = saveSchema.safeParse({
    search: formData.get('search') ?? '',
    alertId: formData.get('alertId') || undefined,
  });
  if (!parsed.success) return { ok: false, message: 'Busca inválida.' };

  const limite = await rateLimit(`alertas:${user.id}`, { limit: 30, windowSeconds: 3600 });
  if (!limite.allowed) return { ok: false, message: 'Muitas alterações seguidas. Tente de novo mais tarde.' };

  const sp = Object.fromEntries(new URLSearchParams(parsed.data.search.replace(/^\?/, '')));
  const resultado = await criteriaFromSearch(sp);
  if (!resultado.ok) return { ok: false, message: resultado.message };

  const criteria = resultado.criteria;
  const label = alertLabel(criteria, await rotulosDoCatalogo());
  const criteriaKey = canonicalCriteria(criteria);

  try {
    if (parsed.data.alertId) {
      const [atualizado] = await db
        .update(savedSearches)
        .set({ criteria, criteriaKey, label, updatedAt: new Date() })
        .where(and(eq(savedSearches.id, parsed.data.alertId), eq(savedSearches.userId, user.id)))
        .returning({ id: savedSearches.id });
      if (!atualizado) return { ok: false, message: 'Alerta não encontrado.' };
      revalidatePath('/alertas');
      return { ok: true, message: `Alerta atualizado: ${label}.`, alertId: atualizado.id };
    }

    // Checagem amigável antes; o gatilho do banco é quem garante de verdade.
    const plano = await alertPlanFor(user.id);
    if (plano.active >= plano.limit) {
      return { ok: false, limitReached: true, message: mensagemDeLimite(plano.limit, plano.premium) };
    }
    const [novo] = await db
      .insert(savedSearches)
      .values({ userId: user.id, label, criteria, criteriaKey })
      .returning({ id: savedSearches.id });
    revalidatePath('/alertas');
    return {
      ok: true,
      alertId: novo!.id,
      message: `Alerta criado: ${label}. Você vai ser avisado quando um espaço novo assim for publicado.`,
    };
  } catch (err) {
    const pg = pgError(err);
    if (pg?.code === '23505' && pg.constraint_name === 'saved_searches_user_criteria_key') {
      return { ok: false, message: 'Você já tem um alerta com exatamente esta busca.' };
    }
    if (pg?.constraint_name === 'saved_searches_active_limit') {
      const plano = await alertPlanFor(user.id);
      return { ok: false, limitReached: true, message: mensagemDeLimite(plano.limit, plano.premium) };
    }
    throw err;
  }
}

const statusSchema = z.object({
  alertId: z.string().uuid(),
  status: z.enum(['active', 'paused']),
});

/** Pausar (para de avisar, guarda os critérios) ou reativar. */
export async function setSearchAlertStatusAction(
  _prev: AlertActionState | undefined,
  formData: FormData,
): Promise<AlertActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para continuar.' };
  }
  const parsed = statusSchema.safeParse({ alertId: formData.get('alertId'), status: formData.get('status') });
  if (!parsed.success) return { ok: false, message: 'Pedido inválido.' };

  try {
    const [row] = await db
      .update(savedSearches)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(savedSearches.id, parsed.data.alertId), eq(savedSearches.userId, user.id)))
      .returning({ id: savedSearches.id });
    if (!row) return { ok: false, message: 'Alerta não encontrado.' };
  } catch (err) {
    if (pgError(err)?.constraint_name === 'saved_searches_active_limit') {
      const plano = await alertPlanFor(user.id);
      return { ok: false, limitReached: true, message: mensagemDeLimite(plano.limit, plano.premium) };
    }
    throw err;
  }
  revalidatePath('/alertas');
  return { ok: true, message: parsed.data.status === 'paused' ? 'Alerta pausado.' : 'Alerta ativado.' };
}

const deleteSchema = z.object({ alertId: z.string().uuid() });

export async function deleteSearchAlertAction(
  _prev: AlertActionState | undefined,
  formData: FormData,
): Promise<AlertActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para continuar.' };
  }
  const parsed = deleteSchema.safeParse({ alertId: formData.get('alertId') });
  if (!parsed.success) return { ok: false, message: 'Pedido inválido.' };

  const [row] = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, parsed.data.alertId), eq(savedSearches.userId, user.id)))
    .returning({ id: savedSearches.id });
  if (!row) return { ok: false, message: 'Alerta não encontrado.' };
  revalidatePath('/alertas');
  return { ok: true, message: 'Alerta excluído.' };
}

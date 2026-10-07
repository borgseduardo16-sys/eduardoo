import 'server-only';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { savedSearches } from '@/db/schema';
import { settingInt } from '@/lib/settings';
import { isPremium } from '@/lib/premium/queries';
import { alertCriteriaSchema, type AlertCriteria } from './criteria';

/**
 * Leitura dos alertas (Fase 23). Toda consulta leva `user_id` no WHERE —
 * é assim que um alerta de outra pessoa nunca aparece nem por id na URL.
 */

export type SavedSearchView = {
  id: string;
  label: string;
  status: 'active' | 'paused';
  criteria: AlertCriteria | null;
  createdAt: Date;
  lastNotifiedAt: Date | null;
  /** Anúncios novos que bateram desde a criação. */
  matchesTotal: number;
  /** Ainda na fila do próximo aviso agrupado. */
  matchesPending: number;
};

function lerCriterios(raw: unknown): AlertCriteria | null {
  const r = alertCriteriaSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export async function listUserSavedSearches(userId: string): Promise<SavedSearchView[]> {
  const rows = await db
    .select({
      id: savedSearches.id,
      label: savedSearches.label,
      status: savedSearches.status,
      criteria: savedSearches.criteria,
      createdAt: savedSearches.createdAt,
      lastNotifiedAt: savedSearches.lastNotifiedAt,
      matchesTotal: sql<number>`(SELECT count(*)::int FROM saved_search_matches m WHERE m.saved_search_id = saved_searches.id)`,
      matchesPending: sql<number>`(
        SELECT count(*)::int FROM saved_search_matches m
        JOIN spaces s ON s.id = m.space_id AND s.status = 'published' AND s.deleted_at IS NULL
        WHERE m.saved_search_id = saved_searches.id AND m.notified_at IS NULL
      )`,
    })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
  return rows.map((r) => ({ ...r, criteria: lerCriterios(r.criteria) }));
}

export async function getUserSavedSearch(userId: string, id: string): Promise<SavedSearchView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const todos = await listUserSavedSearches(userId);
  return todos.find((s) => s.id === id) ?? null;
}

export async function countActiveSavedSearches(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(savedSearches)
    .where(and(eq(savedSearches.userId, userId), eq(savedSearches.status, 'active')));
  return row?.n ?? 0;
}

export type AlertPlan = {
  premium: boolean;
  /** Alertas ATIVOS ao mesmo tempo. */
  limit: number;
  active: number;
  /** Intervalo mínimo entre dois avisos do mesmo alerta. */
  cooldownHours: number;
};

/**
 * Regras do plano (Fase 23) — Premium já inclui "alertas de novos
 * espaços"; aqui isso vira MAIS alertas e aviso mais rápido. Sem cobrança
 * nova: quem não é Premium continua com alertas de verdade.
 */
export async function alertPlanFor(userId: string): Promise<AlertPlan> {
  const [premium, active] = await Promise.all([isPremium(userId), countActiveSavedSearches(userId)]);
  const [limitFree, limitPremium, horasFree, horasPremium] = await Promise.all([
    settingInt('alerts.saved_search_max_free', 2),
    settingInt('alerts.saved_search_max_premium', 20),
    settingInt('alerts.digest_hours_free', 24),
    settingInt('alerts.digest_hours_premium', 1),
  ]);
  return {
    premium,
    limit: premium ? limitPremium : limitFree,
    active,
    cooldownHours: premium ? horasPremium : horasFree,
  };
}

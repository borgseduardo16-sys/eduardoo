import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { prospectLeads, prospectSearches } from '@/db/schema';

/**
 * Leitura de prospeccao.
 *
 * Toda funcao recebe o `userId` de quem esta pedindo e so devolve o que
 * pertence a ELE — mesmo padrao de src/lib/favorites/queries.ts. Nenhuma
 * consulta aqui aceita um id solto sem checar o dono.
 */

export type SearchSummary = {
  id: string;
  niche: string;
  locationLabel: string;
  locationScope: string;
  minReviews: number;
  minRating: string | null;
  requestedQuantity: number;
  status: string;
  errorMessage: string | null;
  companiesAnalyzed: number;
  leadsFound: number;
  discardedSite: number;
  discardedMenu: number;
  discardedCatalog: number;
  discardedScheduling: number;
  discardedOther: number;
  createdAt: Date;
  completedAt: Date | null;
};

export async function getSearchForUser(userId: string, searchId: string): Promise<SearchSummary | null> {
  const [row] = await db
    .select()
    .from(prospectSearches)
    .where(and(eq(prospectSearches.id, searchId), eq(prospectSearches.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listRecentSearches(userId: string, limit = 10): Promise<SearchSummary[]> {
  return db
    .select()
    .from(prospectSearches)
    .where(eq(prospectSearches.userId, userId))
    .orderBy(desc(prospectSearches.createdAt))
    .limit(limit);
}

export type LeadRow = typeof prospectLeads.$inferSelect;

export async function listLeadsForSearch(
  userId: string,
  searchId: string,
  opts: { includeDiscarded?: boolean } = {},
): Promise<LeadRow[]> {
  const conditions = [eq(prospectLeads.searchId, searchId), eq(prospectLeads.userId, userId)];
  if (!opts.includeDiscarded) conditions.push(eq(prospectLeads.leadStatus, 'valid'));

  return db
    .select()
    .from(prospectLeads)
    .where(and(...conditions))
    .orderBy(desc(prospectLeads.reviewCount));
}

export async function getLeadForUser(userId: string, leadId: string): Promise<LeadRow | null> {
  const [row] = await db
    .select()
    .from(prospectLeads)
    .where(and(eq(prospectLeads.id, leadId), eq(prospectLeads.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listSavedLeads(
  userId: string,
  opts: { statuses?: string[] } = {},
): Promise<LeadRow[]> {
  const conditions = [eq(prospectLeads.userId, userId), eq(prospectLeads.isSaved, true)];
  if (opts.statuses && opts.statuses.length > 0) {
    conditions.push(inArray(prospectLeads.savedStatus, opts.statuses as never[]));
  }
  return db
    .select()
    .from(prospectLeads)
    .where(and(...conditions))
    .orderBy(desc(prospectLeads.updatedAt));
}

export type DashboardStats = {
  companiesAnalyzed: number;
  leadsFound: number;
  discardedSite: number;
  discardedMenu: number;
  discardedCatalog: number;
  discardedScheduling: number;
  savedLeads: number;
  contactedLeads: number;
  clientsWon: number;
};

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const [searchTotals] = await db
    .select({
      companiesAnalyzed: sql<number>`coalesce(sum(${prospectSearches.companiesAnalyzed}), 0)::int`,
      leadsFound: sql<number>`coalesce(sum(${prospectSearches.leadsFound}), 0)::int`,
      discardedSite: sql<number>`coalesce(sum(${prospectSearches.discardedSite}), 0)::int`,
      discardedMenu: sql<number>`coalesce(sum(${prospectSearches.discardedMenu}), 0)::int`,
      discardedCatalog: sql<number>`coalesce(sum(${prospectSearches.discardedCatalog}), 0)::int`,
      discardedScheduling: sql<number>`coalesce(sum(${prospectSearches.discardedScheduling}), 0)::int`,
    })
    .from(prospectSearches)
    .where(eq(prospectSearches.userId, userId));

  const [leadTotals] = await db
    .select({
      savedLeads: sql<number>`count(*) filter (where ${prospectLeads.isSaved})::int`,
      contactedLeads: sql<number>`count(*) filter (where ${prospectLeads.savedStatus} in ('contato_realizado','em_negociacao','cliente'))::int`,
      clientsWon: sql<number>`count(*) filter (where ${prospectLeads.savedStatus} = 'cliente')::int`,
    })
    .from(prospectLeads)
    .where(eq(prospectLeads.userId, userId));

  return {
    companiesAnalyzed: searchTotals?.companiesAnalyzed ?? 0,
    leadsFound: searchTotals?.leadsFound ?? 0,
    discardedSite: searchTotals?.discardedSite ?? 0,
    discardedMenu: searchTotals?.discardedMenu ?? 0,
    discardedCatalog: searchTotals?.discardedCatalog ?? 0,
    discardedScheduling: searchTotals?.discardedScheduling ?? 0,
    savedLeads: leadTotals?.savedLeads ?? 0,
    contactedLeads: leadTotals?.contactedLeads ?? 0,
    clientsWon: leadTotals?.clientsWon ?? 0,
  };
}

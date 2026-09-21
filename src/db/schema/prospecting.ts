import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { profiles } from './users';
import {
  prospectLocationScope,
  prospectSearchStatus,
  prospectLeadStatus,
  prospectLeadConfidence,
  prospectWebsiteClassification,
  prospectSavedStatus,
} from './enums';

/**
 * Uma execucao de busca de prospeccao.
 *
 * Guarda os filtros usados e os contadores finais — e o que alimenta o
 * dashboard ("empresas analisadas", "descartadas por cardapio" etc.) sem
 * precisar reprocessar os leads toda vez.
 */
export const prospectSearches = pgTable(
  'prospect_searches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** Rotulo exibido do nicho (predefinido ou digitado pelo usuario). */
    niche: text('niche').notNull(),
    /** Termo efetivamente enviado a API de busca — pode ser igual ao `niche`. */
    nicheKeyword: text('niche_keyword').notNull(),

    locationLabel: text('location_label').notNull(),
    locationScope: prospectLocationScope('location_scope').notNull(),

    minReviews: integer('min_reviews').notNull().default(0),
    /** NULL = "qualquer nota". */
    minRating: numeric('min_rating', { precision: 2, scale: 1 }),
    requestedQuantity: integer('requested_quantity').notNull(),

    status: prospectSearchStatus('status').notNull().default('running'),
    errorMessage: text('error_message'),

    companiesAnalyzed: integer('companies_analyzed').notNull().default(0),
    leadsFound: integer('leads_found').notNull().default(0),
    discardedSite: integer('discarded_site').notNull().default(0),
    discardedMenu: integer('discarded_menu').notNull().default(0),
    discardedCatalog: integer('discarded_catalog').notNull().default(0),
    discardedScheduling: integer('discarded_scheduling').notNull().default(0),
    discardedOther: integer('discarded_other').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('prospect_searches_user_created_idx').on(t.userId, t.createdAt),
    check('prospect_searches_quantity_positive', sql`${t.requestedQuantity} > 0`),
    check('prospect_searches_min_reviews_non_negative', sql`${t.minReviews} >= 0`),
  ],
);

/**
 * Empresa analisada dentro de uma busca, com o resultado da classificacao de
 * presenca digital.
 *
 * Escopada por `searchId` (e `userId`, denormalizado para autorizacao direta
 * na DAL sem precisar de join — mesmo padrao de `favorites`). O mesmo
 * `google_place_id` pode aparecer em buscas diferentes: cada busca e uma
 * fotografia da analise feita naquele momento, e nao e reaproveitada entre
 * usuarios — evita que o dado salvo por uma pessoa vaze para outra.
 */
export const prospectLeads = pgTable(
  'prospect_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    searchId: uuid('search_id')
      .notNull()
      .references(() => prospectSearches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    googlePlaceId: text('google_place_id').notNull(),

    name: text('name').notNull(),
    category: text('category'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    rating: numeric('rating', { precision: 2, scale: 1 }),
    reviewCount: integer('review_count'),
    mapsUrl: text('maps_url'),

    /** Valor cru do campo "website" devolvido pela Places API, se existir. */
    websiteRaw: text('website_raw'),
    websiteClassification: prospectWebsiteClassification('website_classification')
      .notNull()
      .default('none'),
    /** Explicacao em portugues do motivo da classificacao — nunca inventada, gerada pela analise. */
    classificationDetail: text('classification_detail'),

    whatsappUrl: text('whatsapp_url'),
    instagramUrl: text('instagram_url'),
    facebookUrl: text('facebook_url'),

    leadStatus: prospectLeadStatus('lead_status').notNull(),
    discardReason: text('discard_reason'),
    confidence: prospectLeadConfidence('confidence'),

    isSaved: boolean('is_saved').notNull().default(false),
    savedStatus: prospectSavedStatus('saved_status'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('prospect_leads_search_place_key').on(t.searchId, t.googlePlaceId),
    index('prospect_leads_user_status_idx').on(t.userId, t.leadStatus),
    index('prospect_leads_user_saved_idx').on(t.userId, t.isSaved),
    index('prospect_leads_search_idx').on(t.searchId),
    check(
      'prospect_leads_rating_range',
      sql`${t.rating} IS NULL OR (${t.rating} >= 0 AND ${t.rating} <= 5)`,
    ),
    check(
      'prospect_leads_saved_status_requires_saved',
      sql`(${t.isSaved} = true AND ${t.savedStatus} IS NOT NULL) OR (${t.isSaved} = false AND ${t.savedStatus} IS NULL)`,
    ),
    check(
      'prospect_leads_confidence_requires_valid',
      sql`(${t.leadStatus} = 'valid' AND ${t.confidence} IS NOT NULL) OR (${t.leadStatus} <> 'valid' AND ${t.confidence} IS NULL)`,
    ),
  ],
);

export const prospectSearchesRelations = relations(prospectSearches, ({ many, one }) => ({
  leads: many(prospectLeads),
  user: one(profiles, { fields: [prospectSearches.userId], references: [profiles.id] }),
}));

export const prospectLeadsRelations = relations(prospectLeads, ({ one }) => ({
  search: one(prospectSearches, {
    fields: [prospectLeads.searchId],
    references: [prospectSearches.id],
  }),
  user: one(profiles, { fields: [prospectLeads.userId], references: [profiles.id] }),
}));

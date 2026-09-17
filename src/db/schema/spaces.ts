import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  check,
  numeric,
  date,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { spaceType, spaceStatus } from './enums';
import { profiles } from './users';
import { pointColumn } from './_types';

/**
 * Catalogo de caracteristicas (cobertura, camera, acesso 24h...).
 *
 * E uma tabela, e nao um enum, porque o admin precisa gerenciar categorias
 * sem migracao de banco. `appliesTo` controla quais caracteristicas aparecem
 * para cada tipo de espaco — array vazio significa "vale para todos".
 */
export const features = pgTable(
  'features',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    /** Agrupamento na UI: 'seguranca' | 'acesso' | 'estrutura' | 'veiculo'. */
    category: text('category').notNull(),
    /** Nome do icone lucide-react, para a UI nao ter um switch gigante. */
    icon: text('icon'),
    appliesTo: spaceType('applies_to').array().notNull().default(sql`'{}'::space_type[]`),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('features_category_idx').on(t.category)],
);

/**
 * O anuncio.
 *
 * Privacidade da localizacao (requisito explicito do produto):
 * - `location`     : ponto EXATO. Nunca sai em resposta publica.
 * - `approxLocation`: ponto deslocado ~200-400m, deterministico por espaco.
 *                     E o unico que vai para o mapa publico.
 * - `street`/`number`/`complement` so sao revelados apos reserva ativa.
 *
 * Dinheiro: `priceMonthlyCents` e INTEGER em centavos. Ponto flutuante para
 * dinheiro gera erro de arredondamento — nao usamos em lugar nenhum.
 */
export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    /** Slug curto e estavel para a URL publica do anuncio. */
    slug: text('slug').notNull(),

    type: spaceType('type').notNull(),
    status: spaceStatus('status').notNull().default('draft'),

    title: text('title').notNull(),
    description: text('description'),

    // ---- Endereco (privado ate a etapa apropriada da reserva) ----
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    district: text('district'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('BR'),

    // ---- Geolocalizacao ----
    location: pointColumn('location'),
    approxLocation: pointColumn('approx_location'),

    // ---- Caracteristicas fisicas ----
    sizeM2: numeric('size_m2', { precision: 10, scale: 2 }),
    ceilingHeightM: numeric('ceiling_height_m', { precision: 5, scale: 2 }),

    // ---- Preco ----
    priceMonthlyCents: integer('price_monthly_cents').notNull(),
    currency: text('currency').notNull().default('BRL'),

    // ---- Regras ----
    rulesText: text('rules_text'),
    allowedItems: text('allowed_items'),
    forbiddenItems: text('forbidden_items'),
    accessHours: text('access_hours'),

    /** Etapa concluida do formulario de publicacao (1..8), para retomar de onde parou. */
    draftStep: integer('draft_step').notNull().default(1),

    /**
     * A partir de quando o espaco pode ser alugado.
     * NULL enquanto o rascunho nao chegou na etapa de disponibilidade.
     * Anuncio publicado precisa ter data — garantido por CHECK.
     */
    availableFrom: date('available_from'),

    /** Denormalizados a partir de `reviews`, mantidos por trigger. */
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }),
    ratingCount: integer('rating_count').notNull().default(0),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Preenchido pelo admin ao remover o anuncio. */
    removedReason: text('removed_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('spaces_slug_key').on(t.slug),
    index('spaces_owner_idx').on(t.ownerId),
    index('spaces_status_idx').on(t.status),
    index('spaces_type_idx').on(t.type),
    index('spaces_price_idx').on(t.priceMonthlyCents),
    index('spaces_city_state_idx').on(t.city, t.state),
    /** Preco nunca negativo e teto de sanidade (R$ 1.000.000,00/mes). */
    check('spaces_price_positive', sql`${t.priceMonthlyCents} > 0`),
    check('spaces_price_sane', sql`${t.priceMonthlyCents} <= 100000000`),
    check('spaces_size_positive', sql`${t.sizeM2} IS NULL OR ${t.sizeM2} > 0`),
    /** Um anuncio publicado precisa de coordenada, senao nao aparece em busca por distancia. */
    check(
      'spaces_published_requires_location',
      sql`${t.status} <> 'published' OR (${t.location} IS NOT NULL AND ${t.approxLocation} IS NOT NULL)`,
    ),
    /**
     * Anuncio publicado precisa estar completo.
     *
     * Esta e a regra que impede rascunho pela metade de virar publico. Vive no
     * banco de proposito: um bug na aplicacao, ou um UPDATE manual no painel,
     * nao consegue publicar um anuncio sem cidade, sem descricao ou sem data.
     */
    check(
      'spaces_published_requires_complete',
      sql`${t.status} NOT IN ('published','rented') OR (
            ${t.city} IS NOT NULL AND length(trim(${t.city})) > 0
            AND ${t.state} IS NOT NULL AND length(trim(${t.state})) = 2
            AND ${t.district} IS NOT NULL AND length(trim(${t.district})) > 0
            AND length(trim(${t.title})) >= 10
            AND ${t.description} IS NOT NULL AND length(trim(${t.description})) >= 20
            AND ${t.availableFrom} IS NOT NULL
          )`,
    ),
  ],
);

/** Fotos do anuncio. Guardamos o caminho no bucket, nunca uma URL publica fixa. */
export const spaceImages = pgTable(
  'space_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    contentType: text('content_type'),
    /** Texto alternativo — acessibilidade. */
    alt: text('alt'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('space_images_space_idx').on(t.spaceId, t.position),
    uniqueIndex('space_images_path_key').on(t.storagePath),
  ],
);

/** Ligacao N:N entre anuncio e caracteristicas. */
export const spaceFeatures = pgTable(
  'space_features',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    featureKey: text('feature_key')
      .notNull()
      .references(() => features.key, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.featureKey] }),
    index('space_features_feature_idx').on(t.featureKey),
  ],
);

/** Anuncios salvos pelo usuario. */
export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.spaceId] }),
    index('favorites_space_idx').on(t.spaceId),
    index('favorites_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  owner: one(profiles, { fields: [spaces.ownerId], references: [profiles.id] }),
  images: many(spaceImages),
  features: many(spaceFeatures),
}));

export const spaceImagesRelations = relations(spaceImages, ({ one }) => ({
  space: one(spaces, { fields: [spaceImages.spaceId], references: [spaces.id] }),
}));

export const spaceFeaturesRelations = relations(spaceFeatures, ({ one }) => ({
  space: one(spaces, { fields: [spaceFeatures.spaceId], references: [spaces.id] }),
  feature: one(features, { fields: [spaceFeatures.featureKey], references: [features.key] }),
}));

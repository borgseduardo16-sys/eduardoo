import 'server-only';
import { cache } from 'react';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceImages, spaceFeatures, features, profiles } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';

/**
 * Leitura de anuncios.
 *
 * Duas familias de consulta, e a diferenca entre elas e o requisito de
 * privacidade mais importante do produto:
 *
 *   - `...Owner`  devolve o endereco completo e a coordenada exata.
 *                 So para o dono e para o admin.
 *   - `...Public` NUNCA seleciona street/number/complement nem `location`.
 *                 O que sai e bairro, cidade e o ponto aproximado.
 *
 * As colunas sensiveis ficam de fora do SELECT, e nao apagadas depois: o que
 * nao foi consultado nao tem como vazar por engano em um log, num erro
 * serializado ou num componente que renderiza o objeto inteiro.
 */

export class SpaceNotFoundError extends Error {
  constructor() {
    super('Anúncio não encontrado.');
    this.name = 'SpaceNotFoundError';
  }
}

export class NotSpaceOwnerError extends Error {
  constructor() {
    super('Este anúncio não é seu.');
    this.name = 'NotSpaceOwnerError';
  }
}

/** Colunas publicas. A ausencia de `location` e `street` aqui e proposital. */
const publicColumns = {
  id: spaces.id,
  slug: spaces.slug,
  type: spaces.type,
  status: spaces.status,
  title: spaces.title,
  description: spaces.description,
  district: spaces.district,
  city: spaces.city,
  state: spaces.state,
  sizeM2: spaces.sizeM2,
  ceilingHeightM: spaces.ceilingHeightM,
  priceMonthlyCents: spaces.priceMonthlyCents,
  rulesText: spaces.rulesText,
  allowedItems: spaces.allowedItems,
  forbiddenItems: spaces.forbiddenItems,
  accessHours: spaces.accessHours,
  availableFrom: spaces.availableFrom,
  ratingAvg: spaces.ratingAvg,
  ratingCount: spaces.ratingCount,
  publishedAt: spaces.publishedAt,
  ownerId: spaces.ownerId,
  /** Ponto DESLOCADO. O exato nunca sai por aqui. */
  approxLat: latOf(spaces.approxLocation).as('approx_lat'),
  approxLng: lngOf(spaces.approxLocation).as('approx_lng'),
};

export type PublicSpace = {
  id: string;
  slug: string;
  type: string;
  title: string;
  district: string | null;
  city: string | null;
  state: string | null;
  priceMonthlyCents: number;
  approxLat: number | null;
  approxLng: number | null;
  coverPath: string | null;
  photoCount: number;
};

/**
 * Listagem publica do marketplace.
 * So `published`, so nao apagado. Rascunho e pausado nunca aparecem.
 */
export async function listPublishedSpaces(options?: {
  limit?: number;
  offset?: number;
  city?: string;
  type?: string;
}): Promise<PublicSpace[]> {
  const limit = Math.min(options?.limit ?? 24, 60);
  const offset = Math.max(options?.offset ?? 0, 0);

  const conditions = [
    eq(spaces.status, 'published'),
    isNull(spaces.deletedAt),
  ];
  if (options?.city) {
    // ILIKE sem curinga = comparacao exata ignorando maiusculas.
    conditions.push(sql`${spaces.city} ILIKE ${options.city}`);
  }
  if (options?.type) {
    conditions.push(sql`${spaces.type}::text = ${options.type}`);
  }

  const rows = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      type: sql<string>`${spaces.type}::text`,
      title: spaces.title,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      priceMonthlyCents: spaces.priceMonthlyCents,
      approxLat: latOf(spaces.approxLocation),
      approxLng: lngOf(spaces.approxLocation),
      coverPath: sql<string | null>`(
        SELECT si.storage_path FROM space_images si
        WHERE si.space_id = ${spaces.id}
        ORDER BY si.position ASC LIMIT 1
      )`,
      photoCount: sql<number>`(
        SELECT count(*)::int FROM space_images si WHERE si.space_id = ${spaces.id}
      )`,
    })
    .from(spaces)
    .where(and(...conditions))
    .orderBy(desc(spaces.publishedAt))
    .limit(limit)
    .offset(offset);

  return rows as PublicSpace[];
}

/** Pagina publica de um anuncio. Devolve null se nao estiver publicado. */
export const getPublicSpaceBySlug = cache(async (slug: string) => {
  const [space] = await db
    .select(publicColumns)
    .from(spaces)
    .where(and(eq(spaces.slug, slug), eq(spaces.status, 'published'), isNull(spaces.deletedAt)))
    .limit(1);

  if (!space) return null;

  const [images, feats, [owner]] = await Promise.all([
    db
      .select({
        id: spaceImages.id,
        storagePath: spaceImages.storagePath,
        alt: spaceImages.alt,
        position: spaceImages.position,
        width: spaceImages.width,
        height: spaceImages.height,
      })
      .from(spaceImages)
      .where(eq(spaceImages.spaceId, space.id))
      .orderBy(spaceImages.position),
    db
      .select({ key: features.key, label: features.label, icon: features.icon, category: features.category })
      .from(spaceFeatures)
      .innerJoin(features, eq(features.key, spaceFeatures.featureKey))
      .where(eq(spaceFeatures.spaceId, space.id))
      .orderBy(features.sortOrder),
    db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        avatarPath: profiles.avatarPath,
        createdAt: profiles.createdAt,
        phoneVerifiedAt: profiles.phoneVerifiedAt,
        documentVerifiedAt: profiles.documentVerifiedAt,
        completedBookingsCount: profiles.completedBookingsCount,
        upheldReportCount: profiles.upheldReportCount,
      })
      .from(profiles)
      .where(eq(profiles.id, space.ownerId))
      .limit(1),
  ]);

  return { ...space, images, features: feats, owner: owner ?? null };
});

/**
 * Carrega um anuncio para EDICAO, garantindo que quem pede e o dono.
 *
 * E o unico caminho de leitura que devolve endereco exato, e por isso e o
 * unico lugar onde a checagem de dono precisa existir. Concentrar aqui evita
 * o modo de falha classico: uma action nova esquecer de verificar.
 */
export async function getOwnedSpace(spaceId: string, userId: string) {
  const [space] = await db
    .select({
      id: spaces.id,
      ownerId: spaces.ownerId,
      slug: spaces.slug,
      type: sql<string>`${spaces.type}::text`,
      status: sql<string>`${spaces.status}::text`,
      title: spaces.title,
      description: spaces.description,
      street: spaces.street,
      number: spaces.number,
      complement: spaces.complement,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      postalCode: spaces.postalCode,
      lat: latOf(spaces.location),
      lng: lngOf(spaces.location),
      sizeM2: spaces.sizeM2,
      ceilingHeightM: spaces.ceilingHeightM,
      priceMonthlyCents: spaces.priceMonthlyCents,
      availableFrom: spaces.availableFrom,
      rulesText: spaces.rulesText,
      allowedItems: spaces.allowedItems,
      forbiddenItems: spaces.forbiddenItems,
      accessHours: spaces.accessHours,
      draftStep: spaces.draftStep,
      publishedAt: spaces.publishedAt,
      deletedAt: spaces.deletedAt,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  if (!space || space.deletedAt) throw new SpaceNotFoundError();
  if (space.ownerId !== userId) throw new NotSpaceOwnerError();

  const [images, feats] = await Promise.all([
    db
      .select({
        id: spaceImages.id,
        storagePath: spaceImages.storagePath,
        alt: spaceImages.alt,
        position: spaceImages.position,
        width: spaceImages.width,
        height: spaceImages.height,
        sizeBytes: spaceImages.sizeBytes,
      })
      .from(spaceImages)
      .where(eq(spaceImages.spaceId, spaceId))
      .orderBy(spaceImages.position),
    db
      .select({ key: spaceFeatures.featureKey })
      .from(spaceFeatures)
      .where(eq(spaceFeatures.spaceId, spaceId)),
  ]);

  return { ...space, images, featureKeys: feats.map((f) => f.key) };
}

/** Painel "Meus espacos". */
export async function listOwnerSpaces(userId: string, status?: string[]) {
  const conditions = [eq(spaces.ownerId, userId), isNull(spaces.deletedAt)];
  if (status?.length) {
    conditions.push(inArray(sql`${spaces.status}::text`, status));
  }

  return db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      type: sql<string>`${spaces.type}::text`,
      status: sql<string>`${spaces.status}::text`,
      title: spaces.title,
      city: spaces.city,
      district: spaces.district,
      priceMonthlyCents: spaces.priceMonthlyCents,
      draftStep: spaces.draftStep,
      publishedAt: spaces.publishedAt,
      updatedAt: spaces.updatedAt,
      coverPath: sql<string | null>`(
        SELECT si.storage_path FROM space_images si
        WHERE si.space_id = ${spaces.id} ORDER BY si.position ASC LIMIT 1
      )`,
      photoCount: sql<number>`(
        SELECT count(*)::int FROM space_images si WHERE si.space_id = ${spaces.id}
      )`,
    })
    .from(spaces)
    .where(and(...conditions))
    .orderBy(desc(spaces.updatedAt));
}

/** Contagem por status, para as abas do painel. */
export async function countOwnerSpacesByStatus(userId: string) {
  const rows = await db
    .select({
      status: sql<string>`${spaces.status}::text`,
      total: sql<number>`count(*)::int`,
    })
    .from(spaces)
    .where(and(eq(spaces.ownerId, userId), isNull(spaces.deletedAt)))
    .groupBy(spaces.status);

  return Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<string, number>;
}

/** Catalogo de caracteristicas aplicaveis a um tipo de espaco. */
export const listFeaturesForType = cache(async (type: string) => {
  return db
    .select({
      key: features.key,
      label: features.label,
      icon: features.icon,
      category: features.category,
    })
    .from(features)
    .where(
      and(
        eq(features.active, true),
        sql`(cardinality(${features.appliesTo}) = 0 OR ${type}::space_type = ANY(${features.appliesTo}))`,
      ),
    )
    .orderBy(features.sortOrder);
});

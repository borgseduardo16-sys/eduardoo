import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceImages, spaceFeatures, features, profiles } from '@/db/schema';
import { latOf, lngOf, withinMeters, distanceMeters, type LatLng } from '@/db/schema/_types';
import { gatedPromotionTierExpr } from '@/lib/promotions/queries';
import { compatibilityScoreExpr } from '@/lib/promotions/compatibility';

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
  tempFromCents: spaces.tempFromCents,
  tempFromUnits: spaces.tempFromUnits,
  tempFromUnit: spaces.tempFromUnit,
  rulesText: spaces.rulesText,
  allowedItems: spaces.allowedItems,
  forbiddenItems: spaces.forbiddenItems,
  accessHours: spaces.accessHours,
  depositEnabled: spaces.depositEnabled,
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
  /** Parte 12: NULL quando o anúncio só aluga por hora/dia/semana. */
  priceMonthlyCents: number | null;
  tempFromCents: number | null;
  tempFromUnits: number | null;
  tempFromUnit: 'hour' | 'day' | 'week' | null;
  approxLat: number | null;
  approxLng: number | null;
  coverPath: string | null;
  photoCount: number;
  /** Metros ate o ponto de referencia da busca. Null quando nao ha ponto. */
  distanceMeters: number | null;
  /** Ate 3 nomes de caracteristica, para a linha resumo do card. */
  featureLabels: string[];
  /** Null quando o anuncio nao tem promocao ativa no momento. */
  promotionType: 'destaque' | 'turbo' | null;
  /**
   * `numeric` sempre chega como string do driver (evita perda de precisao
   * de float) — mesma convencao de `sizeM2`/`ceilingHeightM`. Null = nenhuma
   * avaliacao ainda (nunca 0, que seria "avaliado com nota zero").
   */
  ratingAvg: string | null;
  ratingCount: number;
  /** TODAS as características marcadas (a compatibilidade precisa de todas, não só das 3 do card). */
  featureKeys: string[];
  sizeM2: string | null;
  availableFrom: string | null;
  /** Último dia de bloqueio ativo do calendário daqui para frente; null = nenhum. */
  blockedUntil: string | null;
};

export type SearchSort = 'distance' | 'price_asc' | 'price_desc' | 'recent' | 'compatibility';

export type SearchSpacesOptions = {
  limit?: number;
  offset?: number;
  /** Igualdade exata (usado pelo /buscar antigo e pelos testes). */
  city?: string;
  /** Tipo do espaco (space_type). Valor desconhecido = nenhum resultado, de proposito. */
  type?: string;
  /**
   * Varios tipos aceitos (busca por necessidade, Fase 23: "moto" cabe em
   * vaga de moto, garagem ou vaga de carro). Ignorado quando `type` existe.
   */
  types?: readonly string[];
  /** So anuncios desta pessoa (perfil publico, Fase 21). */
  ownerId?: string;

  /** Ponto de referencia (GPS, CEP ou endereco geocodificado) — ver resolve-location.ts. */
  point?: LatLng | null;
  /** Raio maximo em metros. So tem efeito quando `point` existe. */
  radiusMeters?: number | null;

  /** Filtro solto por cidade/bairro, vindo de um match sem coordenada. */
  cityFilter?: string | null;
  districtFilter?: string | null;

  /** Texto livre: casa com titulo, cidade e bairro (trigram, ja indexado). */
  textQuery?: string | null;

  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  /** Chaves de `features`. Semantica E: o espaco precisa ter todas. */
  featureKeys?: readonly string[];
  /**
   * So espacos em que um aluguel pode comecar hoje: `available_from <= hoje`
   * e nenhum bloqueio do calendario pela frente (Fase 23 — o aluguel e
   * mensal e sem data para terminar, entao atravessaria o bloqueio).
   */
  availableNow?: boolean;
  /** Mesma regra de `availableNow`, para uma data de inicio ('AAAA-MM-DD'). */
  startBy?: string | null;
  /** Area minima em m². Anuncio sem area informada nao entra. */
  sizeMinM2?: number | null;

  sort?: SearchSort;
  /**
   * Usado por `sort: 'compatibility'` (seção "Recomendados para você"):
   * `type`/`featureKeys` viram só pontuação, não filtro obrigatório — sem
   * isso, o conjunto candidato já teria batido 100% nessas duas dimensões
   * (a busca principal exige IGUALDADE), e não haveria o que a pontuação
   * de compatibilidade diferenciar.
   */
  relaxTypeAndFeatures?: boolean;
};

/**
 * Um aluguel que comeca em `dia` e possivel? Disponivel a partir de antes
 * disso, e sem bloqueio ativo do calendario terminando em `dia` ou depois
 * (Fase 23). Mesma regra de `earliestOpenEndedStart` em
 * src/lib/spaces/availability.ts, que valida a solicitacao — a busca nunca
 * mostra como disponivel algo que a solicitacao recusaria.
 */
export function openEndedStartPossibleBy(dia: SQL): SQL {
  return sql`(
    ${spaces.availableFrom} <= ${dia}
    AND NOT EXISTS (
      SELECT 1 FROM space_availability_blocks b
      WHERE b.space_id = spaces.id AND b.cancelled_at IS NULL AND b.ends_on >= ${dia}
    )
  )`;
}

/**
 * `distance` so faz sentido com um ponto de referencia real. Pedir para
 * ordenar por distancia sem ponto (ex.: buscou so por texto, sem CEP nem
 * GPS) cai em "mais recentes" em vez de falhar ou fingir uma ordem. A
 * interface usa esta mesma funcao para saber qual ordenacao MOSTRAR como
 * selecionada, entao nunca diz "ordenado por distância" quando nao esta.
 */
export function effectiveSort(sort: SearchSort | undefined, hasPoint: boolean): SearchSort {
  if (sort === 'distance' && !hasPoint) return 'recent';
  return sort ?? (hasPoint ? 'distance' : 'recent');
}

/**
 * Busca publica do marketplace. So `published`, so nao apagado — rascunho e
 * pausado nunca aparecem, e essa condicao nao depende de nenhum filtro
 * passado por quem chama.
 *
 * A distancia e sempre calculada a partir de `approx_location`, nunca do
 * ponto exato: e o mesmo ponto que ja aparece no mapa publico, entao mostrar
 * "a 1,2 km" nao revela nada que o marcador no mapa nao revele ja. Calcular
 * a partir do ponto exato permitiria, com consultas repetidas de pontos
 * diferentes, triangular o endereco real por trilateracao.
 */
export async function listPublishedSpaces(options?: SearchSpacesOptions): Promise<PublicSpace[]> {
  const limit = Math.min(options?.limit ?? 24, 60);
  const offset = Math.max(options?.offset ?? 0, 0);
  const point = options?.point ?? null;
  const sort = effectiveSort(options?.sort, point != null);

  const conditions = [
    eq(spaces.status, 'published'),
    isNull(spaces.deletedAt),
  ];
  if (options?.ownerId) {
    conditions.push(eq(spaces.ownerId, options.ownerId));
  }
  if (options?.city) {
    // ILIKE sem curinga = comparacao exata ignorando maiusculas.
    conditions.push(sql`${spaces.city} ILIKE ${options.city}`);
  }
  if (options?.cityFilter) {
    conditions.push(sql`${spaces.city} ILIKE ${options.cityFilter}`);
  }
  if (options?.districtFilter) {
    conditions.push(sql`${spaces.district} ILIKE ${options.districtFilter}`);
  }
  if (options?.type && !options?.relaxTypeAndFeatures) {
    conditions.push(sql`${spaces.type}::text = ${options.type}`);
  } else if (options?.types?.length && !options?.relaxTypeAndFeatures) {
    conditions.push(sql`${spaces.type}::text IN (${sql.join(options.types.map((t) => sql`${t}`), sql`, `)})`);
  }
  if (options?.sizeMinM2 != null) {
    conditions.push(sql`${spaces.sizeM2} >= ${options.sizeMinM2}`);
  }
  if (options?.startBy) {
    conditions.push(openEndedStartPossibleBy(sql`${options.startBy}::date`));
  }
  if (options?.priceMinCents != null) {
    conditions.push(gte(spaces.priceMonthlyCents, options.priceMinCents));
  }
  if (options?.priceMaxCents != null) {
    conditions.push(lte(spaces.priceMonthlyCents, options.priceMaxCents));
  }
  if (options?.availableNow) {
    conditions.push(openEndedStartPossibleBy(sql`CURRENT_DATE`));
  }
  if (point && options?.radiusMeters) {
    conditions.push(withinMeters(spaces.approxLocation, point, options.radiusMeters));
  }
  if (options?.textQuery) {
    const termo = options.textQuery.trim();
    if (termo) {
      // similarity() usa os indices GIN trigram de title/city/district — nao
      // e sequential scan. ILIKE '%...%' entra tambem, para substring exata
      // curta (ex.: "moto") que o trigram sozinho pontuaria baixo.
      conditions.push(sql`(
        similarity(${spaces.title}, ${termo}) > 0.15
        OR similarity(${spaces.city}, ${termo}) > 0.2
        OR similarity(${spaces.district}, ${termo}) > 0.2
        OR ${spaces.title} ILIKE ${'%' + termo + '%'}
      )`);
    }
  }
  if (options?.featureKeys?.length && !options?.relaxTypeAndFeatures) {
    /*
     * Precisa ter TODAS as chaves pedidas: conta quantas das pedidas o
     * espaco tem, e exige que bata com a quantidade pedida.
     *
     * O array vai como `ARRAY[$1, $2, ...]` montado por `sql.join`, e nao
     * como `${options.featureKeys}` direto: o driver postgres-js nao
     * serializa array JS sozinho dentro de um parametro posicional — vira
     * "malformed array literal", porque ele tenta ligar o array inteiro como
     * se fosse um unico texto. `sql.join` liga cada chave no seu proprio `$N`.
     */
    const chaves = sql.join(
      options.featureKeys.map((k) => sql`${k}`),
      sql`, `,
    );
    conditions.push(sql`(
      SELECT count(*) FROM space_features sf
      WHERE sf.space_id = spaces.id AND sf.feature_key = ANY(ARRAY[${chaves}])
    ) = ${options.featureKeys.length}`);
  }

  const distanceExpr = point ? distanceMeters(spaces.approxLocation, point) : sql<number | null>`NULL`;

  /*
   * Promocao entra na ordenacao de dois jeitos, nunca do mesmo:
   *
   * - 'recent' (padrao, sem ponto/preco escolhido pela pessoa): promocao
   *   MANDA, desempatado por mais recente — e o unico caso em que o
   *   Destaque/Turbo entrega o que promete (mais exposicao na navegacao
   *   comum). Sem isso a promocao nunca teria efeito pratico nenhum: dois
   *   anuncios raramente tem o mesmo published_at ate o milissegundo.
   * - 'distance'/'price_asc'/'price_desc' (a pessoa pediu essa ordem
   *   explicitamente): promocao so DESEMPATA, depois da ordenacao pedida —
   *   nunca troca um resultado relevante por um distante/mais caro so por
   *   ter Turbo. E exatamente o caso que o pedido original citou: "vaga de
   *   garagem em Colatina" nao pode trazer um galpao longe so por Turbo.
   */
  const tierExpr = gatedPromotionTierExpr({
    type: options?.type,
    types: options?.types,
    cityFilter: options?.cityFilter || options?.city,
    districtFilter: options?.districtFilter,
    priceMinCents: options?.priceMinCents,
    priceMaxCents: options?.priceMaxCents,
    availableNow: options?.availableNow,
    featureKeys: options?.featureKeys,
  });
  /*
   * 'compatibility' (secao "Recomendados para voce"): ordena SO pela
   * pontuacao de compatibilidade, sem fator de promocao nenhum — e
   * exatamente o pedido explicito de que um anuncio pago com MENOS
   * caracteristicas compativeis nao pule na frente de um gratuito com MAIS.
   */
  const orderBy =
    sort === 'compatibility' ? [desc(compatibilityScoreExpr({
        type: options?.type,
        types: options?.types,
        cityFilter: options?.cityFilter || options?.city,
        districtFilter: options?.districtFilter,
        priceMinCents: options?.priceMinCents,
        priceMaxCents: options?.priceMaxCents,
        availableNow: options?.availableNow,
        featureKeys: options?.featureKeys,
      })), desc(spaces.publishedAt)]
    : sort === 'distance' ? [asc(distanceExpr), desc(tierExpr)]
    // Ordenar por preço é pelo MENSAL; anúncio só por hora vai para o fim
    // nos dois sentidos (não tem preço mensal para comparar).
    : sort === 'price_asc' ? [sql`${spaces.priceMonthlyCents} ASC NULLS LAST`, desc(tierExpr)]
    : sort === 'price_desc' ? [sql`${spaces.priceMonthlyCents} DESC NULLS LAST`, desc(tierExpr)]
    : [desc(tierExpr), desc(spaces.publishedAt)];

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
      tempFromCents: spaces.tempFromCents,
      tempFromUnits: spaces.tempFromUnits,
      tempFromUnit: spaces.tempFromUnit,
      approxLat: latOf(spaces.approxLocation),
      approxLng: lngOf(spaces.approxLocation),
      distanceMeters: distanceExpr,
      /*
       * COALESCE: fotos enviadas antes da miniatura existir caem na principal.
       *
       * A correlacao esta escrita como `spaces.id` LITERAL, e nao interpolada.
       * Interpolar a coluna aqui gera `"id"` sem o nome da tabela — e
       * `space_images` tambem tem uma coluna `id`, entao o Postgres resolve
       * para `si.id` e a condicao vira `si.space_id = si.id`: nunca verdadeira.
       * O resultado era capa NULL e contagem 0 em todo anuncio, sem erro
       * nenhum. Ver a checagem "capa e contagem de fotos" em verify-spaces.ts.
       */
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id
        ORDER BY si.position ASC LIMIT 1
      )`,
      photoCount: sql<number>`(
        SELECT count(*)::int FROM space_images si WHERE si.space_id = spaces.id
      )`,
      featureLabels: sql<string[]>`(
        SELECT COALESCE(array_agg(f.label ORDER BY f.sort_order), '{}')
        FROM (
          SELECT feature_key FROM space_features sf2
          WHERE sf2.space_id = spaces.id LIMIT 3
        ) sf
        JOIN features f ON f.key = sf.feature_key
      )`,
      promotionType: sql<'destaque' | 'turbo' | null>`(
        SELECT p.type::text FROM promotions p
        WHERE p.space_id = spaces.id AND p.status = 'active'
        LIMIT 1
      )`,
      featureKeys: sql<string[]>`(
        SELECT COALESCE(array_agg(sf3.feature_key ORDER BY sf3.feature_key), '{}')
        FROM space_features sf3 WHERE sf3.space_id = spaces.id
      )`,
      sizeM2: spaces.sizeM2,
      availableFrom: spaces.availableFrom,
      blockedUntil: sql<string | null>`(
        SELECT max(b.ends_on)::text FROM space_availability_blocks b
        WHERE b.space_id = spaces.id AND b.cancelled_at IS NULL AND b.ends_on >= CURRENT_DATE
      )`,
    })
    .from(spaces)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return rows as PublicSpace[];
}

/** Alias — a busca (Parte 3) e o marketplace simples sao a mesma consulta. */
export const searchPublishedSpaces = listPublishedSpaces;

/**
 * Status em que a pagina publica do anuncio abre (Fase 23). Alugado e
 * pausado continuam com pagina — link compartilhado nao quebra, e e ali que
 * a pessoa entra na lista de espera —, mas nunca aparecem na busca, que
 * segue so com `published`.
 */
export const PUBLIC_PAGE_STATUSES = ['published', 'rented', 'paused'] as const;

/** Pagina publica de um anuncio. Devolve null se nao estiver no ar (ou alugado/pausado). */
export const getPublicSpaceBySlug = cache(async (slug: string) => {
  const [space] = await db
    .select(publicColumns)
    .from(spaces)
    .where(
      and(
        eq(spaces.slug, slug),
        inArray(spaces.status, [...PUBLIC_PAGE_STATUSES]),
        isNull(spaces.deletedAt),
      ),
    )
    .limit(1);

  if (!space) return null;

  const [images, feats, [owner]] = await Promise.all([
    db
      .select({
        id: spaceImages.id,
        storagePath: spaceImages.storagePath,
        thumbPath: spaceImages.thumbPath,
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
    // Proprietario: so o que e publico (Fase 21) — nome publico, nunca o
    // completo; verificacoes lidas do dado real, nunca presumidas. Conta
    // suspensa/apagada nao aparece como "quem anuncia".
    db
      .select({
        id: profiles.id,
        publicName: profiles.publicName,
        avatarPath: profiles.avatarPath,
        bio: profiles.bio,
        createdAt: profiles.createdAt,
        emailVerified: sql<boolean>`${profiles.emailVerifiedAt} IS NOT NULL`,
        phoneVerified: sql<boolean>`${profiles.phoneVerifiedAt} IS NOT NULL`,
        identityVerified: sql<boolean>`${profiles.identityVerificationStatus} = 'verified'`,
        completedBookingsCount: profiles.completedBookingsCount,
        // `profiles.id` por extenso: ver o comentario em profiles/queries.ts.
        activeSpacesCount: sql<number>`(
          SELECT count(*)::int FROM spaces s2
          WHERE s2.owner_id = profiles.id AND s2.status = 'published' AND s2.deleted_at IS NULL
        )`,
        isPremium: sql<boolean>`EXISTS (
          SELECT 1 FROM premium_memberships pm WHERE pm.user_id = profiles.id AND pm.status = 'active'
        )`,
        // Dado interno de moderação: só reforça a recomendação de visita,
        // nunca vira texto na tela (ver `underReview` em safety/trust.ts).
        // Mesmo limite que a moderação usa, lido de platform_settings.
        underReview: sql<boolean>`(profiles.upheld_report_count >= COALESCE((
          SELECT (ps.value #>> '{}')::int FROM platform_settings ps
          WHERE ps.key = 'safety.auto_review_upheld_threshold'
        ), 3))`,
      })
      .from(profiles)
      .where(and(eq(profiles.id, space.ownerId), eq(profiles.status, 'active'), isNull(profiles.deletedAt)))
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
      tempFromCents: spaces.tempFromCents,
      tempFromUnits: spaces.tempFromUnits,
      tempFromUnit: spaces.tempFromUnit,
      availableFrom: spaces.availableFrom,
      rulesText: spaces.rulesText,
      allowedItems: spaces.allowedItems,
      forbiddenItems: spaces.forbiddenItems,
      accessHours: spaces.accessHours,
      depositEnabled: spaces.depositEnabled,
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
        thumbPath: spaceImages.thumbPath,
        alt: spaceImages.alt,
        position: spaceImages.position,
        width: spaceImages.width,
        height: spaceImages.height,
        sizeBytes: spaceImages.sizeBytes,
        contentType: spaceImages.contentType,
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
      tempFromCents: spaces.tempFromCents,
      tempFromUnits: spaces.tempFromUnits,
      tempFromUnit: spaces.tempFromUnit,
      draftStep: spaces.draftStep,
      publishedAt: spaces.publishedAt,
      updatedAt: spaces.updatedAt,
      // `spaces.id` literal de proposito — ver a nota em listPublishedSpaces.
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
      )`,
      photoCount: sql<number>`(
        SELECT count(*)::int FROM space_images si WHERE si.space_id = spaces.id
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

export type KnownLocationMatch =
  | { kind: 'city'; city: string; state: string | null }
  | { kind: 'district'; district: string; city: string | null; state: string | null };

/**
 * Tenta casar um texto livre com uma cidade ou bairro que JA EXISTE entre os
 * anuncios publicados.
 *
 * Existe para a busca por local funcionar sem geocodificacao no caso mais
 * comum: alguem digita "Colatina" e o marketplace so tem anuncios em
 * Colatina/ES — nao ha por que gastar uma chamada de rede para descobrir algo
 * que o proprio banco ja sabe. So quando isto nao acha nada a busca recorre
 * ao geocodificador (ver src/lib/spaces/resolve-location.ts).
 *
 * Ordem: cidade exata, cidade por prefixo, bairro exato, bairro por prefixo,
 * e por ultimo similaridade (pg_trgm) para tolerar erro de digitacao —
 * "Colattina" ainda acha "Colatina". Previsivel de proposito: cada etapa so
 * roda se a anterior nao achou nada.
 */
export async function matchKnownLocation(text: string): Promise<KnownLocationMatch | null> {
  const termo = text.trim();
  if (termo.length < 2) return null;

  const base = and(eq(spaces.status, 'published'), isNull(spaces.deletedAt));

  /*
   * "Centro, Colatina" (bairro, cidade) e "Colatina, ES" (cidade, UF) —
   * Fase 23. Antes, o texto com vírgula nunca batia com nada do banco e ia
   * direto para o geocodificador, mesmo quando o bairro já tinha anúncio.
   */
  const partes = termo.split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 2) {
    const [a, b] = partes as [string, string];
    if (/^[A-Za-z]{2}$/.test(b)) {
      const [cidadeUf] = await db
        .select({ city: spaces.city, state: spaces.state })
        .from(spaces)
        .where(and(base, sql`${spaces.city} ILIKE ${a}`, sql`${spaces.state} ILIKE ${b}`))
        .limit(1);
      if (cidadeUf?.city) return { kind: 'city', city: cidadeUf.city, state: cidadeUf.state };
    }
    const noBairro = await matchKnownDistrictInCity(a, b);
    if (noBairro) return noBairro;
  }

  const [porCidadeExata] = await db
    .select({ city: spaces.city, state: spaces.state })
    .from(spaces)
    .where(and(base, sql`${spaces.city} ILIKE ${termo}`))
    .limit(1);
  if (porCidadeExata?.city) return { kind: 'city', city: porCidadeExata.city, state: porCidadeExata.state };

  const [porCidadePrefixo] = await db
    .select({ city: spaces.city, state: spaces.state })
    .from(spaces)
    .where(and(base, sql`${spaces.city} ILIKE ${termo + '%'}`))
    .limit(1);
  if (porCidadePrefixo?.city) {
    return { kind: 'city', city: porCidadePrefixo.city, state: porCidadePrefixo.state };
  }

  const [porBairroExato] = await db
    .select({ district: spaces.district, city: spaces.city, state: spaces.state })
    .from(spaces)
    .where(and(base, sql`${spaces.district} ILIKE ${termo}`))
    .limit(1);
  if (porBairroExato?.district) {
    return {
      kind: 'district', district: porBairroExato.district,
      city: porBairroExato.city, state: porBairroExato.state,
    };
  }

  const [porBairroPrefixo] = await db
    .select({ district: spaces.district, city: spaces.city, state: spaces.state })
    .from(spaces)
    .where(and(base, sql`${spaces.district} ILIKE ${termo + '%'}`))
    .limit(1);
  if (porBairroPrefixo?.district) {
    return {
      kind: 'district', district: porBairroPrefixo.district,
      city: porBairroPrefixo.city, state: porBairroPrefixo.state,
    };
  }

  const [porSimilaridade] = await db
    .select({ city: spaces.city, state: spaces.state, sim: sql<number>`similarity(${spaces.city}, ${termo})` })
    .from(spaces)
    .where(and(base, sql`similarity(${spaces.city}, ${termo}) > 0.4`))
    .orderBy(sql`similarity(${spaces.city}, ${termo}) DESC`)
    .limit(1);
  if (porSimilaridade?.city) {
    return { kind: 'city', city: porSimilaridade.city, state: porSimilaridade.state };
  }

  return null;
}

/**
 * Bairro dentro de uma cidade, os dois já existentes entre os anúncios
 * publicados (Fase 23). Nome exato primeiro, prefixo depois — "centro" em
 * "colatina" devolve o "Centro"/"Colatina" como estão gravados.
 */
export async function matchKnownDistrictInCity(
  district: string,
  city: string,
): Promise<Extract<KnownLocationMatch, { kind: 'district' }> | null> {
  const bairro = district.trim();
  const cidade = city.trim();
  if (bairro.length < 2 || cidade.length < 2) return null;
  const base = and(eq(spaces.status, 'published'), isNull(spaces.deletedAt));

  for (const padrao of [bairro, `${bairro}%`]) {
    const [achou] = await db
      .select({ district: spaces.district, city: spaces.city, state: spaces.state })
      .from(spaces)
      .where(and(base, sql`${spaces.district} ILIKE ${padrao}`, sql`${spaces.city} ILIKE ${cidade}`))
      .limit(1);
    if (achou?.district) {
      return { kind: 'district', district: achou.district, city: achou.city, state: achou.state };
    }
  }
  return null;
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

/**
 * Todas as caracteristicas ativas, sem filtrar por tipo.
 *
 * Usado no filtro da busca quando a pessoa ainda nao escolheu um tipo de
 * espaco: "Mostrar somente características compatíveis com os dados
 * cadastrados" (Parte 3, secao 9) vira "todas as que existem no catalogo",
 * porque sem tipo escolhido qualquer uma pode ser compativel.
 */
export const listAllActiveFeatures = cache(async () => {
  return db
    .select({
      key: features.key,
      label: features.label,
      icon: features.icon,
      category: features.category,
    })
    .from(features)
    .where(eq(features.active, true))
    .orderBy(features.sortOrder);
});

import 'server-only';
import { and, desc, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces } from '@/db/schema';
import { distanceMeters, latOf, lngOf, withinMeters } from '@/db/schema/_types';
import { todayInSaoPaulo } from '@/lib/dates';
import { startPossibleOn } from '@/lib/spaces/queries';
import { categoryOfType, typesOfCategories, type MapCategoryKey } from '@/lib/spaces/categories';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { premiumMapReach } from '@/lib/premium/settings';
import {
  MAX_INDIVIDUAL_PINS,
  MAX_OUTSIDE_PINS,
  MAX_PROMOTED_PINS,
  clusterCellDegrees,
  type ExploreQuery,
} from './explore-params';

/**
 * Mapa de exploração — o que desenhar para uma área e um conjunto de filtros.
 *
 * Três regras guiam a resposta:
 *
 *  1. PRIVACIDADE. Tudo sai de `approx_location`, o ponto público: deslocado
 *     para residências e exato só nos tipos comerciais (a escolha é do banco,
 *     por trigger — ver `sync_approx_location`). Esta consulta nem seleciona o
 *     ponto exato, e a rua e o número nunca passam por aqui.
 *
 *  2. SEM MILHARES DE MARCADORES. Até `MAX_INDIVIDUAL_PINS` espaços, cada um é
 *     um marcador. Passando disso o mapa agrupa por quadrados de tela (círculos
 *     com contagem) e só os Destaques continuam individuais — assim a resposta
 *     tem tamanho limitado, não importa quantos anúncios existam na área.
 *
 *  3. PERTO PRIMEIRO. Com um ponto de referência e um raio (padrão: 2 km),
 *     dentro do raio aparece tudo; fora dele só aparecem, nesta ordem, os Turbo,
 *     os Destaques, os anúncios de assinantes Premium (alcance ampliado, abaixo)
 *     e os espaços bem avaliados (poucos), e o resto fica de fora até a pessoa
 *     pedir "qualquer distância". O raio filtra, não ordena: nada de anúncio
 *     longe tomando o lugar de um próximo.
 *
 *  4. ALCANCE AMPLIADO DO PREMIUM. O anúncio de quem é Premium (ciclo pago
 *     vigente) pode aparecer até `premium.map_extra_radius_m` (10 km) ALÉM do
 *     raio, no máximo `premium.map_max_outside_pins` (5) individuais, sempre
 *     depois de Turbo e Destaque, e SEM rótulo: não é "Destaque", não finge ser
 *     Turbo — é um anúncio normal (`promotion: null`). Respeita tudo que vale
 *     para os demais: enquadramento, preço, categoria e disponibilidade.
 *     Ele nunca entra nos círculos de agrupamento: é um dos poucos individuais
 *     fora do raio, como o Destaque.
 */

export type ExplorePin = {
  id: string;
  slug: string;
  title: string;
  type: string;
  category: MapCategoryKey;
  priceMonthlyCents: number | null;
  quantityAvailable: number;
  quantityOffered: number;
  lat: number;
  lng: number;
  ratingAvg: string | null;
  ratingCount: number;
  promotion: 'destaque' | 'turbo' | null;
  /** Fora do raio escolhido: está no mapa por ser Destaque ou bem avaliado. */
  outside: boolean;
};

export type ExploreCluster = {
  lat: number;
  lng: number;
  count: number;
  /** [oeste, sul, leste, norte] — para dar zoom no grupo ao tocar. */
  bounds: [number, number, number, number];
};

export type ExploreResult = {
  pins: ExplorePin[];
  clusters: ExploreCluster[];
  /** Espaços que cumprem os filtros dentro do raio (ou na área toda, sem raio). */
  total: number;
  /** Quantos Turbo/Destaques/bem avaliados aparecem fora do raio. */
  outsideShown: number;
  /** Quantos anúncios aparecem fora do raio só pelo alcance ampliado (sem rótulo na tela). */
  reachShown: number;
  radiusMeters: number | null;
};

const promotedExpr = sql<boolean>`EXISTS (SELECT 1 FROM promotions p WHERE p.space_id = spaces.id AND p.status = 'active')`;
/** Turbo vale mais que Destaque; sem promoção, zero. */
const promotionRankExpr = sql<number>`COALESCE((
  SELECT CASE p.type WHEN 'turbo' THEN 2 WHEN 'destaque' THEN 1 ELSE 0 END
  FROM promotions p WHERE p.space_id = spaces.id AND p.status = 'active' LIMIT 1
), 0)`;
/** O dono do anúncio é Premium AGORA (ciclo pago vigente, relógio do banco). */
const ownerPremiumExpr = sql<boolean>`public.premium_is_active(spaces.owner_id)`;
/** "Relevante" fora do raio: boa nota com um mínimo de avaliações (uma nota 5 sozinha não conta). */
const relevantExpr = sql<boolean>`(${spaces.ratingCount} >= 3 AND ${spaces.ratingAvg} >= 4.5)`;

const pinColumns = {
  id: spaces.id,
  slug: spaces.slug,
  title: spaces.title,
  type: sql<string>`${spaces.type}::text`,
  priceMonthlyCents: spaces.priceMonthlyCents,
  quantityAvailable: spaces.quantityAvailable,
  quantityOffered: spaces.quantityOffered,
  lat: latOf(spaces.approxLocation),
  lng: lngOf(spaces.approxLocation),
  ratingAvg: sql<string | null>`${spaces.ratingAvg}::text`,
  ratingCount: spaces.ratingCount,
  promotion: sql<'destaque' | 'turbo' | null>`(
    SELECT p.type::text FROM promotions p WHERE p.space_id = spaces.id AND p.status = 'active' LIMIT 1
  )`,
};

type PinRow = {
  id: string;
  slug: string;
  title: string;
  type: string;
  priceMonthlyCents: number | null;
  quantityAvailable: number;
  quantityOffered: number;
  lat: number;
  lng: number;
  ratingAvg: string | null;
  ratingCount: number;
  promotion: 'destaque' | 'turbo' | null;
};

function toPin(r: PinRow, outside: boolean): ExplorePin {
  return { ...r, category: categoryOfType(r.type), outside };
}

export async function exploreSpaces(q: ExploreQuery): Promise<ExploreResult> {
  const { bbox } = q;
  const hoje = todayInSaoPaulo();

  const base: SQL[] = [
    eq(spaces.status, 'published'),
    isNull(spaces.deletedAt),
    sql`${spaces.approxLocation} IS NOT NULL`,
    // Casa com o índice GIST de (approx_location)::geography.
    sql`${spaces.approxLocation}::geography && ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326)::geography`,
  ];
  if (q.priceMaxCents != null) base.push(lte(spaces.priceMonthlyCents, q.priceMaxCents));
  if (q.categories.length > 0) base.push(inArray(sql`${spaces.type}::text`, typesOfCategories(q.categories)));
  if (q.availableNow) base.push(startPossibleOn(sql`${hoje}::date`));

  const comRaio = q.center != null && q.radiusMeters != null;
  const near: SQL = comRaio ? withinMeters(spaces.approxLocation, q.center!, q.radiusMeters!) : sql`TRUE`;

  // Referência para ordenar do mais perto ao mais longe: a pessoa, ou o centro da área.
  const referencia = q.center ?? { lat: (bbox.north + bbox.south) / 2, lng: (bbox.east + bbox.west) / 2 };
  const distancia = distanceMeters(spaces.approxLocation, referencia);

  const [contagem] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(spaces)
    .where(and(...base, near));
  const total = contagem?.total ?? 0;

  const pins: ExplorePin[] = [];
  const clusters: ExploreCluster[] = [];

  if (total <= MAX_INDIVIDUAL_PINS) {
    const linhas = await db
      .select(pinColumns)
      .from(spaces)
      .where(and(...base, near))
      .orderBy(desc(promotedExpr), distancia)
      .limit(MAX_INDIVIDUAL_PINS);
    pins.push(...linhas.map((l) => toPin(l, false)));
  } else {
    // Área cheia: Destaques continuam individuais; o resto vira círculos com contagem.
    const destaques = await db
      .select(pinColumns)
      .from(spaces)
      .where(and(...base, near, promotedExpr))
      .orderBy(distancia)
      .limit(MAX_PROMOTED_PINS);
    pins.push(...destaques.map((l) => toPin(l, false)));

    // Células de ~80 px de tela. Os tamanhos são números finitos já validados: entram como literal
    // (e não como parâmetro) para o GROUP BY e o SELECT enxergarem a MESMA expressão.
    const lado = clusterCellDegrees(q.zoom);
    const meioLat = (bbox.north + bbox.south) / 2;
    const ladoLat = lado * Math.max(0.2, Math.cos((meioLat * Math.PI) / 180));
    const gx = sql`floor(ST_X(${spaces.approxLocation}) / ${sql.raw(lado.toString())})`;
    const gy = sql`floor(ST_Y(${spaces.approxLocation}) / ${sql.raw(ladoLat.toString())})`;

    const celulas = await db
      .select({
        n: sql<number>`count(*)::int`,
        lat: sql<number>`avg(ST_Y(${spaces.approxLocation}))`,
        lng: sql<number>`avg(ST_X(${spaces.approxLocation}))`,
        w: sql<number>`min(ST_X(${spaces.approxLocation}))`,
        s: sql<number>`min(ST_Y(${spaces.approxLocation}))`,
        e: sql<number>`max(ST_X(${spaces.approxLocation}))`,
        nn: sql<number>`max(ST_Y(${spaces.approxLocation}))`,
        umId: sql<string>`(array_agg(${spaces.id}::text))[1]`,
      })
      .from(spaces)
      .where(and(...base, near, sql`NOT ${promotedExpr}`))
      .groupBy(gx, gy)
      .orderBy(sql`count(*) DESC`)
      .limit(150);

    const sozinhos = celulas.filter((c) => c.n === 1).map((c) => c.umId);
    for (const c of celulas) {
      if (c.n > 1) clusters.push({ lat: c.lat, lng: c.lng, count: c.n, bounds: [c.w, c.s, c.e, c.nn] });
    }
    if (sozinhos.length > 0) {
      const linhas = await db.select(pinColumns).from(spaces).where(inArray(spaces.id, sozinhos));
      pins.push(...linhas.map((l) => toPin(l, false)));
    }
  }

  // Fora do raio: Turbo e Destaques primeiro, depois os anúncios Premium (alcance ampliado) e
  // por último os bem avaliados — poucos de cada.
  let outsideShown = 0;
  let reachShown = 0;
  if (comRaio) {
    const fora = await db
      .select(pinColumns)
      .from(spaces)
      .where(and(...base, sql`NOT (${near})`, or(promotedExpr, relevantExpr)))
      .orderBy(desc(promotionRankExpr), sql`${spaces.ratingAvg} DESC NULLS LAST`, distancia)
      .limit(MAX_OUTSIDE_PINS);
    const jaTem = new Set(pins.map((p) => p.id));
    const foraNovos = fora.filter((l) => !jaTem.has(l.id));
    for (const l of foraNovos.filter((x) => x.promotion != null)) {
      pins.push(toPin(l, true));
      jaTem.add(l.id);
      outsideShown += 1;
    }

    // Alcance ampliado: do raio até raio + 10 km, só dono Premium, os mais próximos primeiro.
    const { extraRadiusM, maxOutsidePins } = await premiumMapReach();
    if (maxOutsidePins > 0 && extraRadiusM > 0) {
      const ampliados = await db
        .select(pinColumns)
        .from(spaces)
        .where(
          and(
            ...base,
            sql`NOT (${near})`,
            withinMeters(spaces.approxLocation, q.center!, q.radiusMeters! + extraRadiusM),
            sql`NOT ${promotedExpr}`,
            ownerPremiumExpr,
          ),
        )
        .orderBy(distancia)
        .limit(maxOutsidePins + jaTem.size);
      for (const l of ampliados) {
        if (reachShown >= maxOutsidePins) break;
        if (jaTem.has(l.id)) continue;
        // Anúncio normal: sem promoção, sem rótulo — só a posição diz que veio do alcance ampliado.
        pins.push(toPin({ ...l, promotion: null }, true));
        jaTem.add(l.id);
        reachShown += 1;
      }
    }

    for (const l of foraNovos.filter((x) => x.promotion == null)) {
      if (jaTem.has(l.id)) continue;
      pins.push(toPin(l, true));
      jaTem.add(l.id);
      outsideShown += 1;
    }
  }

  return { pins, clusters, total, outsideShown, reachShown, radiusMeters: comRaio ? q.radiusMeters : null };
}

// ---------------------------------------------------------------------------
// Prévia ao tocar num marcador
// ---------------------------------------------------------------------------

export type MapPreview = {
  id: string;
  slug: string;
  title: string;
  type: string;
  district: string | null;
  city: string | null;
  state: string | null;
  priceMonthlyCents: number | null;
  quantityAvailable: number;
  quantityOffered: number;
  ratingAvg: string | null;
  ratingCount: number;
  photoCount: number;
  featureLabels: string[];
  coverUrl: string | null;
};

/**
 * Dados extras do espaço que a pessoa tocou: foto (URL assinada, do bucket
 * privado) e características. Só anúncio publicado e não apagado — um id de
 * rascunho ou de anúncio arquivado responde "não encontrado", igual a um id
 * que não existe.
 */
export async function getMapPreview(id: string): Promise<MapPreview | null> {
  const [row] = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      title: spaces.title,
      type: sql<string>`${spaces.type}::text`,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      priceMonthlyCents: spaces.priceMonthlyCents,
      quantityAvailable: spaces.quantityAvailable,
      quantityOffered: spaces.quantityOffered,
      ratingAvg: sql<string | null>`${spaces.ratingAvg}::text`,
      ratingCount: spaces.ratingCount,
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
      )`,
      photoCount: sql<number>`(SELECT count(*)::int FROM space_images si WHERE si.space_id = spaces.id)`,
      featureLabels: sql<string[]>`(
        SELECT COALESCE(array_agg(f.label ORDER BY f.sort_order), '{}')
        FROM (SELECT feature_key FROM space_features sf2 WHERE sf2.space_id = spaces.id LIMIT 3) sf
        JOIN features f ON f.key = sf.feature_key
      )`,
    })
    .from(spaces)
    .where(and(eq(spaces.id, id), eq(spaces.status, 'published'), isNull(spaces.deletedAt)))
    .limit(1);
  if (!row) return null;

  const urls = row.coverPath ? await signImagePaths([row.coverPath]) : new Map<string, string>();
  const { coverPath, ...resto } = row;
  return { ...resto, coverUrl: coverPath ? (urls.get(coverPath) ?? null) : null };
}

/**
 * Centro de um bairro ou cidade que já tem anúncio no ar, tirado dos pontos
 * PÚBLICOS dos anúncios (a média deles). Serve para abrir o mapa em "Colatina"
 * quando a pessoa digita só o nome — sem chamar serviço de geocodificação.
 */
export async function centroidOfPlace(place: { city?: string | null; district?: string | null }): Promise<{ lat: number; lng: number } | null> {
  const condicoes: SQL[] = [eq(spaces.status, 'published'), isNull(spaces.deletedAt), sql`${spaces.approxLocation} IS NOT NULL`];
  if (place.city) condicoes.push(sql`${spaces.city} ILIKE ${place.city}`);
  if (place.district) condicoes.push(sql`${spaces.district} ILIKE ${place.district}`);
  if (condicoes.length === 3) return null;
  const [row] = await db
    .select({
      lat: sql<number | null>`avg(ST_Y(${spaces.approxLocation}))`,
      lng: sql<number | null>`avg(ST_X(${spaces.approxLocation}))`,
    })
    .from(spaces)
    .where(and(...condicoes));
  return row?.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
}

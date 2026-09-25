import 'server-only';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { promotions, premiumMemberships, spaces, promotionPurchases } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';
import { monthlyBenefitLimit, featuredSectionLimit } from './settings';
import { hasSearchContext, compatibilityScoreExpr, sameCityAsSearchExpr, type CompatibilityContext } from './compatibility';

/**
 * Leitura de promocoes e assinatura Premium.
 *
 * Mesma separacao do resto do app: nenhuma consulta aqui confia em nada
 * vindo do navegador alem de um id — quantidade usada, limite e vigencia
 * sao sempre recalculados aqui, nunca aceitos prontos.
 */

// ---------------------------------------------------------------------------
// Varredura preguicosa de promocao vencida — mesmo padrao de
// `expireStaleBookingRequests` (src/lib/bookings/queries.ts): sem worker,
// sem cron, a promocao vira `expired` na proxima vez que algo relevante ler.
// ---------------------------------------------------------------------------
export async function expireStalePromotions(): Promise<number> {
  const result = await db
    .update(promotions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(and(eq(promotions.status, 'active'), sql`${promotions.expiresAt} <= now()`))
    .returning({ id: promotions.id });
  return result.length;
}

// ---------------------------------------------------------------------------
// Premium
// ---------------------------------------------------------------------------

export type PremiumMembership = {
  status: 'active' | 'cancelled';
  source: 'admin_grant' | 'subscription';
  grantedAt: Date;
};

export async function getPremiumMembership(userId: string): Promise<PremiumMembership | null> {
  const [row] = await db
    .select({
      status: premiumMemberships.status,
      source: premiumMemberships.source,
      grantedAt: premiumMemberships.grantedAt,
    })
    .from(premiumMemberships)
    .where(eq(premiumMemberships.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function isPremium(userId: string): Promise<boolean> {
  const membership = await getPremiumMembership(userId);
  return membership?.status === 'active';
}

export type BenefitUsage = {
  premium: boolean;
  periodStart: Date;
  periodEnd: Date;
  destaque: { used: number; limit: number; remaining: number };
  turbo: { used: number; limit: number; remaining: number };
};

/**
 * Uso do beneficio mensal, contado direto em `promotions` — sem coluna de
 * saldo a parte. O periodo e o MES CALENDARIO (dia 1 a dia 1 do mes
 * seguinte), calculado no banco para nao correr risco de fuso divergente
 * entre o relogio do servidor e o do Postgres.
 */
export async function getMonthlyBenefitUsage(ownerId: string): Promise<BenefitUsage> {
  const [membership, [periodo], contagens, destaqueLimit, turboLimit] = await Promise.all([
    getPremiumMembership(ownerId),
    db.execute<{ period_start: Date; period_end: Date }>(
      sql`SELECT date_trunc('month', now()) AS period_start, date_trunc('month', now()) + interval '1 month' AS period_end`,
    ),
    db
      .select({ type: promotions.type, n: sql<number>`count(*)::int` })
      .from(promotions)
      .where(
        and(
          eq(promotions.ownerId, ownerId),
          eq(promotions.source, 'premium_benefit'),
          gte(promotions.createdAt, sql`date_trunc('month', now())`),
        ),
      )
      .groupBy(promotions.type),
    monthlyBenefitLimit('destaque'),
    monthlyBenefitLimit('turbo'),
  ]);

  const destaqueUsed = contagens.find((c) => c.type === 'destaque')?.n ?? 0;
  const turboUsed = contagens.find((c) => c.type === 'turbo')?.n ?? 0;

  return {
    premium: membership?.status === 'active',
    // `db.execute` devolve o valor bruto do driver — uma string, nao um
    // Date, apesar do generic dizer o contrario (e so um cast, nao converte
    // nada em runtime). `new Date(...)` garante o tipo que `BenefitUsage`
    // promete.
    periodStart: new Date(periodo!.period_start),
    periodEnd: new Date(periodo!.period_end),
    destaque: {
      used: destaqueUsed,
      limit: destaqueLimit,
      remaining: Math.max(0, destaqueLimit - destaqueUsed),
    },
    turbo: {
      used: turboUsed,
      limit: turboLimit,
      remaining: Math.max(0, turboLimit - turboUsed),
    },
  };
}

// ---------------------------------------------------------------------------
// Promocoes de um anuncio / de um proprietario
// ---------------------------------------------------------------------------

export type ActivePromotion = {
  id: string;
  type: 'destaque' | 'turbo';
  status: 'scheduled' | 'active' | 'expired' | 'cancelled';
  startedAt: Date;
  expiresAt: Date;
};

/** Promocao vigente (scheduled ou active) de um anuncio, se houver. */
export async function getActivePromotionForSpace(spaceId: string): Promise<ActivePromotion | null> {
  await expireStalePromotions();
  const [row] = await db
    .select({
      id: promotions.id,
      type: promotions.type,
      status: promotions.status,
      startedAt: promotions.startedAt,
      expiresAt: promotions.expiresAt,
    })
    .from(promotions)
    .where(and(eq(promotions.spaceId, spaceId), inArray(promotions.status, ['scheduled', 'active'])))
    .limit(1);
  return row ?? null;
}

/** Promocao vigente de VARIOS anuncios de uma vez — para a lista de "Meus espaços". */
export async function getActivePromotionsForSpaces(
  spaceIds: string[],
): Promise<Map<string, ActivePromotion>> {
  if (spaceIds.length === 0) return new Map();
  await expireStalePromotions();
  const rows = await db
    .select({
      id: promotions.id,
      spaceId: promotions.spaceId,
      type: promotions.type,
      status: promotions.status,
      startedAt: promotions.startedAt,
      expiresAt: promotions.expiresAt,
    })
    .from(promotions)
    .where(and(inArray(promotions.spaceId, spaceIds), inArray(promotions.status, ['scheduled', 'active'])));
  return new Map(rows.map((r) => [r.spaceId, r]));
}

export type PromotionHistoryRow = ActivePromotion & {
  spaceId: string;
  spaceTitle: string;
  spaceSlug: string;
  source: 'premium_benefit' | 'purchase';
  cancelledAt: Date | null;
  /** Valor pago, em centavos — so existe pra `source: 'purchase'`; benefício Premium é sempre grátis (null). */
  priceCents: number | null;
};

/**
 * Historico de promocoes do proprietario — cada linha e uma promocao que
 * REALMENTE chegou a existir (a compra avulsa so cria a linha em
 * `promotions` quando o pagamento confirma, ver `handlePurchaseConfirmed`
 * em src/lib/payments/webhook.ts), nao toda tentativa de compra.
 *
 * `priceCents` vem de um LEFT JOIN com `promotion_purchases` — so preenchido
 * quando a origem foi `purchase`; benefício Premium nunca tem linha de
 * cobranca correspondente.
 */
export async function listOwnerPromotions(ownerId: string, limit = 20): Promise<PromotionHistoryRow[]> {
  await expireStalePromotions();
  return db
    .select({
      id: promotions.id,
      type: promotions.type,
      status: promotions.status,
      source: promotions.source,
      startedAt: promotions.startedAt,
      expiresAt: promotions.expiresAt,
      cancelledAt: promotions.cancelledAt,
      spaceId: promotions.spaceId,
      spaceTitle: spaces.title,
      spaceSlug: spaces.slug,
      priceCents: promotionPurchases.priceCents,
    })
    .from(promotions)
    .innerJoin(spaces, eq(spaces.id, promotions.spaceId))
    .leftJoin(promotionPurchases, eq(promotionPurchases.promotionId, promotions.id))
    .where(eq(promotions.ownerId, ownerId))
    .orderBy(desc(promotions.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Vitrine publica — home
// ---------------------------------------------------------------------------

/**
 * Mesmo formato de `PublicSpace` (src/lib/spaces/queries.ts) — para poder
 * reusar `ResultCard` direto, sem duplicar a montagem do card. `distanceMeters`
 * fica sempre null: a home não tem ponto de busca, e favoritar/ver
 * características funciona igual ao resultado normal.
 */
export type FeaturedSpace = import('@/lib/spaces/queries').PublicSpace & {
  promotionType: 'destaque' | 'turbo';
};

/**
 * Anuncios com promocao ATIVA, para a secao "Espaços em destaque" da home.
 * Turbo sempre antes de Destaque (hierarquia pedida); dentro do mesmo nivel,
 * o mais recente ativado primeiro. So `published` — uma promocao nao
 * republica um rascunho nem ressuscita um anuncio pausado.
 */
export async function listFeaturedSpaces(limit?: number): Promise<FeaturedSpace[]> {
  await expireStalePromotions();
  const max = limit ?? (await featuredSectionLimit());

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
      ratingAvg: spaces.ratingAvg,
      ratingCount: spaces.ratingCount,
      approxLat: latOf(spaces.approxLocation),
      approxLng: lngOf(spaces.approxLocation),
      distanceMeters: sql<number | null>`NULL`,
      coverPath: sql<string | null>`(
        SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
        WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
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
      promotionType: promotions.type,
      startedAt: promotions.startedAt,
    })
    .from(promotions)
    .innerJoin(spaces, eq(spaces.id, promotions.spaceId))
    .where(and(eq(promotions.status, 'active'), eq(spaces.status, 'published'), sql`${spaces.deletedAt} IS NULL`))
    .orderBy(
      sql`CASE ${promotions.type} WHEN 'turbo' THEN 2 WHEN 'destaque' THEN 1 ELSE 0 END DESC`,
      desc(promotions.startedAt),
    )
    .limit(max);

  return rows as FeaturedSpace[];
}

/**
 * Expressao de desempate por nivel de promocao, para usar como fator
 * ADICIONAL de ordenacao na busca (ver `listPublishedSpaces` em
 * `src/lib/spaces/queries.ts`) — turbo > destaque > sem promocao, mas
 * sempre depois da ordenacao principal escolhida, nunca antes dela.
 */
export function promotionTierExpr() {
  return sql<number>`COALESCE((
    SELECT CASE p.type WHEN 'turbo' THEN 2 WHEN 'destaque' THEN 1 ELSE 0 END
    FROM promotions p
    WHERE p.space_id = spaces.id AND p.status = 'active'
    LIMIT 1
  ), 0)`;
}

/**
 * Mesma coisa que `promotionTierExpr`, mas com a elegibilidade pedida: a
 * promoção só entra na ordenação quando o espaço tem características
 * compatíveis o bastante com a busca em andamento —
 *
 *   - Turbo: mesma cidade da busca E pelo menos 2 características compatíveis;
 *   - Destaque: pelo menos 4 características compatíveis.
 *
 * Sem nenhum criterio de busca (navegação livre), não há o que medir —
 * cai para o `promotionTierExpr()` normal, sem porta nenhuma. Isso
 * garante a regra pedida ("o sistema não deve simplesmente colocar um
 * anúncio pago na frente de qualquer imóvel"): a promoção nunca destrói a
 * relevância de uma busca real, mas também nunca é penalizada quando não
 * há busca nenhuma para destruir.
 */
export function gatedPromotionTierExpr(ctx: CompatibilityContext) {
  if (!hasSearchContext(ctx)) return promotionTierExpr();

  const score = compatibilityScoreExpr(ctx);
  const mesmaCidade = sameCityAsSearchExpr(ctx);

  return sql<number>`COALESCE((
    SELECT CASE
      WHEN p.type = 'turbo' AND (${mesmaCidade}) AND (${score}) >= 2 THEN 2
      WHEN p.type = 'destaque' AND (${score}) >= 4 THEN 1
      ELSE 0
    END
    FROM promotions p
    WHERE p.space_id = spaces.id AND p.status = 'active'
    LIMIT 1
  ), 0)`;
}

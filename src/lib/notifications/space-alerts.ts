import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { favorites } from '@/db/schema';
import { formatBRL } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import { listFavoriterUserIds, listFavoritePatternsForType } from '@/lib/favorites/queries';
import { sendGovernedNotification } from './governor';
import { notifyUser } from './dispatch';
import { computeCompatibilityScore, COMPATIBILITY_THRESHOLD } from './compatibility';

/**
 * Alertas sobre espaços favoritados (Fase 18.2; queda de preço refeita na
 * Fase 23).
 *
 * Só quedas de preço geram notificação, nunca aumento: a pessoa que
 * favoritou não pode "agir" sobre um preço que já subiu, e a instrução do
 * próprio sistema é "melhor deixar de enviar do que incomodar" — um aviso de
 * má notícia sobre a qual nada pode ser feito pesa mais que ajuda.
 */
const AVAILABILITY_COOLDOWN_HOURS = 24;

export type SpaceRef = { id: string; title: string; slug: string };

/*
 * QUEDA DE PREÇO — estratégia contra spam (Fase 23)
 *
 * Cada favorito guarda o MENOR preço que a pessoa já conhece daquele espaço
 * (`price_alert_baseline_cents`: o preço de quando favoritou, ou o do último
 * aviso). Três regras, nesta ordem:
 *
 *   1. Só avisa quem deixou "Me avise quando o preço baixar" ligado.
 *   2. Só avisa quando o preço atual fica ABAIXO do menor já conhecido, por
 *      pelo menos `alerts.price_drop_min_bps` (padrão 1%). Subir e descer de
 *      volta a um patamar já avisado não gera nada.
 *   3. No máximo um aviso por espaço, por pessoa, a cada
 *      `alerts.price_drop_cooldown_hours` (padrão 24h). Uma queda dentro da
 *      janela não se perde: o cron diário (`runPriceDropCatchUp`) avisa
 *      depois, já com o preço daquele momento.
 *
 * Exemplo do pedido — R$ 400 → 390 → 395 → 385, tudo na mesma tarde: um aviso
 * em 390 (400 → 390), nada em 395 (subiu), e 385 fica para o fim da janela,
 * quando chega UM aviso "de R$ 390 para R$ 385". Nunca uma rajada.
 *
 * Só para anúncio no ar (`published`): uma queda num espaço alugado ou
 * pausado espera ele voltar, e o aviso sai pelo cron quando voltar.
 *
 * A "reivindicação" é um UPDATE condicionado ao estado lido (mesma base, fora
 * da janela): duas chamadas simultâneas nunca avisam a mesma pessoa duas
 * vezes pela mesma queda.
 */

type QuedaCandidata = {
  userId: string;
  spaceId: string;
  baselineCents: number;
  currentCents: number;
  title: string;
  slug: string;
};

async function listarQuedas(filtro: { spaceId?: string }): Promise<QuedaCandidata[]> {
  const [minBps, janelaHoras] = await Promise.all([
    settingInt('alerts.price_drop_min_bps', 100),
    settingInt('alerts.price_drop_cooldown_hours', 24),
  ]);

  const linhas = await db.execute<{
    user_id: string;
    space_id: string;
    baseline: number;
    atual: number;
    title: string;
    slug: string;
  }>(sql`
    SELECT f.user_id, f.space_id,
           f.price_alert_baseline_cents AS baseline,
           s.price_monthly_cents AS atual,
           s.title, s.slug
      FROM favorites f
      JOIN spaces s ON s.id = f.space_id
      JOIN profiles p ON p.id = f.user_id
     WHERE f.price_alert
       AND f.price_alert_baseline_cents IS NOT NULL
       AND s.status = 'published'
       AND s.deleted_at IS NULL
       AND p.status = 'active'
       AND p.deleted_at IS NULL
       AND f.price_alert_baseline_cents > s.price_monthly_cents
       AND (f.price_alert_baseline_cents - s.price_monthly_cents)::bigint * 10000
           >= f.price_alert_baseline_cents::bigint * ${minBps}
       AND (f.price_alert_notified_at IS NULL
            OR f.price_alert_notified_at <= now() - make_interval(hours => ${janelaHoras}::int))
       ${filtro.spaceId ? sql`AND f.space_id = ${filtro.spaceId}` : sql``}
  `);

  return linhas.map((l) => ({
    userId: l.user_id,
    spaceId: l.space_id,
    baselineCents: Number(l.baseline),
    currentCents: Number(l.atual),
    title: l.title,
    slug: l.slug,
  }));
}

async function avisarQueda(q: QuedaCandidata): Promise<boolean> {
  // Reivindica: só passa se ninguém avisou esta pessoa desta queda enquanto isso.
  const reivindicadas = await db
    .update(favorites)
    .set({ priceAlertBaselineCents: q.currentCents, priceAlertNotifiedAt: new Date() })
    .where(
      and(
        eq(favorites.userId, q.userId),
        eq(favorites.spaceId, q.spaceId),
        eq(favorites.priceAlert, true),
        eq(favorites.priceAlertBaselineCents, q.baselineCents),
      ),
    )
    .returning({ userId: favorites.userId });
  if (reivindicadas.length === 0) return false;

  const diferenca = q.baselineCents - q.currentCents;
  await notifyUser(db, {
    userId: q.userId,
    type: 'favorite_price_drop',
    title: 'Preço baixou em um espaço salvo',
    body: `"${q.title}": de ${formatBRL(q.baselineCents)} para ${formatBRL(q.currentCents)} por mês (${formatBRL(diferenca)} a menos).`,
    linkPath: `/espacos/${q.slug}`,
    data: {
      spaceId: q.spaceId,
      oldPriceCents: q.baselineCents,
      newPriceCents: q.currentCents,
      diffCents: diferenca,
    },
    dedupeKey: `price_drop:${q.spaceId}:${q.baselineCents}:${q.currentCents}`,
  });
  return true;
}

/** Avisa quem favoritou ESTE espaço, se o preço de agora cair abaixo do que cada um conhece. */
export async function notifyPriceDropsForSpace(spaceId: string): Promise<number> {
  let enviados = 0;
  for (const q of await listarQuedas({ spaceId })) {
    if (await avisarQueda(q)) enviados++;
  }
  return enviados;
}

/** Cron diário: quedas que ficaram para depois (janela mínima, espaço que voltou ao ar). */
export async function runPriceDropCatchUp(): Promise<{ sent: number }> {
  let sent = 0;
  for (const q of await listarQuedas({})) {
    if (await avisarQueda(q)) sent++;
  }
  return { sent };
}

/**
 * Chamada pela etapa de preço do anúncio depois de gravar o valor novo.
 * Aumento não faz nada; queda delega para `notifyPriceDropsForSpace`, que
 * decide por pessoa a partir do estado real do banco.
 */
export async function alertFavoritersOfPriceDrop(
  space: SpaceRef,
  oldPriceCents: number,
  newPriceCents: number,
): Promise<number> {
  if (newPriceCents >= oldPriceCents) return 0;
  return notifyPriceDropsForSpace(space.id);
}

/**
 * Espaço favoritado saiu do ar (pausado ou alugado) ou voltou a ficar
 * disponível. Cooldown mais curto que o de preço: disponibilidade muda o que
 * a pessoa pode FAZER agora mesmo (agendar visita, perder a vaga), então
 * flapping rápido ainda assim merece registrar as duas pontas — só repetição
 * do MESMO lado dentro de 24h é que fica em silêncio.
 */
export async function alertFavoritersOfAvailabilityChange(
  space: SpaceRef,
  kind: 'unavailable' | 'available_again',
  options?: {
    /**
     * Quem NÃO recebe este aviso (Fase 23): quem acabou de alugar o espaço, e
     * quem já foi avisado pela lista de espera — o mesmo fato não vira duas
     * notificações para a mesma pessoa.
     */
    exceptUserIds?: readonly string[];
  },
): Promise<void> {
  const fora = new Set(options?.exceptUserIds ?? []);
  const favoriterIds = (await listFavoriterUserIds(space.id)).filter((id) => !fora.has(id));
  if (favoriterIds.length === 0) return;

  const linkPath = `/espacos/${space.slug}`;
  const copy =
    kind === 'unavailable'
      ? { title: 'Espaço salvo saiu do ar', body: `"${space.title}" não está mais disponível no momento.` }
      : { title: 'Espaço salvo está disponível de novo', body: `"${space.title}" voltou a ficar disponível.` };

  for (const userId of favoriterIds) {
    await sendGovernedNotification({
      userId,
      type: kind === 'unavailable' ? 'favorite_unavailable' : 'favorite_available_again',
      title: copy.title,
      body: copy.body,
      linkPath,
      data: { spaceId: space.id },
      cooldownHours: AVAILABILITY_COOLDOWN_HOURS,
      scopeKey: space.id,
    });
  }
}

const COMPATIBLE_COOLDOWN_HOURS = 48;
/** Trava de custo/ruído: mesmo num tipo+cidade muito favoritado, no máximo 50 pessoas por publicação. */
const MAX_COMPATIBLE_RECIPIENTS = 50;

export type NewPublishedSpace = {
  id: string;
  ownerId: string;
  type: string;
  city: string;
  title: string;
  slug: string;
  priceMonthlyCents: number;
  featureKeys: string[];
};

/**
 * "Novo espaço compatível" (Fase 18.3) — dispara só na primeira publicação
 * (ver `publishSpaceAction`). Tipo e cidade já são o portão de quem entra em
 * `listFavoritePatternsForType`; aqui só pontua e filtra pelo limiar.
 *
 * Cooldown SEM `scopeKey`: é por pessoa, não por espaço — o objetivo é não
 * repetir "temos algo novo pra você" com frequência, não impedir que a
 * mesma pessoa seja avisada de espaços DIFERENTES.
 */
export async function alertCompatibleFavoritersOfNewSpace(
  space: NewPublishedSpace,
  options?: {
    /**
     * Quem já tem um alerta de busca salva que bateu com este anúncio
     * (Fase 23) — recebe o aviso do alerta, que pediu explicitamente, e não
     * um segundo aviso "com o seu perfil" sobre o mesmo espaço.
     */
    exceptUserIds?: readonly string[];
  },
): Promise<void> {
  const patterns = await listFavoritePatternsForType(space.type, space.city, space.id, space.ownerId);
  if (patterns.length === 0) return;

  const fora = new Set(options?.exceptUserIds ?? []);
  const elegiveis = patterns
    .filter((pattern) => !fora.has(pattern.userId))
    .map((pattern) => ({ userId: pattern.userId, score: computeCompatibilityScore(pattern, space) }))
    .filter((c) => c.score >= COMPATIBILITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_COMPATIBLE_RECIPIENTS);

  if (elegiveis.length === 0) return;

  const linkPath = `/espacos/${space.slug}`;
  for (const { userId, score } of elegiveis) {
    await sendGovernedNotification({
      userId,
      type: 'new_compatible_space',
      title: 'Novo espaço com o seu perfil',
      body: `"${space.title}" acabou de ser publicado em ${space.city} e combina com o que você costuma salvar.`,
      linkPath,
      data: { spaceId: space.id, compatibilityScore: score },
      cooldownHours: COMPATIBLE_COOLDOWN_HOURS,
    });
  }
}

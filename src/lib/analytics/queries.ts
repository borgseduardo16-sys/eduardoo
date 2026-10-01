import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { addDaysIso, daysBetweenInclusive, monthRange } from './period';

/**
 * Números do painel de desempenho do proprietário (Fase 23).
 *
 * Tudo sai do banco, e cada evento é contado separado — visualização não é
 * interesse, favorito não é reserva, solicitação não é pagamento, reserva
 * não é locação concluída:
 *
 * - visualizações/compartilhamentos: `space_daily_stats` (só contadores por
 *   dia; ninguém é identificado);
 * - favoritados no período: favoritos criados no período que CONTINUAM
 *   salvos (quem desfaz sai da conta — não guardamos histórico de quem
 *   desfez);
 * - solicitações: pedidos recebidos no período, qualquer que seja a resposta;
 * - reservas iniciadas: aluguéis que começaram de fato (primeiro pagamento
 *   confirmado) no período; locações encerradas contam à parte;
 * - receita: SÓ pagamentos confirmados ou recebidos no período, a parte do
 *   proprietário (já sem a taxa da plataforma). Nada de estimativa;
 * - ocupação: dias em que houve aluguel ativo ÷ dias com o anúncio no ar,
 *   só com pelo menos 14 dias para analisar. Aluguel por tempo conta os
 *   dias que tocou (2 horas numa terça = a terça), nunca "até hoje".
 *
 * Anúncio arquivado (excluído depois de ter reserva) continua entrando nos
 * totais: o dinheiro que ele rendeu não some do relatório porque o anúncio
 * saiu do ar.
 *
 * Toda consulta filtra por `owner_id` do dono logado.
 */

export const MIN_OCCUPANCY_DAYS = 14;
/** Abaixo disso a "taxa de conversão" é ruído (1 solicitação em 3 visitas daria 33%). */
export const MIN_VIEWS_FOR_CONVERSION = 20;

export type SpaceMetrics = {
  spaceId: string;
  title: string;
  slug: string;
  status: string;
  /** Anúncio arquivado — aparece só se teve movimento no período. */
  removed: boolean;
  views: number;
  shares: number;
  favoritesNew: number;
  favoritesNow: number;
  requests: number;
  reservationsStarted: number;
  rentalsEnded: number;
  revenueCents: number;
  /** Null quando não há dias suficientes para dizer algo honesto. */
  occupancy: { percent: number; occupiedDays: number; analyzedDays: number } | null;
};

export type PerformanceTotals = Omit<SpaceMetrics, 'spaceId' | 'title' | 'slug' | 'status' | 'removed' | 'occupancy'>;

export type OwnerPerformance = {
  spaces: SpaceMetrics[];
  totals: PerformanceTotals;
  /** Visualizações por dia do período; null nos dias antes de a contagem existir. */
  viewsByDay: { day: string; views: number | null }[];
  /** Primeiro dia em que visualizações passaram a ser contadas. */
  countingSince: string | null;
};

type LinhaMetricas = {
  space_id: string;
  title: string;
  slug: string;
  status: string;
  removed: boolean;
  views: number;
  shares: number;
  favorites_new: number;
  favorites_now: number;
  requests: number;
  reservations_started: number;
  rentals_ended: number;
  revenue_cents: string | number;
  analyzed_days: number;
  occupied_days: number;
};

/** Desde quando as visualizações são contadas (setting gravado na migração; senão, o primeiro dia com dado). */
export async function viewsCountingSince(): Promise<string | null> {
  const [row] = await db.execute<{ since: string | null }>(sql`
    SELECT COALESCE(
      (SELECT value #>> '{}' FROM platform_settings WHERE key = 'analytics.views_counting_since'),
      (SELECT min(day)::text FROM space_daily_stats)
    ) AS since
  `);
  const v = row?.since ?? null;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function getOwnerPerformance(
  ownerId: string,
  range: { from: string; to: string },
  today: string,
): Promise<OwnerPerformance> {
  const { from, to } = range;
  const fim = to < today ? to : today;
  // Visualizações só contam a partir do início da contagem — assim o total e o
  // gráfico (que mostra "sem dado" antes dela) sempre batem.
  const countingSince = await viewsCountingSince();
  const inicioVisitas = countingSince && countingSince > from ? countingSince : from;

  const linhas = (await db.execute(sql`
    WITH s AS (
      SELECT id, title, slug, status::text AS status, deleted_at IS NOT NULL AS removed,
        (published_at AT TIME ZONE 'America/Sao_Paulo')::date AS publicado_em
      FROM spaces
      WHERE owner_id = ${ownerId} AND published_at IS NOT NULL
        -- anúncio publicado depois do fim do período não fazia parte dele
        AND (published_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${fim}::date
    )
    SELECT
      s.id AS space_id, s.title, s.slug, s.status, s.removed,
      COALESCE((SELECT sum(d.views) FROM space_daily_stats d
        WHERE d.space_id = s.id AND d.day BETWEEN ${inicioVisitas}::date AND ${to}::date), 0)::int AS views,
      COALESCE((SELECT sum(d.shares) FROM space_daily_stats d
        WHERE d.space_id = s.id AND d.day BETWEEN ${inicioVisitas}::date AND ${to}::date), 0)::int AS shares,
      (SELECT count(*) FROM favorites f WHERE f.space_id = s.id
        AND (f.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date)::int AS favorites_new,
      (SELECT count(*) FROM favorites f WHERE f.space_id = s.id)::int AS favorites_now,
      (SELECT count(*) FROM bookings b WHERE b.space_id = s.id AND b.owner_id = ${ownerId}
        AND (b.requested_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date)::int AS requests,
      (SELECT count(*) FROM bookings b WHERE b.space_id = s.id AND b.owner_id = ${ownerId} AND b.activated_at IS NOT NULL
        AND (b.activated_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date)::int AS reservations_started,
      (SELECT count(*) FROM bookings b WHERE b.space_id = s.id AND b.owner_id = ${ownerId} AND b.status = 'ended'
        AND (b.ended_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date)::int AS rentals_ended,
      COALESCE((SELECT sum(b.owner_payout_cents) FROM payments pay JOIN bookings b ON b.id = pay.booking_id
        WHERE b.space_id = s.id AND b.owner_id = ${ownerId}
          AND pay.status IN ('confirmed', 'received') AND pay.paid_at IS NOT NULL
          AND (pay.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${from}::date AND ${to}::date), 0)::bigint AS revenue_cents,
      GREATEST(0, (${fim}::date - GREATEST(${from}::date, s.publicado_em)) + 1)::int AS analyzed_days,
      (SELECT count(DISTINCT dia) FROM bookings b,
        generate_series(
          GREATEST(${from}::date, b.start_date, s.publicado_em),
          -- Parte 12: aluguel por tempo ocupa só os dias que tocou (end_date é exclusivo);
          -- o mensal vai até o dia anterior ao fim (ou até hoje, se segue ativo).
          LEAST(${fim}::date, CASE WHEN b.kind = 'temporary' THEN b.end_date - 1
            ELSE COALESCE((COALESCE(b.ended_at, b.cancelled_at) AT TIME ZONE 'America/Sao_Paulo')::date - 1, ${fim}::date) END),
          interval '1 day') AS dia
        WHERE b.space_id = s.id AND b.owner_id = ${ownerId} AND b.activated_at IS NOT NULL)::int AS occupied_days
    FROM s
    ORDER BY s.title
  `)) as unknown as LinhaMetricas[];

  const todas: SpaceMetrics[] = linhas.map((l) => ({
    spaceId: l.space_id,
    title: l.title,
    slug: l.slug,
    status: l.status,
    removed: l.removed,
    views: l.views,
    shares: l.shares,
    favoritesNew: l.favorites_new,
    favoritesNow: l.favorites_now,
    requests: l.requests,
    reservationsStarted: l.reservations_started,
    rentalsEnded: l.rentals_ended,
    revenueCents: Number(l.revenue_cents),
    // Arquivado: os dias depois da exclusão contariam como "no ar" — melhor não mostrar.
    occupancy: !l.removed && l.analyzed_days >= MIN_OCCUPANCY_DAYS
      ? {
          percent: Math.floor((Math.min(l.occupied_days, l.analyzed_days) * 100) / l.analyzed_days),
          occupiedDays: Math.min(l.occupied_days, l.analyzed_days),
          analyzedDays: l.analyzed_days,
        }
      : null,
  }));

  // Nos totais entra tudo; na lista, o arquivado só aparece se teve movimento.
  const totals: PerformanceTotals = todas.reduce<PerformanceTotals>(
    (t, s) => ({
      views: t.views + s.views,
      shares: t.shares + s.shares,
      favoritesNew: t.favoritesNew + s.favoritesNew,
      favoritesNow: t.favoritesNow + s.favoritesNow,
      requests: t.requests + s.requests,
      reservationsStarted: t.reservationsStarted + s.reservationsStarted,
      rentalsEnded: t.rentalsEnded + s.rentalsEnded,
      revenueCents: t.revenueCents + s.revenueCents,
    }),
    { views: 0, shares: 0, favoritesNew: 0, favoritesNow: 0, requests: 0, reservationsStarted: 0, rentalsEnded: 0, revenueCents: 0 },
  );
  const spaces = todas.filter(
    (s) => !s.removed || s.views + s.shares + s.favoritesNew + s.requests + s.reservationsStarted + s.rentalsEnded + s.revenueCents > 0,
  );

  const porDia = await db.execute<{ day: string; views: number }>(sql`
    SELECT d.day::text AS day, sum(d.views)::int AS views
    FROM space_daily_stats d JOIN spaces s ON s.id = d.space_id
    WHERE s.owner_id = ${ownerId} AND s.published_at IS NOT NULL AND d.day BETWEEN ${inicioVisitas}::date AND ${to}::date
    GROUP BY d.day
  `);
  const mapa = new Map((porDia as unknown as { day: string; views: number }[]).map((r) => [r.day, r.views]));
  const viewsByDay: { day: string; views: number | null }[] = [];
  const total = daysBetweenInclusive(from, fim < from ? from : fim);
  for (let i = 0; i < total; i++) {
    const day = addDaysIso(from, i);
    viewsByDay.push({ day, views: countingSince && day >= countingSince ? (mapa.get(day) ?? 0) : null });
  }

  return { spaces, totals, viewsByDay, countingSince };
}

export type PromotionComparison = {
  promotionId: string;
  spaceTitle: string;
  type: 'destaque' | 'turbo';
  start: string;
  end: string;
  daysDuring: number;
  viewsPerDayDuring: number;
  viewsPerDayBefore: number;
};

/**
 * Destaque/Turbo no período: visualizações por dia DURANTE a promoção e nos
 * mesmos N dias ANTES dela. Só aparece quando os dois intervalos estão
 * inteiros dentro do tempo em que as visualizações já eram contadas, e com
 * pelo menos 3 dias de promoção — senão, não há comparação honesta.
 * É uma comparação simples; a tela não diz que a promoção CAUSOU a diferença.
 */
export async function getOwnerPromotionComparisons(
  ownerId: string,
  range: { from: string; to: string },
  today: string,
): Promise<{ comparisons: PromotionComparison[]; promotionsInPeriod: number }> {
  const desde = await viewsCountingSince();
  const promocoes = (await db.execute(sql`
    SELECT p.id, s.title, p.type::text AS type, p.space_id,
      (p.started_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS inicio,
      (LEAST(p.expires_at, COALESCE(p.cancelled_at, p.expires_at)) AT TIME ZONE 'America/Sao_Paulo')::date::text AS fim
    FROM promotions p JOIN spaces s ON s.id = p.space_id
    WHERE p.owner_id = ${ownerId} AND s.owner_id = ${ownerId}
      AND (p.started_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${range.to}::date
      AND (p.expires_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${range.from}::date
    ORDER BY p.started_at DESC
    LIMIT 20
  `)) as unknown as { id: string; title: string; type: 'destaque' | 'turbo'; space_id: string; inicio: string; fim: string }[];

  const out: PromotionComparison[] = [];
  if (!desde) return { comparisons: out, promotionsInPeriod: promocoes.length };
  for (const p of promocoes) {
    const fim = p.fim < today ? p.fim : addDaysIso(today, -1); // hoje ainda não terminou
    if (fim < p.inicio) continue;
    const dias = daysBetweenInclusive(p.inicio, fim);
    if (dias < 3) continue;
    const antesInicio = addDaysIso(p.inicio, -dias);
    if (antesInicio < desde) continue;
    const [row] = await db.execute<{ durante: number; antes: number }>(sql`
      SELECT
        COALESCE((SELECT sum(views) FROM space_daily_stats WHERE space_id = ${p.space_id}
          AND day BETWEEN ${p.inicio}::date AND ${fim}::date), 0)::int AS durante,
        COALESCE((SELECT sum(views) FROM space_daily_stats WHERE space_id = ${p.space_id}
          AND day BETWEEN ${antesInicio}::date AND ${addDaysIso(p.inicio, -1)}::date), 0)::int AS antes
    `);
    out.push({
      promotionId: p.id,
      spaceTitle: p.title,
      type: p.type,
      start: p.inicio,
      end: fim,
      daysDuring: dias,
      viewsPerDayDuring: Math.round(((row?.durante ?? 0) / dias) * 10) / 10,
      viewsPerDayBefore: Math.round(((row?.antes ?? 0) / dias) * 10) / 10,
    });
  }
  return { comparisons: out, promotionsInPeriod: promocoes.length };
}

/** Primeiro mês em que o proprietário teve anúncio no ar ('AAAA-MM'), ou null. */
export async function ownerFirstPublishedMonth(ownerId: string): Promise<string | null> {
  const [row] = await db.execute<{ mes: string | null }>(sql`
    SELECT to_char(min(published_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes
    FROM spaces WHERE owner_id = ${ownerId} AND published_at IS NOT NULL
  `);
  return row?.mes ?? null;
}

export type MonthlyHistoryRow = {
  /** 'AAAA-MM' */
  month: string;
  /** Null quando o mês inteiro é anterior à contagem de visualizações. */
  views: number | null;
  /** Contagem começou no meio deste mês ('AAAA-MM-DD'); o número vale só a partir daí. */
  viewsCountedFrom: string | null;
  favoritesNew: number;
  requests: number;
  reservationsStarted: number;
  rentalsEnded: number;
  revenueCents: number;
};

/**
 * Histórico mês a mês (do mais recente ao mais antigo), com as MESMAS regras
 * de `getOwnerPerformance` — o total de um mês aqui bate com o painel
 * filtrado naquele mês (verify-descoberta confere). O mês corrente vai só
 * até hoje.
 */
export async function getOwnerMonthlyHistory(
  ownerId: string,
  months: { first: string; last: string },
  today: string,
): Promise<MonthlyHistoryRow[]> {
  const primeiro = monthRange(months.first);
  const ultimo = monthRange(months.last);
  if (!primeiro || !ultimo || months.first > months.last) return [];

  const desde = await viewsCountingSince();
  const inicioVisitas = desde ?? primeiro.from;
  const linhas = await db.execute(sql`
      WITH meses AS (
        SELECT gs::date AS inicio,
          LEAST((gs + interval '1 month' - interval '1 day')::date, ${today}::date) AS fim
        FROM generate_series(${primeiro.from}::date, ${ultimo.from}::date, interval '1 month') AS gs
      ),
      s AS (
        SELECT id FROM spaces WHERE owner_id = ${ownerId} AND published_at IS NOT NULL
      )
      SELECT
        to_char(m.inicio, 'YYYY-MM') AS mes,
        m.inicio::text AS inicio,
        m.fim::text AS fim,
        COALESCE((SELECT sum(d.views) FROM space_daily_stats d
          WHERE d.space_id IN (SELECT id FROM s)
            AND d.day BETWEEN GREATEST(m.inicio, ${inicioVisitas}::date) AND m.fim), 0)::int AS views,
        (SELECT count(*) FROM favorites f WHERE f.space_id IN (SELECT id FROM s)
          AND (f.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN m.inicio AND m.fim)::int AS favorites_new,
        (SELECT count(*) FROM bookings b WHERE b.space_id IN (SELECT id FROM s) AND b.owner_id = ${ownerId}
          AND (b.requested_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN m.inicio AND m.fim)::int AS requests,
        (SELECT count(*) FROM bookings b WHERE b.space_id IN (SELECT id FROM s) AND b.owner_id = ${ownerId}
          AND b.activated_at IS NOT NULL
          AND (b.activated_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN m.inicio AND m.fim)::int AS reservations_started,
        (SELECT count(*) FROM bookings b WHERE b.space_id IN (SELECT id FROM s) AND b.owner_id = ${ownerId}
          AND b.status = 'ended'
          AND (b.ended_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN m.inicio AND m.fim)::int AS rentals_ended,
        COALESCE((SELECT sum(b.owner_payout_cents) FROM payments pay JOIN bookings b ON b.id = pay.booking_id
          WHERE b.space_id IN (SELECT id FROM s) AND b.owner_id = ${ownerId}
            AND pay.status IN ('confirmed', 'received') AND pay.paid_at IS NOT NULL
            AND (pay.paid_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN m.inicio AND m.fim), 0)::bigint AS revenue_cents
      FROM meses m
      ORDER BY m.inicio DESC
    `);

  return (linhas as unknown as {
    mes: string; inicio: string; fim: string; views: number; favorites_new: number; requests: number;
    reservations_started: number; rentals_ended: number; revenue_cents: string | number;
  }[]).map((l) => ({
    month: l.mes,
    views: desde && l.fim >= desde ? l.views : null,
    viewsCountedFrom: desde && l.inicio < desde && l.fim >= desde ? desde : null,
    favoritesNew: l.favorites_new,
    requests: l.requests,
    reservationsStarted: l.reservations_started,
    rentalsEnded: l.rentals_ended,
    revenueCents: Number(l.revenue_cents),
  }));
}

/** Algum anúncio do proprietário já teve qualquer movimento (visita, favorito ou pedido)? */
export async function ownerHasAnyActivity(ownerId: string): Promise<boolean> {
  const [row] = await db.execute<{ tem: boolean }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM space_daily_stats d JOIN spaces s ON s.id = d.space_id
        WHERE s.owner_id = ${ownerId} AND (d.views > 0 OR d.shares > 0))
      OR EXISTS (SELECT 1 FROM favorites f JOIN spaces s ON s.id = f.space_id WHERE s.owner_id = ${ownerId})
      OR EXISTS (SELECT 1 FROM bookings b WHERE b.owner_id = ${ownerId}) AS tem
  `);
  return Boolean(row?.tem);
}

import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, payments, spaces } from '@/db/schema';
import type { GroupRules, RentalTimeUnit, TemporaryPackage } from './pricing';

/**
 * Leitura dos grupos e unidades de um anúncio (Parte 12), com a ocupação
 * calculada AGORA pelo relógio do banco — nunca por um status gravado que
 * fica errado sozinho com o passar do tempo.
 *
 * "Ocupada agora" = tem reserva vigente cobrindo este instante (inclui os
 * 7 minutos de proteção para renovar e o prazo de quem está pagando).
 * "Livre para mensal" = nenhuma reserva daqui em diante: o aluguel contínuo
 * ocupa a unidade sem data para terminar, então qualquer reserva futura,
 * mesmo de 1 hora, impede.
 */

export type UnitView = { id: string; label: string; position: number; occupiedNow: boolean };

export type UnitGroupView = {
  id: string;
  name: string;
  position: number;
  rules: GroupRules;
  totalUnits: number;
  occupiedNow: number;
  freeForMonthly: number;
  units: UnitView[];
};

type GroupRow = {
  id: string;
  name: string;
  position: number;
  allows_continuous: boolean;
  allows_temporary: boolean;
  monthly_price_cents: number | null;
  temp_pricing_mode: 'per_period' | 'packages' | null;
  temp_unit: RentalTimeUnit | null;
  temp_price_cents: number | null;
  temp_max_units: number | null;
  temp_allow_fraction: boolean;
  temp_packages: TemporaryPackage[] | null;
  renewal_allowed: boolean;
  hours_mode: 'always' | 'daily';
  opens_at: string | null;
  closes_at: string | null;
};

export function rulesFromRow(r: GroupRow): GroupRules {
  return {
    allowsContinuous: r.allows_continuous,
    allowsTemporary: r.allows_temporary,
    monthlyPriceCents: r.monthly_price_cents,
    tempPricingMode: r.temp_pricing_mode,
    tempUnit: r.temp_unit,
    tempPriceCents: r.temp_price_cents,
    tempMaxUnits: r.temp_max_units,
    tempAllowFraction: r.temp_allow_fraction,
    tempPackages: r.temp_packages,
    renewalAllowed: r.renewal_allowed,
    hoursMode: r.hours_mode,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
  };
}

/** Condição SQL de "esta reserva ainda segura a unidade" (prazo de pagamento vencido não conta). */
export const LIVE_BOOKING_SQL = sql`
  b.status IN ('approved', 'awaiting_payment', 'active', 'past_due')
  AND NOT (b.status = 'awaiting_payment' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at <= now())
  AND NOT (b.status = 'past_due' AND b.payment_issue_deadline_at <= now())
`;

/** Grupos ATIVOS do anúncio, em ordem, com unidades ativas e ocupação de agora. */
export async function getSpaceUnitGroups(spaceId: string): Promise<UnitGroupView[]> {
  const grupos = (await db.execute(sql`
    SELECT g.id, g.name, g.position, g.allows_continuous, g.allows_temporary, g.monthly_price_cents,
           g.temp_pricing_mode::text AS temp_pricing_mode, g.temp_unit::text AS temp_unit,
           g.temp_price_cents, g.temp_max_units, g.temp_allow_fraction, g.temp_packages,
           g.renewal_allowed, g.hours_mode::text AS hours_mode,
           g.opens_at::text AS opens_at, g.closes_at::text AS closes_at
      FROM space_unit_groups g
     WHERE g.space_id = ${spaceId} AND g.active
     ORDER BY g.position, g.created_at
  `)) as unknown as GroupRow[];
  if (grupos.length === 0) return [];

  const unidades = (await db.execute(sql`
    SELECT u.id, u.group_id, u.label, u.position,
           EXISTS (
             SELECT 1 FROM bookings b
              WHERE b.unit_id = u.id AND ${LIVE_BOOKING_SQL}
                AND b.starts_at <= now()
                AND (b.occupied_until IS NULL OR b.occupied_until > now())
           ) AS occupied_now,
           NOT EXISTS (
             SELECT 1 FROM bookings b
              WHERE b.unit_id = u.id AND ${LIVE_BOOKING_SQL}
                AND (b.occupied_until IS NULL OR b.occupied_until > now())
           ) AS free_for_monthly
      FROM space_units u
     WHERE u.space_id = ${spaceId} AND u.active
     ORDER BY u.position, u.label
  `)) as unknown as { id: string; group_id: string; label: string; position: number; occupied_now: boolean; free_for_monthly: boolean }[];

  return grupos.map((g) => {
    const doGrupo = unidades.filter((u) => u.group_id === g.id);
    return {
      id: g.id,
      name: g.name,
      position: g.position,
      rules: rulesFromRow(g),
      totalUnits: doGrupo.length,
      occupiedNow: doGrupo.filter((u) => u.occupied_now).length,
      freeForMonthly: doGrupo.filter((u) => u.free_for_monthly).length,
      units: doGrupo.map((u) => ({ id: u.id, label: u.label, position: u.position, occupiedNow: u.occupied_now })),
    };
  });
}

export type UnitsSummary = { total: number; occupiedNow: number; availableNow: number };

export function summarizeUnits(groups: Pick<UnitGroupView, 'totalUnits' | 'occupiedNow'>[]): UnitsSummary {
  const total = groups.reduce((s, g) => s + g.totalUnits, 0);
  const occupiedNow = groups.reduce((s, g) => s + g.occupiedNow, 0);
  return { total, occupiedNow, availableNow: total - occupiedNow };
}

/** Resumo de ocupação de vários anúncios de uma vez (listas do proprietário). */
export async function unitsSummaryBySpace(spaceIds: string[]): Promise<Map<string, UnitsSummary>> {
  const mapa = new Map<string, UnitsSummary>();
  if (spaceIds.length === 0) return mapa;
  const linhas = (await db.execute(sql`
    SELECT u.space_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM bookings b
              WHERE b.unit_id = u.id AND ${LIVE_BOOKING_SQL}
                AND b.starts_at <= now()
                AND (b.occupied_until IS NULL OR b.occupied_until > now())
           ))::int AS occupied
      FROM space_units u
      JOIN space_unit_groups g ON g.id = u.group_id AND g.active
     WHERE u.active AND u.space_id IN (${sql.join(spaceIds.map((id) => sql`${id}`), sql`, `)})
     GROUP BY u.space_id
  `)) as unknown as { space_id: string; total: number; occupied: number }[];
  for (const l of linhas) {
    mapa.set(l.space_id, { total: l.total, occupiedNow: l.occupied, availableNow: l.total - l.occupied });
  }
  return mapa;
}

/** Regras de um grupo específico do anúncio (ativo), para conferir um pedido. */
export async function getGroupRules(spaceId: string, groupId: string): Promise<{ id: string; name: string; rules: GroupRules } | null> {
  const [g] = (await db.execute(sql`
    SELECT g.id, g.name, g.position, g.allows_continuous, g.allows_temporary, g.monthly_price_cents,
           g.temp_pricing_mode::text AS temp_pricing_mode, g.temp_unit::text AS temp_unit,
           g.temp_price_cents, g.temp_max_units, g.temp_allow_fraction, g.temp_packages,
           g.renewal_allowed, g.hours_mode::text AS hours_mode,
           g.opens_at::text AS opens_at, g.closes_at::text AS closes_at
      FROM space_unit_groups g
     WHERE g.space_id = ${spaceId} AND g.id = ${groupId} AND g.active
  `)) as unknown as GroupRow[];
  return g ? { id: g.id, name: g.name, rules: rulesFromRow(g) } : null;
}

/** A cobrança em aberto de uma reserva (a mesma que o "Pagar agora" paga). */
export async function getOpenCharge(bookingId: string) {
  const [cobranca] = await db
    .select({
      id: payments.id,
      method: sql<string>`${payments.method}::text`,
      amountCents: payments.amountCents,
      pixPayload: payments.pixPayload,
      pixQrImage: payments.pixQrImage,
      invoiceUrl: payments.invoiceUrl,
      payerStartedAt: payments.payerStartedAt,
      failureReason: payments.failureReason,
    })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['pending', 'overdue'])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return cobranca ?? null;
}

export type OpenCharge = NonNullable<Awaited<ReturnType<typeof getOpenCharge>>>;

export type PaymentIssue = {
  bookingId: string;
  spaceTitle: string;
  unitLabel: string | null;
  startedAt: Date;
  deadlineAt: Date;
};

/**
 * Aluguéis de quem aluga com pagamento pendente AGORA (Parte 12) — para o
 * aviso ao abrir o app e o ponto no menu "Meus aluguéis". Só o que ainda
 * está no prazo: prazo vencido já não é "pendente", é encerramento (a
 * varredura do banco cuida). Sem escrita: roda em toda página.
 */
export async function listRenterPaymentIssues(renterId: string): Promise<PaymentIssue[]> {
  const linhas = await db
    .select({
      bookingId: bookings.id,
      spaceTitle: spaces.title,
      unitLabel: sql<string | null>`(SELECT u.label FROM space_units u WHERE u.id = ${bookings.unitId})`,
      startedAt: bookings.paymentIssueStartedAt,
      deadlineAt: bookings.paymentIssueDeadlineAt,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(
      eq(bookings.renterId, renterId),
      eq(bookings.status, 'past_due'),
      sql`${bookings.paymentIssueDeadlineAt} > now()`,
    ))
    .orderBy(asc(bookings.paymentIssueDeadlineAt));
  return linhas.flatMap((l) =>
    l.startedAt && l.deadlineAt
      ? [{ bookingId: l.bookingId, spaceTitle: l.spaceTitle, unitLabel: l.unitLabel, startedAt: l.startedAt, deadlineAt: l.deadlineAt }]
      : [],
  );
}

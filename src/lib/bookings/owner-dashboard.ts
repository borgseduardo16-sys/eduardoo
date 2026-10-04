import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

/**
 * Painel simples do proprietário: o que está pendente, o que está rodando e o
 * que entra por mês. Tudo é leitura direta do banco, filtrada pelo dono no
 * próprio WHERE — não existe número "calculado em outro lugar" que possa
 * divergir do que as reservas realmente dizem.
 *
 * "Você recebe" é o líquido (aluguel menos a taxa de serviço) congelado em cada
 * locação (`owner_payout_cents`), nunca recalculado com a taxa de hoje.
 */

export type OwnerOverview = {
  /** Solicitações esperando resposta. */
  pendingRequests: number;
  /** Aceitas, esperando o locatário pagar. */
  awaitingPayment: number;
  /** Locações em andamento ou aguardando a data de início (já pagas). */
  activeRentals: number;
  /** Das ativas, as com pagamento pendente neste momento. */
  pastDue: number;
  /** Soma do líquido mensal das locações ativas. */
  monthlyPayoutCents: number;
  /** Vagas livres e oferecidas nos anúncios no ar. */
  slotsAvailable: number;
  slotsOffered: number;
};

export async function getOwnerOverview(ownerId: string): Promise<OwnerOverview> {
  const [reservas] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status = 'requested')::int AS pending,
           count(*) FILTER (WHERE status IN ('approved', 'awaiting_payment'))::int AS awaiting,
           count(*) FILTER (WHERE status IN ('active', 'past_due'))::int AS active,
           count(*) FILTER (WHERE status = 'past_due')::int AS past_due,
           COALESCE(sum(owner_payout_cents) FILTER (WHERE status IN ('active', 'past_due')), 0)::bigint AS payout
      FROM bookings
     WHERE owner_id = ${ownerId}
  `)) as unknown as { pending: number; awaiting: number; active: number; past_due: number; payout: string | number }[];

  const [vagas] = (await db.execute(sql`
    SELECT COALESCE(sum(quantity_available), 0)::int AS available,
           COALESCE(sum(quantity_offered), 0)::int AS offered
      FROM spaces
     WHERE owner_id = ${ownerId} AND deleted_at IS NULL AND status::text IN ('published', 'rented')
  `)) as unknown as { available: number; offered: number }[];

  return {
    pendingRequests: reservas?.pending ?? 0,
    awaitingPayment: reservas?.awaiting ?? 0,
    activeRentals: reservas?.active ?? 0,
    pastDue: reservas?.past_due ?? 0,
    monthlyPayoutCents: Number(reservas?.payout ?? 0),
    slotsAvailable: vagas?.available ?? 0,
    slotsOffered: vagas?.offered ?? 0,
  };
}

export type UpcomingRenewal = {
  bookingId: string;
  spaceTitle: string;
  dueDate: string;
  ownerPayoutCents: number;
  renterName: string | null;
  pastDue: boolean;
};

/** Próximos vencimentos das locações ativas, do mais perto ao mais longe. */
export async function listUpcomingRenewals(ownerId: string, limit = 5): Promise<UpcomingRenewal[]> {
  const linhas = (await db.execute(sql`
    SELECT b.id AS booking_id, s.title AS space_title, sub.next_due_date::text AS due_date,
           b.owner_payout_cents, p.public_name AS renter_name, (b.status = 'past_due') AS past_due
      FROM bookings b
      JOIN spaces s ON s.id = b.space_id
      JOIN profiles p ON p.id = b.renter_id
      JOIN LATERAL (
        SELECT next_due_date FROM subscriptions x WHERE x.booking_id = b.id ORDER BY x.created_at DESC LIMIT 1
      ) sub ON true
     WHERE b.owner_id = ${ownerId} AND b.status IN ('active', 'past_due') AND sub.next_due_date IS NOT NULL
     ORDER BY sub.next_due_date ASC, b.id
     LIMIT ${limit}
  `)) as unknown as {
    booking_id: string; space_title: string; due_date: string; owner_payout_cents: number; renter_name: string | null; past_due: boolean;
  }[];
  return linhas.map((l) => ({
    bookingId: l.booking_id,
    spaceTitle: l.space_title,
    dueDate: l.due_date,
    ownerPayoutCents: l.owner_payout_cents,
    renterName: l.renter_name,
    pastDue: l.past_due,
  }));
}

export type SpaceBookingCounts = { pending: number; active: number };

/** Pendentes e ativas de cada anúncio, para a lista "Meus espaços" (uma consulta só). */
export async function getSpaceBookingCounts(ownerId: string, spaceIds: string[]): Promise<Map<string, SpaceBookingCounts>> {
  const mapa = new Map<string, SpaceBookingCounts>();
  if (spaceIds.length === 0) return mapa;
  const linhas = (await db.execute(sql`
    SELECT space_id,
           count(*) FILTER (WHERE status = 'requested')::int AS pending,
           count(*) FILTER (WHERE status IN ('active', 'past_due'))::int AS active
      FROM bookings
     WHERE owner_id = ${ownerId} AND space_id IN (${sql.join(spaceIds.map((id) => sql`${id}`), sql`, `)})
     GROUP BY space_id
  `)) as unknown as { space_id: string; pending: number; active: number }[];
  for (const l of linhas) mapa.set(l.space_id, { pending: l.pending, active: l.active });
  return mapa;
}

import 'server-only';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, spaces, profiles, bookingStatus, payments } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';
import { settingInt } from '@/lib/settings';

export type BookingStatus = (typeof bookingStatus.enumValues)[number];

export class BookingNotFoundError extends Error {
  constructor() {
    super('Reserva não encontrada.');
    this.name = 'BookingNotFoundError';
  }
}

/** Status que ainda podem virar uma reserva ativa — usados para achar conflito de disponibilidade. */
export const OCCUPYING_STATUSES = ['approved', 'awaiting_payment', 'active', 'past_due'] as const;

const coverPathExpr = sql<string | null>`(
  SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
  WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
)`;

/**
 * Solicitacoes 'requested' mais velhas que o prazo configurado viram
 * 'expired' — de verdade, gravado no banco, nao so escondido na tela.
 *
 * Chamada no INICIO de toda consulta de lista (proprietario e locatario):
 * e uma varredura preguicosa, disparada por trafego de leitura real, sem
 * precisar de worker agendado. Idempotente — rodar de novo sem nada vencido
 * so nao atualiza linha nenhuma.
 */
export async function expireStaleBookingRequests(): Promise<number> {
  const dias = await settingInt('booking.request_expiry_days', 7);
  const result = await db
    .update(bookings)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(bookings.status, 'requested'),
        lt(bookings.requestedAt, sql`now() - (${dias} || ' days')::interval`),
      ),
    )
    .returning({ id: bookings.id });
  return result.length;
}

/** Espaco visto pela tela de solicitacao — so o que o locatario pode ver antes de reservar. */
export async function getSpaceForBookingRequest(spaceId: string) {
  const [row] = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      ownerId: spaces.ownerId,
      type: sql<string>`${spaces.type}::text`,
      status: sql<string>`${spaces.status}::text`,
      title: spaces.title,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      priceMonthlyCents: spaces.priceMonthlyCents,
      availableFrom: spaces.availableFrom,
      approxLat: latOf(spaces.approxLocation),
      approxLng: lngOf(spaces.approxLocation),
      coverPath: coverPathExpr,
      photoCount: sql<number>`(SELECT count(*)::int FROM space_images si WHERE si.space_id = spaces.id)`,
    })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), isNull(spaces.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** true quando o espaco ja tem uma reserva que ocupa o periodo (aprovada ou alem). */
export async function spaceHasOccupyingBooking(spaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.spaceId, spaceId), inArray(bookings.status, [...OCCUPYING_STATUSES])))
    .limit(1);
  return Boolean(row);
}

/** Solicitacao 'requested' que ESTE locatario ja tem para este espaco, se houver — evita duplicata sem impedir de verdade. */
export async function findPendingRequestBySameRenter(spaceId: string, renterId: string) {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.spaceId, spaceId), eq(bookings.renterId, renterId), eq(bookings.status, 'requested')))
    .limit(1);
  return row ?? null;
}

/**
 * Relacao ATIVA de quem esta vendo a pagina com este espaco — pendente ou
 * aprovada. Usado na pagina publica do anuncio pra decidir entre mostrar
 * "Solicitar aluguel" ou o status do que ja existe, em vez de deixar a
 * pessoa mandar uma segunda solicitacao sem saber que a primeira ainda
 * esta em aberto.
 */
export async function getViewerActiveBookingForSpace(spaceId: string, viewerId: string) {
  const [row] = await db
    .select({ id: bookings.id, status: sql<string>`${bookings.status}::text`, reference: bookings.reference })
    .from(bookings)
    .where(
      and(
        eq(bookings.spaceId, spaceId),
        eq(bookings.renterId, viewerId),
        inArray(bookings.status, ['requested', 'approved']),
      ),
    )
    .limit(1);
  return row ?? null;
}

const listSelection = {
  id: bookings.id,
  reference: bookings.reference,
  status: sql<string>`${bookings.status}::text`,
  ownerId: bookings.ownerId,
  startDate: bookings.startDate,
  endDate: bookings.endDate,
  monthlyRentCents: bookings.monthlyRentCents,
  renterFeeCents: bookings.renterFeeCents,
  ownerFeeCents: bookings.ownerFeeCents,
  totalChargedCents: bookings.totalChargedCents,
  ownerPayoutCents: bookings.ownerPayoutCents,
  renterMessage: bookings.renterMessage,
  ownerResponse: bookings.ownerResponse,
  requestedAt: bookings.requestedAt,
  respondedAt: bookings.respondedAt,
  activatedAt: bookings.activatedAt,
  cancelledAt: bookings.cancelledAt,
  cancellationReason: bookings.cancellationReason,
  endedAt: bookings.endedAt,
  spaceId: spaces.id,
  spaceSlug: spaces.slug,
  spaceTitle: spaces.title,
  spaceType: sql<string>`${spaces.type}::text`,
  spaceDistrict: spaces.district,
  spaceCity: spaces.city,
  spaceCoverPath: coverPathExpr,
};

const latestSubscriptionExpr = sql<string | null>`(
  SELECT status::text FROM subscriptions s
  WHERE s.booking_id = bookings.id ORDER BY s.created_at DESC LIMIT 1
)`;
const nextDueDateExpr = sql<string | null>`(
  SELECT next_due_date FROM subscriptions s
  WHERE s.booking_id = bookings.id ORDER BY s.created_at DESC LIMIT 1
)`;
const lastPaymentStatusExpr = sql<string | null>`(
  SELECT status::text FROM payments p
  WHERE p.booking_id = bookings.id ORDER BY p.due_date DESC LIMIT 1
)`;
const lastPaymentDueDateExpr = sql<string | null>`(
  SELECT due_date FROM payments p
  WHERE p.booking_id = bookings.id ORDER BY p.due_date DESC LIMIT 1
)`;
const lastPaymentAmountExpr = sql<number | null>`(
  SELECT amount_cents FROM payments p
  WHERE p.booking_id = bookings.id ORDER BY p.due_date DESC LIMIT 1
)`;

/**
 * Reservas/solicitacoes do LOCATARIO — para /reservas.
 *
 * Inclui o status REAL de pagamento (assinatura + ultima cobranca) quando
 * existir — sem isso a tela so mostraria o status da reserva, nunca "sua
 * proxima cobranca vence dia X" nem "esse pagamento atrasou de verdade".
 */
export async function listRenterBookings(renterId: string) {
  await expireStaleBookingRequests();
  return db
    .select({
      ...listSelection,
      ownerId: profiles.id,
      ownerName: profiles.fullName,
      subscriptionStatus: latestSubscriptionExpr,
      nextDueDate: nextDueDateExpr,
      lastPaymentStatus: lastPaymentStatusExpr,
      lastPaymentDueDate: lastPaymentDueDateExpr,
      lastPaymentAmountCents: lastPaymentAmountExpr,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(profiles, eq(profiles.id, bookings.ownerId))
    .where(eq(bookings.renterId, renterId))
    .orderBy(desc(bookings.requestedAt));
}

/** Uma reserva do locatario, com checagem de posse embutida na propria consulta. */
export async function getRenterBooking(id: string, renterId: string) {
  const [row] = await db
    .select(listSelection)
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(eq(bookings.id, id), eq(bookings.renterId, renterId)))
    .limit(1);
  return row ?? null;
}

/** Solicitacoes recebidas pelo PROPRIETARIO — para a area "Solicitações". */
export async function listOwnerBookingRequests(ownerId: string, statusFilter?: BookingStatus[]) {
  await expireStaleBookingRequests();
  const condicoes = [eq(bookings.ownerId, ownerId)];
  if (statusFilter?.length) condicoes.push(inArray(bookings.status, statusFilter));

  return db
    .select({
      ...listSelection,
      renterId: profiles.id,
      renterName: profiles.fullName,
      renterAvatarPath: profiles.avatarPath,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(profiles, eq(profiles.id, bookings.renterId))
    .where(and(...condicoes))
    .orderBy(desc(bookings.requestedAt));
}

/** Uma solicitacao do proprietario, com checagem de posse embutida na propria consulta. */
export async function getOwnerBooking(id: string, ownerId: string) {
  const [row] = await db
    .select({
      ...listSelection,
      renterId: profiles.id,
      renterName: profiles.fullName,
      renterAvatarPath: profiles.avatarPath,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(profiles, eq(profiles.id, bookings.renterId))
    .where(and(eq(bookings.id, id), eq(bookings.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** Quantas solicitacoes aguardam resposta — para o contador no menu do proprietario. */
export async function countOwnerPendingRequests(ownerId: string): Promise<number> {
  await expireStaleBookingRequests();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), eq(bookings.status, 'requested')));
  return row?.n ?? 0;
}

/** Outras solicitacoes 'requested' do MESMO espaco, exceto a que acabou de ser decidida — para auto-recusar ao aceitar uma. */
export async function listOtherPendingRequestsForSpace(spaceId: string, excludeBookingId: string) {
  return db
    .select({ id: bookings.id, renterId: bookings.renterId })
    .from(bookings)
    .where(
      and(
        eq(bookings.spaceId, spaceId),
        eq(bookings.status, 'requested'),
        ne(bookings.id, excludeBookingId),
      ),
    );
}

/** Alugueis aceitos do proprietario (aprovados em diante) — para a area financeira. */
export async function listOwnerActiveBookings(ownerId: string) {
  return db
    .select(listSelection)
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.status, ['approved', 'awaiting_payment', 'active', 'past_due'])))
    .orderBy(desc(bookings.respondedAt));
}

/**
 * Pagamentos recebidos pelo proprietario, via a reserva.
 *
 * Hoje sempre vazio de verdade — nao existe nenhum gateway ligado ainda
 * (ver docs/PAGAMENTOS.md). Fica como consulta real, e nao como texto fixo
 * na tela, porque no dia que existir cobranca de verdade isso passa a
 * mostrar sozinho, sem precisar mudar esta pagina.
 */
export async function listOwnerPayments(ownerId: string) {
  return db
    .select({
      id: payments.id,
      status: sql<string>`${payments.status}::text`,
      amountCents: payments.amountCents,
      dueDate: payments.dueDate,
      paidAt: payments.paidAt,
      spaceTitle: spaces.title,
      bookingReference: bookings.reference,
    })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.ownerId, ownerId))
    .orderBy(desc(payments.dueDate));
}

import 'server-only';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
      depositEnabled: spaces.depositEnabled,
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
 * Relacao ATIVA de quem esta vendo a pagina com este espaco — pendente,
 * aprovada ou em andamento. Usado na pagina publica do anuncio pra decidir
 * entre mostrar "Solicitar aluguel" ou o status do que ja existe, em vez de
 * deixar a pessoa mandar uma segunda solicitacao sem saber que a primeira
 * ainda esta em aberto — e, desde a Fase 23, pra quem ESTA alugando o
 * espaco ver o proprio aluguel em vez do convite da lista de espera.
 */
export async function getViewerActiveBookingForSpace(spaceId: string, viewerId: string) {
  const [row] = await db
    .select({ id: bookings.id, status: sql<string>`${bookings.status}::text`, reference: bookings.reference })
    .from(bookings)
    .where(
      and(
        eq(bookings.spaceId, spaceId),
        eq(bookings.renterId, viewerId),
        inArray(bookings.status, ['requested', ...OCCUPYING_STATUSES]),
      ),
    )
    .orderBy(desc(bookings.requestedAt))
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
  depositCents: bookings.depositCents,
  depositChargeStatus: sql<string | null>`(
    SELECT status::text FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
  )`,
  depositReleaseStatus: sql<string | null>`(
    SELECT release_status::text FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
  )`,
  depositInvoiceUrl: sql<string | null>`(
    SELECT invoice_url FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
  )`,
  depositReleasedCents: sql<number | null>`(
    SELECT released_cents FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
  )`,
  depositForfeitedCents: sql<number | null>`(
    SELECT forfeited_cents FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
  )`,
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
const lastPaymentInvoiceUrlExpr = sql<string | null>`(
  SELECT invoice_url FROM payments p
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
      ownerPublicName: profiles.publicName,
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

/**
 * Quem pediu o espaco, visto pelo proprietario (Fase 21): so dado publico —
 * nome publico, foto, verificacoes reais, locacoes concluidas. Telefone e
 * e-mail continuam fora: o contato e pelo chat da plataforma.
 */
const renterPublicSelection = {
  renterId: profiles.id,
  renterPublicName: profiles.publicName,
  renterAvatarPath: profiles.avatarPath,
  renterCreatedAt: profiles.createdAt,
  renterEmailVerified: sql<boolean>`${profiles.emailVerifiedAt} IS NOT NULL`,
  renterPhoneVerified: sql<boolean>`${profiles.phoneVerifiedAt} IS NOT NULL`,
  renterIdentityVerified: sql<boolean>`${profiles.identityVerificationStatus} = 'verified'`,
  renterCompletedBookings: profiles.completedBookingsCount,
};

const renterP = alias(profiles, 'booking_renter');
const ownerP = alias(profiles, 'booking_owner');

function publicPerson(p: typeof renterP | typeof ownerP) {
  return {
    id: p.id,
    publicName: p.publicName,
    avatarPath: p.avatarPath,
    createdAt: p.createdAt,
    emailVerified: sql<boolean>`${p.emailVerifiedAt} IS NOT NULL`,
    phoneVerified: sql<boolean>`${p.phoneVerifiedAt} IS NOT NULL`,
    identityVerified: sql<boolean>`${p.identityVerificationStatus} = 'verified'`,
    completedBookingsCount: p.completedBookingsCount,
    active: sql<boolean>`(${p.status} = 'active' AND ${p.deletedAt} IS NULL)`,
  };
}

/**
 * Pagina da reserva (/reservas/[id], Fase 21) — para QUALQUER uma das duas
 * partes, e so para elas. A posse esta no WHERE: id de reserva alheia
 * devolve null, igual a id inexistente (nao da para descobrir se existe).
 *
 * De cada parte sai so o dado publico (nome publico, foto, verificacoes);
 * telefone e e-mail seguem fora — o contato e pelo chat da plataforma.
 */
export async function getBookingForParticipant(id: string, userId: string) {
  const [row] = await db
    .select({
      ...listSelection,
      renterId: bookings.renterId,
      renterFeeBps: bookings.renterFeeBps,
      ownerFeeBps: bookings.ownerFeeBps,
      subscriptionStatus: latestSubscriptionExpr,
      nextDueDate: nextDueDateExpr,
      lastPaymentStatus: lastPaymentStatusExpr,
      lastPaymentDueDate: lastPaymentDueDateExpr,
      lastPaymentAmountCents: lastPaymentAmountExpr,
      lastPaymentInvoiceUrl: lastPaymentInvoiceUrlExpr,
      depositInvoiceUrl: sql<string | null>`(
        SELECT invoice_url FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
      )`,
      renter: publicPerson(renterP),
      owner: publicPerson(ownerP),
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(renterP, eq(renterP.id, bookings.renterId))
    .innerJoin(ownerP, eq(ownerP.id, bookings.ownerId))
    .where(and(eq(bookings.id, id), or(eq(bookings.renterId, userId), eq(bookings.ownerId, userId))))
    .limit(1);
  if (!row) return null;
  return { ...row, viewerRole: row.renterId === userId ? ('renter' as const) : ('owner' as const) };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingForParticipant>>>;

/** Status em que o locatario ja pode ver o endereco exato: reserva confirmada (paga). */
export const ADDRESS_VISIBLE_STATUSES = ['active', 'past_due'] as const;

/**
 * Endereco EXATO do espaco para o locatario de uma reserva confirmada.
 *
 * O unico caminho de leitura de rua/numero/complemento fora da area do
 * proprio dono. A condicao de status esta no WHERE — nao num `if` depois —
 * para que nenhum chamador consiga pular a regra: antes do primeiro
 * pagamento confirmado, a resposta e simplesmente vazia.
 */
export async function getBookingAddressForRenter(bookingId: string, renterId: string) {
  const [row] = await db
    .select({
      street: spaces.street,
      number: spaces.number,
      complement: spaces.complement,
      district: spaces.district,
      city: spaces.city,
      state: spaces.state,
      postalCode: spaces.postalCode,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.renterId, renterId),
        inArray(bookings.status, [...ADDRESS_VISIBLE_STATUSES]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Solicitacoes recebidas pelo PROPRIETARIO — para a area "Solicitações".
 * `limit`/`offset` opcionais: a tela pagina (Fase 21); sem eles, devolve tudo.
 */
export async function listOwnerBookingRequests(
  ownerId: string,
  statusFilter?: BookingStatus[],
  page?: { limit: number; offset: number },
) {
  await expireStaleBookingRequests();
  const condicoes = [eq(bookings.ownerId, ownerId)];
  if (statusFilter?.length) condicoes.push(inArray(bookings.status, statusFilter));

  const consulta = db
    .select({
      ...listSelection,
      ...renterPublicSelection,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .innerJoin(profiles, eq(profiles.id, bookings.renterId))
    .where(and(...condicoes))
    .orderBy(desc(bookings.requestedAt), desc(bookings.id));

  return page ? consulta.limit(page.limit).offset(page.offset) : consulta;
}

/** Uma solicitacao do proprietario, com checagem de posse embutida na propria consulta. */
export async function getOwnerBooking(id: string, ownerId: string) {
  const [row] = await db
    .select({
      ...listSelection,
      ...renterPublicSelection,
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

/**
 * Reserva mais recente entre este espaço e este locatário (Fase 21) — liga
 * a conversa à reserva correspondente. Quem chama já provou que participa
 * da conversa (e portanto do par espaço/locatário).
 */
export async function findLatestBookingForSpaceAndRenter(spaceId: string, renterId: string) {
  const [row] = await db
    .select({ id: bookings.id, status: sql<string>`${bookings.status}::text`, reference: bookings.reference })
    .from(bookings)
    .where(and(eq(bookings.spaceId, spaceId), eq(bookings.renterId, renterId)))
    .orderBy(desc(bookings.requestedAt))
    .limit(1);
  return row ?? null;
}


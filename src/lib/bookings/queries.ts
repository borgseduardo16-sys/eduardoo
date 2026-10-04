import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { bookings, spaces, profiles, bookingStatus, payments } from '@/db/schema';
import { latOf, lngOf } from '@/db/schema/_types';
import { sweepExpiredBookings } from './maintenance';

export type BookingStatus = (typeof bookingStatus.enumValues)[number];

export class BookingNotFoundError extends Error {
  constructor() {
    super('Reserva não encontrada.');
    this.name = 'BookingNotFoundError';
  }
}

/**
 * Status que OCUPAM uma vaga do anúncio. Igual à função `booking_occupies` do
 * banco (migração 0026) — quem conta as vagas de verdade é o banco; esta
 * lista serve a telas e a consultas que precisam do mesmo critério.
 */
export const OCCUPYING_STATUSES = ['approved', 'awaiting_payment', 'active', 'past_due'] as const;

/** Status de uma solicitação/locação ainda viva (ocupando vaga ou aguardando resposta). */
export const LIVE_STATUSES = ['requested', ...OCCUPYING_STATUSES] as const;

const coverPathExpr = sql<string | null>`(
  SELECT COALESCE(si.thumb_path, si.storage_path) FROM space_images si
  WHERE si.space_id = spaces.id ORDER BY si.position ASC LIMIT 1
)`;

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
      quantityOffered: spaces.quantityOffered,
      quantityAvailable: spaces.quantityAvailable,
      quantityTotal: spaces.quantityTotal,
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
 * Relação VIVA de quem está vendo a página com este espaço — pedido
 * pendente, aceita ou em andamento. Decide entre mostrar "Solicitar aluguel"
 * ou o status do que já existe (e, para quem JÁ aluga, o próprio aluguel em
 * vez do convite da lista de espera).
 */
export async function getViewerActiveBookingForSpace(spaceId: string, viewerId: string) {
  const [row] = await db
    .select({
      id: bookings.id,
      status: sql<string>`${bookings.status}::text`,
      reference: bookings.reference,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.spaceId, spaceId),
        eq(bookings.renterId, viewerId),
        inArray(bookings.status, [...LIVE_STATUSES]),
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
  // ---- Prazos (relógio do banco) ----
  /** Até quando o proprietário responde ao pedido (24 h). */
  responseDeadlineAt: bookings.responseDeadlineAt,
  /** Até quando o locatário paga a locação aceita (24 h). */
  firstPaymentDeadlineAt: bookings.firstPaymentDeadlineAt,
  /** Janela TOTAL de 2 h do pagamento pendente. */
  paymentIssueStartedAt: bookings.paymentIssueStartedAt,
  paymentIssueDeadlineAt: bookings.paymentIssueDeadlineAt,
  endReason: sql<string | null>`${bookings.endReason}::text`,
  subscriptionMethod: sql<string | null>`(
    SELECT method::text FROM subscriptions s
    WHERE s.booking_id = bookings.id ORDER BY s.created_at DESC LIMIT 1
  )`,
  // ---- Pedido de encerramento pendente (feito pelo proprietário) ----
  pendingEndRequestId: sql<string | null>`(
    SELECT r.id FROM booking_end_requests r WHERE r.booking_id = bookings.id AND r.status = 'pending' LIMIT 1
  )`,
  pendingEndDate: sql<string | null>`(
    SELECT r.requested_end_date::text FROM booking_end_requests r WHERE r.booking_id = bookings.id AND r.status = 'pending' LIMIT 1
  )`,
  pendingEndReason: sql<string | null>`(
    SELECT r.reason FROM booking_end_requests r WHERE r.booking_id = bookings.id AND r.status = 'pending' LIMIT 1
  )`,
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
const lastPaymentMethodExpr = sql<string | null>`(
  SELECT method::text FROM payments p
  WHERE p.booking_id = bookings.id ORDER BY p.due_date DESC LIMIT 1
)`;
/** Pagamentos já confirmados desta locação — o histórico "mensalidades pagas". */
const paidCountExpr = sql<number>`(
  SELECT count(*)::int FROM payments p
  WHERE p.booking_id = bookings.id AND p.status IN ('confirmed', 'received')
)`;

/**
 * Reservas/solicitacoes do LOCATARIO — para /reservas.
 *
 * Inclui o status REAL de pagamento (assinatura + ultima cobranca) quando
 * existir — sem isso a tela so mostraria o status da reserva, nunca "sua
 * proxima cobranca vence dia X" nem "esse pagamento atrasou de verdade".
 *
 * Prazo vencido (pedido sem resposta, aceite sem pagamento, pagamento
 * pendente depois de 2 h) é encerrado pelo relógio do banco ANTES de listar.
 */
export async function listRenterBookings(renterId: string) {
  await sweepExpiredBookings();
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
      lastPaymentMethod: lastPaymentMethodExpr,
      paidCount: paidCountExpr,
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
    .select({ ...listSelection, renterFeeBps: bookings.renterFeeBps, nextDueDate: nextDueDateExpr })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(eq(bookings.id, id), eq(bookings.renterId, renterId)))
    .limit(1);
  return row ?? null;
}

/**
 * Quem pediu o espaço, visto pelo proprietário: só dado público — nome
 * público, foto, verificações reais (e-mail, telefone, identidade) e
 * locações concluídas. O telefone em si e o e-mail continuam fora: o contato
 * é pelo chat da plataforma.
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
 * Página da locação (/reservas/[id]) — para QUALQUER uma das duas partes, e
 * só para elas. A posse está no WHERE: id de reserva alheia devolve null,
 * igual a id inexistente (não dá para descobrir se existe).
 *
 * As INSTRUÇÕES DE ACESSO seguem a mesma regra do endereço exato: o
 * proprietário (que as escreveu) vê sempre; o locatário só depois que a
 * locação está confirmada (paga). A condição está dentro da consulta, não num
 * `if` depois — nenhum chamador consegue pular a regra.
 */
export async function getBookingForParticipant(id: string, userId: string) {
  const instrucoesLiberadas = sql`(${bookings.ownerId} = ${userId} OR ${bookings.status} IN ('active', 'past_due'))`;
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
      lastPaymentMethod: lastPaymentMethodExpr,
      paidCount: paidCountExpr,
      depositInvoiceUrl: sql<string | null>`(
        SELECT invoice_url FROM booking_deposits bd WHERE bd.booking_id = bookings.id LIMIT 1
      )`,
      /** Vagas livres do anúncio agora — o proprietário vê se ainda dá para aceitar. */
      spaceQuantityAvailable: spaces.quantityAvailable,
      accessInstructions: sql<string | null>`CASE WHEN ${instrucoesLiberadas} THEN ${bookings.accessInstructions} END`,
      hasAccessAudio: sql<boolean>`(${instrucoesLiberadas} AND ${bookings.accessAudioPath} IS NOT NULL)`,
      accessAudioDurationMs: sql<number | null>`CASE WHEN ${instrucoesLiberadas} THEN ${bookings.accessAudioDurationMs} END`,
      /** O proprietário escreveu instruções (a pessoa que aluga só vê o conteúdo depois do pagamento). */
      accessProvided: sql<boolean>`(${bookings.accessInstructions} IS NOT NULL OR ${bookings.accessAudioPath} IS NOT NULL)`,
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

/** Status em que o locatario ja pode ver o endereco exato (e a rota): locação confirmada (paga). */
export const ADDRESS_VISIBLE_STATUSES = ['active', 'past_due'] as const;

/**
 * Endereço EXATO do espaço para o locatário de uma locação confirmada.
 *
 * O único caminho de leitura de rua/número/complemento (e das coordenadas
 * exatas, para "Traçar rota") fora da área do próprio dono. A condição de
 * status está no WHERE — não num `if` depois — para que nenhum chamador
 * consiga pular a regra: antes do pagamento confirmado, a resposta é
 * simplesmente vazia.
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
      lat: latOf(spaces.location),
      lng: lngOf(spaces.location),
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
 * `limit`/`offset` opcionais: a tela pagina; sem eles, devolve tudo.
 */
export async function listOwnerBookingRequests(
  ownerId: string,
  statusFilter?: BookingStatus[],
  page?: { limit: number; offset: number },
) {
  await sweepExpiredBookings();
  const condicoes = [eq(bookings.ownerId, ownerId)];
  if (statusFilter?.length) condicoes.push(inArray(bookings.status, statusFilter));

  const consulta = db
    .select({
      ...listSelection,
      ...renterPublicSelection,
      nextDueDate: nextDueDateExpr,
      subscriptionStatus: latestSubscriptionExpr,
      lastPaymentStatus: lastPaymentStatusExpr,
      paidCount: paidCountExpr,
      /** Vagas do anúncio agora — o proprietário vê se ainda dá para aceitar. */
      spaceQuantityAvailable: spaces.quantityAvailable,
      spaceQuantityOffered: spaces.quantityOffered,
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
  await sweepExpiredBookings();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), eq(bookings.status, 'requested')));
  return row?.n ?? 0;
}

/** Locações aceitas do proprietário (aprovadas em diante) — para a área financeira. */
export async function listOwnerActiveBookings(ownerId: string) {
  return db
    .select(listSelection)
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.status, [...OCCUPYING_STATUSES])))
    .orderBy(desc(bookings.respondedAt));
}

/**
 * Pagamentos recebidos pelo proprietário, via a reserva.
 *
 * Consulta real, e não texto fixo na tela: o que aparece é o que o gateway
 * confirmou (ver docs/PAGAMENTOS.md).
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
 * Reserva mais recente entre este espaço e este locatário — liga a conversa
 * à reserva correspondente. Quem chama já provou que participa da conversa
 * (e portanto do par espaço/locatário).
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

/**
 * Histórico de pedidos de encerramento de uma locação (do proprietário), do
 * mais recente ao mais antigo. Só quem participa da locação consulta — quem
 * chama já provou isso com `getBookingForParticipant`.
 */
export async function listEndRequests(bookingId: string) {
  return (await db.execute(sql`
    SELECT r.id, r.requested_end_date::text AS "endDate", r.reason, r.status::text AS status,
           r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
      FROM booking_end_requests r
     WHERE r.booking_id = ${bookingId}
     ORDER BY r.created_at DESC
  `)) as unknown as {
    id: string;
    endDate: string;
    reason: string | null;
    status: 'pending' | 'withdrawn' | 'completed';
    createdAt: Date;
    resolvedAt: Date | null;
  }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Caminho (no bucket privado) do áudio das instruções de acesso de uma
 * locação. O proprietário vê sempre; o locatário só com a locação confirmada
 * (`active`/`past_due`) — a regra do pagamento está no WHERE, não num `if`
 * depois. Quem não participa recebe `null`.
 */
export async function accessAudioPathForUser(bookingId: string, userId: string): Promise<string | null> {
  if (!UUID_RE.test(bookingId)) return null;
  const [row] = await db
    .select({ path: bookings.accessAudioPath })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        or(
          eq(bookings.ownerId, userId),
          and(eq(bookings.renterId, userId), inArray(bookings.status, [...ADDRESS_VISIBLE_STATUSES])),
        ),
      ),
    )
    .limit(1);
  return row?.path ?? null;
}

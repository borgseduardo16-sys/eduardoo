'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, spaces, auditLogs, profiles, subscriptions, payments } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { notifyUser, notifyUsers } from '@/lib/notifications/dispatch';
import { computeBookingAmounts } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import * as asaas from '@/lib/payments/asaas';
import { findPendingRequestBySameRenter } from './queries';
import { requestBookingSchema, respondBookingSchema, cancelBookingSchema } from './schemas';
import { buildBookingReference } from './reference';
import { postBookingSystemMessage } from '@/lib/messaging/system';
import { onSpaceBecameUnavailable, onSpaceMaybeAvailableAgain } from '@/lib/spaces/availability-events';
import { getSpaceAvailability, earliestOpenEndedStart, blockCrossedByOpenEndedStart } from '@/lib/spaces/availability';
import { getGroupRules, getSpaceUnitGroups } from '@/lib/rentals/queries';
import { findFreeUnit, lockSpaceAndSweep, pgErrorFrom, rentalRuleMessage } from '@/lib/rentals/booking';
import { brDate, brInstant } from '@/lib/rentals/time';
import { processPaymentOutbox } from '@/lib/rentals/maintenance';
import { unitNounFor } from '@/lib/spaces/types';
import { formatBookingDate } from './format';

export type BookingActionState = {
  ok: boolean;
  message?: string;
  bookingId?: string;
};

async function currentFees() {
  const [renterFeeBps, ownerFeeBps] = await Promise.all([
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
  ]);
  return { renterFeeBps, ownerFeeBps };
}

/**
 * true quando a trigger `bookings_guard_blocked_period` (Fase 23) recusou:
 * o período da reserva cruza um bloqueio de datas do calendário do espaço.
 */
function isBlockedPeriodConflict(err: unknown): boolean {
  const pg = pgErrorFrom(err);
  return pg?.code === '23P01' && pg.constraint_name === 'bookings_period_not_blocked';
}

/**
 * true quando o banco recusou por ocupação: a restrição de exclusão
 * `bookings_unit_no_overlap` (Parte 12 — a unidade já está alugada nesse
 * período) ou o deadlock que duas aprovações simultâneas às vezes viram.
 */
function isOccupancyConflict(err: unknown): boolean {
  const pg = pgErrorFrom(err);
  if (!pg) return false;
  if (pg.code === '23P01' && pg.constraint_name === 'bookings_unit_no_overlap') return true;
  if (pg.code === '40P01') return true; // deadlock_detected
  return false;
}

/** Grupo de aluguel MENSAL do pedido: o escolhido, ou o único que aceita mensal. */
async function resolveContinuousGroup(spaceId: string, groupId: string | null) {
  if (groupId) {
    const g = await getGroupRules(spaceId, groupId);
    return g && g.rules.allowsContinuous && g.rules.monthlyPriceCents != null ? g : null;
  }
  const grupos = (await getSpaceUnitGroups(spaceId)).filter((g) => g.rules.allowsContinuous && g.rules.monthlyPriceCents != null);
  return grupos.length === 1 ? { id: grupos[0]!.id, name: grupos[0]!.name, rules: grupos[0]!.rules } : null;
}

// ---------------------------------------------------------------------------
// Locatario pede (aluguel mensal)
// ---------------------------------------------------------------------------

/**
 * Cria uma solicitacao de aluguel MENSAL (contínuo).
 *
 * O navegador manda so `spaceId`, o grupo, a data pretendida e uma mensagem
 * opcional. Preco, taxas e totais sao SEMPRE recalculados aqui (a partir do
 * preço mensal do grupo) — nunca aceitos do cliente — e o banco confere de
 * novo (`bookings_rent_matches_group`). A unidade é escolhida no aceite.
 */
export async function requestBookingAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = requestBookingSchema.safeParse({
    spaceId: formData.get('spaceId'),
    startDate: formData.get('startDate'),
    renterMessage: formData.get('renterMessage') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { spaceId, startDate, renterMessage } = parsed.data;
  const groupIdBruto = String(formData.get('groupId') ?? '');
  const groupId = /^[0-9a-f-]{36}$/i.test(groupIdBruto) ? groupIdBruto : null;

  const [space] = await db
    .select({
      id: spaces.id,
      ownerId: spaces.ownerId,
      status: spaces.status,
      title: spaces.title,
      type: spaces.type,
      deletedAt: spaces.deletedAt,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  if (!space || space.deletedAt || space.status !== 'published') {
    return { ok: false, message: 'Este espaço não está disponível para solicitação agora.' };
  }
  if (space.ownerId === user.id) {
    return { ok: false, message: 'Você não pode solicitar o próprio espaço.' };
  }

  const grupo = await resolveContinuousGroup(space.id, groupId);
  if (!grupo) {
    return { ok: false, message: 'Escolha um grupo de aluguel mensal deste anúncio.' };
  }
  const noun = unitNounFor(space.type);

  /*
   * Disponibilidade de verdade (Fase 23): a data pedida respeita "disponível
   * a partir de" e os bloqueios do calendário. Como o aluguel é mensal e sem
   * data para terminar, ele ocupa a unidade da data de início em diante —
   * um bloqueio futuro também impede começar antes dele.
   */
  const disponibilidade = await getSpaceAvailability(space.id);
  if (!disponibilidade?.openForRequests) {
    return { ok: false, message: 'Este espaço não está disponível para solicitação agora.' };
  }
  const hoje = brDate(new Date());
  const inicioMinimo = earliestOpenEndedStart({
    today: hoje,
    availableFrom: disponibilidade.availableFrom,
    blocks: disponibilidade.upcomingBlocks,
  });
  if (startDate < inicioMinimo) {
    const bloqueio = blockCrossedByOpenEndedStart(startDate, disponibilidade.upcomingBlocks);
    return {
      ok: false,
      message: bloqueio
        ? `O espaço está indisponível de ${formatBookingDate(bloqueio.startsOn)} a ${formatBookingDate(bloqueio.endsOn)}. Como o aluguel é mensal e sem data para terminar, a data de início mais próxima é ${formatBookingDate(inicioMinimo)}.`
        : `Este espaço fica disponível a partir de ${formatBookingDate(inicioMinimo)}.`,
    };
  }

  // Parte 12: precisa existir unidade do grupo livre da data pedida em diante.
  const livre = await findFreeUnit(db, grupo.id, brInstant(startDate, '00:00'), null);
  if (!livre) {
    return {
      ok: false,
      message: `Todas as ${noun.plural} ${grupo.name === 'Padrão' ? 'deste anúncio' : `de "${grupo.name}"`} estão ocupadas a partir dessa data.`,
    };
  }

  const jaTemPendente = await findPendingRequestBySameRenter(spaceId, user.id);
  if (jaTemPendente) {
    return { ok: false, message: 'Você já tem uma solicitação pendente para este espaço.' };
  }

  const fees = await currentFees();
  let amounts;
  try {
    amounts = computeBookingAmounts(grupo.rules.monthlyPriceCents!, fees);
  } catch {
    return { ok: false, message: 'Não foi possível calcular os valores deste anúncio agora.' };
  }

  let bookingId: string | undefined;
  for (let tentativa = 0; tentativa < 3 && !bookingId; tentativa++) {
    try {
      const [row] = await db
        .insert(bookings)
        .values({
          reference: buildBookingReference(),
          spaceId: space.id,
          renterId: user.id,
          ownerId: space.ownerId,
          status: 'requested',
          kind: 'continuous',
          groupId: grupo.id,
          startDate,
          monthlyRentCents: amounts.monthlyRentCents,
          renterFeeBps: amounts.renterFeeBps,
          ownerFeeBps: amounts.ownerFeeBps,
          renterFeeCents: amounts.renterFeeCents,
          ownerFeeCents: amounts.ownerFeeCents,
          totalChargedCents: amounts.totalChargedCents,
          ownerPayoutCents: amounts.ownerPayoutCents,
          renterMessage: renterMessage || null,
        })
        .returning({ id: bookings.id });
      bookingId = row!.id;
    } catch (err) {
      // Colisao no codigo de referencia (raríssima): tenta outro. Qualquer
      // outro erro (ex.: bookings_distinct_parties) sobe de verdade.
      const pg = pgErrorFrom(err);
      if (pg?.code === '23505' && pg.constraint_name === 'bookings_reference_key') {
        continue;
      }
      const msg = rentalRuleMessage(err, noun);
      if (msg) return { ok: false, message: msg };
      throw err;
    }
  }
  if (!bookingId) {
    return { ok: false, message: 'Não foi possível registrar a solicitação. Tente novamente.' };
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'booking.requested',
    entityType: 'booking',
    entityId: bookingId,
    metadata: { spaceId: space.id, startDate, groupId: grupo.id },
  });

  await notifyUser(db, {
    userId: space.ownerId,
    type: 'booking_requested',
    title: 'Nova solicitação de aluguel',
    body: `${user.publicName ?? 'Alguém'} quer alugar "${space.title}"${grupo.name === 'Padrão' ? '' : ` (${grupo.name})`}.`,
    linkPath: `/meus-espacos/solicitacoes?filtro=pendentes#reserva-${bookingId}`,
    data: { bookingId }, dedupeKey: `booking_requested:${bookingId}`,
  });

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');

  /*
   * Redireciona AQUI, no servidor — nao com `router.push` num useEffect do
   * cliente escutando `state.ok`. O Next.js atualiza a rota atual sozinho
   * depois de toda Server Action; como a pagina de solicitar decide o que
   * mostrar consultando se ja existe uma solicitacao, esse refresh trocaria
   * o formulario antes do efeito rodar. `redirect()` evita a corrida.
   */
  redirect(`/reservas/${bookingId}?enviada=1`);
}

// ---------------------------------------------------------------------------
// Proprietario responde
// ---------------------------------------------------------------------------

export async function respondToBookingRequestAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = respondBookingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    decision: formData.get('decision'),
    ownerResponse: formData.get('ownerResponse') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, decision, ownerResponse } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      spaceId: bookings.spaceId,
      status: bookings.status,
      groupId: bookings.groupId,
      startDate: bookings.startDate,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || booking.ownerId !== user.id) {
    return { ok: false, message: 'Solicitação não encontrada.' };
  }
  if (booking.status !== 'requested') {
    return { ok: false, message: 'Esta solicitação já foi respondida.' };
  }

  if (decision === 'reject') {
    await db
      .update(bookings)
      .set({ status: 'rejected', ownerResponse: ownerResponse || null, respondedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'requested')));

    await db.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.rejected',
      entityType: 'booking', entityId: bookingId,
    });
    await notifyUser(db, {
      userId: booking.renterId, type: 'booking_rejected', title: 'Solicitação recusada',
      body: 'O proprietário não aceitou sua solicitação desta vez.', linkPath: `/reservas/${bookingId}`,
      data: { bookingId }, dedupeKey: `booking_rejected:${bookingId}`,
    });

    revalidatePath('/meus-espacos/solicitacoes');
    revalidatePath('/reservas');
    return { ok: true, bookingId };
  }

  // --- aceitar ---
  const [space] = await db
    .select({
      id: spaces.id, status: spaces.status, type: spaces.type,
      title: spaces.title, deletedAt: spaces.deletedAt, depositEnabled: spaces.depositEnabled,
    })
    .from(spaces)
    .where(eq(spaces.id, booking.spaceId))
    .limit(1);
  if (!space || space.deletedAt) {
    return { ok: false, message: 'Este espaço não existe mais.' };
  }
  const noun = unitNounFor(space.type);

  // Solicitações anteriores à Parte 12 não tinham grupo: vale o único mensal.
  const grupo = await resolveContinuousGroup(space.id, booking.groupId);
  if (!grupo) {
    return { ok: false, message: 'O grupo desta solicitação não aceita mais aluguel mensal. Recuse e combine pelo chat.' };
  }

  const fees = await currentFees();
  let amounts;
  try {
    amounts = computeBookingAmounts(grupo.rules.monthlyPriceCents!, fees);
  } catch {
    return { ok: false, message: 'Não foi possível calcular os valores deste anúncio agora.' };
  }
  // Congelado no aceite, como todo o resto — 1x o aluguel mensal do grupo, nunca um valor digitado por alguém.
  const depositCents = space.depositEnabled ? amounts.monthlyRentCents : 0;

  let preteridos: { id: string; renterId: string }[] = [];
  let unidade: { id: string; label: string } | null = null;
  try {
    await db.transaction(async (tx) => {
      await lockSpaceAndSweep(tx, space.id);
      unidade = await findFreeUnit(tx, grupo.id, brInstant(booking.startDate, '00:00'), null);
      if (!unidade) throw new Error('LOTADO');

      const atualizadas = await tx
        .update(bookings)
        .set({
          status: 'approved',
          groupId: grupo.id,
          unitId: unidade.id,
          monthlyRentCents: amounts.monthlyRentCents,
          renterFeeBps: amounts.renterFeeBps,
          ownerFeeBps: amounts.ownerFeeBps,
          renterFeeCents: amounts.renterFeeCents,
          ownerFeeCents: amounts.ownerFeeCents,
          totalChargedCents: amounts.totalChargedCents,
          ownerPayoutCents: amounts.ownerPayoutCents,
          depositCents,
          termsSnapshot: {
            renterFeeBps: amounts.renterFeeBps, ownerFeeBps: amounts.ownerFeeBps,
            priceMonthlyCentsAtAccept: amounts.monthlyRentCents, group: grupo.name, unit: unidade.label,
          },
          ownerResponse: ownerResponse || null,
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        // Trava dupla: WHERE status='requested' garante que ninguem aceitou/recusou
        // essa MESMA solicitacao entre a leitura e a escrita (segunda aba, duplo clique).
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'requested')))
        .returning({ id: bookings.id });

      if (atualizadas.length === 0) {
        throw new Error('CONCORRENCIA: a solicitação já não estava mais pendente.');
      }

      // Com unidades (Parte 12), quem mais pediu só perde a vez quando o
      // GRUPO lotou — com vaga sobrando, a solicitação continua de pé. De
      // forma explícita: o motivo fica na linha e cada um é avisado.
      const aindaLivre = await findFreeUnit(tx, grupo.id, brInstant(booking.startDate, '00:00'), null);
      if (!aindaLivre) {
        preteridos = await tx
          .select({ id: bookings.id, renterId: bookings.renterId })
          .from(bookings)
          .where(and(
            eq(bookings.spaceId, space.id),
            eq(bookings.status, 'requested'),
            ne(bookings.id, bookingId),
            or(eq(bookings.groupId, grupo.id), isNull(bookings.groupId)),
          ));
        if (preteridos.length > 0) {
          await tx
            .update(bookings)
            .set({
              status: 'rejected',
              ownerResponse: `Todas as ${noun.plural} foram alugadas.`,
              respondedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(inArray(bookings.id, preteridos.map((o) => o.id)));
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'LOTADO') {
      return {
        ok: false,
        message: `Nenhuma ${noun.singular} ${grupo.name === 'Padrão' ? '' : `de "${grupo.name}" `}fica livre a partir de ${formatBookingDate(booking.startDate)}. Recuse ou combine outra data pelo chat.`,
      };
    }
    if (isOccupancyConflict(err)) {
      return { ok: false, message: `Esta ${noun.singular} acabou de ser alugada por outra pessoa. Tente aceitar de novo.` };
    }
    if (isBlockedPeriodConflict(err)) {
      return {
        ok: false,
        message:
          'O calendário deste espaço tem datas bloqueadas depois do início pedido. Como o aluguel é mensal e sem data para terminar, desfaça o bloqueio no calendário antes de aceitar.',
      };
    }
    if (err instanceof Error && err.message.startsWith('CONCORRENCIA')) {
      return { ok: false, message: 'Esta solicitação já foi respondida em outra aba ou dispositivo.' };
    }
    const msg = rentalRuleMessage(err, noun);
    if (msg) return { ok: false, message: msg };
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id, actorRole: user.role, action: 'booking.approved',
    entityType: 'booking', entityId: bookingId,
    metadata: {
      totalChargedCents: amounts.totalChargedCents, ownerPayoutCents: amounts.ownerPayoutCents,
      groupId: grupo.id, unitId: (unidade as { id: string } | null)?.id ?? null,
    },
  });
  await notifyUser(db, {
    userId: booking.renterId, type: 'booking_approved', title: 'Solicitação aceita!',
    body: `O proprietário aceitou sua solicitação para "${space.title}". Confirme o pagamento para garantir o espaço.`,
    linkPath: `/reservas/${bookingId}`,
    data: { bookingId }, dedupeKey: `booking_approved:${bookingId}`,
  });

  if (preteridos.length > 0) {
    await notifyUsers(
      db,
      preteridos.map((p) => ({
        userId: p.renterId,
        type: 'booking_rejected' as const,
        title: 'Solicitação recusada',
        body: `Todas as ${noun.plural} de "${space.title}" foram alugadas.`,
        linkPath: `/reservas/${p.id}`,
        data: { bookingId: p.id },
        dedupeKey: `booking_rejected:${p.id}`,
      })),
    );
  }

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');
  revalidatePath('/espacos');

  // Fase 23: se o banco marcou o espaço como alugado (todas as unidades),
  // quem favoritou fica sabendo (menos quem acabou de alugar). Best-effort.
  await onSpaceBecameUnavailable(booking.spaceId, [booking.renterId]);

  // A partir de uma reserva aceita, as duas partes quase sempre precisam
  // combinar algo (acesso, horário) — por isso cria a conversa se ainda não
  // existir, diferente do cancelamento (ver postBookingSystemMessage).
  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: space.title,
    actorId: user.id,
    recipientId: booking.renterId,
    body: 'Reserva aceita. A partir de agora vocês podem combinar os detalhes por aqui.',
    createIfMissing: true,
  });

  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// Cancelar (antes de o aluguel começar a valer)
// ---------------------------------------------------------------------------

/**
 * Cancela uma solicitação ou reserva que ainda não está em andamento.
 *
 * Locatário: a própria, em 'requested', 'approved' ou 'awaiting_payment'
 * (desistiu antes de pagar). Proprietário: só em 'approved' (o combinado
 * caiu por terra) — para 'requested' o caminho é recusar.
 *
 * Se já existe cobrança no gateway (assinatura do mensal), ela é cancelada
 * no Asaas ANTES de qualquer mudança aqui: se o Asaas recusar, nada muda e
 * a pessoa vê o motivo. Cobrança avulsa do temporário fica marcada para
 * exclusão e é excluída na hora (e repetida pelo agendador se falhar).
 */
export async function cancelBookingAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = cancelBookingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, reason } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      status: bookings.status,
      kind: bookings.kind,
      spaceId: bookings.spaceId,
      spaceTitle: spaces.title,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || (booking.ownerId !== user.id && booking.renterId !== user.id)) {
    return { ok: false, message: 'Reserva não encontrada.' };
  }

  const souLocatario = booking.renterId === user.id;
  const podeCancelar = souLocatario
    ? booking.status === 'requested' || booking.status === 'approved' || booking.status === 'awaiting_payment'
    : booking.status === 'approved';

  if (!podeCancelar) {
    return { ok: false, message: 'Esta reserva não pode mais ser cancelada por aqui.' };
  }

  // Mensal aguardando pagamento: a assinatura já existe no Asaas.
  const [assinatura] = await db
    .select({ id: subscriptions.id, providerSubscriptionId: subscriptions.providerSubscriptionId, status: subscriptions.status })
    .from(subscriptions)
    .where(and(eq(subscriptions.bookingId, bookingId), inArray(subscriptions.status, ['pending_authorization', 'active', 'past_due', 'paused'])))
    .limit(1);
  if (assinatura?.providerSubscriptionId) {
    try {
      await asaas.cancelSubscription(assinatura.providerSubscriptionId);
    } catch (err) {
      if (!(err instanceof asaas.AsaasError && err.status === 404)) {
        if (err instanceof asaas.AsaasError) {
          return { ok: false, message: `Não foi possível cancelar a cobrança no gateway: ${err.message}` };
        }
        throw err;
      }
    }
  }

  const atualizadas = await db.transaction(async (tx) => {
    const linhas = await tx
      .update(bookings)
      .set({
        status: 'cancelled',
        endReason: souLocatario ? 'cancelled_by_renter' : 'cancelled_by_owner',
        cancelledAt: new Date(),
        cancelledBy: user.id,
        cancellationReason: reason || null,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['requested', 'approved', 'awaiting_payment'])))
      .returning({ id: bookings.id });
    if (linhas.length === 0) return 0;

    if (assinatura) {
      await tx
        .update(subscriptions)
        .set({ status: 'cancelled', cancelledAt: new Date(), providerCancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, assinatura.id));
    }
    // Cobrança em aberto que não deve mais ser paga (temporário): exclusão no gateway.
    await tx
      .update(payments)
      .set({ deleteRequestedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(payments.bookingId, bookingId),
        inArray(payments.status, ['pending', 'overdue']),
        isNull(payments.deleteRequestedAt),
        isNull(payments.subscriptionId),
      ));
    await tx.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.cancelled',
      entityType: 'booking', entityId: bookingId, metadata: { kind: booking.kind, previousStatus: booking.status },
    });
    return linhas.length;
  });
  if (atualizadas === 0) {
    return { ok: false, message: 'Esta reserva mudou de situação agora há pouco. Recarregue a página.' };
  }

  // Exclui na hora a cobrança que não vale mais; se falhar, o agendador tenta de novo.
  await processPaymentOutbox({ bookingId }).catch((err) => console.error('[cancelar] outbox:', err));

  const outraParte = souLocatario ? booking.ownerId : booking.renterId;
  const [autor] = await db.select({ publicName: profiles.publicName }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  await notifyUser(db, {
    userId: outraParte, type: 'booking_cancelled', title: 'Reserva cancelada',
    body: `${autor?.publicName ?? 'A outra parte'} cancelou esta reserva.`, linkPath: `/reservas/${bookingId}`,
    data: { bookingId }, dedupeKey: `booking_cancelled:${bookingId}`,
  });

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');
  revalidatePath('/espacos');

  // Fase 23: cancelar uma reserva aceita pode devolver o espaço ao ar
  // (trigger no banco) — lista de espera e favoritos ficam sabendo.
  await onSpaceMaybeAvailableAgain(booking.spaceId);

  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: booking.spaceTitle,
    actorId: user.id,
    recipientId: outraParte,
    body: `Reserva cancelada por ${autor?.publicName ?? 'a outra parte'}.`,
    createIfMissing: false,
  });

  return { ok: true, bookingId };
}

/**
 * Encerra um aluguel MENSAL em andamento ('active' ou 'past_due') — o
 * "Cancelar aluguel" da Parte 12, imediato: recorrência cancelada no Asaas
 * (o DELETE da assinatura também remove a cobrança em aberto ou vencida),
 * aluguel encerrado, unidade liberada, histórico com o motivo.
 *
 * A assinatura é cancelada no gateway ANTES de qualquer escrita no banco —
 * se o Asaas recusar, nada muda por aqui, e a pessoa não sai da tela achando
 * que parou de pagar quando na verdade não parou. Um 404 (assinatura já
 * cancelada de outro jeito) é tratado como sucesso, não como erro.
 */
export async function endBookingAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = cancelBookingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, reason } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      status: bookings.status,
      kind: bookings.kind,
      spaceId: bookings.spaceId,
      spaceTitle: spaces.title,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || (booking.ownerId !== user.id && booking.renterId !== user.id)) {
    return { ok: false, message: 'Reserva não encontrada.' };
  }

  if (booking.kind !== 'continuous' || (booking.status !== 'active' && booking.status !== 'past_due')) {
    return { ok: false, message: 'Só é possível encerrar um aluguel mensal em andamento.' };
  }

  const souLocatario = booking.renterId === user.id;

  const [assinatura] = await db
    .select({ id: subscriptions.id, providerSubscriptionId: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.bookingId, bookingId))
    .orderBy(sql`${subscriptions.createdAt} DESC`)
    .limit(1);

  if (assinatura?.providerSubscriptionId) {
    try {
      await asaas.cancelSubscription(assinatura.providerSubscriptionId);
    } catch (err) {
      if (err instanceof asaas.AsaasError && err.status === 404) {
        // Já não existe mais no gateway — segue como se tivesse cancelado agora.
      } else if (err instanceof asaas.AsaasError) {
        console.error('[bookings] Asaas recusou o cancelamento da assinatura:', err.status, err.body);
        return { ok: false, message: `Não foi possível cancelar a cobrança no gateway: ${err.message}` };
      } else {
        throw err;
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        status: 'ended',
        endReason: souLocatario ? 'cancelled_by_renter' : 'cancelled_by_owner',
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['active', 'past_due'])));

    if (assinatura) {
      await tx
        .update(subscriptions)
        .set({ status: 'cancelled', cancelledAt: new Date(), providerCancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, assinatura.id));
    }

    await tx.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.ended',
      entityType: 'booking', entityId: bookingId,
      metadata: { reason: reason ?? null, previousStatus: booking.status, by: souLocatario ? 'renter' : 'owner' },
    });
  });

  const outraParte = souLocatario ? booking.ownerId : booking.renterId;
  const [autor] = await db.select({ publicName: profiles.publicName }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  // A outra parte fica sabendo do encerramento (categoria reservas — essencial)
  // e, no mesmo aviso, que já pode avaliar. Quem encerrou recebe só o
  // "avaliação disponível" (categoria avaliações). Uma notificação por
  // pessoa, nunca duas pelo mesmo evento.
  await notifyUsers(db, [
    {
      userId: outraParte, type: 'booking_cancelled', title: 'Aluguel encerrado',
      body: `${autor?.publicName ?? 'A outra parte'} encerrou o aluguel de "${booking.spaceTitle}". Conte como foi: a avaliação já está disponível.`,
      linkPath: `/reservas/${bookingId}`, data: { bookingId }, dedupeKey: `booking_ended:${bookingId}`,
    },
    {
      userId: user.id, type: 'review_available', title: 'Avaliação disponível',
      body: `Conte como foi o aluguel de "${booking.spaceTitle}" — sua avaliação ajuda as próximas pessoas.`,
      linkPath: `/reservas/${bookingId}`, data: { bookingId }, dedupeKey: `review_available:${bookingId}`,
    },
  ]);

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/meus-espacos/financeiro');
  revalidatePath('/reservas');
  revalidatePath('/espacos');

  // Fase 23: o aluguel acabou e o espaço pode ter voltado ao ar (trigger no
  // banco) — quem estava na lista de espera é avisado. Best-effort.
  await onSpaceMaybeAvailableAgain(booking.spaceId);

  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: booking.spaceTitle,
    actorId: user.id,
    recipientId: outraParte,
    body: `Aluguel encerrado por ${autor?.publicName ?? 'a outra parte'}.`,
    createIfMissing: false,
  });

  return { ok: true, bookingId };
}

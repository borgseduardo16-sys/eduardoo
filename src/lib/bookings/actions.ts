'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, bookingEndRequests, spaces, auditLogs, profiles, subscriptions, payments } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { notifyUser, notifyUsers } from '@/lib/notifications/dispatch';
import { computeBookingAmounts, InvalidAmountError } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import * as asaas from '@/lib/payments/asaas';
import { isBlockedBetween } from '@/lib/safety/queries';
import { postBookingSystemMessage } from '@/lib/messaging/system';
import { findConversation } from '@/lib/messaging/queries';
import { isPathInConversation, readChatAudio } from '@/lib/messaging/audio';
import { onSpaceBecameUnavailable, onSpaceMaybeAvailableAgain } from '@/lib/spaces/availability-events';
import { blockCoveringStart, earliestStartDate, listUpcomingBlocks } from '@/lib/spaces/availability';
import { addDaysToDate, brDate } from '@/lib/time';
import { findPendingRequestBySameRenter } from './queries';
import {
  ACCESS_INSTRUCTIONS_MIN,
  cancelBookingSchema,
  requestBookingSchema,
  requestEndSchema,
  respondBookingSchema,
  withdrawEndRequestSchema,
} from './schemas';
import { buildBookingReference } from './reference';
import { bookingRuleMessage, pgErrorFrom } from './errors';
import { formatBookingDate, formatDateShort } from './format';
import { formatDeadline } from './deadlines';
import { processPaymentOutbox } from './maintenance';

export type BookingActionState = {
  ok: boolean;
  message?: string;
  bookingId?: string;
};

/** Recusa de negócio dentro de uma transação: vira mensagem para a pessoa, sem detalhe técnico. */
class RegraDeNegocio extends Error {}

async function currentFees() {
  const [renterFeeBps, ownerFeeBps] = await Promise.all([
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
  ]);
  return { renterFeeBps, ownerFeeBps };
}

/**
 * Antes de olhar vagas de um anúncio, encerra o que já venceu nele: um pedido
 * sem resposta ou um aceite sem pagamento pode estar segurando a última vaga.
 * Pelo relógio do banco, nunca pelo do servidor da aplicação.
 */
async function sweepSpace(spaceId: string): Promise<void> {
  await db.execute(sql`SELECT public.release_expired_rentals(${spaceId})`);
}

// ---------------------------------------------------------------------------
// Locatário solicita (aluguel MENSAL de uma unidade do anúncio)
// ---------------------------------------------------------------------------

/**
 * Cria uma SOLICITAÇÃO de locação mensal. Nada é cobrado aqui.
 *
 * O navegador manda só `spaceId`, a data de início e uma mensagem opcional.
 * Preço, taxas e totais são SEMPRE calculados aqui (a partir do preço mensal
 * do anúncio) — nunca aceitos do cliente — e o banco confere de novo
 * (`bookings_rent_matches_space`). O proprietário tem 24 horas para aceitar ou
 * recusar; o prazo é gravado pelo banco e o que passar dele expira sozinho.
 *
 * Pedir NÃO consome vaga: vários interessados podem pedir ao mesmo tempo. A
 * vaga é consumida quando o proprietário aceita — e é o banco quem garante
 * que a última não é aceita duas vezes (`bookings_capacity`).
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

  await sweepSpace(spaceId);

  const [space] = await db
    .select({
      id: spaces.id,
      ownerId: spaces.ownerId,
      status: spaces.status,
      title: spaces.title,
      priceMonthlyCents: spaces.priceMonthlyCents,
      availableFrom: spaces.availableFrom,
      quantityAvailable: spaces.quantityAvailable,
      deletedAt: spaces.deletedAt,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);

  if (!space || space.deletedAt || (space.status !== 'published' && space.status !== 'rented')) {
    return { ok: false, message: 'Este espaço não está disponível para solicitação agora.' };
  }
  if (space.ownerId === user.id) {
    return { ok: false, message: 'Você não pode solicitar o próprio espaço.' };
  }
  if (await isBlockedBetween(user.id, space.ownerId)) {
    return { ok: false, message: 'Não é possível enviar esta solicitação.' };
  }
  if (space.status === 'rented' || space.quantityAvailable <= 0) {
    return {
      ok: false,
      message: 'Todas as vagas deste anúncio estão ocupadas agora. Peça um aviso para saber quando abrir uma.',
    };
  }
  if (space.priceMonthlyCents == null) {
    return { ok: false, message: 'Este anúncio ainda não tem preço mensal definido.' };
  }

  // Data de início: hoje (Brasília) em diante, dentro do limite de antecedência,
  // depois de "disponível a partir de" e fora dos dias que o proprietário bloqueou.
  const hoje = brDate(new Date());
  const maxDias = await settingInt('booking.max_start_advance_days', 90);
  if (startDate < hoje) {
    return { ok: false, message: 'A data de início não pode ser no passado.' };
  }
  if (startDate > addDaysToDate(hoje, maxDias)) {
    return { ok: false, message: `Escolha uma data de início dentro dos próximos ${maxDias} dias.` };
  }
  const bloqueios = await listUpcomingBlocks(space.id);
  const inicioMinimo = earliestStartDate({ today: hoje, availableFrom: space.availableFrom, blocks: bloqueios });
  if (space.availableFrom && startDate < space.availableFrom) {
    return { ok: false, message: `Este espaço fica disponível a partir de ${formatBookingDate(space.availableFrom)}.` };
  }
  const bloqueio = blockCoveringStart(startDate, bloqueios);
  if (bloqueio) {
    return {
      ok: false,
      message: `O proprietário não inicia locações de ${formatBookingDate(bloqueio.startsOn)} a ${formatBookingDate(bloqueio.endsOn)}. A primeira data possível é ${formatBookingDate(inicioMinimo)}.`,
    };
  }

  if (await findPendingRequestBySameRenter(spaceId, user.id)) {
    return { ok: false, message: 'Você já tem uma solicitação pendente para este espaço.' };
  }

  let amounts;
  try {
    amounts = computeBookingAmounts(space.priceMonthlyCents, await currentFees());
  } catch (err) {
    if (err instanceof InvalidAmountError) {
      return { ok: false, message: 'Não foi possível calcular os valores deste anúncio agora.' };
    }
    throw err;
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
      // Colisão no código de referência (raríssima): tenta outro. Qualquer
      // outra recusa do banco vira mensagem; o que não é regra conhecida sobe.
      const pg = pgErrorFrom(err);
      if (pg?.code === '23505' && pg.constraint_name === 'bookings_reference_key') continue;
      const msg = bookingRuleMessage(err);
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
    metadata: { spaceId: space.id, startDate },
  });

  await notifyUser(db, {
    userId: space.ownerId,
    type: 'booking_requested',
    title: 'Nova solicitação de locação',
    body: `${user.publicName ?? 'Alguém'} quer alugar "${space.title}" a partir de ${formatBookingDate(startDate)}. Você tem 24 horas para aceitar ou recusar.`,
    linkPath: `/meus-espacos/solicitacoes?filtro=pendentes#reserva-${bookingId}`,
    data: { bookingId },
    dedupeKey: `booking_requested:${bookingId}`,
  });

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');

  /*
   * Redireciona AQUI, no servidor — não com `router.push` num useEffect do
   * cliente escutando `state.ok`. O Next.js atualiza a rota atual sozinho
   * depois de toda Server Action; como a página de solicitar decide o que
   * mostrar consultando se já existe uma solicitação, esse refresh trocaria
   * o formulário antes do efeito rodar. `redirect()` evita a corrida.
   */
  redirect(`/reservas/${bookingId}?enviada=1`);
}

// ---------------------------------------------------------------------------
// Proprietário responde
// ---------------------------------------------------------------------------

/**
 * O proprietário aceita ou recusa um pedido.
 *
 * ACEITAR exige instruções de acesso (texto de 10 a 1000 caracteres e/ou
 * áudio): é o que o locatário precisa para achar e usar o espaço, e só
 * aparece para ele depois do pagamento. O aceite acontece numa transação que
 * TRAVA o anúncio, encerra o que já venceu nele e então grava — o gatilho
 * `bookings_guard_capacity` recusa se, no instante exato, não sobrar vaga
 * (duas pessoas aceitas ao mesmo tempo para a última vaga: uma passa).
 * Quando a última vaga é preenchida, os demais pedidos pendentes são
 * recusados e avisados; com vaga sobrando, continuam de pé.
 */
export async function respondToBookingRequestAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = respondBookingSchema.safeParse({
    bookingId: formData.get('bookingId'),
    decision: formData.get('decision'),
    ownerResponse: formData.get('ownerResponse') || undefined,
    accessInstructions: formData.get('accessInstructions') || undefined,
    accessAudioPath: formData.get('accessAudioPath') || undefined,
    accessAudioDurationMs: formData.get('accessAudioDurationMs') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, decision, ownerResponse, accessInstructions, accessAudioPath, accessAudioDurationMs } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      spaceId: bookings.spaceId,
      status: bookings.status,
      startDate: bookings.startDate,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || booking.ownerId !== user.id) {
    return { ok: false, message: 'Solicitação não encontrada.' };
  }

  // O prazo de resposta pode ter vencido desde que a tela abriu.
  await sweepSpace(booking.spaceId);
  const [atual] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (atual?.status === 'expired') {
    revalidatePath('/meus-espacos/solicitacoes');
    return { ok: false, message: 'O prazo de 24 horas para responder esta solicitação terminou e ela expirou.' };
  }
  if (atual?.status !== 'requested') {
    return { ok: false, message: 'Esta solicitação já foi respondida.' };
  }

  if (decision === 'reject') {
    const recusadas = await db
      .update(bookings)
      .set({ status: 'rejected', ownerResponse: ownerResponse || null, respondedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'requested')))
      .returning({ id: bookings.id });
    if (recusadas.length === 0) {
      return { ok: false, message: 'Esta solicitação já foi respondida em outra aba ou dispositivo.' };
    }

    await db.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.rejected',
      entityType: 'booking', entityId: bookingId,
    });
    await notifyUser(db, {
      userId: booking.renterId, type: 'booking_rejected', title: 'Solicitação recusada',
      body: 'O proprietário não aceitou sua solicitação desta vez. Nada foi cobrado.', linkPath: `/reservas/${bookingId}`,
      data: { bookingId }, dedupeKey: `booking_rejected:${bookingId}`,
    });

    revalidatePath('/meus-espacos/solicitacoes');
    revalidatePath('/reservas');
    return { ok: true, bookingId };
  }

  // --- aceitar: instruções de acesso OBRIGATÓRIAS (texto e/ou áudio) ---
  const texto = accessInstructions?.trim() || null;
  if (texto && texto.length < ACCESS_INSTRUCTIONS_MIN) {
    return { ok: false, message: `Escreva pelo menos ${ACCESS_INSTRUCTIONS_MIN} caracteres nas instruções de acesso, ou grave um áudio.` };
  }

  let audio: { path: string; durationMs: number; mime: string } | null = null;
  if (accessAudioPath) {
    // O áudio mora na pasta da conversa DESTE pedido e já foi enviado e validado
    // (formato por conteúdo, tamanho). Revalida aqui: nunca confia no caminho que veio do formulário.
    const conversa = await findConversation(booking.spaceId, booking.renterId);
    if (!conversa || !isPathInConversation(accessAudioPath, conversa.id)) {
      return { ok: false, message: 'O áudio das instruções não é desta solicitação. Grave de novo.' };
    }
    const arquivo = await readChatAudio(accessAudioPath);
    if (!arquivo) {
      return { ok: false, message: 'O áudio das instruções não foi encontrado. Grave de novo.' };
    }
    audio = { path: accessAudioPath, durationMs: accessAudioDurationMs ?? 0, mime: arquivo.format.mime };
    if (audio.durationMs < 1000) {
      return { ok: false, message: 'Duração do áudio inválida. Grave de novo.' };
    }
  }
  if (!texto && !audio) {
    return { ok: false, message: 'Informe como o locatário encontra e usa o espaço — por texto ou por áudio.' };
  }

  const fees = await currentFees();
  let spaceTitle = '';
  let aceita: { firstPaymentDeadlineAt: Date | null } | undefined;
  let preteridos: { id: string; renterId: string }[] = [];
  let lotou = false;
  const motivoPreterido = 'As vagas deste anúncio foram preenchidas por outras solicitações.';

  try {
    await db.transaction(async (tx) => {
      // 1) trava o anúncio e encerra o que já venceu nele (libera vagas presas);
      await tx.execute(sql`SELECT 1 FROM spaces WHERE id = ${booking.spaceId} FOR UPDATE`);
      await tx.execute(sql`SELECT public.release_expired_rentals(${booking.spaceId})`);

      // 2) lê o preço VIGENTE já com o anúncio travado: o aceite congela este valor.
      const [sp] = await tx
        .select({
          title: spaces.title, priceMonthlyCents: spaces.priceMonthlyCents,
          depositEnabled: spaces.depositEnabled, deletedAt: spaces.deletedAt,
        })
        .from(spaces)
        .where(eq(spaces.id, booking.spaceId))
        .limit(1);
      if (!sp || sp.deletedAt) throw new RegraDeNegocio('Este espaço não existe mais.');
      if (sp.priceMonthlyCents == null) throw new RegraDeNegocio('Este anúncio está sem preço mensal. Defina o preço antes de aceitar.');
      spaceTitle = sp.title;

      let amounts;
      try {
        amounts = computeBookingAmounts(sp.priceMonthlyCents, fees);
      } catch (err) {
        if (err instanceof InvalidAmountError) throw new RegraDeNegocio('Não foi possível calcular os valores deste anúncio agora.');
        throw err;
      }
      // Congelado no aceite, como todo o resto — 1x o aluguel mensal, nunca um valor digitado por alguém.
      const depositCents = sp.depositEnabled ? amounts.monthlyRentCents : 0;

      // 3) o aceite. O WHERE status = 'requested' impede aceitar duas vezes o MESMO pedido
      // (segunda aba, duplo clique); os gatilhos do banco conferem prazo, instruções,
      // preço, calendário e a ÚLTIMA VAGA.
      const atualizadas = await tx
        .update(bookings)
        .set({
          status: 'approved',
          monthlyRentCents: amounts.monthlyRentCents,
          renterFeeBps: amounts.renterFeeBps,
          ownerFeeBps: amounts.ownerFeeBps,
          renterFeeCents: amounts.renterFeeCents,
          ownerFeeCents: amounts.ownerFeeCents,
          totalChargedCents: amounts.totalChargedCents,
          ownerPayoutCents: amounts.ownerPayoutCents,
          depositCents,
          accessInstructions: texto,
          accessAudioPath: audio?.path ?? null,
          accessAudioDurationMs: audio?.durationMs ?? null,
          accessAudioMime: audio?.mime ?? null,
          termsSnapshot: {
            renterFeeBps: amounts.renterFeeBps, ownerFeeBps: amounts.ownerFeeBps,
            priceMonthlyCentsAtAccept: amounts.monthlyRentCents, startDate: booking.startDate,
          },
          ownerResponse: ownerResponse || null,
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'requested')))
        .returning({ firstPaymentDeadlineAt: bookings.firstPaymentDeadlineAt });
      if (atualizadas.length === 0) {
        throw new RegraDeNegocio('Esta solicitação já foi respondida ou expirou. Recarregue a página.');
      }
      aceita = atualizadas[0];

      // 4) Lotou? Quem mais pediu só perde a vez quando NÃO sobra vaga — com vaga
      // sobrando, o pedido continua de pé. O motivo fica na linha e cada um é avisado.
      const [folga] = (await tx.execute(
        sql`SELECT quantity_available::int AS livres FROM spaces WHERE id = ${booking.spaceId}`,
      )) as unknown as { livres: number }[];
      if ((folga?.livres ?? 1) <= 0) {
        lotou = true;
        preteridos = await tx
          .select({ id: bookings.id, renterId: bookings.renterId })
          .from(bookings)
          .where(and(eq(bookings.spaceId, booking.spaceId), eq(bookings.status, 'requested'), ne(bookings.id, bookingId)));
        if (preteridos.length > 0) {
          await tx
            .update(bookings)
            .set({ status: 'rejected', ownerResponse: motivoPreterido, respondedAt: new Date(), updatedAt: new Date() })
            .where(inArray(bookings.id, preteridos.map((p) => p.id)));
        }
      }
    });
  } catch (err) {
    if (err instanceof RegraDeNegocio) return { ok: false, message: err.message };
    const pg = pgErrorFrom(err);
    if (pg?.constraint_name === 'bookings_capacity') {
      return {
        ok: false,
        message: 'Todas as vagas deste anúncio já estão ocupadas. Recuse esta solicitação ou aumente a quantidade oferecida.',
      };
    }
    if (pg?.constraint_name === 'bookings_period_not_blocked') {
      return {
        ok: false,
        message: 'A data de início pedida cai num período que você bloqueou no calendário. Desfaça o bloqueio ou recuse e combine outra data pelo chat.',
      };
    }
    const msg = bookingRuleMessage(err);
    if (msg) return { ok: false, message: msg };
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id, actorRole: user.role, action: 'booking.approved',
    entityType: 'booking', entityId: bookingId,
    metadata: { accessText: Boolean(texto), accessAudio: Boolean(audio), soldOut: lotou },
  });

  const agora = new Date();
  const prazo = aceita?.firstPaymentDeadlineAt ?? null;
  await notifyUser(db, {
    userId: booking.renterId, type: 'booking_approved', title: 'Solicitação aceita!',
    body: `O proprietário aceitou sua solicitação para "${spaceTitle}". Pague ${prazo ? formatDeadline(prazo, agora) : 'em até 24 horas'} para garantir a vaga; depois disso ela é liberada.`,
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
        body: `${motivoPreterido} Anúncio: "${spaceTitle}". Nada foi cobrado.`,
        linkPath: `/reservas/${p.id}`,
        data: { bookingId: p.id },
        dedupeKey: `booking_rejected:${p.id}`,
      })),
    );
  }

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');
  revalidatePath('/espacos');

  // Se a última vaga foi preenchida, quem favoritou fica sabendo (menos quem acabou de alugar).
  if (lotou) await onSpaceBecameUnavailable(booking.spaceId, [booking.renterId]);

  // A partir de uma locação aceita as duas partes quase sempre precisam combinar algo —
  // por isso cria a conversa se ainda não existir. As instruções NÃO vão no chat agora:
  // só depois do pagamento confirmado (a localização exata é privada até lá).
  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle,
    actorId: user.id,
    recipientId: booking.renterId,
    body: `Solicitação aceita. Para garantir a vaga, o pagamento precisa ser feito ${prazo ? formatDeadline(prazo, agora) : 'em até 24 horas'}. As instruções de acesso e o endereço exato aparecem aqui e em Meus aluguéis assim que o pagamento for confirmado.`,
    createIfMissing: true,
  });

  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// Cancelar (antes de a locação começar a valer)
// ---------------------------------------------------------------------------

/**
 * Cancela uma solicitação ou locação que ainda não está em andamento.
 *
 * Locatário: a própria, em 'requested', 'approved' ou 'awaiting_payment'
 * (desistiu antes de pagar). Proprietário: só em 'approved' (o combinado
 * caiu por terra) — para 'requested' o caminho é recusar.
 *
 * Se já existe cobrança no gateway (assinatura do mensal), ela é cancelada
 * no Asaas ANTES de qualquer mudança aqui: se o Asaas recusar, nada muda e
 * a pessoa vê o motivo. A vaga volta sozinha (o banco recontou).
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

  // Aceita e já em pagamento: a assinatura já existe no Asaas.
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
    // Cobrança em aberto que não deve mais ser paga: exclusão no gateway (a manutenção repete até confirmar).
    await tx
      .update(payments)
      .set({ deleteRequestedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(payments.bookingId, bookingId),
        inArray(payments.status, ['pending', 'overdue']),
        isNull(payments.deleteRequestedAt),
      ));
    await tx.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.cancelled',
      entityType: 'booking', entityId: bookingId, metadata: { previousStatus: booking.status },
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

  // A vaga voltou (o banco recontou): lista de espera e favoritos ficam sabendo.
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

// ---------------------------------------------------------------------------
// Encerrar — quem aluga encerra na hora; o proprietário PEDE o encerramento
// ---------------------------------------------------------------------------

/**
 * O LOCATÁRIO encerra uma locação em andamento ('active' ou 'past_due'),
 * imediatamente: recorrência cancelada no Asaas (o DELETE da assinatura também
 * remove a cobrança em aberto ou vencida), locação encerrada, vaga devolvida
 * (o banco recontou), histórico com o motivo.
 *
 * A assinatura é cancelada no gateway ANTES de qualquer escrita no banco —
 * se o Asaas recusar, nada muda por aqui, e a pessoa não sai da tela achando
 * que parou de pagar quando na verdade não parou. Um 404 (assinatura já
 * cancelada de outro jeito) é tratado como sucesso, não como erro.
 *
 * O proprietário não encerra por aqui: ele registra um pedido de encerramento
 * (`requestRentalEndAction`), com data, e o locatário é avisado.
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
  if (booking.renterId !== user.id) {
    return { ok: false, message: 'Quem encerra na hora é quem aluga. Como proprietário, peça o encerramento com uma data.' };
  }
  if (booking.status !== 'active' && booking.status !== 'past_due') {
    return { ok: false, message: 'Só é possível encerrar uma locação em andamento.' };
  }

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

  const encerradas = await db.transaction(async (tx) => {
    const linhas = await tx
      .update(bookings)
      .set({
        status: 'ended',
        endReason: 'cancelled_by_renter',
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['active', 'past_due'])))
      .returning({ id: bookings.id });
    if (linhas.length === 0) return 0;

    if (assinatura) {
      await tx
        .update(subscriptions)
        .set({ status: 'cancelled', cancelledAt: new Date(), providerCancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(subscriptions.id, assinatura.id));
    }
    // Se o proprietário tinha pedido o encerramento, o pedido se cumpriu: nada mais a esperar.
    await tx
      .update(bookingEndRequests)
      .set({ status: 'completed', resolvedAt: new Date() })
      .where(and(eq(bookingEndRequests.bookingId, bookingId), eq(bookingEndRequests.status, 'pending')));

    await tx.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'booking.ended',
      entityType: 'booking', entityId: bookingId,
      metadata: { reason: reason ?? null, previousStatus: booking.status, by: 'renter' },
    });
    return linhas.length;
  });
  if (encerradas === 0) {
    return { ok: false, message: 'Esta locação mudou de situação agora há pouco. Recarregue a página.' };
  }

  const [autor] = await db.select({ publicName: profiles.publicName }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  // O proprietário fica sabendo do encerramento (categoria reservas — essencial) e, no mesmo
  // aviso, que já pode avaliar. Quem encerrou recebe só o "avaliação disponível". Uma
  // notificação por pessoa, nunca duas pelo mesmo evento.
  await notifyUsers(db, [
    {
      userId: booking.ownerId, type: 'booking_cancelled', title: 'Locação encerrada',
      body: `${autor?.publicName ?? 'O locatário'} encerrou a locação de "${booking.spaceTitle}". A vaga voltou a ficar disponível e a avaliação já está disponível.`,
      linkPath: `/reservas/${bookingId}`, data: { bookingId }, dedupeKey: `booking_ended:${bookingId}`,
    },
    {
      userId: user.id, type: 'review_available', title: 'Avaliação disponível',
      body: `Conte como foi a locação de "${booking.spaceTitle}" — sua avaliação ajuda as próximas pessoas.`,
      linkPath: `/reservas/${bookingId}`, data: { bookingId }, dedupeKey: `review_available:${bookingId}`,
    },
  ]);

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/meus-espacos/financeiro');
  revalidatePath('/reservas');
  revalidatePath('/espacos');

  // A vaga voltou — quem estava na lista de espera é avisado. Melhor esforço.
  await onSpaceMaybeAvailableAgain(booking.spaceId);

  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: booking.spaceTitle,
    actorId: user.id,
    recipientId: booking.ownerId,
    body: `Locação encerrada por ${autor?.publicName ?? 'quem alugava'}.`,
    createIfMissing: false,
  });

  return { ok: true, bookingId };
}

/**
 * O PROPRIETÁRIO pede o encerramento de uma locação em andamento.
 *
 * Não apaga nada: registra o pedido (data e, se quiser, motivo), avisa o
 * locatário e preserva o histórico. Quando a data chega, a manutenção do banco
 * (`release_expired_rentals`) encerra a locação, cancela a cobrança
 * automática e devolve a vaga. Multa e aviso prévio mínimo ainda não estão
 * definidos: o prazo mínimo vem de `rental.end_request_min_notice_days` (hoje
 * 0) e é conferido pelo banco, para a regra poder mudar sem deploy.
 */
export async function requestRentalEndAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = requestEndSchema.safeParse({
    bookingId: formData.get('bookingId'),
    endDate: formData.get('endDate'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, endDate, reason } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id,
      ownerId: bookings.ownerId,
      renterId: bookings.renterId,
      status: bookings.status,
      spaceId: bookings.spaceId,
      spaceTitle: spaces.title,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking || booking.ownerId !== user.id) {
    return { ok: false, message: 'Locação não encontrada.' };
  }
  if (booking.status !== 'active' && booking.status !== 'past_due') {
    return { ok: false, message: 'Só é possível pedir o encerramento de uma locação em andamento.' };
  }
  if (endDate < brDate(new Date())) {
    return { ok: false, message: 'A data de encerramento não pode ser no passado.' };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(bookingEndRequests).values({
        bookingId, requestedBy: user.id, requestedEndDate: endDate, reason: reason || null,
      });
      await tx.insert(auditLogs).values({
        actorId: user.id, actorRole: user.role, action: 'booking.end_requested',
        entityType: 'booking', entityId: bookingId, metadata: { endDate, hasReason: Boolean(reason) },
      });
    });
  } catch (err) {
    const msg = bookingRuleMessage(err);
    if (msg) return { ok: false, message: msg };
    throw err;
  }

  const dataTexto = formatDateShort(endDate);
  await notifyUser(db, {
    userId: booking.renterId, type: 'rental_end_requested', title: 'O proprietário pediu o encerramento da locação',
    body: `A locação de "${booking.spaceTitle}" será encerrada em ${dataTexto}.${reason ? ` Motivo informado: ${reason}` : ''} Até lá, ela segue normalmente. Nenhuma multa é cobrada pela plataforma.`,
    linkPath: `/reservas/${bookingId}`, data: { bookingId, endDate },
    dedupeKey: `rental_end_requested:${bookingId}:${endDate}`,
  });

  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: booking.spaceTitle,
    actorId: user.id,
    recipientId: booking.renterId,
    body: `O proprietário pediu o encerramento desta locação para ${dataTexto}.${reason ? ` Motivo: ${reason}` : ''}`,
    createIfMissing: false,
  });

  revalidatePath(`/reservas/${bookingId}`);
  revalidatePath('/reservas');
  revalidatePath('/meus-espacos/solicitacoes');
  return { ok: true, bookingId };
}

/** O proprietário retira o pedido de encerramento que ainda não se cumpriu. */
export async function withdrawRentalEndRequestAction(
  _prev: BookingActionState | undefined,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await requireUserOrThrow();

  const parsed = withdrawEndRequestSchema.safeParse({ bookingId: formData.get('bookingId') });
  if (!parsed.success) return { ok: false, message: 'Locação inválida.' };
  const { bookingId } = parsed.data;

  const [booking] = await db
    .select({
      id: bookings.id, ownerId: bookings.ownerId, renterId: bookings.renterId,
      status: bookings.status, spaceId: bookings.spaceId, spaceTitle: spaces.title,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking || booking.ownerId !== user.id) return { ok: false, message: 'Locação não encontrada.' };

  const retirados = await db
    .update(bookingEndRequests)
    .set({ status: 'withdrawn', resolvedAt: new Date() })
    .where(and(eq(bookingEndRequests.bookingId, bookingId), eq(bookingEndRequests.status, 'pending')))
    .returning({ id: bookingEndRequests.id, endDate: bookingEndRequests.requestedEndDate });
  if (retirados.length === 0) {
    return { ok: false, message: 'Não há pedido de encerramento em aberto para retirar.' };
  }

  await db.insert(auditLogs).values({
    actorId: user.id, actorRole: user.role, action: 'booking.end_request_withdrawn',
    entityType: 'booking', entityId: bookingId, metadata: {},
  });
  await notifyUser(db, {
    userId: booking.renterId, type: 'rental_end_requested', title: 'Pedido de encerramento retirado',
    body: `O proprietário retirou o pedido de encerramento da locação de "${booking.spaceTitle}". Ela continua normalmente.`,
    linkPath: `/reservas/${bookingId}`, data: { bookingId },
    dedupeKey: `rental_end_withdrawn:${retirados[0]!.id}`,
  });
  await postBookingSystemMessage({
    spaceId: booking.spaceId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    spaceTitle: booking.spaceTitle,
    actorId: user.id,
    recipientId: booking.renterId,
    body: 'O proprietário retirou o pedido de encerramento. A locação continua normalmente.',
    createIfMissing: false,
  });

  revalidatePath(`/reservas/${bookingId}`);
  revalidatePath('/reservas');
  return { ok: true, bookingId };
}

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '@/db/client';
import { bookings, spaces, auditLogs, notifications, profiles } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { computeBookingAmounts } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import { findPendingRequestBySameRenter, listOtherPendingRequestsForSpace } from './queries';
import { requestBookingSchema, respondBookingSchema, cancelBookingSchema } from './schemas';
import { buildBookingReference } from './reference';

/*
 * `postgres` so anexa `PostgresError` como propriedade do export default
 * (Object.assign), nunca como export nomeado de verdade — `import {
 * PostgresError } from 'postgres'` passa no typecheck (a declaracao de tipos
 * usa namespace), mas quebra o build real: Turbopack analisa exports ESM
 * estaticamente e nao acha nada com esse nome ali.
 */
const { PostgresError } = postgres;
/** Tipo de instancia — destructure perde o merge automatico valor+tipo que o import nomeado direto teria. */
type PgError = InstanceType<typeof PostgresError>;

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
 * Erro real do Postgres por tras de um erro do Drizzle.
 *
 * O driver `postgres` lanca `PostgresError`, mas o Drizzle embrulha isso num
 * `DrizzleQueryError` e poe o original em `.cause` — sem desembrulhar, todo
 * `instanceof PostgresError` no codigo acima disso falha sempre, em
 * silencio (o catch cai no `throw err` generico como se fosse outra coisa).
 */
function pgErrorFrom(err: unknown): PgError | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/**
 * true quando o erro veio da trava de concorrencia (duas aprovacoes pro
 * mesmo espaco ao mesmo tempo).
 *
 * Sao DOIS codigos possiveis, nao um so — e os dois precisam ser tratados,
 * comprovado por teste real com duas aprovacoes disparadas juntas
 * (scripts/verify-bookings.ts, secao 5): quando as duas transacoes tentam
 * inserir na mesma janela na `bookings_one_active_per_space`, o Postgres as
 * vezes devolve '23505' (violacao de unicidade, quando uma commita antes da
 * outra tentar) e as vezes '40P01' (deadlock, quando as duas travam uma na
 * outra e o detector de deadlock mata uma pra destravar). E o MESMO
 * conflito de concorrencia vestido de dois jeitos — tratar so o primeiro
 * deixaria a segunda transacao estourar como erro 500 sem motivo aparente.
 */
function isOccupancyConflict(err: unknown): boolean {
  const pg = pgErrorFrom(err);
  if (!pg) return false;
  if (pg.code === '23505' && pg.constraint_name === 'bookings_one_active_per_space') return true;
  if (pg.code === '40P01') return true; // deadlock_detected
  return false;
}

// ---------------------------------------------------------------------------
// Locatario pede
// ---------------------------------------------------------------------------

/**
 * Cria uma solicitacao de aluguel.
 *
 * O navegador manda so `spaceId`, a data pretendida e uma mensagem opcional.
 * Preco, taxas e totais sao SEMPRE recalculados aqui — nunca aceitos do
 * cliente. O valor fica gravado desde a solicitacao (a coluna e NOT NULL),
 * mas e recalculado de novo, com a taxa vigente na hora, quando o
 * proprietario aceita — a congelada que vale e essa (ver respondToBooking).
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

  const [space] = await db
    .select({
      id: spaces.id,
      ownerId: spaces.ownerId,
      status: spaces.status,
      title: spaces.title,
      priceMonthlyCents: spaces.priceMonthlyCents,
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

  const jaTemPendente = await findPendingRequestBySameRenter(spaceId, user.id);
  if (jaTemPendente) {
    return { ok: false, message: 'Você já tem uma solicitação pendente para este espaço.' };
  }

  const fees = await currentFees();
  let amounts;
  try {
    amounts = computeBookingAmounts(space.priceMonthlyCents, fees);
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

  await db.insert(notifications).values({
    userId: space.ownerId,
    type: 'booking_requested',
    title: 'Nova solicitação de aluguel',
    body: `${user.fullName ?? 'Alguém'} quer alugar "${space.title}".`,
    linkPath: '/meus-espacos/solicitacoes',
    data: { bookingId },
  });

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');

  /*
   * Redireciona AQUI, no servidor — nao com `router.push` num useEffect do
   * cliente escutando `state.ok`. O Next.js atualiza a rota atual sozinho
   * depois de toda Server Action (o equivalente a um `router.refresh()`
   * automatico); como essa mesma pagina de solicitar decide o que mostrar
   * consultando se ja existe uma solicitacao, esse refresh troca o
   * `<RequestBookingForm>` pela tela de "voce ja solicitou" ANTES do efeito
   * do componente (que estava dentro do componente sendo substituido) ter
   * a chance de rodar — a navegacao para /reservas nunca acontecia.
   * `redirect()` evita a corrida de vez: e a propria action que decide.
   */
  redirect('/reservas?enviada=1');
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
    await db.insert(notifications).values({
      userId: booking.renterId, type: 'booking_rejected', title: 'Solicitação recusada',
      body: 'O proprietário não aceitou sua solicitação desta vez.', linkPath: '/reservas',
      data: { bookingId },
    });

    revalidatePath('/meus-espacos/solicitacoes');
    revalidatePath('/reservas');
    return { ok: true, bookingId };
  }

  // --- aceitar ---
  const [space] = await db
    .select({ id: spaces.id, status: spaces.status, priceMonthlyCents: spaces.priceMonthlyCents, title: spaces.title, deletedAt: spaces.deletedAt })
    .from(spaces)
    .where(eq(spaces.id, booking.spaceId))
    .limit(1);
  if (!space || space.deletedAt) {
    return { ok: false, message: 'Este espaço não existe mais.' };
  }

  const fees = await currentFees();
  let amounts;
  try {
    amounts = computeBookingAmounts(space.priceMonthlyCents, fees);
  } catch {
    return { ok: false, message: 'Não foi possível calcular os valores deste anúncio agora.' };
  }

  let preteridos: { id: string; renterId: string }[] = [];
  try {
    await db.transaction(async (tx) => {
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
          termsSnapshot: { renterFeeBps: amounts.renterFeeBps, ownerFeeBps: amounts.ownerFeeBps, priceMonthlyCentsAtAccept: space.priceMonthlyCents },
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

      // Quem mais pediu o mesmo espaco perde a vez — de forma explicita, nao
      // silenciosa: o motivo fica registrado na propria linha da solicitacao
      // E cada um recebe notificacao (depois do commit, fora da transacao).
      const outras = await listOtherPendingRequestsForSpace(space.id, bookingId);
      if (outras.length > 0) {
        await tx
          .update(bookings)
          .set({
            status: 'rejected',
            ownerResponse: 'Outro interessado foi aceito primeiro.',
            respondedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(bookings.id, outras.map((o) => o.id)));
        preteridos = outras;
      }
    });
  } catch (err) {
    if (isOccupancyConflict(err)) {
      return { ok: false, message: 'Este espaço já tem uma reserva ativa — não é possível aceitar duas ao mesmo tempo.' };
    }
    if (err instanceof Error && err.message.startsWith('CONCORRENCIA')) {
      return { ok: false, message: 'Esta solicitação já foi respondida em outra aba ou dispositivo.' };
    }
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id, actorRole: user.role, action: 'booking.approved',
    entityType: 'booking', entityId: bookingId,
    metadata: { totalChargedCents: amounts.totalChargedCents, ownerPayoutCents: amounts.ownerPayoutCents },
  });
  await db.insert(notifications).values({
    userId: booking.renterId, type: 'booking_approved', title: 'Solicitação aceita!',
    body: `O proprietário aceitou sua solicitação para "${space.title}".`, linkPath: '/reservas',
    data: { bookingId },
  });

  if (preteridos.length > 0) {
    await db.insert(notifications).values(
      preteridos.map((p) => ({
        userId: p.renterId,
        type: 'booking_rejected' as const,
        title: 'Solicitação recusada',
        body: `Outro interessado foi aceito primeiro para "${space.title}".`,
        linkPath: '/reservas',
        data: { bookingId: p.id },
      })),
    );
  }

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');
  revalidatePath('/espacos');
  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------------

/**
 * Cancela uma solicitacao ou reserva.
 *
 * Locatario cancela a propria, em 'requested' ou 'approved' (desistiu antes
 * de pagar). Proprietario so cancela em 'approved' (combinado caiu por
 * terra) — para 'requested' o caminho e recusar, que e mais claro sobre o
 * que aconteceu.
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
    .select({ id: bookings.id, ownerId: bookings.ownerId, renterId: bookings.renterId, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking || (booking.ownerId !== user.id && booking.renterId !== user.id)) {
    return { ok: false, message: 'Reserva não encontrada.' };
  }

  const souLocatario = booking.renterId === user.id;
  const podeCancelar = souLocatario
    ? booking.status === 'requested' || booking.status === 'approved'
    : booking.status === 'approved';

  if (!podeCancelar) {
    return { ok: false, message: 'Esta reserva não pode mais ser cancelada por aqui.' };
  }

  await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: user.id,
      cancellationReason: reason || null,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ['requested', 'approved'])));

  await db.insert(auditLogs).values({
    actorId: user.id, actorRole: user.role, action: 'booking.cancelled',
    entityType: 'booking', entityId: bookingId,
  });

  const outraParte = souLocatario ? booking.ownerId : booking.renterId;
  const [autor] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
  await db.insert(notifications).values({
    userId: outraParte, type: 'booking_cancelled', title: 'Reserva cancelada',
    body: `${autor?.fullName ?? 'A outra parte'} cancelou esta reserva.`, linkPath: '/reservas',
    data: { bookingId },
  });

  revalidatePath('/meus-espacos/solicitacoes');
  revalidatePath('/reservas');
  revalidatePath('/espacos');
  return { ok: true, bookingId };
}

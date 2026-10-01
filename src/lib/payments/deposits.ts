import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookingDeposits, bookings, ledgerEntries } from '@/db/schema';
import { insertNotification, notifyUser, type PushJob } from '@/lib/notifications/dispatch';
import { formatBRL } from '@/lib/money';
import * as asaas from './asaas';

/**
 * Caução — proteção contra dano (Fase 20).
 *
 * Cobrança avulsa no Asaas, igual à compra de Destaque/Turbo: sem split,
 * porque o dinheiro não é receita de ninguém — é do locatário, em custódia
 * da plataforma, até o aluguel encerrar sem disputa (libera integral) ou um
 * dano ser confirmado (retém uma parte, decidida por um humano, nunca por
 * regra automática).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DepositRow = typeof bookingDeposits.$inferSelect;

export type BookingForDeposit = { id: string; reference: string; depositCents: number };

/** Cria a cobrança avulsa da caução no Asaas — chamado de startCheckoutAction. */
export async function chargeDeposit(
  customerId: string,
  booking: BookingForDeposit,
  dueDate: string,
): Promise<asaas.AsaasPayment> {
  return asaas.createPayment({
    customer: customerId,
    billingType: 'UNDEFINED',
    value: booking.depositCents / 100,
    dueDate,
    description: `MyPlace — caução (${booking.reference})`,
    externalReference: `${booking.reference}-caucao`,
  });
}

// ---------------------------------------------------------------------------
// Webhook — eventos da cobrança da caução (3º ramo de processAsaasWebhook)
// ---------------------------------------------------------------------------

export async function handleDepositEvent(
  tx: Tx,
  event: string,
  deposito: DepositRow,
  payload: { payment?: { status?: string } },
): Promise<PushJob[]> {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
      return handleDepositConfirmed(tx, deposito);
    case 'PAYMENT_RECEIVED': {
      // Pix e boleto chegam direto como RECEIVED (sem CONFIRMED): confirma antes
      // (a função não faz nada se a caução já estava confirmada).
      const jobs = await handleDepositConfirmed(tx, deposito);
      await tx.update(bookingDeposits).set({ status: 'received', updatedAt: new Date() }).where(eq(bookingDeposits.id, deposito.id));
      return jobs;
    }
    case 'PAYMENT_OVERDUE':
      await tx.update(bookingDeposits).set({ status: 'overdue', updatedAt: new Date() }).where(eq(bookingDeposits.id, deposito.id));
      return [];
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return handleDepositFailed(tx, deposito);
    case 'PAYMENT_DELETED':
      await tx.update(bookingDeposits).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(bookingDeposits.id, deposito.id));
      return [];
    case 'PAYMENT_REFUNDED':
      // O proprio releaseDeposit ja chama o estorno e grava o resultado — este
      // evento so confirma o que ja aconteceu, nao ha novo efeito a aplicar.
      void payload;
      return [];
  }
  return [];
}

async function handleDepositConfirmed(tx: Tx, deposito: DepositRow): Promise<PushJob[]> {
  if (deposito.status === 'confirmed' || deposito.status === 'received') return [];

  await tx
    .update(bookingDeposits)
    .set({ status: 'confirmed', paidAt: new Date(), updatedAt: new Date() })
    .where(eq(bookingDeposits.id, deposito.id));

  const [booking] = await tx.select({ renterId: bookings.renterId }).from(bookings).where(eq(bookings.id, deposito.bookingId)).limit(1);
  if (!booking) return [];

  await tx.insert(ledgerEntries).values({
    type: 'deposit_charged', bookingId: deposito.bookingId,
    userId: null, amountCents: deposito.amountCents, description: 'Caução cobrada e confirmada',
  });

  const job = await insertNotification(tx, {
    userId: booking.renterId, type: 'payment_confirmed', title: 'Caução confirmada',
    body: 'Sua caução foi confirmada e fica em garantia até o fim do aluguel, sem dano.',
    linkPath: `/reservas/${deposito.bookingId}`, data: { bookingId: deposito.bookingId },
  });
  return job ? [job] : [];
}

async function handleDepositFailed(tx: Tx, deposito: DepositRow): Promise<PushJob[]> {
  await tx
    .update(bookingDeposits)
    .set({ status: 'failed', failureReason: 'Recusado na análise de risco do gateway.', updatedAt: new Date() })
    .where(eq(bookingDeposits.id, deposito.id));

  const [booking] = await tx.select({ renterId: bookings.renterId }).from(bookings).where(eq(bookings.id, deposito.bookingId)).limit(1);
  if (!booking) return [];

  const job = await insertNotification(tx, {
    userId: booking.renterId, type: 'payment_failed', title: 'Cobrança da caução recusada',
    body: 'A cobrança da caução não foi aprovada. O aluguel segue normalmente — regularize a caução assim que possível.',
    linkPath: `/reservas/${deposito.bookingId}`, data: { bookingId: deposito.bookingId },
  });
  return job ? [job] : [];
}

// ---------------------------------------------------------------------------
// Liberação e retenção
// ---------------------------------------------------------------------------

export type ReleaseDepositResult = { ok: true } | { ok: false; message: string };

/**
 * Libera (integral) ou retém parte da caução. Chamada tanto pelo cron de
 * liberação automática (`forfeitCents = 0`, sem denúncia procedente) quanto
 * pela ação do admin (`forfeitCents > 0`, denúncia de dano confirmada).
 *
 * O estorno em si é SÍNCRONO — a resposta do Asaas já diz se funcionou, não
 * precisa esperar webhook pra saber (diferente da cobrança inicial, que
 * depende de o locatário efetivamente pagar). Só grava no banco depois do
 * gateway confirmar, nunca antes.
 */
export async function releaseDeposit(
  depositId: string,
  forfeitCents: number,
  resolvedReportId: string | null,
): Promise<ReleaseDepositResult> {
  const [deposito] = await db.select().from(bookingDeposits).where(eq(bookingDeposits.id, depositId)).limit(1);
  if (!deposito) return { ok: false, message: 'Caução não encontrada.' };
  if (deposito.releaseStatus !== 'held') return { ok: false, message: 'Esta caução já foi resolvida antes.' };
  if (!['confirmed', 'received'].includes(deposito.status)) {
    return { ok: false, message: 'Esta caução ainda não foi confirmada pelo gateway.' };
  }
  if (!Number.isInteger(forfeitCents) || forfeitCents < 0 || forfeitCents > deposito.amountCents) {
    return { ok: false, message: 'Valor de retenção inválido.' };
  }

  const releaseCents = deposito.amountCents - forfeitCents;

  if (releaseCents > 0) {
    try {
      await asaas.refundPayment(deposito.providerPaymentId, releaseCents);
    } catch (err) {
      if (err instanceof asaas.AsaasError) {
        console.error('[deposits] Asaas recusou o estorno da caução:', err.status, err.body);
        return { ok: false, message: `Não foi possível estornar: ${err.message}` };
      }
      throw err;
    }
  }

  const releaseStatus = forfeitCents === 0 ? 'released' : releaseCents === 0 ? 'forfeited' : 'partially_forfeited';

  const [booking] = await db
    .select({ renterId: bookings.renterId, ownerId: bookings.ownerId })
    .from(bookings)
    .where(eq(bookings.id, deposito.bookingId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(bookingDeposits)
      .set({
        releaseStatus, releasedCents: releaseCents, forfeitedCents: forfeitCents,
        resolvedReportId, releasedAt: new Date(), updatedAt: new Date(),
      })
      .where(eq(bookingDeposits.id, depositId));

    /*
     * Sinais opostos, igual `refund`/`owner_payout` já fazem: o que sai da
     * custódia da plataforma é negativo. `deposit_charged` (+) menos as duas
     * saídas soma exatamente zero quando tudo está resolvido — é o invariante
     * que prova que nada ficou preso nem inventado no meio do caminho.
     */
    if (releaseCents > 0) {
      await tx.insert(ledgerEntries).values({
        type: 'deposit_released', bookingId: deposito.bookingId,
        userId: null, amountCents: -releaseCents, description: 'Caução devolvida ao locatário',
      });
    }
    if (forfeitCents > 0) {
      await tx.insert(ledgerEntries).values({
        type: 'deposit_forfeited_to_owner', bookingId: deposito.bookingId,
        userId: booking?.ownerId ?? null, amountCents: -forfeitCents,
        description: 'Caução retida por dano — repasse ao proprietário ainda é manual',
      });
    }
  });

  if (booking) {
    if (forfeitCents === 0) {
      await notifyUser(db, {
        userId: booking.renterId, type: 'payment_confirmed', title: 'Caução devolvida',
        body: 'Sua caução foi devolvida integralmente — o aluguel encerrou sem nenhum dano registrado.',
        linkPath: `/reservas/${deposito.bookingId}`, data: { bookingId: deposito.bookingId },
      });
    } else {
      const complemento = releaseCents > 0 ? ` (${formatBRL(releaseCents)} devolvidos)` : '';
      await notifyUser(db, {
        userId: booking.renterId, type: 'payment_failed', title: 'Parte da caução foi retida',
        body: `Uma denúncia de dano foi confirmada e parte da caução ficou retida${complemento}.`,
        linkPath: `/reservas/${deposito.bookingId}`, data: { bookingId: deposito.bookingId },
      });
      await notifyUser(db, {
        userId: booking.ownerId, type: 'payment_confirmed', title: 'Caução retida a seu favor',
        body: `Uma denúncia de dano foi confirmada — ${formatBRL(forfeitCents)} da caução ficam retidos a seu favor (repasse ainda manual).`,
        linkPath: '/meus-espacos/financeiro', data: { bookingId: deposito.bookingId },
      });
    }
  }

  return { ok: true };
}

/** Nunca libera antes disso, mesmo sem denúncia nenhuma — dá tempo do proprietário notar um dano. */
const AUTO_RELEASE_AFTER_DAYS = 7;

/**
 * Libera sozinha as cauções de alugueis encerrados há mais de
 * `AUTO_RELEASE_AFTER_DAYS`, sem denúncia de dano em aberto nem confirmada
 * contra aquela reserva. Roda pelo mesmo cron diário da Fase 18
 * (`/api/cron/notificacoes`) — não é notificação, mas é o mesmo tipo de
 * job "por tempo, não por ação de alguém", e reaproveitar evita gastar um
 * segundo slot de cron do plano Hobby da Vercel à toa.
 */
export async function runDepositAutoRelease(): Promise<{ released: number }> {
  const candidatos = await db
    .select({ id: bookingDeposits.id })
    .from(bookingDeposits)
    .innerJoin(bookings, eq(bookings.id, bookingDeposits.bookingId))
    .where(
      and(
        eq(bookingDeposits.releaseStatus, 'held'),
        inArray(bookingDeposits.status, ['confirmed', 'received']),
        eq(bookings.status, 'ended'),
        sql`${bookings.endedAt} <= now() - (${AUTO_RELEASE_AFTER_DAYS} || ' days')::interval`,
        sql`NOT EXISTS (
          SELECT 1 FROM reports r
          WHERE r.booking_id = ${bookings.id}
            AND r.reason IN ('dano_ao_espaco', 'uso_indevido_do_espaco')
            AND (r.status IN ('open', 'reviewing') OR r.upheld = true)
        )`,
      ),
    );

  let released = 0;
  for (const c of candidatos) {
    const resultado = await releaseDeposit(c.id, 0, null);
    if (resultado.ok) released++;
    else console.error('[deposits] falha ao liberar automaticamente:', c.id, resultado.message);
  }
  return { released };
}

import 'server-only';
import { after } from 'next/server';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs, payments, subscriptions } from '@/db/schema';
import * as asaas from '@/lib/payments/asaas';
import { isIntegrationConfigured } from '@/lib/env';
import { notifyUsers, type NotifyInput } from '@/lib/notifications/dispatch';
import { ENDING_NOTICE_MINUTES, PAYMENT_FIRST_WINDOW_MINUTES } from './pricing';
import { brTime } from './time';

/**
 * Manutenção do aluguel pelo relógio (Parte 12).
 *
 * A CORREÇÃO não depende disto: disponibilidade e prazos são calculados
 * pelo relógio do banco, e quem vai alugar uma unidade encerra antes o que
 * venceu nela (`release_expired_rentals`). Isto aqui faz o que precisa
 * acontecer na hora certa mesmo sem ninguém abrir o app:
 *   1. encerrar o que venceu em TODOS os anúncios;
 *   2. avisar ("termina em 10 minutos", "último prazo", "encerrado");
 *   3. executar no gateway o que o banco marcou (cancelar recorrência,
 *      excluir cobrança que não vale mais, estornar pagamento atrasado),
 *      repetindo até o gateway confirmar.
 *
 * Tudo idempotente: rodar duas vezes no mesmo minuto não duplica aviso
 * (dedupeKey), não cancela duas vezes (marca de confirmação) e não estorna
 * duas vezes (status da cobrança).
 */

export type OutboxResult = { cancelled: number; deleted: number; refunded: number; failed: number; busy?: boolean };

/**
 * Executa no gateway os efeitos pendentes que o banco marcou.
 *
 * Um executor por vez (trava consultiva do Postgres, presa a uma transação
 * aberta só para isso): o agendador, a varredura depois de uma tela e o
 * cancelamento podem chamar ao mesmo tempo, e nenhum estorno pode sair duas
 * vezes. Quem encontra a trava ocupada não espera: quem a segura já está
 * processando a fila, e o que sobrar fica para a próxima rodada.
 */
export async function processPaymentOutbox(scope?: { bookingId?: string; limit?: number }): Promise<OutboxResult> {
  return db.transaction(async (tx) => {
    const [trava] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('myplace:payment_outbox')) AS ok`,
    )) as unknown as { ok: boolean }[];
    if (!trava?.ok) return { cancelled: 0, deleted: 0, refunded: 0, failed: 0, busy: true };
    return processOutboxLocked(scope);
  });
}

async function processOutboxLocked(scope?: { bookingId?: string; limit?: number }): Promise<OutboxResult> {
  const r: OutboxResult = { cancelled: 0, deleted: 0, refunded: 0, failed: 0 };
  const limite = scope?.limit ?? 50;
  const configurado = isIntegrationConfigured('payments');

  // 1. Recorrência cancelada aqui e ainda não confirmada no gateway.
  const assinaturas = await db
    .select({ id: subscriptions.id, bookingId: subscriptions.bookingId, providerSubscriptionId: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.status, 'cancelled'),
      isNull(subscriptions.providerCancelledAt),
      scope?.bookingId ? eq(subscriptions.bookingId, scope.bookingId) : undefined,
    ))
    .limit(limite);
  for (const a of assinaturas) {
    if (a.providerSubscriptionId) {
      if (!configurado) continue;
      try {
        await asaas.cancelSubscription(a.providerSubscriptionId);
      } catch (err) {
        if (!(err instanceof asaas.AsaasError && err.status === 404)) {
          r.failed++;
          console.error('[manutenção] cancelar assinatura no Asaas falhou:', a.providerSubscriptionId, err instanceof asaas.AsaasError ? err.body : err);
          continue;
        }
      }
    }
    await db.update(subscriptions).set({ providerCancelledAt: new Date(), updatedAt: new Date() }).where(eq(subscriptions.id, a.id));
    await db.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'subscription.cancelled_at_gateway',
      entityType: 'subscription', entityId: a.id, metadata: { bookingId: a.bookingId },
    });
    r.cancelled++;
  }

  // 2. Cobrança que não deve mais ser paga (reserva expirou ou foi desistida).
  const paraExcluir = await db
    .select({ id: payments.id, providerPaymentId: payments.providerPaymentId, bookingId: payments.bookingId })
    .from(payments)
    .where(and(
      isNotNull(payments.deleteRequestedAt),
      isNull(payments.providerDeletedAt),
      inArray(payments.status, ['pending', 'overdue']),
      scope?.bookingId ? eq(payments.bookingId, scope.bookingId) : undefined,
    ))
    .limit(limite);
  for (const p of paraExcluir) {
    if (!configurado) continue;
    try {
      await asaas.deletePayment(p.providerPaymentId);
    } catch (err) {
      if (!(err instanceof asaas.AsaasError && err.status === 404)) {
        r.failed++;
        console.error('[manutenção] excluir cobrança no Asaas falhou:', p.providerPaymentId, err instanceof asaas.AsaasError ? err.body : err);
        continue;
      }
    }
    await db
      .update(payments)
      .set({ providerDeletedAt: new Date(), status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(payments.id, p.id), inArray(payments.status, ['pending', 'overdue'])));
    r.deleted++;
  }

  // 3. Pagamento que chegou depois do fim (aluguel já encerrado ou reserva
  // expirada): estorno integral. O status da cobrança vira `refunded` na
  // hora em que o gateway aceita o pedido — é o que impede pedir de novo; o
  // evento PAYMENT_REFUNDED depois registra o lançamento e avisa.
  const paraEstornar = await db
    .select({ id: payments.id, providerPaymentId: payments.providerPaymentId, bookingId: payments.bookingId, amountCents: payments.amountCents })
    .from(payments)
    .where(and(
      isNotNull(payments.refundRequestedAt),
      inArray(payments.status, ['confirmed', 'received']),
      scope?.bookingId ? eq(payments.bookingId, scope.bookingId) : undefined,
    ))
    .limit(limite);
  for (const p of paraEstornar) {
    if (!configurado) continue;
    try {
      await asaas.refundPayment(p.providerPaymentId);
    } catch (err) {
      r.failed++;
      console.error('[manutenção] estorno no Asaas falhou:', p.providerPaymentId, err instanceof asaas.AsaasError ? err.body : err);
      continue;
    }
    await db
      .update(payments)
      .set({ status: 'refunded', refundedCents: p.amountCents, updatedAt: new Date() })
      .where(and(eq(payments.id, p.id), inArray(payments.status, ['confirmed', 'received'])));
    await db.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'payment.refund_sent',
      entityType: 'payment', entityId: p.id, metadata: { bookingId: p.bookingId },
    });
    r.refunded++;
  }

  return r;
}

type LinhaAviso = {
  id: string;
  renter_id: string;
  owner_id: string;
  title: string;
  ends_at: Date | null;
  renewal_allowed: boolean;
  started: Date | null;
  deadline: Date | null;
};

/** Avisos que dependem do relógio. Cada um tem `dedupeKey`: nunca repete. */
export async function sendRentalNotices(): Promise<number> {
  const avisos: NotifyInput[] = [];

  // "Seu aluguel termina em 10 minutos." — só para quem ainda não renovou.
  const terminando = (await db.execute(sql`
    SELECT b.id, b.renter_id, b.owner_id, s.title, b.ends_at, b.renewal_allowed, NULL::timestamptz AS started, NULL::timestamptz AS deadline
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.kind = 'temporary' AND b.status = 'active'
       AND b.ends_at > now() AND b.ends_at <= now() + make_interval(mins => ${ENDING_NOTICE_MINUTES})
       AND NOT EXISTS (
         SELECT 1 FROM bookings r WHERE r.renewed_from_id = b.id
            AND r.status IN ('awaiting_payment', 'active')
       )
  `)) as unknown as LinhaAviso[];
  for (const b of terminando) {
    avisos.push({
      userId: b.renter_id, type: 'rental_ending_soon',
      title: 'Seu aluguel termina em 10 minutos.',
      body: `"${b.title}" — o horário acaba às ${b.ends_at ? brTime(new Date(b.ends_at)) : ''}.${b.renewal_allowed ? ' Dá para renovar em Meus aluguéis.' : ''}`,
      linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `rental_ending_soon:${b.id}`,
    });
  }

  // Pagamento pendente: passou a primeira janela (40 min) — último prazo.
  const segundaJanela = (await db.execute(sql`
    SELECT b.id, b.renter_id, b.owner_id, s.title, NULL::timestamptz AS ends_at, false AS renewal_allowed,
           b.payment_issue_started_at AS started, b.payment_issue_deadline_at AS deadline
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'past_due'
       AND now() >= b.payment_issue_started_at + make_interval(mins => ${PAYMENT_FIRST_WINDOW_MINUTES})
       AND now() < b.payment_issue_deadline_at
  `)) as unknown as LinhaAviso[];
  for (const b of segundaJanela) {
    const chave = b.started ? new Date(b.started).getTime() : 0;
    avisos.push({
      userId: b.renter_id, type: 'payment_failed',
      title: 'Último prazo para regularizar o pagamento',
      body: `Você tem até as ${b.deadline ? brTime(new Date(b.deadline)) : ''} para pagar o aluguel de "${b.title}". Depois disso, o aluguel é encerrado.`,
      linkPath: `/reservas/${b.id}/pendente`, data: { bookingId: b.id }, dedupeKey: `payment_second_window:${b.id}:${chave}`,
    });
  }

  // Encerrado por falta de pagamento (o banco já encerrou; aqui só avisa).
  const encerrados = (await db.execute(sql`
    SELECT b.id, b.renter_id, b.owner_id, s.title, NULL::timestamptz AS ends_at, false AS renewal_allowed,
           NULL::timestamptz AS started, NULL::timestamptz AS deadline
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'ended' AND b.end_reason = 'payment_not_received'
       AND b.ended_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of encerrados) {
    avisos.push(
      {
        userId: b.renter_id, type: 'booking_cancelled', title: 'Aluguel encerrado por falta de pagamento',
        body: `O prazo para regularizar o pagamento de "${b.title}" terminou. A cobrança automática foi cancelada e nada mais será cobrado.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_terminated:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'booking_cancelled', title: 'Aluguel encerrado por falta de pagamento',
        body: `O locatário de "${b.title}" não regularizou o pagamento no prazo. A unidade voltou a ficar disponível.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_terminated:${b.id}`,
      },
    );
  }

  // Reserva temporária que expirou sem pagamento.
  const expiradas = (await db.execute(sql`
    SELECT b.id, b.renter_id, b.owner_id, s.title, NULL::timestamptz AS ends_at, false AS renewal_allowed,
           NULL::timestamptz AS started, NULL::timestamptz AS deadline
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'expired' AND b.end_reason = 'hold_expired'
       AND b.updated_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of expiradas) {
    avisos.push({
      userId: b.renter_id, type: 'booking_cancelled', title: 'Reserva expirada',
      body: `O pagamento da reserva em "${b.title}" não foi concluído a tempo, e a unidade foi liberada. Nada foi cobrado.`,
      linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `hold_expired:${b.id}`,
    });
  }

  if (avisos.length === 0) return 0;
  await notifyUsers(db, avisos);
  return avisos.length;
}

/**
 * Encerra no banco o que já venceu ANTES de mostrar uma tela (prazo para
 * pagar, janela de renovação, prazo final do pagamento pendente). Se algo
 * mudou, os avisos e os efeitos no gateway (cancelar recorrência, excluir
 * cobrança, estornar) rodam DEPOIS da resposta: a tela nunca espera o Asaas.
 * Fora de uma requisição (scripts), só encerra — o agendador faz o resto.
 */
export async function sweepExpiredRentals(): Promise<number> {
  const [linha] = (await db.execute(sql`SELECT public.release_expired_rentals(NULL) AS n`)) as unknown as { n: number }[];
  const n = Number(linha?.n ?? 0);
  if (n > 0) {
    try {
      after(async () => {
        try {
          await sendRentalNotices();
          await processPaymentOutbox({ limit: 20 });
        } catch (err) {
          console.error('[manutenção] efeitos depois da varredura falharam (o agendador repete):', err);
        }
      });
    } catch {
      // Sem requisição em curso: nada a agendar aqui.
    }
  }
  return n;
}

export type MaintenanceSummary = { released: number; notices: number; outbox: OutboxResult };

/** Tudo junto: o agendador por minuto chama isto (e o diário, como rede de segurança). */
export async function runRentalMaintenance(): Promise<MaintenanceSummary> {
  const [linha] = (await db.execute(sql`SELECT public.release_expired_rentals(NULL) AS n`)) as unknown as { n: number }[];
  const notices = await sendRentalNotices();
  const outbox = await processPaymentOutbox();
  return { released: Number(linha?.n ?? 0), notices, outbox };
}

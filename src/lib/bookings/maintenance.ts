import 'server-only';
import { after } from 'next/server';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs, payments, subscriptions } from '@/db/schema';
import * as asaas from '@/lib/payments/asaas';
import { isIntegrationConfigured } from '@/lib/env';
import { notifyUsers, type NotifyInput } from '@/lib/notifications/dispatch';
import { notifyWaitlistIfAvailable } from '@/lib/waitlist/notify';
import { brTime } from '@/lib/time';
import { runPremiumMaintenance, type PremiumMaintenanceSummary } from '@/lib/premium/maintenance';
import { processTransferOutbox } from '@/lib/premium/benefit';
import { syncOwnerFeesWithPremium, syncSubscriptionSplits } from './fees';
import {
  PAYMENT_EXPIRING_NOTICE_HOURS,
  PAYMENT_WINDOW_NOTICE_MINUTES,
  REQUEST_EXPIRING_NOTICE_HOURS,
  formatDeadline,
} from './deadlines';

/**
 * Manutenção das locações pelo relógio.
 *
 * A CORREÇÃO não depende disto: disponibilidade e prazos são calculados pelo
 * relógio do banco, e quem vai aceitar um pedido encerra antes o que venceu
 * naquele anúncio (`release_expired_rentals`). Isto aqui faz o que precisa
 * acontecer na hora certa mesmo sem ninguém abrir o app:
 *   1. encerrar o que venceu em TODOS os anúncios (pedido sem resposta,
 *      aceite sem pagamento, pagamento pendente depois de 2 h, encerramento
 *      pedido pelo proprietário cuja data chegou);
 *   2. avisar quem precisa saber, uma vez só;
 *   3. executar no gateway o que o banco marcou (cancelar recorrência,
 *      excluir cobrança que não vale mais, estornar pagamento atrasado),
 *      repetindo até o gateway confirmar;
 *   4. avisar a lista de espera dos anúncios que voltaram a ter vaga.
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

  // 2. Cobrança que não deve mais ser paga (pedido expirou ou foi desistido).
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

  // 3. Pagamento que chegou depois do fim (locação já encerrada ou pedido
  // expirado): estorno integral. O status da cobrança vira `refunded` na
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
  renter_name: string | null;
  deadline: Date | string | null;
  started: Date | string | null;
};

const DATA = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

/** Avisos que dependem do relógio. Cada um tem `dedupeKey`: nunca repete. */
export async function sendBookingNotices(): Promise<number> {
  const avisos: NotifyInput[] = [];
  const agora = new Date();

  // Colunas comuns de todas as consultas abaixo.
  const base = sql`
    b.id, b.renter_id, b.owner_id, s.title,
    (SELECT p.public_name FROM profiles p WHERE p.id = b.renter_id) AS renter_name`;

  // 1. Pedido perto de expirar — o proprietário ainda não respondeu.
  const aExpirar = (await db.execute(sql`
    SELECT ${base}, b.response_deadline_at AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'requested'
       AND b.response_deadline_at > now()
       AND b.response_deadline_at <= now() + make_interval(hours => ${REQUEST_EXPIRING_NOTICE_HOURS})
  `)) as unknown as LinhaAviso[];
  for (const b of aExpirar) {
    const prazo = DATA(b.deadline);
    avisos.push({
      userId: b.owner_id, type: 'booking_request_expiring',
      title: 'Solicitação perto de expirar',
      body: `${b.renter_name ?? 'Alguém'} pediu "${b.title}". Responda ${prazo ? formatDeadline(prazo, agora) : 'em breve'}; depois disso a solicitação expira.`,
      linkPath: `/meus-espacos/solicitacoes?filtro=pendentes#reserva-${b.id}`,
      data: { bookingId: b.id }, dedupeKey: `request_expiring:${b.id}`,
    });
  }

  // 2. Pedido que expirou sem resposta (o banco já expirou; aqui só avisa).
  const pedidosExpirados = (await db.execute(sql`
    SELECT ${base}, NULL::timestamptz AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'expired' AND b.end_reason = 'request_not_answered'
       AND b.updated_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of pedidosExpirados) {
    avisos.push(
      {
        userId: b.renter_id, type: 'booking_expired', title: 'Solicitação expirada',
        body: `O proprietário de "${b.title}" não respondeu a tempo. Nada foi cobrado — dá para procurar outro espaço ou pedir de novo.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `request_expired:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'booking_expired', title: 'Uma solicitação expirou',
        body: `A solicitação de ${b.renter_name ?? 'um interessado'} para "${b.title}" passou do prazo de resposta e foi encerrada.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `request_expired:${b.id}`,
      },
    );
  }

  // 3. Aceite perto de vencer — o locatário ainda não pagou.
  const pagamentoAExpirar = (await db.execute(sql`
    SELECT ${base}, b.first_payment_deadline_at AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status IN ('approved', 'awaiting_payment')
       AND b.first_payment_deadline_at > now()
       AND b.first_payment_deadline_at <= now() + make_interval(hours => ${PAYMENT_EXPIRING_NOTICE_HOURS})
  `)) as unknown as LinhaAviso[];
  for (const b of pagamentoAExpirar) {
    const prazo = DATA(b.deadline);
    avisos.push({
      userId: b.renter_id, type: 'payment_upcoming', title: 'Falta pouco para pagar',
      body: `Pague ${prazo ? formatDeadline(prazo, agora) : 'em breve'} para garantir "${b.title}". Depois disso, a vaga é liberada.`,
      linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_expiring:${b.id}`,
    });
  }

  // 4. Aceite que não foi pago a tempo (a vaga já voltou).
  const naoPagas = (await db.execute(sql`
    SELECT ${base}, NULL::timestamptz AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'expired' AND b.end_reason = 'payment_not_received'
       AND b.updated_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of naoPagas) {
    avisos.push(
      {
        userId: b.renter_id, type: 'booking_expired', title: 'Locação expirada',
        body: `O prazo para pagar "${b.title}" terminou e a vaga foi liberada. Nada foi cobrado.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_deadline_expired:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'booking_expired', title: 'Locação expirada sem pagamento',
        body: `${b.renter_name ?? 'O locatário'} não pagou "${b.title}" no prazo. A vaga voltou a ficar disponível.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_deadline_expired:${b.id}`,
      },
    );
  }

  // 5. Janela do pagamento pendente acabando — último aviso.
  const janelaAcabando = (await db.execute(sql`
    SELECT ${base}, b.payment_issue_deadline_at AS deadline, b.payment_issue_started_at AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'past_due'
       AND b.payment_issue_deadline_at > now()
       AND b.payment_issue_deadline_at <= now() + make_interval(mins => ${PAYMENT_WINDOW_NOTICE_MINUTES})
  `)) as unknown as LinhaAviso[];
  for (const b of janelaAcabando) {
    const prazo = DATA(b.deadline);
    const chave = DATA(b.started)?.getTime() ?? 0;
    avisos.push({
      userId: b.renter_id, type: 'payment_failed', title: 'Último aviso para regularizar o pagamento',
      body: `Você tem até as ${prazo ? brTime(prazo) : ''} para pagar o aluguel de "${b.title}". Depois disso, a locação é encerrada.`,
      linkPath: `/reservas/${b.id}/pendente`, data: { bookingId: b.id }, dedupeKey: `payment_window_closing:${b.id}:${chave}`,
    });
  }

  // 6. Encerrada por falta de pagamento (o banco já encerrou; aqui só avisa).
  const encerradasPorPagamento = (await db.execute(sql`
    SELECT ${base}, NULL::timestamptz AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'ended' AND b.end_reason = 'payment_not_received'
       AND b.ended_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of encerradasPorPagamento) {
    avisos.push(
      {
        userId: b.renter_id, type: 'booking_cancelled', title: 'Locação encerrada por falta de pagamento',
        body: `O prazo para regularizar o pagamento de "${b.title}" terminou. A cobrança automática foi cancelada e nada mais será cobrado.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_terminated:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'booking_cancelled', title: 'Locação encerrada por falta de pagamento',
        body: `${b.renter_name ?? 'O locatário'} não regularizou o pagamento de "${b.title}" no prazo. A vaga voltou a ficar disponível.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `payment_terminated:${b.id}`,
      },
    );
  }

  // 7. Encerrada a pedido do proprietário (a data chegou) — os dois já podem avaliar.
  const encerradasPeloDono = (await db.execute(sql`
    SELECT ${base}, NULL::timestamptz AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status = 'ended' AND b.end_reason = 'owner_end_request'
       AND b.ended_at > now() - interval '1 day'
  `)) as unknown as LinhaAviso[];
  for (const b of encerradasPeloDono) {
    avisos.push(
      {
        userId: b.renter_id, type: 'booking_cancelled', title: 'Locação encerrada',
        body: `A locação de "${b.title}" foi encerrada na data pedida pelo proprietário. Conte como foi: a avaliação já está disponível.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `owner_end_done:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'booking_cancelled', title: 'Locação encerrada',
        body: `A locação de "${b.title}" com ${b.renter_name ?? 'o locatário'} foi encerrada. A vaga voltou a ficar disponível.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `owner_end_done:${b.id}`,
      },
      {
        userId: b.renter_id, type: 'review_available', title: 'Avaliação disponível',
        body: `Conte como foi a locação de "${b.title}" — sua avaliação ajuda as próximas pessoas.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `review_available:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'review_available', title: 'Avaliação disponível',
        body: `Conte como foi a locação com ${b.renter_name ?? 'o locatário'} — sua avaliação ajuda os próximos proprietários.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `review_available:${b.id}`,
      },
    );
  }

  // 8. Locação que começou hoje, paga ANTES do dia de início. Paga no próprio dia (ou depois), o aviso de "pagamento
  // confirmado" já disse que a locação começou — não se repete. Janela de 3 dias para trás: cobre uma parada do
  // agendador sem varrer o histórico inteiro.
  const iniciadas = (await db.execute(sql`
    SELECT ${base}, NULL::timestamptz AS deadline, NULL::timestamptz AS started
      FROM bookings b JOIN spaces s ON s.id = b.space_id
     WHERE b.status IN ('active', 'past_due')
       AND b.activated_at IS NOT NULL
       AND (b.activated_at AT TIME ZONE 'America/Sao_Paulo')::date < b.start_date
       AND b.start_date <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND b.start_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 3
  `)) as unknown as LinhaAviso[];
  for (const b of iniciadas) {
    avisos.push(
      {
        userId: b.renter_id, type: 'rental_started', title: 'Sua locação começou',
        body: `Hoje começa a locação de "${b.title}". As instruções de acesso e a rota estão em Meus aluguéis.`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `rental_started:${b.id}`,
      },
      {
        userId: b.owner_id, type: 'rental_started', title: 'Locação iniciada',
        body: `${b.renter_name ?? 'O locatário'} começa hoje a locação de "${b.title}".`,
        linkPath: `/reservas/${b.id}`, data: { bookingId: b.id }, dedupeKey: `rental_started:${b.id}`,
      },
    );
  }

  if (avisos.length === 0) return 0;
  await notifyUsers(db, avisos);
  return avisos.length;
}

/**
 * Lista de espera: avisa quem espera por um anúncio que voltou a ter vaga,
 * seja qual for o motivo (pedido que expirou, locação encerrada, quantidade
 * aumentada, anúncio retomado). A varredura olha o ESTADO, não o evento —
 * por isso nenhum caminho que devolve uma vaga precisa lembrar de avisar.
 */
export async function notifyWaitlistsOfAvailableSpaces(): Promise<number> {
  const linhas = (await db.execute(sql`
    SELECT DISTINCT w.space_id
      FROM waitlist_entries w JOIN spaces s ON s.id = w.space_id
     WHERE w.status = 'waiting' AND s.status = 'published' AND s.quantity_available > 0 AND s.deleted_at IS NULL
  `)) as unknown as { space_id: string }[];
  let avisados = 0;
  for (const l of linhas) {
    avisados += (await notifyWaitlistIfAvailable(l.space_id)).length;
  }
  return avisados;
}

/**
 * Encerra no banco o que já venceu ANTES de mostrar uma tela (prazo de
 * resposta, prazo de pagamento, janela do pagamento pendente, encerramento
 * pedido). Se algo mudou, os avisos e os efeitos no gateway (cancelar
 * recorrência, excluir cobrança, estornar) rodam DEPOIS da resposta: a tela
 * nunca espera o Asaas. Fora de uma requisição (scripts), só encerra — o
 * agendador faz o resto.
 */
export async function sweepExpiredBookings(): Promise<number> {
  const [linha] = (await db.execute(sql`SELECT public.release_expired_rentals(NULL) AS n`)) as unknown as { n: number }[];
  const n = Number(linha?.n ?? 0);
  if (n > 0) {
    try {
      after(async () => {
        try {
          await sendBookingNotices();
          await processPaymentOutbox({ limit: 20 });
          await notifyWaitlistsOfAvailableSpaces();
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

export type MaintenanceSummary = { released: number; notices: number; waitlist: number; outbox: OutboxResult; premium: PremiumMaintenanceSummary; transfers: { sent: number; failed: number }; ownerFees: { changed: number; splitsUpdated: number; splitsFailed: number } };

/** Tudo junto: o agendador chama isto (e o diário, como rede de segurança). */
export async function runBookingMaintenance(): Promise<MaintenanceSummary> {
  const [linha] = (await db.execute(sql`SELECT public.release_expired_rentals(NULL) AS n`)) as unknown as { n: number }[];
  const notices = await sendBookingNotices();
  const outbox = await processPaymentOutbox();
  const waitlist = await notifyWaitlistsOfAvailableSpaces();
  // Premium (Etapa 2): estado das assinaturas, recorrências a cancelar no gateway e avisos.
  const premium = await runPremiumMaintenance();
  // Fila de transferências do benefício do primeiro mês: não faz nada com a feature flag desligada.
  const transfers = await processTransferOutbox();
  // A taxa do proprietário segue o Premium: quem perdeu volta a 3% nas próximas mensalidades (e o split no Asaas acompanha).
  const taxas = await syncOwnerFeesWithPremium();
  const splits = await syncSubscriptionSplits();
  const ownerFees = { changed: taxas.changed, splitsUpdated: splits.updated, splitsFailed: splits.failed };
  return { released: Number(linha?.n ?? 0), notices, waitlist, outbox, premium, transfers, ownerFees };
}

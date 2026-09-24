import 'server-only';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bookings,
  subscriptions,
  payments,
  payouts,
  ledgerEntries,
  webhookEvents,
  notifications,
  auditLogs,
  ownerPayoutAccounts,
  promotionPurchases,
  promotions,
} from '@/db/schema';
import { platformNetCents } from '@/lib/money';

const { PostgresError } = postgres;

/**
 * Processamento de webhook do Asaas.
 *
 * Regra central (pedida explicitamente): o mesmo evento entregue duas vezes
 * NUNCA cria duas cobrancas, libera duas reservas ou duplica repasse/receita.
 * A garantia vem do indice unico `(provider, provider_event_id)` em
 * `webhook_events` (ver src/db/schema/payments.ts) combinado com fazer TUDO
 * — a reivindicacao de idempotencia E as mudancas de negocio — dentro da
 * MESMA transacao: se qualquer parte falhar, nada e gravado (nem o proprio
 * registro do evento), entao uma reentrega apos falha reprocessa do zero em
 * vez de ficar "meio processada".
 *
 * Nomes de evento tratados abaixo — o que e CONFIRMADO por busca (nao leitura
 * direta da documentacao — ver src/lib/payments/asaas.ts) esta listado la.
 * Eventos fora desta lista sao gravados como `ignored`, nao tratados como
 * erro: e mais seguro reconhecer "nao sei o que fazer com isso ainda" do que
 * adivinhar um efeito colateral financeiro.
 */
const EVENTOS_TRATADOS = new Set([
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
]);

export type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    netValue?: number;
    status?: string;
  };
};

export type WebhookResult = { ok: boolean; reason?: string };

export async function processAsaasWebhook(payload: AsaasWebhookPayload): Promise<WebhookResult> {
  const event = payload?.event;
  const providerPaymentId = payload?.payment?.id;

  if (!event || typeof event !== 'string' || !providerPaymentId) {
    return { ok: false, reason: 'payload sem "event" ou "payment.id"' };
  }

  /*
   * Nao ha campo dedicado de id de evento confirmado na apuracao desta
   * rodada (ver docs/PAGAMENTOS.md §4) — por isso a chave de idempotencia e
   * `evento:idDaCobranca`. Isso cobre o caso real que a reentrega do Asaas
   * produz (o MESMO evento, para a MESMA cobranca, reenviado). So haveria
   * problema se o Asaas legitimamente disparasse o MESMO tipo de evento duas
   * vezes para a mesma cobranca por motivos DIFERENTES — o que nao acontece
   * no ciclo de vida normal de uma cobranca (cada evento marca uma transicao
   * de estado que so ocorre uma vez).
   */
  const providerEventId = `${event}:${providerPaymentId}`;

  try {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(webhookEvents)
        .values({ provider: 'asaas', providerEventId, eventType: event, payload, status: 'received' })
        .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
        .returning({ id: webhookEvents.id });

      if (!claimed) {
        return { ok: true, reason: 'evento ja processado antes (idempotencia)' };
      }

      if (!EVENTOS_TRATADOS.has(event)) {
        await tx
          .update(webhookEvents)
          .set({ status: 'ignored', processedAt: new Date() })
          .where(eq(webhookEvents.id, claimed.id));
        return { ok: true, reason: `evento "${event}" reconhecido mas nao tratado por esta versao` };
      }

      const [pagamento] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.provider, 'asaas'), eq(payments.providerPaymentId, providerPaymentId)))
        .limit(1);

      if (pagamento) {
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, pagamento.bookingId)).limit(1);
        if (!booking) {
          // Nao deveria acontecer: bookings.id e referenciado com ON DELETE RESTRICT.
          throw new Error(`reserva ${pagamento.bookingId} da cobranca ${pagamento.id} nao encontrada`);
        }

        await handleEvent(tx, event, pagamento, booking, payload);

        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookEvents.id, claimed.id));

        return { ok: true };
      }

      const [compra] = await tx
        .select()
        .from(promotionPurchases)
        .where(and(eq(promotionPurchases.provider, 'asaas'), eq(promotionPurchases.providerPaymentId, providerPaymentId)))
        .limit(1);

      if (compra) {
        await handlePromotionPurchaseEvent(tx, event, compra, payload);

        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookEvents.id, claimed.id));

        return { ok: true };
      }

      await tx
        .update(webhookEvents)
        .set({ status: 'ignored', processedAt: new Date(), lastError: 'providerPaymentId sem cobranca correspondente no banco' })
        .where(eq(webhookEvents.id, claimed.id));
      return { ok: true, reason: 'providerPaymentId sem cobranca correspondente no banco' };
    });
  } catch (err) {
    console.error('[asaas webhook] falha processando evento:', event, providerPaymentId, err);
    return { ok: false, reason: 'erro interno processando o evento' };
  }
}

// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentRow = typeof payments.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;

async function handleEvent(
  tx: Tx,
  event: string,
  pagamento: PaymentRow,
  booking: BookingRow,
  payload: AsaasWebhookPayload,
) {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
      return handleConfirmed(tx, pagamento, booking, payload);
    case 'PAYMENT_RECEIVED':
      return handleReceived(tx, pagamento, booking, payload);
    case 'PAYMENT_OVERDUE':
      return handleOverdue(tx, pagamento, booking);
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return handleFailed(tx, pagamento, booking);
    case 'PAYMENT_REFUNDED':
      return handleRefunded(tx, pagamento, booking);
    case 'PAYMENT_DELETED':
      return handleDeleted(tx, pagamento);
  }
}

/**
 * Pagamento feito, mas o saldo AINDA NAO esta disponivel (achado confirmado
 * na apuracao — ver src/lib/payments/asaas.ts). E o sinal de que o locatario
 * cumpriu a parte dele: e aqui, nao no PAYMENT_RECEIVED, que a reserva vira
 * "active" e o endereco exato libera — o locatario nao deveria esperar a
 * plataforma receber o dinheiro para poder usar o espaco que ja pagou.
 * O REPASSE ao proprietario, por outro lado, so acontece no PAYMENT_RECEIVED
 * (handleReceived), porque so ali ha dinheiro disponivel de verdade para
 * repassar.
 */
async function handleConfirmed(tx: Tx, pagamento: PaymentRow, booking: BookingRow, payload: AsaasWebhookPayload) {
  await tx
    .update(payments)
    .set({ status: 'confirmed', paidAt: new Date(), providerPayload: payload as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(payments.id, pagamento.id));

  const primeiraAtivacao = !booking.activatedAt;
  if (primeiraAtivacao || booking.status === 'past_due') {
    await tx
      .update(bookings)
      .set({ status: 'active', activatedAt: booking.activatedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));

    if (pagamento.subscriptionId) {
      await tx
        .update(subscriptions)
        .set({ status: 'active', failedCycles: 0, updatedAt: new Date() })
        .where(eq(subscriptions.id, pagamento.subscriptionId));
    }
  }

  await tx.insert(notifications).values([
    {
      userId: booking.renterId, type: 'payment_confirmed', title: 'Pagamento confirmado',
      body: 'Seu pagamento foi confirmado. O aluguel segue ativo.',
      linkPath: '/reservas', data: { bookingId: booking.id, paymentId: pagamento.id },
    },
    {
      userId: booking.ownerId, type: 'payment_confirmed', title: 'Pagamento recebido',
      body: 'O pagamento deste aluguel foi confirmado pelo locatário.',
      linkPath: '/meus-espacos/financeiro', data: { bookingId: booking.id, paymentId: pagamento.id },
    },
  ]);

  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.confirmed',
    entityType: 'payment', entityId: pagamento.id,
    metadata: { bookingId: booking.id, primeiraAtivacao },
  });
}

/**
 * Saldo disponivel de verdade — momento em que existe dinheiro para repassar.
 * `gatewayFeeCents`/`netAmountCents` so ficam conhecidos aqui (o valor bruto
 * cobrado ja era sabido desde a criacao da cobranca, mas a tarifa do gateway
 * so o proprio gateway informa, e so depois de liquidar).
 */
async function handleReceived(tx: Tx, pagamento: PaymentRow, booking: BookingRow, payload: AsaasWebhookPayload) {
  const valorBrutoCents = typeof payload?.payment?.value === 'number'
    ? Math.round(payload.payment.value * 100)
    : pagamento.amountCents;
  const valorLiquidoCents = typeof payload?.payment?.netValue === 'number'
    ? Math.round(payload.payment.netValue * 100)
    : null;
  const tarifaGatewayCents = valorLiquidoCents !== null ? valorBrutoCents - valorLiquidoCents : null;

  const netPlataformaCents = tarifaGatewayCents !== null
    ? platformNetCents(
        { totalChargedCents: booking.totalChargedCents, ownerPayoutCents: booking.ownerPayoutCents },
        tarifaGatewayCents,
      )
    : null;

  await tx
    .update(payments)
    .set({
      status: 'received', creditedAt: new Date(),
      gatewayFeeCents: tarifaGatewayCents, netAmountCents: valorLiquidoCents,
      platformNetCents: netPlataformaCents, updatedAt: new Date(),
    })
    .where(eq(payments.id, pagamento.id));

  const [contaDoDono] = await tx
    .select()
    .from(ownerPayoutAccounts)
    .where(eq(ownerPayoutAccounts.ownerId, booking.ownerId))
    .limit(1);

  let payoutId: string | null = null;
  if (contaDoDono?.providerWalletId) {
    const [jaTemPayout] = await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.paymentId, pagamento.id)).limit(1);
    if (!jaTemPayout) {
      const [novo] = await tx
        .insert(payouts)
        .values({
          paymentId: pagamento.id, ownerId: booking.ownerId, provider: 'asaas',
          providerWalletId: contaDoDono.providerWalletId,
          /*
           * status 'pending', nao 'settled': o split do Asaas move o dinheiro
           * na carteira do proprietario, mas nao confirmei (nem por busca) um
           * evento de webhook dedicado a "o repasse pousou de verdade" — so
           * marcar 'settled' sem essa confirmacao seria inventar um estado
           * que ninguem viu acontecer.
           */
          amountCents: booking.ownerPayoutCents, status: 'pending',
        })
        .returning({ id: payouts.id });
      payoutId = novo!.id;
    }
  } else {
    console.error(`[asaas webhook] proprietario ${booking.ownerId} sem carteira cadastrada — repasse do pagamento ${pagamento.id} nao registrado`);
  }

  if (tarifaGatewayCents !== null) {
    /*
     * As tres linhas sao do ponto de vista da PLATAFORMA (userId null): o que
     * entrou, o que o gateway cobrou, o que saiu no repasse. "Quanto ESTE
     * proprietario recebeu" ja tem lugar proprio e mais direto — a tabela
     * `payouts` (payouts.ownerId) — entao o ledger nao duplica essa marcacao
     * aqui. Isso mantem uma conta simples: soma das tres linhas desta cobranca
     * bate exatamente com `platformNetCents` (src/lib/money.ts).
     */
    await tx.insert(ledgerEntries).values([
      {
        type: 'charge_captured', bookingId: booking.id, paymentId: pagamento.id,
        userId: null, amountCents: valorBrutoCents, description: 'Cobranca capturada',
      },
      {
        type: 'gateway_fee', bookingId: booking.id, paymentId: pagamento.id,
        userId: null, amountCents: -tarifaGatewayCents, description: 'Tarifa do gateway (Asaas)',
      },
      {
        type: 'owner_payout', bookingId: booking.id, paymentId: pagamento.id, payoutId,
        userId: null, amountCents: -booking.ownerPayoutCents, description: 'Repasse ao proprietario',
      },
    ]);
  }

  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.received',
    entityType: 'payment', entityId: pagamento.id,
    metadata: { bookingId: booking.id, gatewayFeeCents: tarifaGatewayCents, payoutId },
  });
}

async function handleOverdue(tx: Tx, pagamento: PaymentRow, booking: BookingRow) {
  await tx.update(payments).set({ status: 'overdue', updatedAt: new Date() }).where(eq(payments.id, pagamento.id));

  if (booking.status === 'active') {
    await tx.update(bookings).set({ status: 'past_due', updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  }
  if (pagamento.subscriptionId) {
    await tx
      .update(subscriptions)
      .set({ status: 'past_due', failedCycles: sql`${subscriptions.failedCycles} + 1`, updatedAt: new Date() })
      .where(eq(subscriptions.id, pagamento.subscriptionId));
  }

  await tx.insert(notifications).values({
    userId: booking.renterId, type: 'payment_failed', title: 'Pagamento em atraso',
    body: 'O pagamento deste mês está atrasado. Regularize para manter o aluguel ativo.',
    linkPath: '/reservas', data: { bookingId: booking.id, paymentId: pagamento.id },
  });
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.overdue',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id },
  });
}

async function handleFailed(tx: Tx, pagamento: PaymentRow, booking: BookingRow) {
  await tx
    .update(payments)
    .set({ status: 'failed', failureReason: 'Recusado na analise de risco do gateway.', updatedAt: new Date() })
    .where(eq(payments.id, pagamento.id));

  await tx.insert(notifications).values({
    userId: booking.renterId, type: 'payment_failed', title: 'Pagamento recusado',
    body: 'Seu pagamento não foi aprovado. Tente novamente com outro cartão ou meio de pagamento.',
    linkPath: '/reservas', data: { bookingId: booking.id, paymentId: pagamento.id },
  });
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.failed',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id },
  });
}

async function handleRefunded(tx: Tx, pagamento: PaymentRow, booking: BookingRow) {
  await tx
    .update(payments)
    .set({ status: 'refunded', refundedCents: pagamento.amountCents, updatedAt: new Date() })
    .where(eq(payments.id, pagamento.id));

  await tx.insert(ledgerEntries).values({
    type: 'refund', bookingId: booking.id, paymentId: pagamento.id,
    userId: null, amountCents: -pagamento.amountCents, description: 'Estorno',
  });

  await tx.insert(notifications).values({
    userId: booking.renterId, type: 'payment_failed', title: 'Pagamento estornado',
    body: 'O pagamento deste aluguel foi estornado.',
    linkPath: '/reservas', data: { bookingId: booking.id, paymentId: pagamento.id },
  });
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.refunded',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id },
  });
}

async function handleDeleted(tx: Tx, pagamento: PaymentRow) {
  await tx.update(payments).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(payments.id, pagamento.id));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.deleted',
    entityType: 'payment', entityId: pagamento.id, metadata: {},
  });
}

// ---------------------------------------------------------------------------
// Compra avulsa de Destaque/Turbo — cobranca UNICA, sem split, sem reserva.
// ---------------------------------------------------------------------------

type PromotionPurchaseRow = typeof promotionPurchases.$inferSelect;

/**
 * `true` quando o erro veio do indice unico que impede duas promocoes
 * vigentes no mesmo espaco (`promotions_one_active_per_space`) — mesmo
 * codigo `23505` usado em `promotions/actions.ts`.
 */
function isOverlappingPromotionConflict(err: unknown): boolean {
  const pg = err instanceof PostgresError
    ? err
    : err instanceof Error && err.cause instanceof PostgresError
      ? err.cause
      : null;
  return pg?.code === '23505' && pg.constraint_name === 'promotions_one_active_per_space';
}

async function handlePromotionPurchaseEvent(
  tx: Tx,
  event: string,
  compra: PromotionPurchaseRow,
  payload: AsaasWebhookPayload,
) {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
      return handlePurchaseConfirmed(tx, compra, payload);
    case 'PAYMENT_RECEIVED':
      return handlePurchaseReceived(tx, compra);
    case 'PAYMENT_OVERDUE':
      await tx.update(promotionPurchases).set({ status: 'overdue', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
      return;
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      await tx
        .update(promotionPurchases)
        .set({ status: 'failed', failureReason: 'Recusado na analise de risco do gateway.', updatedAt: new Date() })
        .where(eq(promotionPurchases.id, compra.id));
      return;
    case 'PAYMENT_REFUNDED':
      return handlePurchaseRefunded(tx, compra);
    case 'PAYMENT_DELETED':
      await tx.update(promotionPurchases).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
      return;
  }
}

/**
 * Pagamento confirmado: a promocao nasce AGORA (nao no momento da compra) —
 * `startedAt`/`expiresAt` contam a partir de quando o dinheiro esta
 * confirmado, nao de quando a pessoa clicou em comprar.
 *
 * Se o espaco ja tiver uma promocao vigente nesse meio-tempo (ex.: usou um
 * beneficio Premium gratis enquanto a cobranca estava pendente), o indice
 * unico recusa o INSERT — o pagamento fica confirmado mesmo assim, mas sem
 * `promotion_id`, com o motivo registrado para suporte resolver (reembolso
 * manual), em vez de perder o dinheiro silenciosamente ou quebrar o webhook
 * inteiro.
 */
async function handlePurchaseConfirmed(tx: Tx, compra: PromotionPurchaseRow, payload: AsaasWebhookPayload) {
  if (compra.promotionId) return; // ja processado (reentrega do mesmo evento nao deveria chegar aqui, mas por garantia)

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + compra.durationHours * 60 * 60 * 1000);

  /*
   * O INSERT arriscado (pode colidir com `promotions_one_active_per_space`)
   * fica isolado num SAVEPOINT: uma vez que um INSERT falha, o Postgres
   * aborta a transacao INTEIRA ate ela terminar — nenhum outro comando
   * roda, nem sequer o UPDATE de recuperacao no catch. `tx.transaction()`
   * aninhado vira SAVEPOINT de verdade (suporte nativo do Drizzle sobre
   * postgres.js): se o INSERT falhar, so ELE desfaz, e o `tx` de fora
   * continua saudavel para gravar o resultado (com ou sem promocao).
   */
  let promotionId: string | null = null;
  let conflito = false;
  try {
    await tx.transaction(async (tx2) => {
      const [criada] = await tx2
        .insert(promotions)
        .values({
          spaceId: compra.spaceId,
          ownerId: compra.ownerId,
          type: compra.type,
          status: 'active',
          source: 'purchase',
          transactionId: compra.providerPaymentId,
          startedAt,
          expiresAt,
        })
        .returning({ id: promotions.id });
      promotionId = criada!.id;
    });
  } catch (err) {
    if (!isOverlappingPromotionConflict(err)) throw err;
    conflito = true;
  }

  if (!conflito) {
    await tx
      .update(promotionPurchases)
      .set({
        status: 'confirmed', paidAt: startedAt, promotionId,
        providerPayload: payload as Record<string, unknown>, updatedAt: new Date(),
      })
      .where(eq(promotionPurchases.id, compra.id));

    await tx.insert(notifications).values({
      userId: compra.ownerId, type: 'payment_confirmed', title: 'Promoção ativada',
      body: `Pagamento confirmado — seu anúncio está com ${compra.type === 'turbo' ? 'Turbo' : 'Destaque'} ativo.`,
      linkPath: '/meus-espacos', data: { spaceId: compra.spaceId, promotionId },
    });
    await tx.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'promotion_purchase.confirmed',
      entityType: 'promotion_purchase', entityId: compra.id,
      metadata: { spaceId: compra.spaceId, type: compra.type, promotionId },
    });
  } else {
    await tx
      .update(promotionPurchases)
      .set({
        status: 'confirmed', paidAt: startedAt,
        failureReason: 'Pagamento confirmado, mas o anúncio já tinha outra promoção vigente — precisa de reembolso manual.',
        providerPayload: payload as Record<string, unknown>, updatedAt: new Date(),
      })
      .where(eq(promotionPurchases.id, compra.id));

    await tx.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'promotion_purchase.confirmed_without_activation',
      entityType: 'promotion_purchase', entityId: compra.id,
      metadata: { spaceId: compra.spaceId, type: compra.type, reason: 'overlapping_promotion' },
    });
  }
}

async function handlePurchaseReceived(tx: Tx, compra: PromotionPurchaseRow) {
  await tx.update(promotionPurchases).set({ status: 'received', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'promotion_purchase.received',
    entityType: 'promotion_purchase', entityId: compra.id, metadata: { spaceId: compra.spaceId },
  });
}

/** Estorno depois de confirmado: cancela a promocao tambem — sem cobranca, sem boost. */
async function handlePurchaseRefunded(tx: Tx, compra: PromotionPurchaseRow) {
  await tx.update(promotionPurchases).set({ status: 'refunded', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));

  if (compra.promotionId) {
    await tx
      .update(promotions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(promotions.id, compra.promotionId), sql`${promotions.status} IN ('scheduled','active')`));
  }

  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'promotion_purchase.refunded',
    entityType: 'promotion_purchase', entityId: compra.id, metadata: { spaceId: compra.spaceId, promotionId: compra.promotionId },
  });
}

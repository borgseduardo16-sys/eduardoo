import 'server-only';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bookings,
  spaces,
  subscriptions,
  payments,
  payouts,
  ledgerEntries,
  webhookEvents,
  auditLogs,
  ownerPayoutAccounts,
  promotionPurchases,
  promotions,
  bookingDeposits,
} from '@/db/schema';
import { platformNetCents } from '@/lib/money';
import { insertNotification, insertNotifications, flushPushJobs, type PushJob } from '@/lib/notifications/dispatch';
import { postAccessInstructions } from '@/lib/messaging/system';
import { PAYMENT_WINDOW_MINUTES } from '@/lib/bookings/payment-window';
import { formatDateShort } from '@/lib/bookings/format';
import { brDate, brTime } from '@/lib/time';
import { handleDepositEvent } from './deposits';

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
 * As notificacoes (Fase 19) sao inseridas com o `tx` da transacao — mas o
 * PUSH de verdade so e disparado DEPOIS que a transacao comitou (ver o fim
 * desta funcao). Mandar o push de dentro do handler correria na frente do
 * commit: se um passo POSTERIOR da mesma transacao falhasse, o push já
 * teria avisado de algo que acabou de ser desfeito.
 *
 * Nomes de evento tratados abaixo — o que e CONFIRMADO por busca (nao leitura
 * direta da documentacao — ver src/lib/payments/asaas.ts) esta listado la.
 * Eventos fora desta lista sao gravados como `ignored`, nao tratados como
 * erro: e mais seguro reconhecer "nao sei o que fazer com isso ainda" do que
 * adivinhar um efeito colateral financeiro.
 */
const EVENTOS_TRATADOS = new Set([
  // Fase 23: cobrança nova gerada pela assinatura (renovação mensal).
  'PAYMENT_CREATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  // Parte 12: a cobrança automática no cartão foi recusada pela operadora
  // (documentação do Asaas, "Eventos para cobranças").
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
]);

export type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    netValue?: number;
    status?: string;
    /**
     * Id da assinatura de origem ("sub_..."), só presente quando a cobrança
     * foi gerada por uma assinatura — é o que liga as renovações mensais à
     * nossa `subscriptions` (documentação do Asaas: eventos para cobranças).
     */
    subscription?: string;
    dueDate?: string;
    invoiceUrl?: string;
    /** Forma de pagamento da cobrança no gateway (PIX, CREDIT_CARD, BOLETO…) — só informativo. */
    billingType?: string;
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

  let pushJobs: PushJob[] = [];
  // Coisas que só podem acontecer DEPOIS do commit (mensagem no chat, por exemplo): se a
  // transação desfizer, elas não acontecem.
  const afterCommit: AfterCommit = [];
  let resultado: WebhookResult;

  try {
    resultado = await db.transaction(async (tx) => {
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

        pushJobs = await handleEvent(tx, event, pagamento, booking, payload, afterCommit);
        if (pagamento.subscriptionId) await recalcNextDueDate(tx, pagamento.subscriptionId);

        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookEvents.id, claimed.id));

        return { ok: true };
      }

      /*
       * Fase 23 — renovação: a partir do 2º mês, quem cria a cobrança é o
       * próprio Asaas (a assinatura), então ela chega aqui sem linha nossa.
       * Se o `payment.subscription` é uma assinatura NOSSA, a cobrança é
       * registrada (com os valores que o gateway informou) e o evento segue
       * o mesmo caminho de qualquer cobrança. Assinatura desconhecida cai no
       * "ignorado" lá embaixo — nada é criado a partir de um id que não é nosso.
       */
      const idAssinatura = typeof payload.payment?.subscription === 'string' ? payload.payment.subscription : null;
      if (idAssinatura) {
        const [assinatura] = await tx
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.provider, 'asaas'), eq(subscriptions.providerSubscriptionId, idAssinatura)))
          .limit(1);
        if (assinatura) {
          const [booking] = await tx.select().from(bookings).where(eq(bookings.id, assinatura.bookingId)).limit(1);
          if (!booking) throw new Error(`reserva ${assinatura.bookingId} da assinatura ${assinatura.id} nao encontrada`);
          const cobranca = await registerSubscriptionPayment(tx, assinatura, providerPaymentId, payload);
          pushJobs = await handleEvent(tx, event, cobranca, booking, payload, afterCommit);
          await recalcNextDueDate(tx, assinatura.id);

          await tx
            .update(webhookEvents)
            .set({ status: 'processed', processedAt: new Date() })
            .where(eq(webhookEvents.id, claimed.id));

          return { ok: true };
        }
      }

      const [compra] = await tx
        .select()
        .from(promotionPurchases)
        .where(and(eq(promotionPurchases.provider, 'asaas'), eq(promotionPurchases.providerPaymentId, providerPaymentId)))
        .limit(1);

      if (compra) {
        pushJobs = await handlePromotionPurchaseEvent(tx, event, compra, payload);

        await tx
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookEvents.id, claimed.id));

        return { ok: true };
      }

      const [deposito] = await tx
        .select()
        .from(bookingDeposits)
        .where(and(eq(bookingDeposits.provider, 'asaas'), eq(bookingDeposits.providerPaymentId, providerPaymentId)))
        .limit(1);

      if (deposito) {
        pushJobs = await handleDepositEvent(tx, event, deposito, payload);

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

  try {
    await flushPushJobs(pushJobs);
  } catch (err) {
    // O webhook em si ja comitou com sucesso — uma falha so no push nunca vira "erro" pro Asaas.
    console.error('[asaas webhook] falha ao enviar push (nao afeta o processamento):', err);
  }
  for (const tarefa of afterCommit) {
    try {
      await tarefa();
    } catch (err) {
      console.error('[asaas webhook] tarefa pos-commit falhou (nao afeta o processamento):', err);
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AfterCommit = Array<() => Promise<void>>;
type PaymentRow = typeof payments.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * Grava localmente uma cobrança gerada pela assinatura (renovação). Valor,
 * vencimento e link de pagamento vêm do gateway (servidor a servidor, com o
 * token do webhook) — nunca do navegador. Valor inválido cai no valor da
 * assinatura; se o gateway cobrar diferente do combinado, fica registrado na
 * auditoria. Idempotente pelo índice único (provider, provider_payment_id).
 */
async function registerSubscriptionPayment(
  tx: Tx,
  assinatura: SubscriptionRow,
  providerPaymentId: string,
  payload: AsaasWebhookPayload,
): Promise<PaymentRow> {
  const bruto = payload.payment?.value;
  const valorCents = typeof bruto === 'number' && Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto * 100) : assinatura.amountCents;
  const venc = payload.payment?.dueDate;
  const dueDate = typeof venc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(venc)
    ? venc
    : (assinatura.nextDueDate ?? new Date().toISOString().slice(0, 10));
  const link = payload.payment?.invoiceUrl;
  const invoiceUrl = typeof link === 'string' && link.startsWith('https://') ? link.slice(0, 500) : null;

  const [novo] = await tx
    .insert(payments)
    .values({
      bookingId: assinatura.bookingId,
      subscriptionId: assinatura.id,
      provider: 'asaas',
      providerPaymentId,
      status: 'pending',
      method: assinatura.method,
      amountCents: valorCents,
      dueDate,
      invoiceUrl,
      providerPayload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [payments.provider, payments.providerPaymentId] })
    .returning();
  const linha = novo ?? (await tx
    .select()
    .from(payments)
    .where(and(eq(payments.provider, 'asaas'), eq(payments.providerPaymentId, providerPaymentId)))
    .limit(1))[0];
  if (!linha) throw new Error(`cobranca ${providerPaymentId} nao pôde ser registrada`);

  if (novo) {
    await tx.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'payment.renewal_registered',
      entityType: 'payment', entityId: novo.id,
      metadata: {
        bookingId: assinatura.bookingId, subscriptionId: assinatura.id, dueDate,
        amountCents: valorCents, expectedAmountCents: assinatura.amountCents,
        amountMismatch: valorCents !== assinatura.amountCents,
      },
    });
  }
  return linha;
}

/**
 * Próxima cobrança da assinatura = o vencimento mais antigo ainda em aberto;
 * sem nada em aberto, um mês depois da última paga. Recalculado a cada
 * evento de cobrança — é o que mantém "Próxima cobrança" na tela e o
 * lembrete de vencimento certos mês após mês (antes da Fase 23, o valor
 * gravado no checkout nunca avançava).
 */
async function recalcNextDueDate(tx: Tx, subscriptionId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE subscriptions s SET
      next_due_date = COALESCE(
        (SELECT min(p.due_date) FROM payments p
          WHERE p.subscription_id = s.id AND p.status IN ('pending', 'overdue')),
        (SELECT (max(p.due_date) + interval '1 month')::date FROM payments p
          WHERE p.subscription_id = s.id AND p.status IN ('confirmed', 'received')),
        s.next_due_date
      ),
      updated_at = now()
    WHERE s.id = ${subscriptionId}
  `);
}

async function handleEvent(
  tx: Tx,
  event: string,
  pagamento: PaymentRow,
  booking: BookingRow,
  payload: AsaasWebhookPayload,
  afterCommit: AfterCommit,
): Promise<PushJob[]> {
  switch (event) {
    case 'PAYMENT_CREATED':
      return handleCreated(tx, pagamento, booking, payload);
    case 'PAYMENT_CONFIRMED':
      return handleConfirmed(tx, pagamento, booking, payload, afterCommit);
    case 'PAYMENT_RECEIVED':
      return handleReceived(tx, pagamento, booking, payload, afterCommit);
    case 'PAYMENT_OVERDUE':
      return handleOverdue(tx, pagamento, booking);
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return handleFailed(tx, pagamento, booking, 'Recusado na analise de risco do gateway.');
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
      return handleFailed(tx, pagamento, booking, 'Cartão recusado pela operadora.');
    case 'PAYMENT_REFUNDED':
      return handleRefunded(tx, pagamento, booking);
    case 'PAYMENT_DELETED':
      return handleDeleted(tx, pagamento);
  }
  return [];
}

/**
 * Cobrança criada (Fase 23). Não avisa ninguém: o lembrete de vencimento
 * (7 e 1 dia antes, cron diário) já cuida disso sem duplicar. Só completa o
 * link de pagamento se ainda não havia, e registra na auditoria se a
 * cobrança nasceu depois de o aluguel acabar (não deveria acontecer: a
 * assinatura é cancelada no gateway ao encerrar).
 */
async function handleCreated(tx: Tx, pagamento: PaymentRow, booking: BookingRow, payload: AsaasWebhookPayload): Promise<PushJob[]> {
  const link = payload.payment?.invoiceUrl;
  if (!pagamento.invoiceUrl && typeof link === 'string' && link.startsWith('https://')) {
    await tx.update(payments).set({ invoiceUrl: link.slice(0, 500), updatedAt: new Date() }).where(eq(payments.id, pagamento.id));
  }
  if (booking.status === 'ended' || booking.status === 'cancelled') {
    await tx.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'payment.created_after_end',
      entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id, bookingStatus: booking.status },
    });
  }
  return [];
}

/**
 * Pagamento feito, mas o saldo AINDA NAO esta disponivel (achado confirmado
 * na apuracao — ver src/lib/payments/asaas.ts). E o sinal de que o locatario
 * cumpriu a parte dele: e aqui, nao no PAYMENT_RECEIVED, que a locação vira
 * "active" e o endereco exato e as instruções de acesso liberam — o locatario
 * nao deveria esperar a plataforma receber o dinheiro para poder usar o
 * espaco que ja pagou. O REPASSE ao proprietario, por outro lado, so acontece
 * no PAYMENT_RECEIVED (handleReceived), porque so ali ha dinheiro disponivel
 * de verdade para repassar.
 *
 * A confirmação depende de COMO está a locação agora:
 *   - aceita / aguardando pagamento → ativa (a VAGA já era dela desde o aceite;
 *     "aguardando início" é só `active` com a data de início no futuro);
 *   - pagamento pendente → volta a ativa e a janela de 2 h some;
 *   - ativa → mais uma mensalidade (renovação);
 *   - expirada, encerrada, cancelada ou recusada (o dinheiro chegou depois do
 *     fim) → estorno automático, e a pessoa é avisada. Nunca cobra por algo
 *     que não entrega — e não reativa: a recorrência no gateway já foi cancelada.
 */
async function handleConfirmed(
  tx: Tx,
  pagamento: PaymentRow,
  booking: BookingRow,
  payload: AsaasWebhookPayload,
  afterCommit: AfterCommit,
): Promise<PushJob[]> {
  // Nunca rebaixa uma cobrança que já está à frente (evento fora de ordem).
  await tx
    .update(payments)
    .set({ status: 'confirmed', paidAt: new Date(), providerPayload: payload as Record<string, unknown>, deleteRequestedAt: null, updatedAt: new Date() })
    .where(and(eq(payments.id, pagamento.id), sql`${payments.status} IN ('pending', 'overdue', 'failed')`));

  if (booking.status === 'ended' || booking.status === 'cancelled' || booking.status === 'expired' || booking.status === 'rejected') {
    return requestLateRefund(tx, pagamento, booking, 'Pagamento confirmado depois que a locação já tinha terminado.');
  }

  const primeiraAtivacao = !booking.activatedAt;
  const regularizou = booking.status === 'past_due';
  // Mensalidade de uma locação que já estava rodando = renovação.
  const renovacao = !primeiraAtivacao && !regularizou;

  let ativouAgora = false;
  if (booking.status === 'awaiting_payment' || booking.status === 'approved' || booking.status === 'past_due') {
    const ativadas = await tx
      .update(bookings)
      .set({
        status: 'active',
        activatedAt: booking.activatedAt ?? new Date(),
        paymentIssueStartedAt: null,
        paymentIssueDeadlineAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, booking.id), sql`${bookings.status} IN ('approved', 'awaiting_payment', 'past_due')`))
      .returning({ id: bookings.id });
    ativouAgora = ativadas.length > 0;

    if (pagamento.subscriptionId) {
      await tx
        .update(subscriptions)
        .set({ status: 'active', failedCycles: 0, updatedAt: new Date() })
        .where(eq(subscriptions.id, pagamento.subscriptionId));
    }
  }

  const [anuncio] = await tx.select({ title: spaces.title }).from(spaces).where(eq(spaces.id, booking.spaceId)).limit(1);
  const titulo = anuncio?.title ?? 'o espaço';
  const hoje = brDate(new Date());
  const comecaDepois = booking.startDate > hoje;

  const jobs = await insertNotifications(tx, [
    // dedupeKey por COBRANCA: CONFIRMED e RECEIVED da mesma cobranca (eventos
    // diferentes, ids diferentes) nao viram dois avisos iguais.
    {
      userId: booking.renterId, type: 'payment_confirmed',
      title: regularizou ? 'Pagamento regularizado' : renovacao ? 'Renovação confirmada' : 'Pagamento confirmado',
      body: regularizou
        ? `Recebemos o pagamento. Sua locação de "${titulo}" continua ativa.`
        : renovacao
          ? `O pagamento da mensalidade de "${titulo}" foi confirmado. A locação segue ativa por mais um mês.`
          : comecaDepois
            ? `Sua locação de "${titulo}" está confirmada e começa em ${formatDateShort(booking.startDate)}. As instruções de acesso e a rota estão em Meus aluguéis.`
            : `Sua locação de "${titulo}" está confirmada e já começou. As instruções de acesso e a rota estão em Meus aluguéis.`,
      linkPath: `/reservas/${booking.id}`, data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_confirmed:${pagamento.id}`,
    },
    {
      userId: booking.ownerId, type: 'payment_confirmed',
      title: regularizou ? 'Pagamento regularizado' : renovacao ? 'Mensalidade paga' : 'Locação confirmada',
      body: regularizou
        ? `O locatário regularizou o pagamento de "${titulo}".`
        : renovacao
          ? `O locatário pagou a mensalidade de "${titulo}".`
          : `O pagamento foi confirmado e a locação de "${titulo}" está garantida${comecaDepois ? `, com início em ${formatDateShort(booking.startDate)}` : ' e já começou'}.`,
      linkPath: renovacao || regularizou ? '/meus-espacos/financeiro' : `/reservas/${booking.id}`,
      data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_confirmed:${pagamento.id}`,
    },
  ]);

  // Um aviso por pessoa: com a data de início já chegada, o próprio "pagamento confirmado" diz que a locação
  // começou. Só quando o pagamento vem ANTES do início a manutenção avisa de novo, no dia (maintenance.ts).

  // As instruções de acesso (texto e/ou áudio) vão para o chat só agora que o pagamento
  // está confirmado — antes disso a localização exata é privada.
  if (ativouAgora && primeiraAtivacao && (booking.accessInstructions || booking.accessAudioPath)) {
    afterCommit.push(() =>
      postAccessInstructions({
        spaceId: booking.spaceId,
        renterId: booking.renterId,
        ownerId: booking.ownerId,
        spaceTitle: titulo,
        text: booking.accessInstructions,
        audio: booking.accessAudioPath && booking.accessAudioDurationMs && booking.accessAudioMime
          ? { path: booking.accessAudioPath, durationMs: booking.accessAudioDurationMs, mime: booking.accessAudioMime }
          : null,
      }),
    );
  }

  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.confirmed',
    entityType: 'payment', entityId: pagamento.id,
    metadata: { bookingId: booking.id, primeiraAtivacao, regularizou },
  });

  return jobs;
}

/**
 * Dinheiro que chegou para um aluguel que não existe mais: marca o estorno
 * (o agendador executa no Asaas e repete até confirmar) e avisa a pessoa.
 */
async function requestLateRefund(tx: Tx, pagamento: PaymentRow, booking: BookingRow, motivo: string): Promise<PushJob[]> {
  await tx
    .update(payments)
    .set({ refundRequestedAt: new Date(), refundReason: motivo, updatedAt: new Date() })
    .where(and(eq(payments.id, pagamento.id), sql`${payments.refundRequestedAt} IS NULL`));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.late_refund_requested',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id, bookingStatus: booking.status, motivo },
  });
  return insertNotifications(tx, [
    {
      userId: booking.renterId, type: 'payment_refunded', title: 'Seu pagamento será devolvido',
      body: 'O pagamento chegou depois que o aluguel já tinha terminado. Ele está sendo estornado automaticamente — nada fica cobrado.',
      linkPath: `/reservas/${booking.id}`, data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `late_refund:${pagamento.id}`,
    },
  ]);
}

/**
 * Saldo disponivel de verdade — momento em que existe dinheiro para repassar.
 * `gatewayFeeCents`/`netAmountCents` so ficam conhecidos aqui (o valor bruto
 * cobrado ja era sabido desde a criacao da cobranca, mas a tarifa do gateway
 * so o proprio gateway informa, e so depois de liquidar).
 *
 * Pix (e boleto) NÃO passam por PAYMENT_CONFIRMED: o Asaas manda
 * PAYMENT_CREATED → PAYMENT_RECEIVED (documentação, "Eventos para
 * cobranças"). Para essas cobranças o RECEIVED é o primeiro aviso de que
 * houve pagamento, e por isso faz antes o que o CONFIRMED faria: ativar a
 * reserva, regularizar o pagamento pendente, reativar a reserva expirada ou
 * mandar estornar o que chegou tarde. Sem isso, um aluguel pago por Pix
 * nunca ficava ativo.
 */
async function handleReceived(
  tx: Tx,
  pagamentoRecebido: PaymentRow,
  booking: BookingRow,
  payload: AsaasWebhookPayload,
  afterCommit: AfterCommit,
): Promise<PushJob[]> {
  let pagamento = pagamentoRecebido;
  let jobs: PushJob[] = [];
  if (pagamento.status === 'pending' || pagamento.status === 'overdue' || pagamento.status === 'failed') {
    jobs = await handleConfirmed(tx, pagamento, booking, payload, afterCommit);
    // A confirmação pode ter mandado estornar (pagamento depois do fim): relê.
    const [relida] = await tx.select().from(payments).where(eq(payments.id, pagamento.id)).limit(1);
    if (relida) pagamento = relida;
  }

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

  // Cobrança já estornada (pagamento que chegou depois do fim) não volta a
  // "recebida": o evento só completa tarifa e valor líquido — e não gera
  // repasse ao proprietário (o dinheiro volta inteiro para quem pagou).
  const estornada = pagamento.status === 'refunded' || pagamento.status === 'partially_refunded' || pagamento.refundRequestedAt != null;
  await tx
    .update(payments)
    .set({
      ...(estornada ? {} : { status: 'received' as const }),
      creditedAt: new Date(),
      gatewayFeeCents: tarifaGatewayCents, netAmountCents: valorLiquidoCents,
      platformNetCents: estornada ? null : netPlataformaCents, updatedAt: new Date(),
    })
    .where(eq(payments.id, pagamento.id));

  const [contaDoDono] = await tx
    .select()
    .from(ownerPayoutAccounts)
    .where(eq(ownerPayoutAccounts.ownerId, booking.ownerId))
    .limit(1);

  let payoutId: string | null = null;
  if (estornada) {
    // Sem repasse: o pagamento está sendo devolvido.
  } else if (contaDoDono?.providerWalletId) {
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
      ...(estornada
        ? []
        : [{
            type: 'owner_payout' as const, bookingId: booking.id, paymentId: pagamento.id, payoutId,
            userId: null, amountCents: -booking.ownerPayoutCents, description: 'Repasse ao proprietario',
          }]),
    ]);
  }

  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.received',
    entityType: 'payment', entityId: pagamento.id,
    metadata: { bookingId: booking.id, gatewayFeeCents: tarifaGatewayCents, payoutId, estornada },
  });

  return jobs;
}

/**
 * Cobrança vencida. Na locação em andamento, é a falha da cobrança (Pix do mês
 * não pago até o vencimento): abre a janela de regularização — 2 horas, no
 * TOTAL — em vez de encerrar na hora.
 */
async function handleOverdue(tx: Tx, pagamento: PaymentRow, booking: BookingRow): Promise<PushJob[]> {
  await tx
    .update(payments)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(eq(payments.id, pagamento.id), sql`${payments.status} IN ('pending', 'failed')`));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.overdue',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id },
  });

  if (booking.status === 'active') {
    return openPaymentWindow(tx, pagamento, booking, 'overdue');
  }
  // Primeira cobrança ainda não paga: a pessoa fica sabendo do atraso (a vaga só segue
  // reservada até o fim do prazo de 24 h do aceite).
  if (booking.status === 'awaiting_payment' || booking.status === 'approved') {
    return insertNotifications(tx, [
      {
        userId: booking.renterId, type: 'payment_failed', title: 'Pagamento em atraso',
        body: 'O primeiro pagamento desta locação venceu. Pague pelo app para garantir a vaga.',
        linkPath: `/reservas/${booking.id}`, data: { bookingId: booking.id, paymentId: pagamento.id },
        dedupeKey: `payment_overdue:${pagamento.id}`,
      },
    ]);
  }
  return [];
}

/**
 * Cobrança recusada (cartão recusado pela operadora ou reprovado na análise
 * de risco). A cobrança continua em aberto no Asaas e pode ser paga de
 * outro jeito ("Pagar agora" troca a forma de pagamento dela). Na locação em
 * andamento, abre a mesma janela de 2 horas.
 */
async function handleFailed(tx: Tx, pagamento: PaymentRow, booking: BookingRow, motivo: string): Promise<PushJob[]> {
  await tx
    .update(payments)
    .set({ failureReason: motivo, updatedAt: new Date() })
    .where(eq(payments.id, pagamento.id));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.failed',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id, motivo },
  });

  if (booking.status === 'active') {
    return openPaymentWindow(tx, pagamento, booking, 'card_refused');
  }
  if (booking.status === 'past_due') return []; // a janela já está aberta; a tela mostra o motivo
  if (booking.status !== 'approved' && booking.status !== 'awaiting_payment') return [];

  return insertNotifications(tx, [
    {
      userId: booking.renterId, type: 'payment_failed', title: 'Pagamento recusado',
      body: 'Seu pagamento não foi aprovado. Tente com outro cartão ou pague com Pix — a vaga segue reservada até o fim do prazo.',
      linkPath: `/reservas/${booking.id}`,
      data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_failed:${pagamento.id}`,
    },
  ]);
}

/**
 * Abre a janela de regularização do pagamento pendente: a locação NÃO é
 * cancelada na hora. São 2 horas no TOTAL; o prazo fica gravado na locação
 * (o banco confere que é exatamente esse) e quem encerra no fim é
 * `release_expired_rentals`, pelo relógio do banco. Durante a janela dá para
 * tentar o cartão de novo ou pagar por Pix; regularizou, a locação continua.
 */
async function openPaymentWindow(tx: Tx, pagamento: PaymentRow, booking: BookingRow, causa: 'overdue' | 'card_refused'): Promise<PushJob[]> {
  const abertas = await tx
    .update(bookings)
    .set({
      status: 'past_due',
      paymentIssueStartedAt: sql`now()`,
      paymentIssueDeadlineAt: sql`now() + make_interval(mins => ${PAYMENT_WINDOW_MINUTES})`,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'active')))
    .returning({ prazo: bookings.paymentIssueDeadlineAt });
  if (abertas.length === 0) return [];

  if (pagamento.subscriptionId) {
    await tx
      .update(subscriptions)
      .set({ status: 'past_due', failedCycles: sql`${subscriptions.failedCycles} + 1`, updatedAt: new Date() })
      .where(eq(subscriptions.id, pagamento.subscriptionId));
  }
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'booking.payment_window_opened',
    entityType: 'booking', entityId: booking.id, metadata: { paymentId: pagamento.id, causa },
  });

  const ate = abertas[0]?.prazo ? brTime(abertas[0].prazo) : null;
  const automatico = pagamento.method === 'credit_card';
  return insertNotifications(tx, [
    {
      userId: booking.renterId, type: 'payment_failed', title: 'Pagamento pendente',
      body: `${automatico
        ? 'Não conseguimos concluir seu pagamento automático.'
        : 'Não identificamos o pagamento da mensalidade.'} Você tem 2 horas${ate ? ` (até as ${ate})` : ''} para regularizar — tente o cartão de novo ou pague por Pix. Sem pagamento, a locação é encerrada.`,
      linkPath: `/reservas/${booking.id}/pendente`, data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_issue:${booking.id}:${pagamento.id}`,
    },
    {
      userId: booking.ownerId, type: 'payment_failed', title: 'Pagamento do locatário pendente',
      body: 'A cobrança deste mês não foi concluída. O locatário tem 2 horas para regularizar; sem pagamento, a locação é encerrada e a vaga volta a ficar disponível.',
      linkPath: `/reservas/${booking.id}`, data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_issue:${booking.id}:${pagamento.id}`,
    },
  ]);
}

async function handleRefunded(tx: Tx, pagamento: PaymentRow, booking: BookingRow): Promise<PushJob[]> {
  await tx
    .update(payments)
    .set({ status: 'refunded', refundedCents: pagamento.amountCents, updatedAt: new Date() })
    .where(eq(payments.id, pagamento.id));

  await tx.insert(ledgerEntries).values({
    type: 'refund', bookingId: booking.id, paymentId: pagamento.id,
    userId: null, amountCents: -pagamento.amountCents, description: 'Estorno',
  });

  const jobsEstorno = await insertNotifications(tx, [
    {
      userId: booking.renterId, type: 'payment_refunded', title: 'Pagamento estornado',
      body: 'O pagamento deste aluguel foi estornado.',
      linkPath: `/reservas/${booking.id}`, data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_refunded:${pagamento.id}`,
    },
    {
      userId: booking.ownerId, type: 'payment_refunded', title: 'Pagamento estornado',
      body: 'Um pagamento deste aluguel foi estornado ao locatário.',
      linkPath: '/meus-espacos/financeiro', data: { bookingId: booking.id, paymentId: pagamento.id },
      dedupeKey: `payment_refunded:${pagamento.id}`,
    },
  ]);
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.refunded',
    entityType: 'payment', entityId: pagamento.id, metadata: { bookingId: booking.id },
  });

  return jobsEstorno;
}

async function handleDeleted(tx: Tx, pagamento: PaymentRow): Promise<PushJob[]> {
  await tx.update(payments).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(payments.id, pagamento.id));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'payment.deleted',
    entityType: 'payment', entityId: pagamento.id, metadata: {},
  });
  return [];
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
): Promise<PushJob[]> {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
      return handlePurchaseConfirmed(tx, compra, payload);
    case 'PAYMENT_RECEIVED': {
      // Pix e boleto chegam direto como RECEIVED (sem CONFIRMED): ativa antes.
      const jobs = compra.promotionId ? [] : await handlePurchaseConfirmed(tx, compra, payload);
      return [...jobs, ...(await handlePurchaseReceived(tx, compra))];
    }
    case 'PAYMENT_OVERDUE':
      await tx.update(promotionPurchases).set({ status: 'overdue', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
      return [];
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      await tx
        .update(promotionPurchases)
        .set({ status: 'failed', failureReason: 'Recusado na analise de risco do gateway.', updatedAt: new Date() })
        .where(eq(promotionPurchases.id, compra.id));
      return [];
    case 'PAYMENT_REFUNDED':
      return handlePurchaseRefunded(tx, compra);
    case 'PAYMENT_DELETED':
      await tx.update(promotionPurchases).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
      return [];
  }
  return [];
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
async function handlePurchaseConfirmed(tx: Tx, compra: PromotionPurchaseRow, payload: AsaasWebhookPayload): Promise<PushJob[]> {
  if (compra.promotionId) return []; // ja processado (reentrega do mesmo evento nao deveria chegar aqui, mas por garantia)

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

    const job = await insertNotification(tx, {
      userId: compra.ownerId, type: 'payment_confirmed', title: 'Promoção ativada',
      body: `Pagamento confirmado — seu anúncio está com ${compra.type === 'turbo' ? 'Turbo' : 'Destaque'} ativo.`,
      linkPath: '/meus-espacos/promocoes', data: { spaceId: compra.spaceId, promotionId },
      dedupeKey: `promotion_activated:${compra.id}`,
    });
    await tx.insert(auditLogs).values({
      actorId: null, actorRole: 'system', action: 'promotion_purchase.confirmed',
      entityType: 'promotion_purchase', entityId: compra.id,
      metadata: { spaceId: compra.spaceId, type: compra.type, promotionId },
    });

    return job ? [job] : [];
  }

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

  return [];
}

async function handlePurchaseReceived(tx: Tx, compra: PromotionPurchaseRow): Promise<PushJob[]> {
  await tx.update(promotionPurchases).set({ status: 'received', updatedAt: new Date() }).where(eq(promotionPurchases.id, compra.id));
  await tx.insert(auditLogs).values({
    actorId: null, actorRole: 'system', action: 'promotion_purchase.received',
    entityType: 'promotion_purchase', entityId: compra.id, metadata: { spaceId: compra.spaceId },
  });
  return [];
}

/** Estorno depois de confirmado: cancela a promocao tambem — sem cobranca, sem boost. */
async function handlePurchaseRefunded(tx: Tx, compra: PromotionPurchaseRow): Promise<PushJob[]> {
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

  return [];
}

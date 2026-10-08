'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  profiles,
  bookings,
  ownerPayoutAccounts,
  subscriptions,
  payments,
  bookingDeposits,
  auditLogs,
} from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { decideFirstMonthBenefit, reserveBenefit } from '@/lib/premium/benefit';
import * as asaas from './asaas';
import { DOCUMENT_IN_OTHER_ACCOUNT, documentInUseByOther } from './document';
import { ensureAsaasCustomer } from './customer';
import { chargeDeposit } from './deposits';
import { payoutAccountSchema, checkoutSchema } from './schemas';
import { getOwnerPayoutAccount } from './queries';
import { PAYMENT_WINDOW_MINUTES } from '@/lib/bookings/payment-window';

export type PayoutAccountActionState = { ok: boolean; message?: string };

/**
 * Cria a subconta do proprietario no Asaas (onboarding de recebimento).
 *
 * Decisao registrada aqui porque a documentacao nao confirmou o oposto (ver
 * src/lib/payments/asaas.ts): a conta entra como `canReceive: true` assim
 * que a subconta e criada, otimista sobre o KYC ja liberar recebimento. Se
 * o Asaas exigir aprovacao antes de aceitar split de verdade, isso precisa
 * mudar para `false` com uma forma de confirmar aprovacao — nao fiz isso
 * agora porque inventaria um fluxo de aprovacao que ninguem pediu e que a
 * apuracao nao confirmou ser necessario.
 */
export async function createPayoutAccountAction(
  _prev: PayoutAccountActionState | undefined,
  formData: FormData,
): Promise<PayoutAccountActionState> {
  const user = await requireUserOrThrow();

  const existente = await getOwnerPayoutAccount(user.id);
  if (existente) {
    return { ok: false, message: 'Você já tem uma conta de recebimento configurada.' };
  }

  const parsed = payoutAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const dados = parsed.data;

  // Antes do gateway: documento de outra conta não cria subconta nenhuma.
  if (await documentInUseByOther(user.id, dados.cpfCnpj)) {
    return { ok: false, message: DOCUMENT_IN_OTHER_ACCOUNT };
  }

  let subconta: asaas.AsaasSubaccount;
  try {
    subconta = await asaas.createSubaccount({
      name: dados.fullName,
      email: dados.email,
      cpfCnpj: dados.cpfCnpj,
      mobilePhone: dados.mobilePhone,
      incomeValue: dados.incomeValueReais,
      birthDate: dados.birthDate || undefined,
      address: dados.address,
      addressNumber: dados.addressNumber,
      province: dados.province,
      postalCode: dados.postalCode,
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[payouts] Asaas recusou a criação da subconta:', err.status, err.body);
      return { ok: false, message: `O Asaas recusou os dados enviados: ${err.message}` };
    }
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx.insert(ownerPayoutAccounts).values({
      ownerId: user.id,
      provider: 'asaas',
      providerAccountId: subconta.id,
      providerWalletId: subconta.walletId,
      status: 'under_review',
      canReceive: true,
      approvedAt: new Date(),
    });
    await tx.update(profiles).set({ cpfCnpj: dados.cpfCnpj }).where(eq(profiles.id, user.id));
    await tx.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: 'payout_account.created',
      entityType: 'owner_payout_account',
      entityId: subconta.id,
    });
  });

  revalidatePath('/meus-espacos/financeiro');
  redirect('/meus-espacos/financeiro?conta=criada');
}

export type CheckoutActionState = { ok: boolean; message?: string };

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Vencimento da primeira cobrança: a data de início da locação (ou hoje, se já
 * passou — o Asaas não aceita vencimento no passado). O ciclo mensal conta a
 * partir dela ("Próximo vencimento"). A pessoa paga ANTES, dentro do prazo de
 * 24 h do aceite: o Pix da primeira cobrança vale até pagar, e o pagamento
 * confirma a locação como "aguardando início" até a data chegar.
 */
function primeiroVencimento(startDate: string): string {
  return startDate < hojeISO() ? hojeISO() : startDate;
}

/**
 * Locatario confirma o pagamento de uma reserva aceita: cria (ou reaproveita)
 * o cliente Asaas, cria a assinatura mensal com o split para o proprietario,
 * grava a assinatura/cobranca localmente, e redireciona para a fatura
 * hospedada pelo Asaas — o formulario de cartao/Pix/boleto em si roda no
 * Asaas, nao neste código (mantém dado de cartão fora do nosso escopo).
 */
export async function startCheckoutAction(
  _prev: CheckoutActionState | undefined,
  formData: FormData,
): Promise<CheckoutActionState> {
  const user = await requireUserOrThrow();

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { bookingId, cpfCnpj, method } = parsed.data;
  const cartao = method === 'card';

  // O prazo de 24 h para pagar pode ter vencido desde que a tela abriu: o banco encerra e a vaga volta.
  const [alvo] = await db.select({ spaceId: bookings.spaceId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (alvo) await db.execute(sql`SELECT public.release_expired_rentals(${alvo.spaceId})`);

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking || booking.renterId !== user.id) {
    return { ok: false, message: 'Reserva não encontrada.' };
  }
  if (booking.status === 'expired') {
    return { ok: false, message: 'O prazo para pagar terminou e a vaga foi liberada. Nada foi cobrado.' };
  }
  if (booking.status !== 'approved') {
    return { ok: false, message: 'Esta reserva não está aguardando pagamento.' };
  }

  const contaDoDono = await getOwnerPayoutAccount(booking.ownerId);
  if (!contaDoDono?.canReceive || !contaDoDono.providerWalletId) {
    return {
      ok: false,
      message: 'O proprietário ainda não configurou o recebimento. Tente novamente mais tarde.',
    };
  }

  // Cria (na primeira vez) ou reaproveita o cliente do Asaas; o CPF informado fica no perfil.
  const cliente = await ensureAsaasCustomer(user, cpfCnpj);
  if (!cliente.ok) return { ok: false, message: cliente.message };
  const customerId = cliente.customerId;

  const nextDueDate = primeiroVencimento(booking.startDate);
  const split = asaas.splitForOwner(contaDoDono.providerWalletId, booking.ownerPayoutCents);

  let assinatura: asaas.AsaasSubscription;
  try {
    assinatura = await asaas.createSubscription({
      customer: customerId,
      // Cartão: o Asaas cobra o mesmo cartão todo mês, sozinho. Pix: cada
      // mensalidade vira uma cobrança Pix paga pelo app.
      billingType: cartao ? 'CREDIT_CARD' : 'PIX',
      value: booking.totalChargedCents / 100,
      nextDueDate,
      cycle: 'MONTHLY',
      split,
      externalReference: booking.reference,
      description: `MyPlace — ${booking.reference}`,
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[checkout] Asaas recusou a criação da assinatura:', err.status, err.body);
      return { ok: false, message: `Não foi possível iniciar o pagamento: ${err.message}` };
    }
    throw err;
  }

  const primeiraCobranca = await asaas.listSubscriptionPayments(assinatura.id);
  const cobranca = primeiraCobranca.data[0];
  if (!cobranca) {
    console.error('[checkout] assinatura criada sem cobranca gerada:', assinatura.id);
    return { ok: false, message: 'O gateway criou a assinatura mas não gerou a primeira cobrança. Tente novamente.' };
  }

  /*
   * Caução (Fase 20): cobrança AVULSA, separada da assinatura — nunca soma no
   * aluguel recorrente. Criada aqui, fora da transação, igual à assinatura
   * acima: se falhar depois disso, a assinatura já existe no Asaas sem
   * registro nosso ainda — mesmo risco já aceito pelo fluxo existente (ver
   * o `listSubscriptionPayments` logo acima), não um risco novo desta fase.
   */
  let cobrancaCaucao: asaas.AsaasPayment | null = null;
  if (booking.depositCents > 0) {
    try {
      cobrancaCaucao = await chargeDeposit(customerId, booking, nextDueDate);
    } catch (err) {
      if (err instanceof asaas.AsaasError) {
        console.error('[checkout] Asaas recusou a cobrança da caução:', err.status, err.body);
        return { ok: false, message: `Não foi possível cobrar a caução: ${err.message}` };
      }
      throw err;
    }
  }

  const diaVencimento = Math.min(Number(nextDueDate.slice(8, 10)), 28);

  /*
   * Benefício do primeiro mês do Premium — ATRÁS DE FEATURE FLAG (desligada por padrão: `decide…` devolve
   * `off` e nada abaixo roda). Com a flag ligada e o direito confirmado pelo banco, a PRIMEIRA cobrança
   * passa a valer o que o locatário de fato paga e perde o split (a plataforma recebe e transfere o repasse
   * inteiro ao proprietário pela fila `platform_transfers`). NÃO validado no Asaas real — ver
   * docs/PREMIUM-BENEFICIO.md. Se o ajuste da cobrança falhar, a cobrança segue no valor cheio.
   */
  let beneficio: Extract<Awaited<ReturnType<typeof decideFirstMonthBenefit>>, { kind: 'apply' }> | null = null;
  let valorPrimeiraCobrancaCents = booking.totalChargedCents;
  let decisaoBeneficio: Awaited<ReturnType<typeof decideFirstMonthBenefit>> = { kind: 'off' };
  try {
    decisaoBeneficio = await decideFirstMonthBenefit({
      renterId: user.id, cpfCnpj, monthlyRentCents: booking.monthlyRentCents, totalChargedCents: booking.totalChargedCents,
    });
  } catch (err) {
    // Flag ligada sem configuração completa: o benefício não é aplicado (e o erro fica no log); a cobrança normal segue.
    console.error('[checkout] benefício do Premium indisponível:', err instanceof Error ? err.message : err);
  }
  if (decisaoBeneficio.kind === 'apply') {
    try {
      await asaas.updatePaymentValueAndSplit(cobranca.id, { valueCents: decisaoBeneficio.result.payerPaysCents, split: [] });
      beneficio = decisaoBeneficio;
      valorPrimeiraCobrancaCents = decisaoBeneficio.result.payerPaysCents;
    } catch (err) {
      console.error('[checkout] benefício do Premium não aplicado — cobrança segue no valor cheio:', cobranca.id, err instanceof asaas.AsaasError ? err.body : err);
    }
  }

  // Pix: o QR da primeira mensalidade aparece no próprio app (sem sair para a fatura).
  let qr: asaas.AsaasPixQrCode | null = null;
  if (!cartao) {
    try {
      qr = await asaas.getPixQrCode(cobranca.id);
    } catch (err) {
      console.error('[checkout] QR Code Pix indisponível:', cobranca.id, err instanceof asaas.AsaasError ? err.body : err);
    }
  }

  let faturaUrl: string;
  try {
    faturaUrl = await db.transaction(async (tx) => {
      const [sub] = await tx
        .insert(subscriptions)
        .values({
          bookingId: booking.id,
          provider: 'asaas',
          providerSubscriptionId: assinatura.id,
          status: 'pending_authorization',
          method: cartao ? 'credit_card' : 'pix',
          amountCents: booking.totalChargedCents,
          billingDay: diaVencimento,
          nextDueDate,
        })
        .returning({ id: subscriptions.id });

      await tx.insert(payments).values({
        bookingId: booking.id,
        subscriptionId: sub!.id,
        provider: 'asaas',
        providerPaymentId: cobranca.id,
        status: 'pending',
        method: cartao ? 'credit_card' : 'pix',
        amountCents: valorPrimeiraCobrancaCents,
        dueDate: nextDueDate,
        invoiceUrl: cobranca.invoiceUrl,
        pixPayload: qr?.payload ?? null,
        pixQrImage: qr?.encodedImage ?? null,
        payerStartedAt: new Date(),
      });

      // Só sai de "aceita" se ainda estiver aceita: se o prazo de 24 h estourou no meio do
      // caminho, o banco já a expirou e nada é gravado aqui.
      const marcadas = await tx
        .update(bookings)
        .set({ status: 'awaiting_payment', updatedAt: new Date() })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'approved')))
        .returning({ id: bookings.id });
      if (marcadas.length === 0) throw new Error('RESERVA_FORA_DO_PRAZO');

      if (beneficio) {
        await reserveBenefit(tx, {
          decision: beneficio, renterId: user.id, cpfCnpj, bookingId: booking.id,
          totalChargedCents: booking.totalChargedCents, ownerPayoutCents: booking.ownerPayoutCents,
          providerPaymentId: cobranca.id,
        });
      }

      if (cobrancaCaucao) {
        await tx.insert(bookingDeposits).values({
          bookingId: booking.id,
          amountCents: booking.depositCents,
          provider: 'asaas',
          providerPaymentId: cobrancaCaucao.id,
          status: 'pending',
          invoiceUrl: cobrancaCaucao.invoiceUrl,
        });
      }

      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'checkout.started',
        entityType: 'booking',
        entityId: booking.id,
        metadata: { providerSubscriptionId: assinatura.id, providerPaymentId: cobranca.id, method },
      });

      if (!cobranca.invoiceUrl) throw new Error('Cobrança criada sem invoiceUrl.');
      return cobranca.invoiceUrl;
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Cobrança criada sem invoiceUrl.') {
      return { ok: false, message: 'O gateway não devolveu um link de pagamento. Tente novamente.' };
    }
    if (err instanceof Error && err.message === 'RESERVA_FORA_DO_PRAZO') {
      // A locação expirou no meio do caminho: o que acabou de nascer no gateway não pode ficar vivo.
      await asaas.cancelSubscription(assinatura.id).catch((e) => console.error('[checkout] assinatura órfã não cancelada:', assinatura.id, e));
      if (cobrancaCaucao) await asaas.deletePayment(cobrancaCaucao.id).catch((e) => console.error('[checkout] caução órfã não excluída:', cobrancaCaucao?.id, e));
      return { ok: false, message: 'O prazo para pagar terminou e a vaga foi liberada. Nada foi cobrado.' };
    }
    throw err;
  }

  revalidatePath('/reservas');
  revalidatePath('/meus-espacos/financeiro');
  // Pix com QR: paga no app. Cartão (ou Pix sem QR): a fatura do Asaas.
  if (!cartao && qr) redirect(`/reservas/${booking.id}/pagar`);
  redirect(faturaUrl);
}


// ---------------------------------------------------------------------------
// "Pagar com Pix" / "Pagar com cartão" — primeira cobrança e pagamento pendente
// ---------------------------------------------------------------------------

export type PaymentActionState = { ok: boolean; message?: string; needsCpf?: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cobrança em aberto de uma reserva (a mais recente ainda não paga). */
async function cobrancaEmAberto(bookingId: string) {
  const [p] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['pending', 'overdue'])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return p ?? null;
}

/**
 * Troca a forma de pagamento da cobrança em aberto: serve ao pagamento da
 * locação aceita ("Pagar com Pix"/"Pagar com cartão") e à regularização do
 * pagamento pendente — "tentar o cartão de novo" ou "pagar por Pix". NUNCA
 * cria cobrança nova: troca a forma de pagamento da que já existe
 * (`PUT /payments/{id}`). Clicar duas vezes não faz nada a mais (mesma forma
 * = nenhuma chamada).
 *
 * Nada aqui confirma pagamento: a locação só muda quando o webhook do Asaas
 * avisar. "Voltei da página do banco" não é pagamento.
 */
export async function choosePaymentMethodAction(
  _prev: PaymentActionState | undefined,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await requireUserOrThrow();
  const bookingId = String(formData.get('bookingId') ?? '');
  const metodo = String(formData.get('method') ?? '');
  if (!UUID_RE.test(bookingId) || (metodo !== 'pix' && metodo !== 'card')) {
    return { ok: false, message: 'Recarregue a página e tente de novo.' };
  }

  // Os prazos (24 h do aceite, 2 h do pagamento pendente) valem pelo relógio do banco.
  const [alvo] = await db.select({ spaceId: bookings.spaceId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (alvo) await db.execute(sql`SELECT public.release_expired_rentals(${alvo.spaceId})`);

  const [booking] = await db
    .select({ id: bookings.id, renterId: bookings.renterId, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking || booking.renterId !== user.id) return { ok: false, message: 'Reserva não encontrada.' };
  if (booking.status === 'expired') {
    return { ok: false, message: 'O prazo para pagar terminou e a vaga foi liberada. Nada foi cobrado.' };
  }
  if (booking.status === 'ended') {
    return {
      ok: false,
      message: `Esta locação já foi encerrada. Se o prazo de ${PAYMENT_WINDOW_MINUTES / 60} horas para regularizar o pagamento terminou, nada mais será cobrado.`,
    };
  }
  const pagavel = booking.status === 'awaiting_payment' || booking.status === 'past_due';
  if (!pagavel) return { ok: false, message: 'Esta reserva não tem pagamento em aberto.' };

  const cobranca = await cobrancaEmAberto(booking.id);
  if (!cobranca) return { ok: false, message: 'A cobrança ainda está sendo gerada. Atualize a página em instantes.' };

  try {
    if (metodo === 'pix') {
      // Trava a cobrança: dois toques ao mesmo tempo passam aqui um de cada
      // vez, e o segundo já encontra o Pix pronto (nada repetido no gateway).
      await db.transaction(async (tx) => {
        const [atual] = await tx
          .select({ method: payments.method, pixPayload: payments.pixPayload })
          .from(payments)
          .where(eq(payments.id, cobranca.id))
          .for('update');
        if (atual?.method !== 'pix' || !atual.pixPayload) {
          if (atual?.method !== 'pix') await asaas.updatePaymentBillingType(cobranca.providerPaymentId, 'PIX');
          const qr = await asaas.getPixQrCode(cobranca.providerPaymentId);
          await tx
            .update(payments)
            .set({ method: 'pix', pixPayload: qr.payload, pixQrImage: qr.encodedImage, payerStartedAt: new Date(), updatedAt: new Date() })
            .where(eq(payments.id, cobranca.id));
        } else {
          await tx.update(payments).set({ payerStartedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, cobranca.id));
        }
      });
      await db.insert(auditLogs).values({
        actorId: user.id, actorRole: user.role, action: 'payment.method_pix',
        entityType: 'payment', entityId: cobranca.id, metadata: { bookingId: booking.id },
      });
      revalidatePath(`/reservas/${booking.id}`);
      revalidatePath(`/reservas/${booking.id}/pagar`);
      revalidatePath(`/reservas/${booking.id}/pendente`);
      return { ok: true };
    }

    // Cartão (crédito ou débito, conforme a fatura do Asaas oferecer).
    const fatura = await db.transaction(async (tx) => {
      const [atual] = await tx
        .select({ method: payments.method, invoiceUrl: payments.invoiceUrl })
        .from(payments)
        .where(eq(payments.id, cobranca.id))
        .for('update');
      let link = atual?.invoiceUrl ?? null;
      if (atual?.method !== 'credit_card') {
        const atualizada = await asaas.updatePaymentBillingType(cobranca.providerPaymentId, 'CREDIT_CARD');
        link = atualizada.invoiceUrl ?? link;
      }
      await tx
        .update(payments)
        .set({ method: 'credit_card', invoiceUrl: link, payerStartedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, cobranca.id));
      return link;
    });
    await db.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'payment.method_card',
      entityType: 'payment', entityId: cobranca.id, metadata: { bookingId: booking.id },
    });
    if (!fatura) return { ok: false, message: 'O gateway não devolveu o link de pagamento. Tente de novo.' };
    redirect(fatura);
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[pagamento] Asaas recusou a troca de forma de pagamento:', err.status, err.body);
      return { ok: false, message: `O gateway recusou: ${err.message}` };
    }
    throw err;
  }
}

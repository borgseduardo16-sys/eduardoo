'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  profiles,
  bookings,
  ownerPayoutAccounts,
  renterBillingProfiles,
  subscriptions,
  payments,
  auditLogs,
} from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import * as asaas from './asaas';
import { payoutAccountSchema, checkoutSchema } from './schemas';
import { getOwnerPayoutAccount, getRenterBillingProfile } from './queries';

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

/** yyyy-mm-dd -> yyyy-mm-dd, nunca antes de hoje (o Asaas nao aceita vencimento no passado). */
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
  const { bookingId, cpfCnpj } = parsed.data;

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking || booking.renterId !== user.id) {
    return { ok: false, message: 'Reserva não encontrada.' };
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

  await db.update(profiles).set({ cpfCnpj }).where(eq(profiles.id, user.id));

  let billing = await getRenterBillingProfile(user.id);
  if (!billing) {
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    let cliente: asaas.AsaasCustomer;
    try {
      cliente = await asaas.createCustomer({
        name: perfil?.fullName ?? user.fullName ?? 'Locatário',
        cpfCnpj,
        email: user.email,
        mobilePhone: perfil?.phone ?? undefined,
        externalReference: user.id,
      });
    } catch (err) {
      if (err instanceof asaas.AsaasError) {
        console.error('[checkout] Asaas recusou a criação do cliente:', err.status, err.body);
        return { ok: false, message: `O Asaas recusou seus dados: ${err.message}` };
      }
      throw err;
    }
    const [novoBilling] = await db
      .insert(renterBillingProfiles)
      .values({ userId: user.id, provider: 'asaas', providerCustomerId: cliente.id })
      .returning();
    billing = novoBilling!;
  }

  const nextDueDate = primeiroVencimento(booking.startDate);
  const split = asaas.splitForOwner(contaDoDono.providerWalletId, booking.ownerPayoutCents);

  let assinatura: asaas.AsaasSubscription;
  try {
    assinatura = await asaas.createSubscription({
      customer: billing.providerCustomerId,
      billingType: 'UNDEFINED',
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

  const diaVencimento = Math.min(Number(nextDueDate.slice(8, 10)), 28);

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
          method: 'pix',
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
        method: 'pix',
        amountCents: booking.totalChargedCents,
        dueDate: nextDueDate,
        invoiceUrl: cobranca.invoiceUrl,
      });

      await tx.update(bookings).set({ status: 'awaiting_payment', updatedAt: new Date() }).where(eq(bookings.id, booking.id));

      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'checkout.started',
        entityType: 'booking',
        entityId: booking.id,
        metadata: { providerSubscriptionId: assinatura.id, providerPaymentId: cobranca.id },
      });

      if (!cobranca.invoiceUrl) throw new Error('Cobrança criada sem invoiceUrl.');
      return cobranca.invoiceUrl;
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Cobrança criada sem invoiceUrl.') {
      return { ok: false, message: 'O gateway não devolveu um link de pagamento. Tente novamente.' };
    }
    throw err;
  }

  revalidatePath('/reservas');
  revalidatePath('/meus-espacos/financeiro');
  redirect(faturaUrl);
}

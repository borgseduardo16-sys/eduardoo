'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { premiumMemberships, premiumCharges, auditLogs } from '@/db/schema';
import { requireUserOrThrow, type SessionUser } from '@/lib/auth/dal';
import { IntegrationNotConfiguredError, isIntegrationConfigured } from '@/lib/env';
import * as asaas from '@/lib/payments/asaas';
import { ensureAsaasCustomer } from '@/lib/payments/customer';
import { todayInSaoPaulo } from '@/lib/dates';
import { brDate, formatBrDate } from '@/lib/time';
import { notifyUser } from '@/lib/notifications/dispatch';
import { subscribePremiumSchema } from './schemas';
import { premiumMonthlyPriceCents } from './settings';
import { getPremiumOverview } from './queries';

/**
 * Assinar, cancelar a renovação e reativar o Premium.
 *
 * O Premium é uma assinatura recorrente PRÓPRIA no Asaas (sem split, valor da
 * plataforma), separada das assinaturas das locações. O navegador nunca manda
 * preço: o valor sai de `premium.price_monthly_cents`, no servidor.
 *
 * NADA aqui ativa o Premium. Quem ativa é o webhook do Asaas, quando o
 * pagamento é CONFIRMADO (`src/lib/premium/webhook.ts`). "Voltei da página de
 * pagamento" não é pagamento.
 *
 * Cancelar NÃO encerra o Premium na hora: a pessoa continua Premium, usando os
 * benefícios, até o fim do período já pago. Sem renovação automática e sem
 * reembolso proporcional.
 */

const CONTA_VINCULADA =
  'Já existe uma assinatura Premium em outra conta com o mesmo e-mail, telefone ou documento. O Premium é um por pessoa.';

export type PremiumActionState = { ok: boolean; message?: string; needsCpf?: boolean };

const SEM_PAGAMENTOS =
  'Os pagamentos ainda não estão configurados neste ambiente, então não dá para assinar agora. Nada foi cobrado.';

function isNotFound(err: unknown): boolean {
  return err instanceof asaas.AsaasError && err.status === 404;
}

type Abertura =
  | { ok: true; redirectTo: string | null }
  | { ok: false; message: string; needsCpf?: boolean };

/**
 * Cria a assinatura recorrente no Asaas e grava a nossa. Serve a "assinar" e a
 * "reativar" (Premium vigente cujo cancelamento estava agendado: a nova
 * recorrência só começa a cobrar no fim do período já pago).
 *
 * Uma assinatura por pessoa de cada vez: trava consultiva do Postgres presa a
 * esta transação (duplo clique e duas abas entram em fila). Nenhuma recorrência
 * velha fica viva: a anterior é cancelada ANTES de criar a nova.
 */
async function abrirAssinatura(
  user: SessionUser,
  input: { method: 'card' | 'pix'; cpfCnpj: string | null; planCents: number },
): Promise<Abertura> {
  const { method, cpfCnpj, planCents } = input;
  const metodoDb = method === 'card' ? ('credit_card' as const) : ('pix' as const);

  return db.transaction(async (tx) => {
    const [trava] = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${`myplace:premium_checkout:${user.id}`})) AS ok`,
    )) as unknown as { ok: boolean }[];
    if (!trava?.ok) return { ok: false, message: 'Já estamos gerando a sua cobrança. Aguarde um instante e atualize a página.' };

    const [membro] = await tx.select().from(premiumMemberships).where(eq(premiumMemberships.userId, user.id)).for('update');
    const visao = await getPremiumOverview(user.id);

    if (visao.isActive && !visao.cancelAtPeriodEnd && visao.source === 'subscription') {
      return { ok: false, message: 'Você já é Membro Premium. A renovação é mensal e automática enquanto a assinatura estiver ativa.' };
    }
    const reativando = visao.isActive && visao.cancelAtPeriodEnd && visao.source === 'subscription';

    // Assinatura ainda não paga, mesma forma de pagamento e cobrança em aberto: continua de onde parou.
    if (
      !visao.isActive &&
      visao.state === 'pending_payment' &&
      visao.billingMethod === metodoDb &&
      visao.openCharge?.invoiceUrl
    ) {
      return { ok: true, redirectTo: visao.openCharge.invoiceUrl };
    }

    if (!isIntegrationConfigured('payments')) return { ok: false, message: SEM_PAGAMENTOS };

    // Uma pessoa, um Premium: outra conta com o mesmo e-mail, telefone ou documento já tem Premium vivo.
    // O banco também trava (`premium_memberships_linked_account`); conferir ANTES evita criar recorrência no gateway.
    const [vinculada] = (await tx.execute(sql`
      SELECT 1 AS ok FROM premium_memberships pm
       WHERE pm.user_id <> ${user.id} AND pm.status::text IN ('pending_payment', 'active')
         AND public.premium_accounts_linked(${user.id}::uuid, pm.user_id) IN ('mesmo e-mail', 'mesmo telefone', 'mesmo documento')
       LIMIT 1`)) as unknown as { ok: number }[];
    if (vinculada) return { ok: false, message: CONTA_VINCULADA };

    const cliente = await ensureAsaasCustomer(user, cpfCnpj);
    if (!cliente.ok) return { ok: false, message: cliente.message, needsCpf: cliente.needsCpf };

    // Nenhuma recorrência velha fica viva: cancela a anterior antes de criar a nova.
    if (membro?.providerSubscriptionId && !membro.providerCancelledAt) {
      try {
        await asaas.cancelSubscription(membro.providerSubscriptionId);
      } catch (err) {
        if (!isNotFound(err)) {
          console.error('[premium] não consegui cancelar a recorrência anterior:', membro.providerSubscriptionId, err);
          return { ok: false, message: 'Não foi possível trocar a forma de pagamento agora. Tente de novo em instantes.' };
        }
      }
      await tx
        .update(premiumCharges)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(sql`${premiumCharges.userId} = ${user.id} AND ${premiumCharges.status} IN ('pending', 'overdue')`);
    }

    // Reativar: a cobrança nova só começa no fim do período já pago.
    const hoje = todayInSaoPaulo();
    const fim = visao.cycle ? brDate(visao.cycle.endsAt) : hoje;
    const nextDueDate = reativando && fim > hoje ? fim : hoje;

    let assinatura: asaas.AsaasSubscription;
    try {
      assinatura = await asaas.createSubscription({
        customer: cliente.customerId,
        // Cartão: o Asaas cobra o mesmo cartão todo mês, sozinho. Pix: cada mensalidade vira uma cobrança Pix.
        billingType: method === 'card' ? 'CREDIT_CARD' : 'PIX',
        value: planCents / 100,
        nextDueDate,
        cycle: 'MONTHLY',
        externalReference: `premium:${user.id}`,
        description: 'MyPlace Premium — assinatura mensal',
      });
    } catch (err) {
      if (err instanceof asaas.AsaasError) {
        console.error('[premium] Asaas recusou a criação da assinatura:', err.status, err.body);
        return { ok: false, message: `Não foi possível iniciar o pagamento: ${err.message}` };
      }
      throw err;
    }

    try {
      let cobranca: asaas.AsaasPayment | null = null;
      if (nextDueDate <= hoje) {
        const lista = await asaas.listSubscriptionPayments(assinatura.id);
        cobranca = lista.data[0] ?? null;
        if (!cobranca) {
          console.error('[premium] assinatura criada sem cobrança gerada:', assinatura.id);
          await asaas.cancelSubscription(assinatura.id).catch((e) => console.error('[premium] assinatura órfã não cancelada:', assinatura.id, e));
          return { ok: false, message: 'O gateway criou a assinatura mas não gerou a primeira cobrança. Tente novamente.' };
        }
      }

      const base = {
        source: 'subscription' as const,
        provider: 'asaas',
        providerSubscriptionId: assinatura.id,
        billingMethod: metodoDb,
        planCents,
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
        providerCancelledAt: null,
        financialTestEnabled: false,
        updatedAt: new Date(),
      };
      // Quem já é Premium (reativação, ou concessão administrativa em vigor) segue ativo; os demais aguardam o pagamento.
      const atualizacao = visao.isActive
        ? base
        : { ...base, status: 'pending_payment' as const, cancelledAt: null, cancelledBy: null };
      await tx
        .insert(premiumMemberships)
        .values({ userId: user.id, status: 'pending_payment', ...base })
        .onConflictDoUpdate({ target: premiumMemberships.userId, set: atualizacao });

      if (cobranca) {
        await tx
          .insert(premiumCharges)
          .values({
            userId: user.id,
            provider: 'asaas',
            providerPaymentId: cobranca.id,
            providerSubscriptionId: assinatura.id,
            status: 'pending',
            method: metodoDb,
            amountCents: planCents,
            dueDate: nextDueDate,
            invoiceUrl: cobranca.invoiceUrl,
          })
          .onConflictDoUpdate({
            target: [premiumCharges.provider, premiumCharges.providerPaymentId],
            set: { invoiceUrl: cobranca.invoiceUrl, method: metodoDb, updatedAt: new Date() },
          });
      }

      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: reativando ? 'premium.resume_started' : 'premium.checkout_started',
        entityType: 'profile',
        entityId: user.id,
        metadata: {
          method,
          planCents,
          providerSubscriptionId: assinatura.id,
          providerPaymentId: cobranca?.id ?? null,
          nextDueDate,
        },
      });

      return { ok: true, redirectTo: cobranca?.invoiceUrl ?? null };
    } catch (err) {
      // O que acabou de nascer no gateway não pode ficar vivo sem registro nosso.
      await asaas.cancelSubscription(assinatura.id).catch((e) => console.error('[premium] assinatura órfã não cancelada:', assinatura.id, e));
      throw err;
    }
  });
}

export async function subscribePremiumAction(
  _prev: PremiumActionState | undefined,
  formData: FormData,
): Promise<PremiumActionState> {
  const user = await requireUserOrThrow();

  const parsed = subscribePremiumSchema.safeParse({
    method: formData.get('method'),
    cpfCnpj: formData.get('cpfCnpj') ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const preco = await premiumMonthlyPriceCents();
  if (!preco) return { ok: false, message: 'O preço do Premium ainda não foi definido. Tente novamente mais tarde.' };

  let resultado: Abertura;
  try {
    resultado = await abrirAssinatura(user, { method: parsed.data.method, cpfCnpj: parsed.data.cpfCnpj, planCents: preco });
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) return { ok: false, message: SEM_PAGAMENTOS };
    throw err;
  }
  if (!resultado.ok) return { ok: false, message: resultado.message, needsCpf: resultado.needsCpf };

  revalidatePath('/premium');
  redirect(resultado.redirectTo ?? '/premium?assinatura=aguardando');
}

/** Reativar a renovação de um Premium vigente que tinha cancelamento agendado. A forma de pagamento é a de antes. */
export async function resumePremiumAction(): Promise<PremiumActionState> {
  const user = await requireUserOrThrow();
  const visao = await getPremiumOverview(user.id);
  if (!(visao.isActive && visao.cancelAtPeriodEnd && visao.source === 'subscription')) {
    return { ok: false, message: 'Não há cancelamento agendado para desfazer.' };
  }
  const preco = await premiumMonthlyPriceCents();
  if (!preco) return { ok: false, message: 'O preço do Premium ainda não foi definido. Tente novamente mais tarde.' };

  let resultado: Abertura;
  try {
    resultado = await abrirAssinatura(user, {
      method: visao.billingMethod === 'credit_card' ? 'card' : 'pix',
      cpfCnpj: null,
      planCents: preco,
    });
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) return { ok: false, message: SEM_PAGAMENTOS };
    throw err;
  }
  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath('/premium');
  return { ok: true, message: 'Renovação reativada. A próxima cobrança acontece no fim do período atual.' };
}

/**
 * Cancela a assinatura. Com Premium vigente = NÃO RENOVAR: segue Premium até o
 * fim do período pago. Sem pagamento ainda = abandona a assinatura pendente
 * (nada foi cobrado). O nosso estado é a verdade: se o gateway não responder
 * agora, o agendador cancela a recorrência lá e repete até confirmar.
 */
export async function cancelPremiumAction(): Promise<PremiumActionState> {
  const user = await requireUserOrThrow();

  const resultado = await db.transaction(async (tx) => {
    const [membro] = await tx.select().from(premiumMemberships).where(eq(premiumMemberships.userId, user.id)).for('update');
    const visao = await getPremiumOverview(user.id);
    if (!membro) return { ok: false as const, message: 'Você não tem uma assinatura do Premium.' };

    if (visao.isActive && visao.adminTest) {
      return {
        ok: false as const,
        message: `Seu Premium é uma concessão administrativa (modo teste) e termina em ${formatBrDate(visao.cycle!.endsAt)}. Não há assinatura para cancelar.`,
      };
    }

    if (visao.isActive && membro.source === 'subscription') {
      if (membro.cancelAtPeriodEnd) return { ok: false as const, message: 'A renovação já estava cancelada.' };
      await tx
        .update(premiumMemberships)
        .set({ cancelAtPeriodEnd: true, cancelRequestedAt: new Date(), updatedAt: new Date() })
        .where(eq(premiumMemberships.userId, user.id));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'premium.renewal_cancelled',
        entityType: 'profile',
        entityId: user.id,
        metadata: { periodEnd: visao.cycle!.endsAt.toISOString() },
      });
      return { ok: true as const, tipo: 'renovacao' as const, fim: visao.cycle!.endsAt, assinaturaId: membro.providerSubscriptionId };
    }

    if (!visao.isActive && membro.status === 'pending_payment') {
      await tx
        .update(premiumMemberships)
        .set({ status: 'cancelled', cancelledBy: user.id, cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(premiumMemberships.userId, user.id));
      await tx
        .update(premiumCharges)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(sql`${premiumCharges.userId} = ${user.id} AND ${premiumCharges.status} IN ('pending', 'overdue')`);
      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'premium.pending_cancelled',
        entityType: 'profile',
        entityId: user.id,
        metadata: {},
      });
      return { ok: true as const, tipo: 'pendente' as const, fim: null, assinaturaId: membro.providerSubscriptionId };
    }

    return { ok: false as const, message: 'Você não tem uma assinatura ativa para cancelar.' };
  });
  if (!resultado.ok) return { ok: false, message: resultado.message };

  // Gateway: melhor esforço agora; o que falhar, o agendador repete (nada de cobrança depois do fim).
  if (resultado.assinaturaId && isIntegrationConfigured('payments')) {
    try {
      await asaas.cancelSubscription(resultado.assinaturaId);
      await db
        .update(premiumMemberships)
        .set({ providerCancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(premiumMemberships.userId, user.id));
    } catch (err) {
      if (isNotFound(err)) {
        await db
          .update(premiumMemberships)
          .set({ providerCancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(premiumMemberships.userId, user.id));
      } else {
        console.error('[premium] cancelar recorrência no Asaas falhou (o agendador repete):', resultado.assinaturaId, err);
      }
    }
  }

  const fimTexto = resultado.fim ? formatBrDate(resultado.fim) : null;
  await notifyUser(db, {
    userId: user.id,
    type: 'premium_changed',
    title: resultado.tipo === 'renovacao' ? 'Renovação do Premium cancelada' : 'Assinatura do Premium cancelada',
    body:
      resultado.tipo === 'renovacao'
        ? `Você continua Premium e pode usar seus benefícios até ${fimTexto}. Não haverá novas cobranças.`
        : 'Nada foi cobrado.',
    linkPath: '/premium',
    data: { tipo: resultado.tipo },
  });

  revalidatePath('/premium');
  return {
    ok: true,
    message:
      resultado.tipo === 'renovacao'
        ? `Renovação cancelada. Você continua Premium até ${fimTexto} e não será cobrado de novo. Não há reembolso proporcional.`
        : 'Assinatura cancelada. Nada foi cobrado.',
  };
}

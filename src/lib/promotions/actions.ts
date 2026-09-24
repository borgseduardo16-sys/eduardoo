'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, gte, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '@/db/client';
import { promotions, premiumMemberships, auditLogs, promotionPurchases, profiles, renterBillingProfiles } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { getOwnedSpace } from '@/lib/spaces/queries';
import { getRenterBillingProfile } from '@/lib/payments/queries';
import * as asaas from '@/lib/payments/asaas';
import { monthlyBenefitLimit, promotionDurationHours } from './settings';
import { getActivePromotionForSpace } from './queries';
import { findPriceOption } from './purchase-pricing';
import { activatePromotionSchema, cancelPromotionSchema, purchasePromotionSchema } from './schemas';

/** Mesmo desembrulho de PostgresError usado em bookings/actions.ts — ver o comentário lá. */
const { PostgresError } = postgres;
type PgError = InstanceType<typeof PostgresError>;

function pgErrorFrom(err: unknown): PgError | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/**
 * true quando o erro veio da trava de concorrencia (duplo clique, ou duas
 * abas tentando promover o mesmo anuncio ao mesmo tempo) — mesmos dois
 * codigos possiveis de `isOccupancyConflict` em bookings/actions.ts.
 */
function isPromotionConflict(err: unknown): boolean {
  const pg = pgErrorFrom(err);
  if (!pg) return false;
  if (pg.code === '23505' && pg.constraint_name === 'promotions_one_active_per_space') return true;
  if (pg.code === '40P01') return true;
  return false;
}

/** Erro esperado de regra de negocio (sem Premium, sem saldo) — vira mensagem, nao 500. */
class BenefitError extends Error {}

export type PromotionActionState = {
  ok: boolean;
  message?: string;
  promotionId?: string;
};

const TYPE_LABEL = { destaque: 'Destaque', turbo: 'Turbo' } as const;

function revalidateAfterChange() {
  revalidatePath('/meus-espacos');
  revalidatePath('/premium');
  revalidatePath('/');
  revalidatePath('/espacos');
}

/**
 * Ativa Destaque ou Turbo num anuncio, consumindo um beneficio Premium do
 * mes corrente.
 *
 * Autorizacao: `getOwnedSpace` (mesma funcao usada por toda action de
 * anuncio) garante que so o dono promove o proprio anuncio. Nada do que o
 * navegador manda alem de `spaceId`/`type` e confiado — Premium, saldo
 * disponivel e duracao sao sempre recalculados aqui.
 *
 * Concorrencia: a linha de `premium_memberships` do dono e travada
 * (`FOR UPDATE`) antes de contar o uso do mes, entao duas ativacoes
 * simultaneas da MESMA pessoa (dois anuncios diferentes, ou duplo clique
 * rapido antes do primeiro commitar) serializam — a segunda so ve a
 * contagem depois que a primeira commitou. Para o duplo clique no MESMO
 * anuncio, o indice unico parcial (`promotions_one_active_per_space`)
 * cobre mesmo se a trava acima falhar.
 */
export async function activatePromotionAction(
  _prev: PromotionActionState | undefined,
  formData: FormData,
): Promise<PromotionActionState> {
  const user = await requireUserOrThrow();

  const parsed = activatePromotionSchema.safeParse({
    spaceId: formData.get('spaceId'),
    type: formData.get('type'),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Escolha um anúncio e um tipo de promoção válidos.' };
  }
  const { spaceId, type } = parsed.data;

  let space: Awaited<ReturnType<typeof getOwnedSpace>>;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Anúncio não encontrado.' };
  }

  if (space.status !== 'published') {
    return { ok: false, message: 'Só é possível destacar um anúncio publicado.' };
  }

  try {
    const promotionId = await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ status: premiumMemberships.status })
        .from(premiumMemberships)
        .where(eq(premiumMemberships.userId, user.id))
        .for('update');

      if (!membership || membership.status !== 'active') {
        throw new BenefitError('Você precisa ser Membro Premium para usar Destaque ou Turbo.');
      }

      const limit = await monthlyBenefitLimit(type);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(promotions)
        .where(
          and(
            eq(promotions.ownerId, user.id),
            eq(promotions.type, type),
            eq(promotions.source, 'premium_benefit'),
            gte(promotions.createdAt, sql`date_trunc('month', now())`),
          ),
        );
      if (n >= limit) {
        throw new BenefitError(
          `Você já usou ${limit === 1 ? 'o' : 'os'} ${limit} ${TYPE_LABEL[type]}${limit === 1 ? '' : 's'} disponíve${limit === 1 ? 'l' : 'is'} este mês.`,
        );
      }

      const hours = await promotionDurationHours(type);
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + hours * 60 * 60 * 1000);

      const [inserted] = await tx
        .insert(promotions)
        .values({
          spaceId,
          ownerId: user.id,
          type,
          status: 'active',
          source: 'premium_benefit',
          startedAt,
          expiresAt,
        })
        .returning({ id: promotions.id });

      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'promotion.activated',
        entityType: 'promotion',
        entityId: inserted!.id,
        metadata: { spaceId, type, source: 'premium_benefit', expiresAt: expiresAt.toISOString() },
      });

      return inserted!.id;
    });

    revalidateAfterChange();

    return { ok: true, message: `${TYPE_LABEL[type]} ativado com sucesso.`, promotionId };
  } catch (err) {
    if (err instanceof BenefitError) return { ok: false, message: err.message };
    if (isPromotionConflict(err)) {
      return { ok: false, message: 'Este anúncio já tem uma promoção ativa agora.' };
    }
    throw err;
  }
}

/**
 * Cancela uma promocao vigente. Nao devolve o beneficio consumido — os
 * creditos nao acumulam nem voltam, mesma regra de "nao usou, perdeu".
 */
export async function cancelPromotionAction(
  _prev: PromotionActionState | undefined,
  formData: FormData,
): Promise<PromotionActionState> {
  const user = await requireUserOrThrow();

  const parsed = cancelPromotionSchema.safeParse({ promotionId: formData.get('promotionId') });
  if (!parsed.success) {
    return { ok: false, message: 'Promoção inválida.' };
  }
  const { promotionId } = parsed.data;

  const updated = await db
    .update(promotions)
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: user.id, updatedAt: new Date() })
    .where(
      and(
        eq(promotions.id, promotionId),
        eq(promotions.ownerId, user.id),
        sql`${promotions.status} IN ('scheduled','active')`,
      ),
    )
    .returning({ id: promotions.id, type: promotions.type, spaceId: promotions.spaceId });

  if (updated.length === 0) {
    return { ok: false, message: 'Esta promoção não existe mais ou já foi encerrada.' };
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'promotion.cancelled',
    entityType: 'promotion',
    entityId: promotionId,
    metadata: { spaceId: updated[0]!.spaceId, type: updated[0]!.type },
  });

  revalidateAfterChange();

  return { ok: true, message: `${TYPE_LABEL[updated[0]!.type]} cancelado.` };
}

export type PurchasePromotionActionState = { ok: boolean; message?: string };

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compra avulsa de Destaque/Turbo — preco fixo, independente de ser Premium
 * ou nao (o beneficio gratis do Premium e `activatePromotionAction`, esta
 * aqui e sempre paga).
 *
 * Mesmo padrao de `startCheckoutAction` (booking): cria/reaproveita o
 * cliente Asaas do comprador, cria uma cobranca (aqui UNICA, sem split — o
 * dinheiro e da plataforma), grava a compra como `pending` e redireciona
 * pra fatura. A promocao so nasce quando o webhook confirma o pagamento —
 * ver `handlePurchaseConfirmed` em src/lib/payments/webhook.ts.
 */
export async function purchasePromotionAction(
  _prev: PurchasePromotionActionState | undefined,
  formData: FormData,
): Promise<PurchasePromotionActionState> {
  const user = await requireUserOrThrow();

  const parsed = purchasePromotionSchema.safeParse({
    spaceId: formData.get('spaceId'),
    type: formData.get('type'),
    durationHours: formData.get('durationHours'),
    cpfCnpj: formData.get('cpfCnpj'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { spaceId, type, durationHours, cpfCnpj } = parsed.data;

  let space: Awaited<ReturnType<typeof getOwnedSpace>>;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Anúncio não encontrado.' };
  }
  if (space.status !== 'published') {
    return { ok: false, message: 'Só é possível promover um anúncio publicado.' };
  }

  const vigente = await getActivePromotionForSpace(spaceId);
  if (vigente) {
    return { ok: false, message: 'Este anúncio já tem uma promoção ativa agora.' };
  }

  // Preco NUNCA vem do formulario — so o (tipo, duracao) escolhidos, contra o catalogo fixo.
  const opcao = findPriceOption(type, durationHours);
  if (!opcao) {
    return { ok: false, message: 'Duração inválida para esta modalidade.' };
  }

  await db.update(profiles).set({ cpfCnpj }).where(eq(profiles.id, user.id));

  let billing = await getRenterBillingProfile(user.id);
  if (!billing) {
    const [perfil] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
    let cliente: asaas.AsaasCustomer;
    try {
      cliente = await asaas.createCustomer({
        name: perfil?.fullName ?? user.fullName ?? 'Anunciante',
        cpfCnpj,
        email: user.email,
        mobilePhone: perfil?.phone ?? undefined,
        externalReference: user.id,
      });
    } catch (err) {
      if (err instanceof asaas.AsaasError) {
        console.error('[promotions] Asaas recusou a criação do cliente:', err.status, err.body);
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

  let cobranca: asaas.AsaasPayment;
  try {
    cobranca = await asaas.createPayment({
      customer: billing.providerCustomerId,
      billingType: 'UNDEFINED',
      value: opcao.priceCents / 100,
      dueDate: hojeISO(),
      externalReference: `promotion:${spaceId}:${type}`,
      description: `MyPlace — ${TYPE_LABEL[type]} (${opcao.label}) — ${space.title}`,
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[promotions] Asaas recusou a criação da cobrança:', err.status, err.body);
      return { ok: false, message: `Não foi possível iniciar o pagamento: ${err.message}` };
    }
    throw err;
  }

  if (!cobranca.invoiceUrl) {
    console.error('[promotions] cobrança criada sem invoiceUrl:', cobranca.id);
    return { ok: false, message: 'O gateway não devolveu um link de pagamento. Tente novamente.' };
  }

  await db.transaction(async (tx) => {
    await tx.insert(promotionPurchases).values({
      spaceId,
      ownerId: user.id,
      type,
      durationHours: opcao.durationHours,
      priceCents: opcao.priceCents,
      provider: 'asaas',
      providerPaymentId: cobranca.id,
      status: 'pending',
      invoiceUrl: cobranca.invoiceUrl,
    });

    await tx.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: 'promotion_purchase.started',
      entityType: 'space',
      entityId: spaceId,
      metadata: { type, durationHours: opcao.durationHours, priceCents: opcao.priceCents, providerPaymentId: cobranca.id },
    });
  });

  revalidatePath('/meus-espacos');
  redirect(cobranca.invoiceUrl);
}

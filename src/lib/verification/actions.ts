'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { db } from '@/db/client';
import { auditLogs, phoneVerifications, profiles } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { isIntegrationConfigured } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { maskPhone, normalizeBrazilianMobile } from './phone';
import { MAX_CHECK_ATTEMPTS } from './queries';
import { checkSmsCode, sendSmsCode, TwilioVerifyError } from './twilio';

/**
 * Verificação de telefone por SMS (Fase 21).
 *
 * REGRA CENTRAL: o navegador só manda o número (na etapa 1) e o código (na
 * etapa 2). O número que acaba verificado é SEMPRE o que ficou gravado no
 * servidor ao pedir o código (`phone_verifications`), e `phone_verified_at`
 * só é preenchido quando o PROVEDOR responde `approved` — nunca por um
 * campo vindo da tela. Sem o serviço configurado, as ações recusam com
 * mensagem clara; nada finge ter verificado.
 */

const { PostgresError } = postgres;
type PgError = InstanceType<typeof PostgresError>;

const VALIDADE_MINUTOS = 10;

export type PhoneVerificationState = {
  ok: boolean;
  step?: 'code' | 'done';
  message?: string;
  /** Serviço de SMS não configurado na plataforma. */
  unavailable?: boolean;
};

const INDISPONIVEL: PhoneVerificationState = {
  ok: false,
  unavailable: true,
  message: 'A verificação por SMS ainda não está disponível na MyPlace. Nenhum código foi enviado.',
};

const SESSAO_EXPIRADA: PhoneVerificationState = {
  ok: false,
  message: 'Sua sessão expirou. Entre novamente para verificar seu telefone.',
};

async function usuarioOuNulo() {
  try {
    return await requireUserOrThrow();
  } catch {
    return null;
  }
}

function pgErrorFrom(err: unknown): PgError | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause as PgError;
  return null;
}

async function encerrarPendentes(userId: string, status: 'cancelled' | 'expired' | 'failed') {
  await db
    .update(phoneVerifications)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(phoneVerifications.userId, userId), eq(phoneVerifications.status, 'pending')));
}

/** Etapa 1: recebe o número, pede ao provedor o envio do SMS. */
export async function startPhoneVerificationAction(
  _prev: PhoneVerificationState | undefined,
  formData: FormData,
): Promise<PhoneVerificationState> {
  const user = await usuarioOuNulo();
  if (!user) return SESSAO_EXPIRADA;
  if (!isIntegrationConfigured('phoneVerification')) return INDISPONIVEL;

  const phone = normalizeBrazilianMobile(formData.get('phone'));
  if (!phone) {
    return { ok: false, message: 'Informe um celular brasileiro com DDD, por exemplo (27) 99999-8888.' };
  }

  // Número já verificado por OUTRA conta: um número, uma conta — encarece
  // criar perfis paralelos para se autoavaliar.
  const [emOutraConta] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.phone, phone),
        isNotNull(profiles.phoneVerifiedAt),
        isNull(profiles.deletedAt),
        ne(profiles.id, user.id),
      ),
    )
    .limit(1);
  if (emOutraConta) {
    return { ok: false, message: 'Este número já está verificado em outra conta da MyPlace.' };
  }

  // SMS custa dinheiro e é alvo clássico de abuso ("SMS pumping"): limite
  // por pessoa E por número, além do limite do próprio provedor.
  const [porPessoa, porNumero] = await Promise.all([
    rateLimit(`phone-verify:user:${user.id}`, { limit: 3, windowSeconds: 600 }),
    rateLimit(`phone-verify:phone:${phone}`, { limit: 3, windowSeconds: 600 }),
  ]);
  if (!porPessoa.allowed || !porNumero.allowed) {
    return { ok: false, message: 'Muitos códigos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.' };
  }

  // Pedir um código novo invalida o anterior (índice único: um pendente por pessoa).
  await encerrarPendentes(user.id, 'cancelled');

  let enviado: { sid: string | null; status: string };
  try {
    enviado = await sendSmsCode(phone);
  } catch (err) {
    if (err instanceof TwilioVerifyError) {
      if (err.code === 60200) return { ok: false, message: 'Este número não é válido. Confira o DDD e os dígitos.' };
      if (err.code === 60205) return { ok: false, message: 'Este número parece ser fixo e não recebe SMS. Use um celular.' };
      if (err.code === 60203) {
        return { ok: false, message: 'Muitos códigos enviados para este número. Aguarde 10 minutos e tente de novo.' };
      }
    }
    console.error('[verificacao] falha ao pedir SMS ao provedor:', err);
    return { ok: false, message: 'Não conseguimos enviar o SMS agora. Tente novamente em alguns minutos.' };
  }

  await db.insert(phoneVerifications).values({
    userId: user.id,
    phone,
    status: 'pending',
    providerSid: enviado.sid,
    expiresAt: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
  });

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'phone_verification.started',
    entityType: 'profile',
    entityId: user.id,
    // Só o final do número: o bastante para suporte, sem guardar o número no log.
    metadata: { phoneSuffix: phone.slice(-4) },
  });

  revalidatePath('/minha-conta/verificacoes');
  return { ok: true, step: 'code', message: `Enviamos um código por SMS para ${maskPhone(phone)}.` };
}

/** Etapa 2: confere o código com o provedor. Só `approved` grava o selo. */
export async function checkPhoneVerificationAction(
  _prev: PhoneVerificationState | undefined,
  formData: FormData,
): Promise<PhoneVerificationState> {
  const user = await usuarioOuNulo();
  if (!user) return SESSAO_EXPIRADA;
  if (!isIntegrationConfigured('phoneVerification')) return INDISPONIVEL;

  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (!/^\d{4,10}$/.test(code)) {
    return { ok: false, step: 'code', message: 'Digite o código numérico que chegou por SMS.' };
  }

  const limite = await rateLimit(`phone-verify:check:${user.id}`, { limit: 10, windowSeconds: 600 });
  if (!limite.allowed) {
    return { ok: false, step: 'code', message: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' };
  }

  // Conta a tentativa ANTES de chamar o provedor, atomicamente: duas abas
  // enviando ao mesmo tempo não ganham tentativas extras.
  const [pendente] = await db
    .update(phoneVerifications)
    .set({ checkAttempts: sql`${phoneVerifications.checkAttempts} + 1` })
    .where(
      and(
        eq(phoneVerifications.userId, user.id),
        eq(phoneVerifications.status, 'pending'),
        sql`${phoneVerifications.checkAttempts} < ${MAX_CHECK_ATTEMPTS}`,
      ),
    )
    .returning({
      id: phoneVerifications.id,
      phone: phoneVerifications.phone,
      expiresAt: phoneVerifications.expiresAt,
      checkAttempts: phoneVerifications.checkAttempts,
    });

  if (!pendente) {
    await encerrarPendentes(user.id, 'failed');
    revalidatePath('/minha-conta/verificacoes');
    return { ok: false, message: 'Não há código válido em andamento. Peça um novo código.' };
  }
  if (pendente.expiresAt.getTime() <= Date.now()) {
    await encerrarPendentes(user.id, 'expired');
    revalidatePath('/minha-conta/verificacoes');
    return { ok: false, message: 'O código expirou. Peça um novo.' };
  }

  let resultado: { status: string; approved: boolean };
  try {
    resultado = await checkSmsCode(pendente.phone, code);
  } catch (err) {
    if (err instanceof TwilioVerifyError && err.code === 20404) {
      await encerrarPendentes(user.id, 'expired');
      revalidatePath('/minha-conta/verificacoes');
      return { ok: false, message: 'O código expirou ou já foi usado. Peça um novo.' };
    }
    if (err instanceof TwilioVerifyError && err.code === 60202) {
      await encerrarPendentes(user.id, 'failed');
      revalidatePath('/minha-conta/verificacoes');
      return { ok: false, message: 'Tentativas esgotadas para este código. Peça um novo.' };
    }
    console.error('[verificacao] falha ao conferir codigo no provedor:', err);
    return { ok: false, step: 'code', message: 'Não conseguimos conferir o código agora. Tente novamente.' };
  }

  if (!resultado.approved) {
    const restantes = MAX_CHECK_ATTEMPTS - pendente.checkAttempts;
    if (restantes <= 0) {
      await encerrarPendentes(user.id, 'failed');
      revalidatePath('/minha-conta/verificacoes');
      return { ok: false, message: 'Código incorreto e tentativas esgotadas. Peça um novo código.' };
    }
    return {
      ok: false,
      step: 'code',
      message: `Código incorreto. Você ainda tem ${restantes} ${restantes === 1 ? 'tentativa' : 'tentativas'}.`,
    };
  }

  // Aprovado pelo provedor: grava o número QUE FOI VERIFICADO (o do servidor).
  try {
    await db.transaction(async (tx) => {
      const agora = new Date();
      await tx
        .update(phoneVerifications)
        .set({ status: 'approved', resolvedAt: agora })
        .where(eq(phoneVerifications.id, pendente.id));
      await tx
        .update(profiles)
        .set({ phone: pendente.phone, phoneVerifiedAt: agora, updatedAt: agora })
        .where(eq(profiles.id, user.id));
      await tx.insert(auditLogs).values({
        actorId: user.id,
        actorRole: user.role,
        action: 'phone_verification.approved',
        entityType: 'profile',
        entityId: user.id,
        metadata: { phoneSuffix: pendente.phone.slice(-4) },
      });
    });
  } catch (err) {
    const pg = pgErrorFrom(err);
    if (pg?.code === '23505') {
      // Outra conta verificou o mesmo número entre o pedido e a conferência.
      await encerrarPendentes(user.id, 'failed');
      revalidatePath('/minha-conta/verificacoes');
      return { ok: false, message: 'Este número já foi verificado em outra conta da MyPlace.' };
    }
    throw err;
  }

  revalidatePath('/minha-conta');
  revalidatePath('/minha-conta/verificacoes');
  revalidatePath(`/perfil/${user.id}`);
  return { ok: true, step: 'done', message: 'Telefone verificado!' };
}

/** Desiste do código em andamento (ex.: digitou o número errado). */
export async function cancelPhoneVerificationAction(): Promise<PhoneVerificationState> {
  const user = await usuarioOuNulo();
  if (!user) return SESSAO_EXPIRADA;
  await encerrarPendentes(user.id, 'cancelled');
  revalidatePath('/minha-conta/verificacoes');
  return { ok: true };
}

'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { reports, userBlocks, profiles, auditLogs, platformSettings, reviews, bookings } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { rateLimit } from '@/lib/rate-limit';
import {
  reportInputSchema,
  blockUserSchema,
  severityFor,
  type ReportTarget,
} from './report-config';

export type SafetyActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

/**
 * `audit_logs.ip` e coluna `inet` — so aceita endereco valido ou NULL.
 * Sem cabecalho de proxy (ex.: chamada direta, sem `x-forwarded-for`/
 * `x-real-ip`), NULL e o unico valor que a coluna aceita; um texto como
 * "desconhecido" quebraria o INSERT (22P02, invalid input syntax for type inet).
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

/** Le um numero de platform_settings, com queda para o padrao se faltar. */
async function setting(key: string, fallback: number): Promise<number> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  const n = Number(row?.value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coluna de alvo correspondente ao tipo. */
function targetColumns(targetType: ReportTarget, targetId: string) {
  switch (targetType) {
    case 'space':
      return { spaceId: targetId };
    case 'user':
      return { targetUserId: targetId };
    case 'message':
      return { messageId: targetId };
    case 'review':
      return { reviewId: targetId };
  }
}

/**
 * A reserva informada (opcional) precisa ser de quem denuncia E ter a ver
 * com o alvo: a outra parte da reserva (usuario), o espaco dela (anuncio) ou
 * uma avaliacao dela. Sem isso, qualquer um poderia pendurar uma denuncia
 * na reserva de outras pessoas — e denuncia com reserva e o que a
 * moderacao usa para decidir sobre a caucao (Fase 20).
 */
async function bookingMatchesTarget(
  bookingId: string,
  reporterId: string,
  targetType: ReportTarget,
  targetId: string,
): Promise<boolean> {
  const [b] = await db
    .select({ renterId: bookings.renterId, ownerId: bookings.ownerId, spaceId: bookings.spaceId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!b) return false;
  if (b.renterId !== reporterId && b.ownerId !== reporterId) return false;

  const outraParte = b.renterId === reporterId ? b.ownerId : b.renterId;
  switch (targetType) {
    case 'user':
      return targetId === outraParte;
    case 'space':
      return targetId === b.spaceId;
    case 'review': {
      const [r] = await db
        .select({ bookingId: reviews.bookingId })
        .from(reviews)
        .where(eq(reviews.id, targetId))
        .limit(1);
      return r?.bookingId === bookingId;
    }
    case 'message':
      return false;
  }
}

// ---------------------------------------------------------------------------
// Denunciar
// ---------------------------------------------------------------------------

/**
 * Cria uma denuncia.
 *
 * A severidade e derivada do motivo aqui no servidor — o formulario nao a
 * envia. O snapshot da evidencia e capturado por trigger no banco, para que o
 * conteudo denunciado nao desapareca se for editado ou apagado em seguida.
 */
export async function createReportAction(
  _prev: SafetyActionState | undefined,
  formData: FormData,
): Promise<SafetyActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para denunciar.' };
  }

  const parsed = reportInputSchema.safeParse({
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    reason: formData.get('reason'),
    details: formData.get('details') ?? undefined,
    bookingId: formData.get('bookingId') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { targetType, targetId, reason, details, bookingId } = parsed.data;

  if (targetType === 'user' && targetId === user.id) {
    return { ok: false, message: 'Não é possível denunciar a si mesmo.' };
  }

  // Avaliacao: so as que estao no ar, e ninguem denuncia a propria.
  if (targetType === 'review') {
    const [review] = await db
      .select({ authorId: reviews.authorId, hiddenAt: reviews.hiddenAt })
      .from(reviews)
      .where(eq(reviews.id, targetId))
      .limit(1);
    if (!review || review.hiddenAt) {
      return { ok: false, message: 'Esta avaliação não está mais disponível.' };
    }
    if (review.authorId === user.id) {
      return { ok: false, message: 'Você não pode denunciar a sua própria avaliação.' };
    }
  }

  if (bookingId && !(await bookingMatchesTarget(bookingId, user.id, targetType, targetId))) {
    return { ok: false, message: 'Esta reserva não está ligada ao que você está denunciando.' };
  }

  // A denuncia tambem pode virar ferramenta de assedio: alguem abrindo dezenas
  // contra a mesma pessoa. Por isso ha um teto diario.
  const maxPerDay = await setting('safety.max_reports_per_day', 10);
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.reporterId, user.id), gte(reports.createdAt, ontem)));

  if (count >= maxPerDay) {
    return {
      ok: false,
      message:
        'Você atingiu o limite de denúncias por dia. Se houver algo urgente, fale com o suporte.',
    };
  }

  const burst = await rateLimit(`report:${user.id}`, { limit: 3, windowSeconds: 60 });
  if (!burst.allowed) {
    return { ok: false, message: 'Aguarde um instante antes de enviar outra denúncia.' };
  }

  try {
    await db.insert(reports).values({
      targetType,
      ...targetColumns(targetType, targetId),
      reporterId: user.id,
      bookingId: bookingId ?? null,
      reason,
      severity: severityFor(reason),
      details,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('reports_one_open_per_target')) {
      return {
        ok: false,
        message: 'Você já tem uma denúncia em aberto sobre isso. Nossa equipe está analisando.',
      };
    }
    if (msg.includes('reports_no_self_report')) {
      return { ok: false, message: 'Não é possível denunciar a si mesmo.' };
    }
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return { ok: false, message: 'O conteúdo denunciado não existe mais.' };
    }
    throw err;
  }

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'report.created',
    entityType: targetType,
    entityId: targetId,
    metadata: { reason, severity: severityFor(reason), ...(bookingId ? { bookingId } : {}) },
    ip: await clientIp(),
  });

  return {
    ok: true,
    message:
      'Denúncia registrada. Nossa equipe vai analisar. Se você se sentir ameaçado, bloqueie a pessoa também.',
  };
}

// ---------------------------------------------------------------------------
// Bloquear / desbloquear
// ---------------------------------------------------------------------------

/**
 * Bloqueia outro usuario.
 *
 * Efeito imediato e MUTUO: nenhum dos dois consegue iniciar conversa, enviar
 * mensagem ou reservar espaco do outro — garantido por trigger no banco, nao
 * apenas aqui. As conversas existentes entre os dois sao encerradas.
 *
 * Diferente da denuncia, nao depende de analise de ninguem: e a pessoa
 * resolvendo o proprio problema na hora.
 */
export async function blockUserAction(
  _prev: SafetyActionState | undefined,
  formData: FormData,
): Promise<SafetyActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para bloquear alguém.' };
  }

  const parsed = blockUserSchema.safeParse({
    blockedId: formData.get('blockedId'),
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (parsed.data.blockedId === user.id) {
    return { ok: false, message: 'Você não pode bloquear a si mesmo.' };
  }

  const [alvo] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, parsed.data.blockedId))
    .limit(1);

  if (!alvo) return { ok: false, message: 'Usuário não encontrado.' };

  await db
    .insert(userBlocks)
    .values({
      blockerId: user.id,
      blockedId: parsed.data.blockedId,
      reason: parsed.data.reason,
    })
    .onConflictDoNothing();

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'user.blocked',
    entityType: 'profile',
    entityId: parsed.data.blockedId,
    ip: await clientIp(),
  });

  revalidatePath('/mensagens');
  revalidatePath('/minha-conta/seguranca');

  return {
    ok: true,
    message: 'Usuário bloqueado. Vocês não poderão mais se falar nem negociar pela plataforma.',
  };
}

export async function unblockUserAction(
  _prev: SafetyActionState | undefined,
  formData: FormData,
): Promise<SafetyActionState> {
  let user;
  try {
    user = await requireUserOrThrow();
  } catch {
    return { ok: false, message: 'Entre na sua conta para continuar.' };
  }

  const blockedId = formData.get('blockedId');
  if (typeof blockedId !== 'string') {
    return { ok: false, message: 'Usuário inválido.' };
  }

  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, blockedId)));

  await db.insert(auditLogs).values({
    actorId: user.id,
    actorRole: user.role,
    action: 'user.unblocked',
    entityType: 'profile',
    entityId: blockedId,
    ip: await clientIp(),
  });

  revalidatePath('/minha-conta/seguranca');

  // Desbloquear nao reabre a conversa encerrada: quem quiser retomar
  // comeca uma nova, de propria vontade.
  return { ok: true, message: 'Usuário desbloqueado.' };
}

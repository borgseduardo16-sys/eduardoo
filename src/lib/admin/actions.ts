'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { reports, profiles, auditLogs, premiumMemberships, bookingDeposits } from '@/db/schema';
import { requireAdminOrThrow } from '@/lib/auth/dal';
import { releaseDeposit } from '@/lib/payments/deposits';
import { parseBRLToCents } from '@/lib/money';

export type AdminActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Mesma regra de `audit_logs.ip` (coluna `inet`) usada em safety/actions.ts e auth/actions.ts. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

// ---------------------------------------------------------------------------
// Resolver denúncia
// ---------------------------------------------------------------------------

const resolveReportSchema = z.object({
  reportId: z.uuid('Denúncia inválida.'),
  decision: z.enum(['upheld', 'dismissed'], { error: 'Escolha uma decisão.' }),
  resolutionNote: z
    .string()
    .trim()
    .max(1000, 'Use no máximo 1000 caracteres.')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/**
 * Resolve uma denúncia como procedente ou improcedente.
 *
 * `upheld = true` alimenta, por trigger no banco, o contador de reincidência
 * do denunciado (`profiles.upheld_report_count`) e — ao atingir o limite de
 * `safety.auto_suspend_upheld_threshold` — a suspensão automática da conta.
 * Nada disso é decidido aqui: este código só grava a decisão do moderador.
 */
export async function resolveReportAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdminOrThrow();

  const parsed = resolveReportSchema.safeParse({
    reportId: formData.get('reportId'),
    decision: formData.get('decision'),
    resolutionNote: formData.get('resolutionNote') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { reportId, decision, resolutionNote } = parsed.data;

  const status = decision === 'upheld' ? 'resolved' : 'dismissed';
  const upheld = decision === 'upheld';

  const updated = await db
    .update(reports)
    .set({ status, upheld, resolutionNote, resolvedBy: admin.id, resolvedAt: new Date() })
    .where(and(eq(reports.id, reportId), inArray(reports.status, ['open', 'reviewing'])))
    .returning({ id: reports.id, targetType: reports.targetType });

  if (updated.length === 0) {
    return { ok: false, message: 'Esta denúncia já foi resolvida (por você ou outro moderador).' };
  }

  await db.insert(auditLogs).values({
    actorId: admin.id,
    actorRole: admin.role,
    action: 'report.resolved',
    entityType: 'report',
    entityId: reportId,
    metadata: { decision, targetType: updated[0].targetType },
    ip: await clientIp(),
  });

  /*
   * Sem revalidatePath aqui, de proposito: a fila filtra por status
   * open/reviewing, entao um refresh imediato removeria este item da lista
   * antes do admin ver a confirmacao — o mesmo susto que RespondRequestActions
   * evita em /meus-espacos/solicitacoes, so que aqui o item de fato some da
   * consulta (nao so muda de grupo). A pagina e `force-dynamic`: a proxima
   * navegacao de verdade ja mostra a fila sem este item, sem precisar disso.
   */

  return {
    ok: true,
    message: decision === 'upheld' ? 'Denúncia marcada como procedente.' : 'Denúncia marcada como improcedente.',
  };
}

// ---------------------------------------------------------------------------
// Caução — reter por dano (Fase 20)
// ---------------------------------------------------------------------------

const resolveDepositSchema = z.object({
  bookingId: z.uuid('Reserva inválida.'),
  /** BRL digitado pelo admin ("0,00" pra liberar tudo) — vira centavos aqui, nunca aceito pronto do cliente. */
  forfeitValue: z.string().min(1, 'Informe um valor.'),
  reportId: z.uuid().optional(),
});

/**
 * Decide o destino da caução de uma reserva: libera tudo (forfeitCents = 0)
 * ou retém uma parte a favor do proprietário. Ação SEPARADA de
 * `resolveReportAction` de propósito — mexe com dinheiro de verdade (chama
 * o Asaas de verdade pra estornar), então pode falhar independentemente da
 * denúncia já ter sido resolvida, e precisa poder ser tentada de novo sem
 * reabrir a denúncia.
 */
export async function resolveDepositAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdminOrThrow();

  const parsed = resolveDepositSchema.safeParse({
    bookingId: formData.get('bookingId'),
    forfeitValue: formData.get('forfeitValue'),
    reportId: formData.get('reportId') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { bookingId, forfeitValue, reportId } = parsed.data;

  let forfeitCents: number;
  try {
    forfeitCents = parseBRLToCents(forfeitValue);
  } catch {
    return { ok: false, fieldErrors: { forfeitValue: ['Valor inválido. Exemplo: 50,00 ou 0,00 para liberar tudo.'] } };
  }

  const [deposito] = await db
    .select({ id: bookingDeposits.id })
    .from(bookingDeposits)
    .where(eq(bookingDeposits.bookingId, bookingId))
    .limit(1);
  if (!deposito) {
    return { ok: false, message: 'Esta reserva não tem caução cobrada.' };
  }

  const resultado = await releaseDeposit(deposito.id, forfeitCents, reportId ?? null);
  if (!resultado.ok) {
    return { ok: false, message: resultado.message };
  }

  await db.insert(auditLogs).values({
    actorId: admin.id,
    actorRole: admin.role,
    action: 'deposit.resolved',
    entityType: 'booking_deposit',
    entityId: deposito.id,
    metadata: { bookingId, forfeitCents, reportId: reportId ?? null },
    ip: await clientIp(),
  });

  revalidatePath('/admin/denuncias');

  return {
    ok: true,
    message: forfeitCents > 0 ? 'Caução resolvida — parte retida a favor do proprietário.' : 'Caução liberada integralmente.',
  };
}

// ---------------------------------------------------------------------------
// Status de conta
// ---------------------------------------------------------------------------

const updateAccountStatusSchema = z
  .object({
    userId: z.uuid('Usuário inválido.'),
    status: z.enum(['active', 'suspended', 'banned'], { error: 'Status inválido.' }),
    statusReason: z
      .string()
      .trim()
      .max(500, 'Use no máximo 500 caracteres.')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine((d) => d.status === 'active' || Boolean(d.statusReason), {
    path: ['statusReason'],
    message: 'Explique o motivo ao suspender ou banir uma conta.',
  });

/**
 * Altera o status de uma conta (ativar, suspender, banir) manualmente.
 *
 * Complementa a suspensão automática por reincidência: cobre o caso de um
 * único incidente grave (sem 5 denúncias procedentes ainda) e a reversão —
 * a suspensão automática nunca reativa sozinha, então reativar sempre passa
 * por aqui.
 */
export async function updateAccountStatusAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdminOrThrow();

  const parsed = updateAccountStatusSchema.safeParse({
    userId: formData.get('userId'),
    status: formData.get('status'),
    statusReason: formData.get('statusReason') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { userId, status, statusReason } = parsed.data;

  if (userId === admin.id) {
    return { ok: false, message: 'Você não pode alterar o status da própria conta.' };
  }

  const [alvo] = await db
    .select({ id: profiles.id, status: profiles.status })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!alvo) return { ok: false, message: 'Conta não encontrada.' };

  await db
    .update(profiles)
    .set({ status, statusReason: status === 'active' ? null : (statusReason ?? null), updatedAt: new Date() })
    .where(eq(profiles.id, userId));

  await db.insert(auditLogs).values({
    actorId: admin.id,
    actorRole: admin.role,
    action: 'account.status_changed',
    entityType: 'profile',
    entityId: userId,
    metadata: { from: alvo.status, to: status, reason: statusReason },
    ip: await clientIp(),
  });

  revalidatePath('/admin/usuarios');

  return { ok: true, message: 'Status da conta atualizado.' };
}

// ---------------------------------------------------------------------------
// Premium (mecanismo interino — Fase 13)
// ---------------------------------------------------------------------------

const togglePremiumSchema = z.object({
  userId: z.uuid('Usuário inválido.'),
  acao: z.enum(['conceder', 'revogar'], { error: 'Ação inválida.' }),
});

/**
 * Concede ou revoga Premium manualmente.
 *
 * Mecanismo INTERINO: hoje não existe assinatura paga, então este é o único
 * jeito de alguém virar Premium. Mesmo padrão de `updateAccountStatusAction`
 * (auditado, admin não mexe na própria conta) — quando o plano pago for
 * decidido, essa ação continua existindo do mesmo jeito (útil para suporte
 * conceder um período de cortesia), só deixa de ser o ÚNICO caminho.
 */
export async function togglePremiumMembershipAction(
  _prev: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdminOrThrow();

  const parsed = togglePremiumSchema.safeParse({
    userId: formData.get('userId'),
    acao: formData.get('acao'),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { userId, acao } = parsed.data;

  if (userId === admin.id) {
    return { ok: false, message: 'Você não pode conceder Premium à própria conta.' };
  }

  const [alvo] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!alvo) return { ok: false, message: 'Conta não encontrada.' };

  if (acao === 'conceder') {
    await db
      .insert(premiumMemberships)
      .values({ userId, status: 'active', source: 'admin_grant', grantedBy: admin.id, grantedAt: new Date() })
      .onConflictDoUpdate({
        target: premiumMemberships.userId,
        set: {
          status: 'active',
          source: 'admin_grant',
          grantedBy: admin.id,
          grantedAt: new Date(),
          cancelledBy: null,
          cancelledAt: null,
          updatedAt: new Date(),
        },
      });
  } else {
    const atualizadas = await db
      .update(premiumMemberships)
      .set({ status: 'cancelled', cancelledBy: admin.id, cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(premiumMemberships.userId, userId), eq(premiumMemberships.status, 'active')))
      .returning({ userId: premiumMemberships.userId });
    if (atualizadas.length === 0) {
      return { ok: false, message: 'Esta conta não é Premium no momento.' };
    }
  }

  await db.insert(auditLogs).values({
    actorId: admin.id,
    actorRole: admin.role,
    action: acao === 'conceder' ? 'premium.granted' : 'premium.revoked',
    entityType: 'profile',
    entityId: userId,
    metadata: { acao },
    ip: await clientIp(),
  });

  revalidatePath('/admin/usuarios');

  return { ok: true, message: acao === 'conceder' ? 'Premium concedido.' : 'Premium revogado.' };
}

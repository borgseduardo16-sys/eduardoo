import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { reports, profiles, spaces, messages, bookings, bookingDeposits } from '@/db/schema';

/** Ordem de gravidade na fila — mais grave primeiro, sem depender da ordem alfabética do enum. */
const severityRank = sql<number>`CASE ${reports.severity}
  WHEN 'critical' THEN 4
  WHEN 'high' THEN 3
  WHEN 'normal' THEN 2
  WHEN 'low' THEN 1
  ELSE 0
END`;

/**
 * Fila de moderação: denúncias abertas ou em análise, mais graves e mais
 * antigas primeiro — mesma ordem do índice parcial `reports_queue_idx`.
 *
 * Resolve o alvo (título do anúncio, nome do usuário, prévia da mensagem) e
 * quem denunciou, para o moderador decidir sem precisar abrir outra tela.
 */
export async function listModerationQueue() {
  return db
    .select({
      id: reports.id,
      targetType: sql<string>`${reports.targetType}::text`,
      reason: sql<string>`${reports.reason}::text`,
      severity: sql<string>`${reports.severity}::text`,
      status: sql<string>`${reports.status}::text`,
      details: reports.details,
      evidenceSnapshot: reports.evidenceSnapshot,
      createdAt: reports.createdAt,

      reporterId: reports.reporterId,
      reporterName: sql<string | null>`(SELECT full_name FROM profiles WHERE id = ${reports.reporterId})`,

      spaceId: reports.spaceId,
      spaceTitle: spaces.title,
      spaceSlug: spaces.slug,

      targetUserId: reports.targetUserId,
      targetUserName: sql<string | null>`(SELECT full_name FROM profiles WHERE id = ${reports.targetUserId})`,
      targetUserUpheldCount: sql<number | null>`(SELECT upheld_report_count FROM profiles WHERE id = ${reports.targetUserId})`,

      messageId: reports.messageId,
      messageBody: messages.body,
      messageSenderId: messages.senderId,
      messageSenderName: sql<string | null>`(SELECT full_name FROM profiles WHERE id = ${messages.senderId})`,

      /** Contexto pra denúncia de dano (Fase 20): a locação e a caução em jogo, se houver. */
      bookingId: reports.bookingId,
      bookingReference: bookings.reference,
      depositId: bookingDeposits.id,
      depositAmountCents: bookingDeposits.amountCents,
      depositReleaseStatus: sql<string | null>`${bookingDeposits.releaseStatus}::text`,
    })
    .from(reports)
    .leftJoin(spaces, eq(reports.spaceId, spaces.id))
    .leftJoin(messages, eq(reports.messageId, messages.id))
    .leftJoin(bookings, eq(reports.bookingId, bookings.id))
    .leftJoin(bookingDeposits, eq(bookingDeposits.bookingId, reports.bookingId))
    .where(inArray(reports.status, ['open', 'reviewing']))
    .orderBy(desc(severityRank), reports.createdAt);
}

/** Contagem por status, para o cabeçalho do painel. */
export async function getModerationQueueCount(): Promise<number> {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(inArray(reports.status, ['open', 'reviewing']));
  return count;
}

/** Uma denúncia, para validar antes de resolver (evita resolver id inexistente). */
export async function getReportById(id: string) {
  const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return row ?? null;
}

/** Últimas denúncias já decididas sobre uma pessoa — contexto de reincidência ao resolver uma nova. */
export async function listResolvedReportsAgainstUser(targetUserId: string, limit = 5) {
  return db
    .select({
      id: reports.id,
      reason: sql<string>`${reports.reason}::text`,
      upheld: reports.upheld,
      resolutionNote: reports.resolutionNote,
      resolvedAt: reports.resolvedAt,
    })
    .from(reports)
    .where(and(eq(reports.targetUserId, targetUserId), inArray(reports.status, ['resolved', 'dismissed'])))
    .orderBy(desc(reports.resolvedAt))
    .limit(limit);
}

export type AdminAccountRow = {
  id: string;
  fullName: string | null;
  role: string;
  status: string;
  statusReason: string | null;
  upheldReportCount: number;
  completedBookingsCount: number;
  createdAt: Date;
  /** Premium AGORA: ciclo pago (ou concessao administrativa) vigente — `premium_is_active()`. */
  isPremium: boolean;
  /** `subscription` (assinatura paga) ou `admin_grant` (modo teste/suporte); null fora do Premium. */
  premiumSource: string | null;
  premiumEndsAt: Date | string | null;
  /** O Premium vigente da direito aos beneficios financeiros? */
  premiumFinancial: boolean;
};

const accountColumns = {
  id: profiles.id,
  fullName: profiles.fullName,
  role: sql<string>`${profiles.role}::text`,
  status: sql<string>`${profiles.status}::text`,
  statusReason: profiles.statusReason,
  upheldReportCount: profiles.upheldReportCount,
  completedBookingsCount: profiles.completedBookingsCount,
  createdAt: profiles.createdAt,
  isPremium: sql<boolean>`public.premium_is_active(${profiles.id})`,
  // `profiles.id` por extenso nas subconsultas: o Drizzle interpolaria só "id", que ali viraria o id do CICLO.
  premiumSource: sql<string | null>`(SELECT c.source::text FROM premium_cycles c WHERE c.id = public.premium_current_cycle_id(profiles.id))`,
  premiumEndsAt: sql<Date | string | null>`(SELECT COALESCE(c.ended_early_at, c.ends_at) FROM premium_cycles c WHERE c.id = public.premium_current_cycle_id(profiles.id))`,
  premiumFinancial: sql<boolean>`public.premium_financial_active(${profiles.id})`,
};

/**
 * Busca contas por nome (painel de usuários) — sem e-mail, que mora em auth.users.
 *
 * Mais recente primeiro: sem isso, um nome comum com mais de `limit` contas
 * cadastradas devolve uma ordem arbitrária do Postgres (na prática, a ordem
 * de armazenamento) — a conta que o moderador provavelmente quer (a mais
 * nova) podia nem aparecer, sem nenhum aviso de que o resultado foi cortado.
 */
export async function searchAccounts(query: string, limit = 20): Promise<AdminAccountRow[]> {
  const termo = query.trim();
  if (!termo) return [];
  return db
    .select(accountColumns)
    .from(profiles)
    .where(sql`${profiles.fullName} ILIKE ${'%' + termo + '%'}`)
    .orderBy(desc(profiles.createdAt))
    .limit(limit);
}

export async function getAccountById(id: string): Promise<AdminAccountRow | null> {
  const [row] = await db
    .select(accountColumns)
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return row ?? null;
}

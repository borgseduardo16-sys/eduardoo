import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { reports, profiles, spaces, messages } from '@/db/schema';

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
    })
    .from(reports)
    .leftJoin(spaces, eq(reports.spaceId, spaces.id))
    .leftJoin(messages, eq(reports.messageId, messages.id))
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
};

/** Busca contas por nome (painel de usuários) — sem e-mail, que mora em auth.users. */
export async function searchAccounts(query: string, limit = 20): Promise<AdminAccountRow[]> {
  const termo = query.trim();
  if (!termo) return [];
  return db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      role: sql<string>`${profiles.role}::text`,
      status: sql<string>`${profiles.status}::text`,
      statusReason: profiles.statusReason,
      upheldReportCount: profiles.upheldReportCount,
      completedBookingsCount: profiles.completedBookingsCount,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(sql`${profiles.fullName} ILIKE ${'%' + termo + '%'}`)
    .limit(limit);
}

export async function getAccountById(id: string): Promise<AdminAccountRow | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      role: sql<string>`${profiles.role}::text`,
      status: sql<string>`${profiles.status}::text`,
      statusReason: profiles.statusReason,
      upheldReportCount: profiles.upheldReportCount,
      completedBookingsCount: profiles.completedBookingsCount,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return row ?? null;
}

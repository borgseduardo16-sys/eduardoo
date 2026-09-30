import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyUser } from '@/lib/notifications/dispatch';
import { todayInSaoPaulo } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { monthLabel, monthRange, previousMonth } from './period';
import { getOwnerMonthlyHistory, type MonthlyHistoryRow } from './queries';

/**
 * Aviso "seu relatório do mês está pronto" (Fase 23), pelo cron diário.
 *
 * - Um por proprietário por mês (dedupeKey `monthly_report:{dono}:{AAAA-MM}`),
 *   mesmo que o cron rode de novo.
 * - Só nos primeiros dias do mês: relatório de agosto chegando no fim de
 *   setembro seria notícia velha (o relatório continua no painel sempre).
 * - Só para quem teve anúncio no ar naquele mês, e só se aconteceu alguma
 *   coisa — relatório de zeros é ruído (mesma regra do resumo da Fase 18).
 * - Os números do aviso são os mesmos do painel (`getOwnerMonthlyHistory`).
 */
export const MONTHLY_REPORT_SEND_UNTIL_DAY = 7;

function plural(v: number, um: string, varios: string): string {
  return `${v.toLocaleString('pt-BR')} ${v === 1 ? um : varios}`;
}

/** Texto do aviso a partir dos números reais do mês; null quando não houve nada. */
export function monthlyReportBody(row: MonthlyHistoryRow): string | null {
  const partes: string[] = [];
  if (row.views) partes.push(plural(row.views, 'visualização', 'visualizações'));
  if (row.favoritesNew > 0) partes.push(plural(row.favoritesNew, 'favorito', 'favoritos'));
  if (row.requests > 0) partes.push(plural(row.requests, 'solicitação', 'solicitações'));
  if (row.reservationsStarted > 0) partes.push(plural(row.reservationsStarted, 'reserva iniciada', 'reservas iniciadas'));
  if (row.rentalsEnded > 0) partes.push(plural(row.rentalsEnded, 'locação encerrada', 'locações encerradas'));
  if (row.revenueCents > 0) partes.push(`${formatBRL(row.revenueCents)} de receita confirmada`);
  if (partes.length === 0) return null;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `Em ${monthLabel(row.month).split(' de ')[0]}: ${lista}.`;
}

export async function runMonthlyReports(
  now = new Date(),
  /** Só para testes: limita a estes proprietários. */
  opts: { onlyOwners?: string[] } = {},
): Promise<{ reports: number; skipped?: 'fora_da_janela' }> {
  const hoje = todayInSaoPaulo(now);
  if (Number(hoje.slice(8, 10)) > MONTHLY_REPORT_SEND_UNTIL_DAY) return { reports: 0, skipped: 'fora_da_janela' };

  const mes = previousMonth(hoje);
  const range = monthRange(mes)!;
  const donos = (await db.execute(sql`
    SELECT DISTINCT s.owner_id
    FROM spaces s
    WHERE s.published_at IS NOT NULL
      AND (s.published_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${range.to}::date
      AND (s.deleted_at IS NULL OR (s.deleted_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${range.from}::date)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = s.owner_id AND n.dedupe_key = 'monthly_report:' || s.owner_id::text || ':' || ${mes}
      )
  `)) as unknown as { owner_id: string }[];

  let reports = 0;
  for (const { owner_id: ownerId } of donos) {
    if (opts.onlyOwners && !opts.onlyOwners.includes(ownerId)) continue;
    try {
      const [linha] = await getOwnerMonthlyHistory(ownerId, { first: mes, last: mes }, hoje);
      const corpo = linha ? monthlyReportBody(linha) : null;
      if (!corpo) continue;
      await notifyUser(db, {
        userId: ownerId,
        type: 'monthly_report',
        title: `Seu relatório de ${monthLabel(mes).split(' de ')[0]} está pronto`,
        body: corpo,
        linkPath: `/meus-espacos/desempenho?mes=${mes}`,
        data: { month: mes },
        dedupeKey: `monthly_report:${ownerId}:${mes}`,
      });
      reports++;
    } catch (err) {
      // Um dono com problema não impede o relatório dos outros.
      console.error('[relatorio mensal] falha para um proprietario:', err);
    }
  }
  return { reports };
}

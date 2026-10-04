import 'server-only';
import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { RESPONSE_WINDOW_DAYS, type ResponseStats } from './response-format';

/**
 * Taxa e tempo de resposta de um proprietário (Fase 22), apurados das
 * solicitações reais — as regras do que conta estão em `response-format.ts`.
 *
 * Solicitação ainda `requested` mas já fora do prazo conta como sem
 * resposta mesmo antes de `sweepExpiredBookings` marcá-la `expired`
 * (essa marcação é preguiçosa): a leitura não depende de alguém ter aberto
 * uma tela antes.
 *
 * O tempo usa `GREATEST(0, …)`: `responded_at` vem do relógio do servidor da
 * aplicação e `requested_at` do banco; uma diferença de relógio nunca vira
 * tempo negativo.
 *
 * Usa o índice `bookings_owner_idx (owner_id, status)`. Só agregados saem
 * daqui — nenhuma solicitação, nome ou data individual.
 */
export const getOwnerResponseStats = cache(async (ownerId: string): Promise<ResponseStats> => {
  const [linha] = (await db.execute(sql`
    WITH cfg AS (
      SELECT COALESCE(
        (SELECT (value #>> '{}')::int FROM platform_settings WHERE key = 'booking.request_expiry_days'),
        7
      ) AS dias
    )
    SELECT
      count(*) FILTER (WHERE b.responded_at IS NOT NULL)::int AS respondidas,
      count(*) FILTER (
        WHERE b.responded_at IS NULL
          AND (b.status = 'expired'
               OR (b.status = 'requested' AND b.requested_at < now() - make_interval(days => cfg.dias)))
      )::int AS sem_resposta,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (b.responded_at - b.requested_at)))
      ) FILTER (WHERE b.responded_at IS NOT NULL) AS mediana_segundos
    FROM bookings b, cfg
    WHERE b.owner_id = ${ownerId}
      AND b.requested_at >= now() - make_interval(days => ${RESPONSE_WINDOW_DAYS}::int)
  `)) as unknown as { respondidas: number; sem_resposta: number; mediana_segundos: number | string | null }[];

  const respondidas = linha?.respondidas ?? 0;
  const semResposta = linha?.sem_resposta ?? 0;
  const mediana = linha?.mediana_segundos;
  return {
    decided: respondidas + semResposta,
    answered: respondidas,
    medianSeconds: mediana == null ? null : Number(mediana),
  };
});

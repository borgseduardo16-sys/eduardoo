import { sql } from 'drizzle-orm';
import { HOJE_BR_SQL } from '@/lib/dates';

/**
 * Bloqueios do calendário que ainda não terminaram, como JSON — sem motivo
 * nem anotação (são privados do proprietário). Correlacionado com `spaces.id`
 * escrito por extenso: interpolar a coluna geraria `"id"` sem a tabela e a
 * condição viraria `b.space_id = b.id` (ver a nota em listPublishedSpaces).
 */
export const upcomingBlocksExpr = sql<{ startsOn: string; endsOn: string }[]>`COALESCE((
  SELECT json_agg(json_build_object('startsOn', b.starts_on::text, 'endsOn', b.ends_on::text) ORDER BY b.starts_on)
  FROM space_availability_blocks b
  WHERE b.space_id = spaces.id AND b.cancelled_at IS NULL AND b.ends_on >= ${sql.raw(HOJE_BR_SQL)}
), '[]'::json)`;

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

/**
 * Teto diário de chamadas de IA por funcionalidade (Fase 23) — controle de
 * custo que vale para o app inteiro, entre todas as instâncias, porque o
 * contador mora no banco (`ai_usage_counters`), não em memória.
 *
 * A cota é consumida ANTES da chamada: uma chamada que falha também conta.
 * Sem isso, um erro em sequência (chave inválida, serviço fora) viraria
 * tentativa infinita sem custo aparente.
 *
 * O dia é o de São Paulo, o mesmo das outras contagens diárias do app.
 */
export type AiFeature = 'search' | 'listing';

/** true = pode chamar (e a chamada já foi contada); false = teto do dia atingido. */
export async function consumeAiQuota(feature: AiFeature, dailyLimit: number): Promise<boolean> {
  if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) return false;
  const rows = await db.execute<{ calls: number }>(sql`
    INSERT INTO ai_usage_counters (day, feature, calls)
    VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, ${feature}, 1)
    ON CONFLICT (day, feature) DO UPDATE
      SET calls = ai_usage_counters.calls + 1
      WHERE ai_usage_counters.calls < ${dailyLimit}
    RETURNING calls
  `);
  return rows.length > 0;
}

/** Quantas chamadas já foram feitas hoje (para testes e diagnóstico). */
export async function aiCallsToday(feature: AiFeature): Promise<number> {
  const rows = await db.execute<{ calls: number }>(sql`
    SELECT calls FROM ai_usage_counters
    WHERE day = (now() AT TIME ZONE 'America/Sao_Paulo')::date AND feature = ${feature}
  `);
  return Number(rows[0]?.calls ?? 0);
}

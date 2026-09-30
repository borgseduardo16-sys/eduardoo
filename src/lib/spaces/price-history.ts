import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacePriceHistory } from '@/db/schema';

/**
 * Histórico público de preço de um anúncio (Fase 23).
 *
 * Vem inteiro de `space_price_history`, que o banco grava sozinho a cada
 * mudança real depois da publicação — nada aqui é estimado ou preenchido.
 * Anúncio que nunca mudou de preço devolve `null` e a página não mostra
 * nada (nem um gráfico vazio).
 *
 * Várias mudanças no MESMO dia viram uma só (o preço com que o dia
 * terminou): o que interessa a quem procura espaço é a trajetória, não os
 * ajustes de digitação de uma tarde. Um dia que termina no mesmo preço do
 * anterior não vira ponto.
 */

export type PricePoint = {
  /** yyyy-mm-dd, no fuso de São Paulo. */
  date: string;
  priceCents: number;
  /** Diferença para o ponto anterior (negativo = caiu). Null no primeiro ponto. */
  deltaCents: number | null;
  /** O primeiro ponto é o preço com que o anúncio foi publicado. */
  isPublication: boolean;
};

export type PublicPriceHistory = { points: PricePoint[] };

/** Quantos pontos no máximo (além do da publicação): o suficiente para ver a trajetória. */
const MAX_PONTOS = 8;

export type RawPriceChange = { day: string; oldPriceCents: number; newPriceCents: number };

/** Parte pura, testável sem banco: mudanças em ordem → pontos exibíveis. */
export function buildPriceHistory(
  publishedDay: string | null,
  changes: RawPriceChange[],
): PublicPriceHistory | null {
  if (changes.length === 0) return null;

  // Fecha cada dia no último preço daquele dia.
  const porDia = new Map<string, number>();
  for (const c of changes) porDia.set(c.day, c.newPriceCents);

  const inicial = changes[0].oldPriceCents;
  const pontos: PricePoint[] = [
    { date: publishedDay ?? changes[0].day, priceCents: inicial, deltaCents: null, isPublication: true },
  ];
  for (const [dia, preco] of porDia) {
    const anterior = pontos[pontos.length - 1].priceCents;
    if (preco === anterior) continue;
    pontos.push({ date: dia, priceCents: preco, deltaCents: preco - anterior, isPublication: false });
  }

  // Só a publicação não é histórico: nenhuma mudança sobreviveu ao dia.
  if (pontos.length < 2) return null;

  const cauda = pontos.slice(1).slice(-MAX_PONTOS);
  return { points: [pontos[0], ...cauda] };
}

export async function getPublicPriceHistory(spaceId: string, publishedAt: Date | null): Promise<PublicPriceHistory | null> {
  const rows = await db
    .select({
      day: sql<string>`to_char(${spacePriceHistory.changedAt} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      oldPriceCents: spacePriceHistory.oldPriceCents,
      newPriceCents: spacePriceHistory.newPriceCents,
    })
    .from(spacePriceHistory)
    .where(eq(spacePriceHistory.spaceId, spaceId))
    .orderBy(asc(spacePriceHistory.changedAt));

  const publishedDay = publishedAt
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(publishedAt)
    : null;

  return buildPriceHistory(publishedDay, rows);
}

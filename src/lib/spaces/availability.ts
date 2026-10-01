import 'server-only';
import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceAvailabilityBlocks } from '@/db/schema';

/**
 * Disponibilidade de um espaço (Fase 23) — a mesma resposta para a página
 * pública, a lista de espera e a validação de solicitação.
 *
 * Parte 12: a ocupação é por UNIDADE (ver src/lib/rentals/queries.ts). Aqui
 * fica o nível do anúncio: está no ar e tem pelo menos uma unidade que não
 * está com aluguel mensal. Horários livres do temporário são por unidade.
 */

export type SpaceBlockPublic = { startsOn: string; endsOn: string };

export type SpaceAvailability = {
  status: string;
  availableFrom: string | null;
  /** Todas as unidades estão com aluguel mensal (anúncio `rented`). */
  occupied: boolean;
  /** Bloqueios manuais que ainda não terminaram — SEM motivo (motivo é privado). */
  upcomingBlocks: SpaceBlockPublic[];
  /** Pode receber solicitação agora (no ar e sem ocupação). */
  openForRequests: boolean;
};

export async function getSpaceAvailability(spaceId: string): Promise<SpaceAvailability | null> {
  const [space] = await db
    .select({
      status: sql<string>`${spaces.status}::text`,
      availableFrom: spaces.availableFrom,
      deletedAt: spaces.deletedAt,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space || space.deletedAt) return null;

  const bloqueios = await listUpcomingBlocks(spaceId);

  // Parte 12: o banco marca `rented` só quando TODAS as unidades estão com
  // aluguel mensal (`space_fully_rented`). Com uma unidade livre que seja,
  // o anúncio continua no ar e recebendo pedidos.
  const occupied = space.status === 'rented';
  return {
    status: space.status,
    availableFrom: space.availableFrom,
    occupied,
    upcomingBlocks: bloqueios,
    openForRequests: space.status === 'published',
  };
}

/** Bloqueios ativos que terminam hoje ou depois, em ordem. Nunca devolve motivo nem anotação. */
export async function listUpcomingBlocks(spaceId: string): Promise<SpaceBlockPublic[]> {
  return db
    .select({ startsOn: spaceAvailabilityBlocks.startsOn, endsOn: spaceAvailabilityBlocks.endsOn })
    .from(spaceAvailabilityBlocks)
    .where(
      and(
        eq(spaceAvailabilityBlocks.spaceId, spaceId),
        isNull(spaceAvailabilityBlocks.cancelledAt),
        gte(spaceAvailabilityBlocks.endsOn, sql`CURRENT_DATE`),
      ),
    )
    .orderBy(asc(spaceAvailabilityBlocks.startsOn));
}

/** yyyy-mm-dd + n dias. Conta em UTC puro: data de calendário, sem hora nem fuso. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Primeira data em que um aluguel SEM data de término pode começar.
 *
 * Como o aluguel ocupa o espaço dali para a frente, qualquer bloqueio futuro
 * que ainda não terminou empurra o início para o dia seguinte ao fim do
 * ÚLTIMO bloqueio. Antes disso, o início também não pode ser anterior a
 * "disponível a partir de" nem a hoje.
 */
export function earliestOpenEndedStart(input: {
  today: string;
  availableFrom: string | null;
  blocks: SpaceBlockPublic[];
}): string {
  let inicio = input.today;
  if (input.availableFrom && input.availableFrom > inicio) inicio = input.availableFrom;
  for (const b of input.blocks) {
    if (b.endsOn >= inicio) {
      const depois = addDaysISO(b.endsOn, 1);
      if (depois > inicio) inicio = depois;
    }
  }
  return inicio;
}

/** O bloqueio que um aluguel sem término começando em `start` atravessaria, se houver. */
export function blockCrossedByOpenEndedStart(start: string, blocks: SpaceBlockPublic[]): SpaceBlockPublic | null {
  return blocks.find((b) => b.endsOn >= start) ?? null;
}

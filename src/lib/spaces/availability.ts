import 'server-only';
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, spaces, spaceAvailabilityBlocks } from '@/db/schema';
import { OCCUPYING_STATUSES } from '@/lib/bookings/queries';

/**
 * Disponibilidade de um espaço (Fase 23) — a mesma resposta para a página
 * pública, a lista de espera e a validação de solicitação.
 *
 * O modelo de aluguel é mensal e sem data para terminar (`bookings.end_date`
 * fica NULL): uma reserva vigente ocupa o espaço dali em diante. Por isso
 * "disponível" aqui não é "tem dias livres no calendário" — é "está no ar e
 * ninguém ocupa".
 */

export type SpaceBlockPublic = { startsOn: string; endsOn: string };

export type SpaceAvailability = {
  status: string;
  availableFrom: string | null;
  /** Há reserva aceita, aguardando pagamento, ativa ou em atraso. */
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

  const [ocupacao, bloqueios] = await Promise.all([
    db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.spaceId, spaceId), inArray(bookings.status, [...OCCUPYING_STATUSES])))
      .limit(1),
    listUpcomingBlocks(spaceId),
  ]);

  const occupied = ocupacao.length > 0;
  return {
    status: space.status,
    availableFrom: space.availableFrom,
    occupied,
    upcomingBlocks: bloqueios,
    openForRequests: space.status === 'published' && !occupied,
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

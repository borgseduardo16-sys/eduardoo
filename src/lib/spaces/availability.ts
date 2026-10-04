import 'server-only';
import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, spaceAvailabilityBlocks } from '@/db/schema';
import { addDaysToDate } from '@/lib/time';
import type { SpaceBlockPublic } from './start-dates';

export { blockCoveringStart, earliestStartDate, type SpaceBlockPublic } from './start-dates';

/**
 * Disponibilidade de um anúncio — a mesma resposta para a página pública, a
 * lista de espera e a validação de solicitação.
 *
 * O anúncio tem uma QUANTIDADE (ver `spaces.quantity_*`): `quantityOffered`
 * vagas na plataforma e `quantityAvailable` ainda livres. Quem mantém o
 * número é o banco — ele é recontado a partir das locações que ocupam vaga
 * (aceitas, em pagamento, ativas e com pagamento pendente) a cada mudança.
 * Pedidos ainda sem resposta NÃO ocupam nada.
 */

export type SpaceAvailability = {
  status: string;
  availableFrom: string | null;
  /** Quantas unidades o proprietário oferece na plataforma. */
  quantityOffered: number;
  /** Quantas ainda estão livres agora. */
  quantityAvailable: number;
  /** Total real do local (opcional, informativo: "80 de 100 vagas na plataforma"). */
  quantityTotal: number | null;
  /** Todas as vagas ocupadas (anúncio `rented`). */
  occupied: boolean;
  /** Bloqueios manuais que ainda não terminaram — SEM motivo (motivo é privado). */
  upcomingBlocks: SpaceBlockPublic[];
  /** Pode receber solicitação agora (no ar e com vaga). */
  openForRequests: boolean;
};

export async function getSpaceAvailability(spaceId: string): Promise<SpaceAvailability | null> {
  const [space] = await db
    .select({
      status: sql<string>`${spaces.status}::text`,
      availableFrom: spaces.availableFrom,
      quantityOffered: spaces.quantityOffered,
      quantityAvailable: spaces.quantityAvailable,
      quantityTotal: spaces.quantityTotal,
      deletedAt: spaces.deletedAt,
    })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space || space.deletedAt) return null;

  const bloqueios = await listUpcomingBlocks(spaceId);

  return {
    status: space.status,
    availableFrom: space.availableFrom,
    quantityOffered: space.quantityOffered,
    quantityAvailable: space.quantityAvailable,
    quantityTotal: space.quantityTotal,
    occupied: space.status === 'rented',
    upcomingBlocks: bloqueios,
    // O banco mantém o status: `rented` quando não sobra vaga, `published` quando sobra.
    openForRequests: space.status === 'published' && space.quantityAvailable > 0,
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

/** yyyy-mm-dd + n dias (calendário, sem hora nem fuso). */
export function addDaysISO(iso: string, n: number): string {
  return addDaysToDate(iso, n);
}

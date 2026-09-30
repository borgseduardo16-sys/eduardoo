import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, profiles, spaceAvailabilityBlocks, spaces } from '@/db/schema';
import { OCCUPYING_STATUSES } from '@/lib/bookings/queries';
import type { CalendarRange } from './month';

/**
 * Leitura do calendário (Fase 23).
 *
 * `getOwnerCalendarData` só devolve algo para o DONO do espaço (a posse está
 * no WHERE — espaço de outra pessoa é igual a espaço inexistente). É a única
 * leitura que traz motivo e anotação dos bloqueios e quem está alugando.
 * A versão pública (`getPublicCalendarRanges`) traz só períodos, sem motivo.
 */

export type OwnerBlock = {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: 'manutencao' | 'uso_proprio' | 'viagem' | 'outro';
  note: string | null;
};

export const BLOCK_REASON_LABEL: Record<OwnerBlock['reason'], string> = {
  manutencao: 'Manutenção',
  uso_proprio: 'Uso próprio',
  viagem: 'Viagem',
  outro: 'Outro motivo',
};

export async function getOwnerCalendarData(spaceId: string, ownerId: string) {
  const [space] = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      title: spaces.title,
      status: sql<string>`${spaces.status}::text`,
      availableFrom: spaces.availableFrom,
    })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.ownerId, ownerId), isNull(spaces.deletedAt)))
    .limit(1);
  if (!space) return null;

  const [ocupacoes, bloqueios, pedidos] = await Promise.all([
    db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: sql<string>`${bookings.status}::text`,
        startDate: bookings.startDate,
        endDate: bookings.endDate,
        renterPublicName: profiles.publicName,
      })
      .from(bookings)
      .innerJoin(profiles, eq(profiles.id, bookings.renterId))
      .where(and(eq(bookings.spaceId, spaceId), inArray(bookings.status, [...OCCUPYING_STATUSES]))),
    db
      .select({
        id: spaceAvailabilityBlocks.id,
        startsOn: spaceAvailabilityBlocks.startsOn,
        endsOn: spaceAvailabilityBlocks.endsOn,
        reason: sql<OwnerBlock['reason']>`${spaceAvailabilityBlocks.reason}::text`,
        note: spaceAvailabilityBlocks.note,
      })
      .from(spaceAvailabilityBlocks)
      .where(
        and(
          eq(spaceAvailabilityBlocks.spaceId, spaceId),
          isNull(spaceAvailabilityBlocks.cancelledAt),
          gte(spaceAvailabilityBlocks.endsOn, sql`CURRENT_DATE`),
        ),
      )
      .orderBy(asc(spaceAvailabilityBlocks.startsOn)),
    db
      .select({ id: bookings.id, startDate: bookings.startDate, reference: bookings.reference })
      .from(bookings)
      .where(and(eq(bookings.spaceId, spaceId), eq(bookings.status, 'requested')))
      .orderBy(desc(bookings.requestedAt)),
  ]);

  return { space, occupations: ocupacoes, blocks: bloqueios as OwnerBlock[], pendingRequests: pedidos };
}

export type OwnerCalendarData = NonNullable<Awaited<ReturnType<typeof getOwnerCalendarData>>>;

/** Períodos ocupados, no formato do calendário (fim inclusivo; reserva sem fim fica sem fim). */
export function occupationRanges(ocupacoes: { startDate: string; endDate: string | null }[]): CalendarRange[] {
  return ocupacoes.map((o) => ({
    startsOn: o.startDate,
    // end_date da reserva é exclusivo; no calendário o fim é inclusivo.
    endsOn: o.endDate ? dayBefore(o.endDate) : null,
  }));
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Calendário público: só "ocupado"/"bloqueado", sem motivo, sem quem aluga.
 * Quem é dono ou está alugando vê detalhes em outros lugares.
 */
export async function getPublicCalendarRanges(spaceId: string): Promise<{ occupied: CalendarRange[]; blocked: CalendarRange[] }> {
  const [ocupacoes, bloqueios] = await Promise.all([
    db
      .select({ startDate: bookings.startDate, endDate: bookings.endDate })
      .from(bookings)
      .where(and(eq(bookings.spaceId, spaceId), inArray(bookings.status, [...OCCUPYING_STATUSES]))),
    db
      .select({ startsOn: spaceAvailabilityBlocks.startsOn, endsOn: spaceAvailabilityBlocks.endsOn })
      .from(spaceAvailabilityBlocks)
      .where(
        and(
          eq(spaceAvailabilityBlocks.spaceId, spaceId),
          isNull(spaceAvailabilityBlocks.cancelledAt),
          gte(spaceAvailabilityBlocks.endsOn, sql`CURRENT_DATE`),
        ),
      ),
  ]);
  return { occupied: occupationRanges(ocupacoes), blocked: bloqueios };
}

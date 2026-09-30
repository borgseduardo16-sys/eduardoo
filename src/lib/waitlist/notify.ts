import 'server-only';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, waitlistEntries } from '@/db/schema';
import { notifyUsers } from '@/lib/notifications/dispatch';
import { getSpaceAvailability } from '@/lib/spaces/availability';

/**
 * Avisa quem está na lista de espera — só se o espaço estiver MESMO
 * disponível agora (no ar e sem reserva vigente). Devolve quem foi avisado,
 * para o aviso de "favorito disponível de novo" não mandar o mesmo recado
 * duas vezes para a mesma pessoa.
 *
 * O UPDATE ... RETURNING é a trava: duas chamadas ao mesmo tempo (a ação de
 * encerrar e o cron, por exemplo) nunca reivindicam a mesma entrada — cada
 * pessoa é avisada uma vez só. E o `dedupeKey` por entrada impede que um
 * reprocessamento gere uma segunda notificação.
 *
 * Não reserva nada: o aviso leva ao anúncio, e a pessoa segue o fluxo
 * normal de solicitação, em pé de igualdade com qualquer outra.
 */
export async function notifyWaitlistIfAvailable(spaceId: string): Promise<string[]> {
  const disponibilidade = await getSpaceAvailability(spaceId);
  if (!disponibilidade?.openForRequests) return [];

  const [space] = await db
    .select({ title: spaces.title, slug: spaces.slug })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space) return [];

  const avisados = await db
    .update(waitlistEntries)
    .set({ status: 'notified', notifiedAt: new Date() })
    .where(and(eq(waitlistEntries.spaceId, spaceId), eq(waitlistEntries.status, 'waiting')))
    .returning({ id: waitlistEntries.id, userId: waitlistEntries.userId });

  if (avisados.length === 0) return [];

  await notifyUsers(
    db,
    avisados.map((a) => ({
      userId: a.userId,
      type: 'waitlist_available' as const,
      title: 'O espaço que você esperava está disponível',
      body: `"${space.title}" voltou a ficar disponível. Ele não fica reservado para ninguém: veja o anúncio e envie sua solicitação.`,
      linkPath: `/espacos/${space.slug}`,
      data: { spaceId, waitlistEntryId: a.id },
      dedupeKey: `waitlist_available:${a.id}`,
    })),
  );

  return avisados.map((a) => a.userId);
}

/**
 * Anúncio que deixou de existir (apagado, arquivado, removido): quem
 * esperava por ele não vai ser avisado nunca — a entrada fecha, e a tela da
 * pessoa mostra que o anúncio foi encerrado em vez de "aguardando" para
 * sempre.
 */
export async function closeWaitlistOfGoneSpaces(): Promise<number> {
  const fechadas = await db
    .update(waitlistEntries)
    .set({ status: 'closed', closedAt: new Date() })
    .where(
      and(
        eq(waitlistEntries.status, 'waiting'),
        inArray(
          waitlistEntries.spaceId,
          db
            .select({ id: spaces.id })
            .from(spaces)
            .where(or(isNotNull(spaces.deletedAt), inArray(spaces.status, ['archived', 'removed']))),
        ),
      ),
    )
    .returning({ id: waitlistEntries.id });
  return fechadas.length;
}

/**
 * Rede de segurança do cron diário: espaço que voltou a ficar disponível por
 * um caminho que não chamou o aviso na hora (ex.: SQL manual) ainda assim
 * avisa quem espera, no máximo um dia depois.
 */
export async function runWaitlistSweep(): Promise<{ notified: number; closed: number }> {
  const closed = await closeWaitlistOfGoneSpaces();

  const candidatos = await db
    .selectDistinct({ spaceId: waitlistEntries.spaceId })
    .from(waitlistEntries)
    .innerJoin(spaces, eq(spaces.id, waitlistEntries.spaceId))
    .where(and(eq(waitlistEntries.status, 'waiting'), eq(spaces.status, 'published'), sql`${spaces.deletedAt} IS NULL`));

  let notified = 0;
  for (const { spaceId } of candidatos) {
    notified += (await notifyWaitlistIfAvailable(spaceId)).length;
  }
  return { notified, closed };
}

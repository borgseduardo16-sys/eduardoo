import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces } from '@/db/schema';
import { alertFavoritersOfAvailabilityChange } from '@/lib/notifications/space-alerts';
import { notifyWaitlistIfAvailable } from '@/lib/waitlist/notify';
import { getSpaceAvailability } from './availability';

/**
 * O que acontece quando a disponibilidade de um espaço muda (Fase 23).
 *
 * Quem muda o STATUS é o banco (trigger `bookings_sync_space_occupancy`);
 * isto aqui só avisa as pessoas, depois do fato já gravado — por isso lê o
 * estado real em vez de confiar em quem chamou. Chamado pelas ações que
 * mexem em reserva ou em pausa, e pelo cron diário como rede de segurança.
 *
 * Nunca lança: aviso é consequência, e uma falha nele não pode desfazer um
 * cancelamento ou encerramento que já aconteceu.
 */

async function refDoEspaco(spaceId: string) {
  const [row] = await db
    .select({ id: spaces.id, title: spaces.title, slug: spaces.slug })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  return row ?? null;
}

/** Se o espaço está disponível agora: avisa a lista de espera e, depois, quem favoritou. */
export async function onSpaceMaybeAvailableAgain(spaceId: string): Promise<void> {
  try {
    const disponibilidade = await getSpaceAvailability(spaceId);
    if (!disponibilidade?.openForRequests) return;

    const avisadosPelaLista = await notifyWaitlistIfAvailable(spaceId);
    const ref = await refDoEspaco(spaceId);
    if (ref) {
      await alertFavoritersOfAvailabilityChange(ref, 'available_again', { exceptUserIds: avisadosPelaLista });
    }
  } catch (err) {
    console.error('[disponibilidade] falha ao avisar que o espaço voltou a ficar disponível:', err);
  }
}

/**
 * O espaço saiu do ar (alugado por alguém ou pausado): quem favoritou fica
 * sabendo — e pode entrar na lista de espera pelo próprio anúncio.
 */
export async function onSpaceBecameUnavailable(spaceId: string, exceptUserIds: readonly string[] = []): Promise<void> {
  try {
    const disponibilidade = await getSpaceAvailability(spaceId);
    if (!disponibilidade || disponibilidade.openForRequests) return;
    const ref = await refDoEspaco(spaceId);
    if (ref) await alertFavoritersOfAvailabilityChange(ref, 'unavailable', { exceptUserIds });
  } catch (err) {
    console.error('[disponibilidade] falha ao avisar que o espaço ficou indisponível:', err);
  }
}

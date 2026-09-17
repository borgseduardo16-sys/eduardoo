import 'server-only';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/dal';
import { getOwnedSpace, NotSpaceOwnerError, SpaceNotFoundError } from './queries';

/**
 * Carrega o rascunho de uma etapa do formulário, já autorizado.
 *
 * Responde 404 quando o anúncio é de outra pessoa, e não 403. A diferença
 * importa: um 403 confirmaria que aquele id existe, o que permite descobrir
 * quantos anúncios a plataforma tem e quais ids são válidos só variando a URL.
 *
 * Centralizar aqui é o que garante que nenhuma etapa nova esqueça a checagem.
 */
export async function loadDraftStep(spaceId: string) {
  const user = await requireUser(`/anunciar/${spaceId}`);

  try {
    const space = await getOwnedSpace(spaceId, user.id);
    return { user, space };
  } catch (err) {
    if (err instanceof NotSpaceOwnerError || err instanceof SpaceNotFoundError) {
      notFound();
    }
    throw err;
  }
}

export type DraftSpace = Awaited<ReturnType<typeof loadDraftStep>>['space'];

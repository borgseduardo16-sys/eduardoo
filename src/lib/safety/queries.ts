import 'server-only';
import { cache } from 'react';
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { userBlocks, profiles } from '@/db/schema';

/**
 * Consultas de seguranca usadas pelo servidor.
 *
 * Memoizadas por render: checar bloqueio em varios pontos da mesma pagina
 * custa uma consulta so.
 */

/**
 * Ha bloqueio entre as duas pessoas, em qualquer direcao?
 *
 * A checagem e simetrica de proposito. Se so valesse em um sentido, quem foi
 * bloqueado descobriria isso ao conseguir (ou nao) iniciar a conversa — e teria
 * como contornar pelo outro lado.
 */
export const isBlockedBetween = cache(async (a: string, b: string): Promise<boolean> => {
  const [row] = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return Boolean(row);
});

/** Lista de bloqueios do usuario, para a tela de segurança da conta. */
export const listBlockedUsers = cache(async (userId: string) => {
  return db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      avatarPath: profiles.avatarPath,
      reason: userBlocks.reason,
      blockedAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(profiles, eq(profiles.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, userId))
    .orderBy(desc(userBlocks.createdAt));
});

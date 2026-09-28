import 'server-only';
import { cache } from 'react';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';

/**
 * Perfil público (Fase 21).
 *
 * Seleciona SÓ o que pode ser público — a lista de colunas aqui é a mesma
 * que o banco libera para o navegador (GRANT por coluna, migração 0021).
 * Telefone, e-mail, CPF, nome completo e cidade da pessoa não saem daqui:
 * um erro de template não tem como vazar o que nem chegou na página.
 *
 * Conta suspensa, banida ou apagada não tem perfil público (404) — e a
 * página não diz o porquê, que é informação de moderação.
 */

export type PublicProfile = {
  id: string;
  /** Nome de exibição ou primeiro nome. Null quando a pessoa não informou nome. */
  publicName: string | null;
  avatarPath: string | null;
  bio: string | null;
  createdAt: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
  /**
   * Estado bruto do banco. NÃO é exibido nesta fase: não há provedor de
   * verificação de identidade integrado (ver `IDENTITY_VERIFICATION_AVAILABLE`).
   */
  identityVerified: boolean;
  completedBookingsCount: number;
  /** Anúncios publicados agora. */
  activeSpacesCount: number;
  /** Plano Premium ativo — benefício comercial, não sinal de confiança. */
  isPremium: boolean;
};

const uuid = z.string().uuid();

export function isUuid(value: string): boolean {
  return uuid.safeParse(value).success;
}

export const getPublicProfile = cache(async (userId: string): Promise<PublicProfile | null> => {
  if (!isUuid(userId)) return null;

  const [row] = await db
    .select({
      id: profiles.id,
      publicName: profiles.publicName,
      avatarPath: profiles.avatarPath,
      bio: profiles.bio,
      createdAt: profiles.createdAt,
      emailVerified: sql<boolean>`${profiles.emailVerifiedAt} IS NOT NULL`,
      phoneVerified: sql<boolean>`${profiles.phoneVerifiedAt} IS NOT NULL`,
      identityVerified: sql<boolean>`${profiles.identityVerificationStatus} = 'verified'`,
      completedBookingsCount: profiles.completedBookingsCount,
      // `profiles.id` escrito por extenso DE PROPOSITO: numa consulta de uma
      // tabela so, o Drizzle interpola a coluna como "id", sem o nome da
      // tabela — e dentro da subconsulta esse "id" viraria o id do ESPACO
      // (contagem sempre 0). Pego pelo verify-confianca.ts.
      activeSpacesCount: sql<number>`(
        SELECT count(*)::int FROM spaces s
        WHERE s.owner_id = profiles.id AND s.status = 'published' AND s.deleted_at IS NULL
      )`,
      isPremium: sql<boolean>`EXISTS (
        SELECT 1 FROM premium_memberships pm
        WHERE pm.user_id = profiles.id AND pm.status = 'active'
      )`,
    })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.status, 'active'), isNull(profiles.deletedAt)))
    .limit(1);

  return row ?? null;
});

/** Dados editáveis do PRÓPRIO perfil (Minha conta → Perfil). Nunca usado em página pública. */
export async function getOwnProfileForEdit(userId: string) {
  const [row] = await db
    .select({
      fullName: profiles.fullName,
      displayName: profiles.displayName,
      publicName: profiles.publicName,
      bio: profiles.bio,
      avatarPath: profiles.avatarPath,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ?? null;
}

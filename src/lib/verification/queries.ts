import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { phoneVerifications, profiles } from '@/db/schema';
import { isIntegrationConfigured } from '@/lib/env';

/** Limite de conferências por código — o mesmo que o Twilio aplica (60202). */
export const MAX_CHECK_ATTEMPTS = 5;

export type VerificationOverview = {
  email: { verifiedAt: Date | null };
  phone: {
    /** Número atual do perfil (E.164). Só a própria pessoa vê, e mascarado. */
    number: string | null;
    verifiedAt: Date | null;
    /** Verificação em andamento, se houver e ainda não expirou. */
    pending: { phone: string; expiresAt: Date; attemptsLeft: number } | null;
    /** Serviço de SMS configurado na plataforma? Sem ele, nada de fingir. */
    available: boolean;
  };
  identity: { status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired' };
};

/** Estado das verificações da PRÓPRIA pessoa (Minha conta → Verificações). */
export async function getVerificationOverview(userId: string): Promise<VerificationOverview> {
  const [[perfil], [pendente]] = await Promise.all([
    db
      .select({
        emailVerifiedAt: profiles.emailVerifiedAt,
        phone: profiles.phone,
        phoneVerifiedAt: profiles.phoneVerifiedAt,
        identityStatus: profiles.identityVerificationStatus,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    db
      .select({
        phone: phoneVerifications.phone,
        expiresAt: phoneVerifications.expiresAt,
        checkAttempts: phoneVerifications.checkAttempts,
      })
      .from(phoneVerifications)
      .where(and(eq(phoneVerifications.userId, userId), eq(phoneVerifications.status, 'pending')))
      .orderBy(desc(phoneVerifications.createdAt))
      .limit(1),
  ]);

  const pendingValida = pendente && pendente.expiresAt.getTime() > Date.now() ? pendente : null;

  return {
    email: { verifiedAt: perfil?.emailVerifiedAt ?? null },
    phone: {
      number: perfil?.phone ?? null,
      verifiedAt: perfil?.phoneVerifiedAt ?? null,
      pending: pendingValida
        ? {
            phone: pendingValida.phone,
            expiresAt: pendingValida.expiresAt,
            attemptsLeft: Math.max(0, MAX_CHECK_ATTEMPTS - pendingValida.checkAttempts),
          }
        : null,
      available: isIntegrationConfigured('phoneVerification'),
    },
    identity: { status: perfil?.identityStatus ?? 'not_started' },
  };
}

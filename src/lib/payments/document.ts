import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';

export const DOCUMENT_IN_OTHER_ACCOUNT =
  'Este CPF/CNPJ já está cadastrado em outra conta da MyPlace. Se ele é seu, entre na conta original ou fale com o suporte.';

/** Outra conta já usa este CPF/CNPJ? (o banco não aceita o mesmo documento em duas contas) */
export async function documentInUseByOther(userId: string, cpfCnpj: string): Promise<boolean> {
  const [outra] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.cpfCnpj, cpfCnpj), ne(profiles.id, userId)))
    .limit(1);
  return Boolean(outra);
}

/**
 * Grava o CPF/CNPJ no perfil de quem paga ou recebe. Documento que já é de
 * outra conta vira uma mensagem clara — não um erro 500 —, e quem chama
 * confere ANTES de falar com o gateway (nada fica criado no Asaas à toa).
 */
export async function saveProfileDocument(
  userId: string,
  cpfCnpj: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (await documentInUseByOther(userId, cpfCnpj)) return { ok: false, message: DOCUMENT_IN_OTHER_ACCOUNT };
  try {
    await db.update(profiles).set({ cpfCnpj }).where(eq(profiles.id, userId));
  } catch (err) {
    // Duas contas gravando o mesmo documento ao mesmo tempo: o índice único decide.
    const causa = err instanceof Error && err.cause ? err.cause : err;
    if ((causa as { code?: string } | null)?.code === '23505') return { ok: false, message: DOCUMENT_IN_OTHER_ACCOUNT };
    throw err;
  }
  return { ok: true };
}

import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, renterBillingProfiles } from '@/db/schema';
import * as asaas from './asaas';
import { saveProfileDocument } from './document';
import { getRenterBillingProfile } from './queries';

/**
 * Garante o cliente do Asaas de quem paga: cria na primeira vez, com o CPF
 * informado, e reaproveita nas seguintes. Sem CPF e sem cliente, devolve
 * `needsCpf` — quem chama pede o documento à pessoa, nunca inventa um.
 */
export async function ensureAsaasCustomer(
  user: { id: string; email: string; fullName: string | null },
  cpfCnpj: string | null,
): Promise<
  | { ok: true; customerId: string }
  | { ok: false; needsCpf: boolean; message: string }
> {
  const existente = await getRenterBillingProfile(user.id);
  if (existente) return { ok: true, customerId: existente.providerCustomerId };
  if (!cpfCnpj) return { ok: false, needsCpf: true, message: 'Informe seu CPF para gerar a cobrança.' };

  const documento = await saveProfileDocument(user.id, cpfCnpj);
  if (!documento.ok) return { ok: false, needsCpf: true, message: documento.message };
  const [perfil] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  let cliente: asaas.AsaasCustomer;
  try {
    cliente = await asaas.createCustomer({
      name: perfil?.fullName ?? user.fullName ?? 'Locatário',
      cpfCnpj,
      email: user.email,
      mobilePhone: perfil?.phone ?? undefined,
      externalReference: user.id,
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[pagamento] Asaas recusou a criação do cliente:', err.status, err.body);
      return { ok: false, needsCpf: false, message: `O Asaas recusou seus dados: ${err.message}` };
    }
    throw err;
  }
  await db
    .insert(renterBillingProfiles)
    .values({ userId: user.id, provider: 'asaas', providerCustomerId: cliente.id })
    .onConflictDoNothing();
  const salvo = await getRenterBillingProfile(user.id);
  return { ok: true, customerId: salvo?.providerCustomerId ?? cliente.id };
}

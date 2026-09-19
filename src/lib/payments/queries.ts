import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ownerPayoutAccounts, renterBillingProfiles, payouts, payments, bookings, spaces } from '@/db/schema';

export async function getOwnerPayoutAccount(ownerId: string) {
  const [row] = await db
    .select()
    .from(ownerPayoutAccounts)
    .where(eq(ownerPayoutAccounts.ownerId, ownerId))
    .limit(1);
  return row ?? null;
}

export async function getRenterBillingProfile(userId: string) {
  const [row] = await db
    .select()
    .from(renterBillingProfiles)
    .where(eq(renterBillingProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Repasses do proprietario — a perna do split que sai pra carteira dele.
 *
 * Diferente de `listOwnerPayments` (a cobranca do locatario), isto e o
 * dinheiro que o PROPRIETARIO realmente recebe. Hoje `status` so alcanca
 * 'pending': nao existe (nem foi confirmado por busca) um evento de webhook
 * dedicado a "o repasse pousou de verdade" — ver o comentario em
 * `src/lib/payments/webhook.ts` (handleReceived). A tela mostra o que o
 * banco tem, nunca inventa um "pago" que ninguem confirmou.
 */
export async function listOwnerPayouts(ownerId: string) {
  return db
    .select({
      id: payouts.id,
      status: sql<string>`${payouts.status}::text`,
      amountCents: payouts.amountCents,
      settledAt: payouts.settledAt,
      createdAt: payouts.createdAt,
      spaceTitle: spaces.title,
      bookingReference: bookings.reference,
    })
    .from(payouts)
    .innerJoin(payments, eq(payments.id, payouts.paymentId))
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(payouts.ownerId, ownerId))
    .orderBy(desc(payouts.createdAt));
}

/** Soma de repasses por status — para o resumo "já recebido" vs. "pendente" do financeiro. */
export async function getOwnerPayoutSummary(ownerId: string) {
  const linhas = await db
    .select({ status: sql<string>`${payouts.status}::text`, total: sql<number>`sum(${payouts.amountCents})::int` })
    .from(payouts)
    .where(eq(payouts.ownerId, ownerId))
    .groupBy(payouts.status);

  const porStatus = new Map(linhas.map((l) => [l.status, l.total]));
  const settledCents = porStatus.get('settled') ?? 0;
  const pendingCents = (porStatus.get('pending') ?? 0) + (porStatus.get('scheduled') ?? 0);
  return { settledCents, pendingCents };
}

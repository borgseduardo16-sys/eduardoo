import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { ownerPayoutAccounts, renterBillingProfiles } from '@/db/schema';

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

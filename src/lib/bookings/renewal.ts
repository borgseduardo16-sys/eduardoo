import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { todayInSaoPaulo } from '@/lib/dates';
import { computeRenewal, type RenewalCharge } from './renewal-state';

export type RenewalInfo = ReturnType<typeof computeRenewal> & {
  role: 'renter' | 'owner';
  /** Parte do proprietário por mês (já sem a taxa) — é o que ele vê. */
  ownerPayoutCents: number;
  /** Mais recentes primeiro, até 12. O link de pagamento só vai para o locatário. */
  history: RenewalCharge[];
};

/**
 * Renovação mensal de uma reserva (Fase 23), para a página da reserva.
 *
 * Autorização aqui mesmo (DAL): só o locatário ou o proprietário daquela
 * reserva recebem algo; qualquer outra pessoa recebe null, igual a "não
 * existe". O link de pagamento das cobranças é do locatário — para o
 * proprietário ele vem sempre vazio.
 */
export async function getRenewalInfo(bookingId: string, userId: string): Promise<RenewalInfo | null> {
  const [b] = (await db.execute(sql`
    SELECT b.id, b.status::text AS status, b.renter_id, b.owner_id, b.owner_payout_cents,
      s.id AS sub_id, s.status::text AS sub_status, s.next_due_date::text AS next_due_date, s.amount_cents AS sub_amount
    FROM bookings b
    LEFT JOIN LATERAL (
      SELECT * FROM subscriptions s WHERE s.booking_id = b.id ORDER BY s.created_at DESC LIMIT 1
    ) s ON true
    WHERE b.id = ${bookingId} AND (b.renter_id = ${userId} OR b.owner_id = ${userId})
  `)) as unknown as {
    id: string; status: string; renter_id: string; owner_id: string; owner_payout_cents: number;
    sub_id: string | null; sub_status: string | null; next_due_date: string | null; sub_amount: number | null;
  }[];
  if (!b || !b.sub_id) return null;

  const role = b.renter_id === userId ? 'renter' : 'owner';
  const linhas = (await db.execute(sql`
    SELECT id, due_date::text AS due_date, amount_cents, status::text AS status, paid_at, invoice_url
    FROM payments
    WHERE booking_id = ${b.id} AND subscription_id IS NOT NULL
    ORDER BY due_date DESC, created_at DESC
    LIMIT 24
  `)) as unknown as { id: string; due_date: string; amount_cents: number; status: string; paid_at: Date | string | null; invoice_url: string | null }[];

  const charges: RenewalCharge[] = linhas.map((l) => ({
    id: l.id,
    dueDate: l.due_date,
    amountCents: l.amount_cents,
    status: l.status,
    paidAt: l.paid_at ? new Date(l.paid_at).toISOString() : null,
    invoiceUrl: role === 'renter' ? l.invoice_url : null,
  }));

  const resultado = computeRenewal(
    {
      bookingStatus: b.status,
      subscriptionStatus: b.sub_status,
      subscriptionNextDueDate: b.next_due_date,
      subscriptionAmountCents: b.sub_amount,
      charges,
    },
    todayInSaoPaulo(),
  );

  return {
    ...resultado,
    role,
    ownerPayoutCents: b.owner_payout_cents,
    history: charges.slice(0, 12),
  };
}

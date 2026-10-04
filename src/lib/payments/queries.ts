import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ownerPayoutAccounts, renterBillingProfiles, payouts, payments, bookingDeposits, bookings, spaces } from '@/db/schema';

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

/**
 * Cauções (proteção contra dano) dos aluguéis do proprietário (Fase 20).
 *
 * O repasse do valor retido em disputa ainda não é automático (mesmo motivo
 * de `listOwnerPayouts`: nenhuma transferência conta-a-conta confirmada no
 * Asaas) — por isso a tela mostra "retido, repasse pendente" em vez de somar
 * esse valor ao `getOwnerPayoutSummary`, que é só o que já pousou de fato.
 */
export async function listOwnerDeposits(ownerId: string) {
  return db
    .select({
      id: bookingDeposits.id,
      status: sql<string>`${bookingDeposits.status}::text`,
      releaseStatus: sql<string>`${bookingDeposits.releaseStatus}::text`,
      amountCents: bookingDeposits.amountCents,
      releasedCents: bookingDeposits.releasedCents,
      forfeitedCents: bookingDeposits.forfeitedCents,
      paidAt: bookingDeposits.paidAt,
      releasedAt: bookingDeposits.releasedAt,
      createdAt: bookingDeposits.createdAt,
      spaceTitle: spaces.title,
      bookingReference: bookings.reference,
    })
    .from(bookingDeposits)
    .innerJoin(bookings, eq(bookings.id, bookingDeposits.bookingId))
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(eq(bookings.ownerId, ownerId))
    .orderBy(desc(bookingDeposits.createdAt));
}


/** A cobrança em aberto de uma locação (a mesma que o "Pagar" paga). */
export async function getOpenCharge(bookingId: string) {
  const [cobranca] = await db
    .select({
      id: payments.id,
      method: sql<string>`${payments.method}::text`,
      amountCents: payments.amountCents,
      pixPayload: payments.pixPayload,
      pixQrImage: payments.pixQrImage,
      invoiceUrl: payments.invoiceUrl,
      payerStartedAt: payments.payerStartedAt,
      failureReason: payments.failureReason,
    })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['pending', 'overdue'])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return cobranca ?? null;
}

export type OpenCharge = NonNullable<Awaited<ReturnType<typeof getOpenCharge>>>;

export type PaymentIssue = {
  bookingId: string;
  spaceTitle: string;
  startedAt: Date;
  deadlineAt: Date;
};

/**
 * Locações de quem aluga com pagamento pendente AGORA — para o aviso ao abrir o
 * app e o ponto no menu "Meus aluguéis". Só o que ainda está dentro da janela de
 * 2 horas: prazo vencido já não é "pendente", é encerramento (a varredura do
 * banco cuida disso). Sem escrita: roda em toda página.
 */
export async function listRenterPaymentIssues(renterId: string): Promise<PaymentIssue[]> {
  const linhas = await db
    .select({
      bookingId: bookings.id,
      spaceTitle: spaces.title,
      startedAt: bookings.paymentIssueStartedAt,
      deadlineAt: bookings.paymentIssueDeadlineAt,
    })
    .from(bookings)
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(and(
      eq(bookings.renterId, renterId),
      eq(bookings.status, 'past_due'),
      sql`${bookings.paymentIssueDeadlineAt} > now()`,
    ))
    .orderBy(asc(bookings.paymentIssueDeadlineAt));
  return linhas.flatMap((l) =>
    l.startedAt && l.deadlineAt
      ? [{ bookingId: l.bookingId, spaceTitle: l.spaceTitle, startedAt: l.startedAt, deadlineAt: l.deadlineAt }]
      : [],
  );
}

export type OwnerStatementRow = {
  bookingId: string;
  reference: string;
  status: string;
  startDate: string;
  spaceTitle: string;
  renterName: string | null;
  /** Aluguel mensal combinado e a taxa de serviço, congelados na locação. */
  monthlyRentCents: number;
  ownerFeeCents: number;
  ownerFeeBps: number;
  /** O que o proprietário recebe por mês — o número que importa. */
  ownerPayoutCents: number;
  /** Acumulado das mensalidades já confirmadas, líquido (soma dos repasses que não falharam). */
  receivedCents: number;
  /** Quantas mensalidades isso representa. */
  months: number;
};

/**
 * Extrato do proprietário por locação: o valor LÍQUIDO por mês em primeiro
 * lugar e, ao lado, o total já recebido. Só entram locações aceitas em diante
 * (o que ainda é pedido não tem valor a receber). Leitura direta do banco,
 * filtrada pelo dono no WHERE; os repasses vêm da tabela `payouts`, uma linha por
 * mensalidade confirmada.
 */
export async function listOwnerStatement(ownerId: string): Promise<OwnerStatementRow[]> {
  const linhas = (await db.execute(sql`
    SELECT b.id AS booking_id, b.reference, b.status::text AS status, b.start_date::text AS start_date,
           s.title AS space_title, p.public_name AS renter_name,
           b.monthly_rent_cents, b.owner_fee_cents, b.owner_fee_bps, b.owner_payout_cents,
           COALESCE(sum(po.amount_cents) FILTER (WHERE po.status NOT IN ('failed', 'reversed')), 0)::bigint AS received_cents,
           count(po.id) FILTER (WHERE po.status NOT IN ('failed', 'reversed'))::int AS months
      FROM bookings b
      JOIN spaces s ON s.id = b.space_id
      JOIN profiles p ON p.id = b.renter_id
      LEFT JOIN payments pm ON pm.booking_id = b.id
      LEFT JOIN payouts po ON po.payment_id = pm.id
     WHERE b.owner_id = ${ownerId}
       AND b.status IN ('approved', 'awaiting_payment', 'active', 'past_due', 'ended')
     GROUP BY b.id, s.title, p.public_name
     ORDER BY (b.status IN ('active', 'past_due')) DESC, b.activated_at DESC NULLS LAST, b.requested_at DESC
  `)) as unknown as {
    booking_id: string; reference: string; status: string; start_date: string; space_title: string; renter_name: string | null;
    monthly_rent_cents: number; owner_fee_cents: number; owner_fee_bps: number; owner_payout_cents: number;
    received_cents: string | number; months: number;
  }[];
  return linhas.map((l) => ({
    bookingId: l.booking_id,
    reference: l.reference,
    status: l.status,
    startDate: l.start_date,
    spaceTitle: l.space_title,
    renterName: l.renter_name,
    monthlyRentCents: l.monthly_rent_cents,
    ownerFeeCents: l.owner_fee_cents,
    ownerFeeBps: l.owner_fee_bps,
    ownerPayoutCents: l.owner_payout_cents,
    receivedCents: Number(l.received_cents),
    months: l.months,
  }));
}

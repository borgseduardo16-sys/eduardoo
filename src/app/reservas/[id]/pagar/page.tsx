import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/dal';
import { getRenterBooking } from '@/lib/bookings/queries';
import { getOwnerPayoutAccount } from '@/lib/payments/queries';
import { formatBRL } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { CheckoutForm } from '@/components/payments/checkout-form';

export const metadata: Metadata = { title: 'Pagamento' };
export const dynamic = 'force-dynamic';

export default async function PagarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reservas/${id}/pagar`);

  const booking = await getRenterBooking(id, user.id);
  if (!booking) notFound();

  if (booking.status !== 'approved') {
    redirect('/reservas');
  }

  const contaDoDono = await getOwnerPayoutAccount(booking.ownerId);
  const [perfil] = await db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, user.id)).limit(1);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-lg px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Confirmar pagamento</h1>
          <p className="text-[var(--content-muted)]">{booking.spaceTitle}</p>
        </header>

        <div className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3 bg-[var(--surface-sunken)]">
          <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">Resumo</p>
          <dl className="space-y-2 text-[0.9375rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--content-muted)]">Aluguel mensal</dt>
              <dd className="tabular-nums">{formatBRL(booking.monthlyRentCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--content-muted)]">Taxa da plataforma</dt>
              <dd className="tabular-nums">{formatBRL(booking.renterFeeCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-2 border-t font-semibold">
              <dt>Total, cobrado todo mês</dt>
              <dd className="tabular-nums">{formatBRL(booking.totalChargedCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--content-muted)]">A partir de</dt>
              <dd>{formatBookingDate(booking.startDate)}</dd>
            </div>
          </dl>
        </div>

        {!contaDoDono?.canReceive ? (
          <Alert tone="critical" title="Ainda não é possível pagar">
            O proprietário deste espaço ainda não configurou o recebimento. Tente novamente mais
            tarde, ou entre em contato pela plataforma.
          </Alert>
        ) : (
          <CheckoutForm bookingId={booking.id} cpfSugerido={perfil?.cpfCnpj} />
        )}

        <p className="text-[0.8125rem] text-[var(--content-subtle)]">
          <Link href="/reservas" className="underline underline-offset-4">Voltar para Minhas reservas</Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { CircleCheck, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getRenterBooking } from '@/lib/bookings/queries';
import { getOwnerPayoutAccount } from '@/lib/payments/queries';
import { formatBRL } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { endReasonLabel, formatRentalDuration, formatRentalPeriod, unitLine } from '@/lib/rentals/format';
import { brTime } from '@/lib/rentals/time';
import { unitNounFor } from '@/lib/spaces/types';
import { sweepExpiredRentals } from '@/lib/rentals/maintenance';
import { getOpenCharge } from '@/lib/rentals/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { CheckoutForm } from '@/components/payments/checkout-form';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { AutoRefresh, Countdown } from '@/components/rentals/live';
import { PixCharge } from '@/components/rentals/pix-charge';
import { PaymentMethodButtons } from '@/components/rentals/payment-method-buttons';

export const metadata: Metadata = { title: 'Pagamento' };
export const dynamic = 'force-dynamic';

/**
 * Pagamento de uma reserva (Parte 12):
 *   - mensal aceito → escolher cartão (automático) ou Pix e criar a assinatura;
 *   - aguardando pagamento → Pix na própria tela (QR do Asaas) ou cartão na
 *     fatura do Asaas, sobre a MESMA cobrança; o prazo para pagar corre pelo
 *     relógio do banco;
 *   - confirmado → só quando o webhook do Asaas confirmou. Voltar da página
 *     do banco não confirma nada: esta tela pergunta de novo ao servidor.
 */
export default async function PagarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reservas/${id}/pagar`);

  // Prazo de pagamento vencido é encerrado pelo banco antes de mostrar.
  await sweepExpiredRentals();

  const booking = await getRenterBooking(id, user.id);
  if (!booking) notFound();

  const agora = new Date();
  const temporario = booking.kind === 'temporary';
  const unidade = unitLine(booking.unitLabel, booking.groupName, booking.spaceGroupCount);
  const periodo = temporario && booking.startsAt && booking.endsAt
    ? formatRentalPeriod(booking.startsAt, booking.endsAt, agora)
    : null;

  if (booking.status === 'approved') {
    const contaDoDono = await getOwnerPayoutAccount(booking.ownerId);
    const [perfil] = await db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    return (
      <Shell title="Confirmar pagamento" subtitle={booking.spaceTitle}>
        <Resumo
          linhas={[
            ...(unidade ? [['Unidade', unidade] as const] : []),
            ['Aluguel mensal', formatBRL(booking.monthlyRentCents)],
            ['Taxa da plataforma', formatBRL(booking.renterFeeCents)],
          ]}
          total={['Total, cobrado todo mês', formatBRL(booking.totalChargedCents)]}
          extra={[['A partir de', formatBookingDate(booking.startDate)]]}
        />
        {!contaDoDono?.canReceive ? (
          <Alert tone="critical" title="Ainda não é possível pagar">
            O proprietário deste espaço ainda não configurou o recebimento. Tente novamente mais
            tarde, ou entre em contato pela plataforma.
          </Alert>
        ) : (
          <CheckoutForm bookingId={booking.id} cpfSugerido={perfil?.cpfCnpj} />
        )}
      </Shell>
    );
  }

  if (booking.status === 'active') {
    return (
      <Shell title="Pagamento confirmado" subtitle={booking.spaceTitle}>
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <CircleCheck className="size-6 shrink-0 text-[var(--color-positive)]" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">
              {temporario ? 'Sua reserva está garantida.' : 'Seu aluguel está ativo.'}
            </p>
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              {[unidade, periodo].filter(Boolean).join(' · ') || 'O pagamento foi confirmado pelo banco.'}
            </p>
          </div>
        </div>
        <Link href={`/reservas/${booking.id}`} className="inline-flex items-center h-11 px-5 rounded-[var(--radius-field)] border font-medium hover:bg-[var(--surface-sunken)]">
          Ver em Meus aluguéis
        </Link>
      </Shell>
    );
  }

  if (booking.status === 'expired' || booking.status === 'cancelled' || booking.status === 'ended') {
    return (
      <Shell title="Reserva encerrada" subtitle={booking.spaceTitle}>
        <Alert tone="info" title={endReasonLabel(booking.endReason) ?? 'Esta reserva não está mais em aberto'}>
          {booking.endReason === 'hold_expired'
            ? 'O pagamento não foi concluído a tempo, e a unidade foi liberada. Nada foi cobrado.'
            : 'Não há nada para pagar nesta reserva.'}
        </Alert>
        <Link href={`/espacos/${booking.spaceSlug}#alugar`} className="inline-flex items-center h-11 px-5 rounded-[var(--radius-field)] border font-medium hover:bg-[var(--surface-sunken)]">
          Fazer uma nova reserva
        </Link>
      </Shell>
    );
  }

  if (booking.status === 'past_due') redirect(`/reservas/${booking.id}/pendente`);
  if (booking.status !== 'awaiting_payment') redirect(`/reservas/${booking.id}`);

  const cobranca = await getOpenCharge(booking.id);

  const prazo = temporario ? booking.holdExpiresAt : null;

  return (
    <Shell
      title={temporario ? 'Pague para garantir a reserva' : 'Pague a primeira mensalidade'}
      subtitle={booking.spaceTitle}
    >
      {/* Pergunta de novo ao servidor a cada 5 s: a confirmação vem do webhook do Asaas. */}
      <AutoRefresh everyMs={5000} />

      <Resumo
        linhas={[
          ...(unidade ? [['Unidade', unidade] as const] : []),
          ...(periodo ? [['Quando', periodo] as const] : []),
          ...(temporario ? [['Duração', formatRentalDuration(booking.durationUnits, booking.durationUnit)] as const] : []),
          ['Aluguel', formatBRL(booking.monthlyRentCents)],
          ['Taxa da plataforma', formatBRL(booking.renterFeeCents)],
        ]}
        total={['Total', formatBRL(booking.totalChargedCents)]}
      />

      {prazo && (
        <p className="flex items-center gap-2 text-[0.9375rem]" data-testid="prazo-pagamento">
          <Clock className="size-4 text-[var(--content-muted)]" aria-hidden />
          <span>
            {(() => {
              const n = unitNounFor(booking.spaceType);
              return `${n.feminino ? 'A' : 'O'} ${n.singular} fica ${n.feminino ? 'segura' : 'seguro'} para você até ${brTime(prazo)}`;
            })()} —{' '}
            <Countdown target={prazo.toISOString()} serverNow={agora.toISOString()} className="font-medium" endedText="prazo encerrado" />
          </span>
        </p>
      )}

      {cobranca?.failureReason && (
        <Alert tone="warning" title="O último pagamento não foi aprovado">
          {cobranca.failureReason} Tente de novo com outro cartão ou pague com Pix.
        </Alert>
      )}

      {!cobranca ? (
        <Alert tone="info" title="Gerando a cobrança">
          A cobrança está sendo criada no gateway. Esta tela atualiza sozinha.
        </Alert>
      ) : cobranca.method === 'pix' && cobranca.pixPayload ? (
        <section aria-labelledby="pix-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4">
          <h2 id="pix-titulo" className="font-semibold">Pagar com Pix</h2>
          <PixCharge payload={cobranca.pixPayload} qrImage={cobranca.pixQrImage} />
          <PaymentMethodButtons bookingId={booking.id} showPix={false} showCard cardLabel="Prefiro pagar com cartão" primary="pix" />
        </section>
      ) : cobranca.method === 'credit_card' && cobranca.invoiceUrl ? (
        <section className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
          <h2 className="font-semibold">Pagar com cartão</h2>
          <p className="text-[0.875rem] text-[var(--content-muted)]">
            O pagamento com cartão (crédito, ou débito quando o seu banco oferece) acontece na página segura do Asaas.
            {cobranca.payerStartedAt ? ' Se você já pagou, aguarde: a confirmação chega em instantes e esta tela atualiza sozinha.' : ''}
          </p>
          <a href={cobranca.invoiceUrl} className="inline-flex w-full items-center justify-center h-13 px-6 rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] font-medium">
            Abrir a página de pagamento
          </a>
          <PaymentMethodButtons bookingId={booking.id} showPix showCard={false} pixLabel="Prefiro pagar com Pix" primary="card" />
        </section>
      ) : (
        <PaymentMethodButtons bookingId={booking.id} showPix showCard />
      )}

      {temporario && (
        <div className="pt-2">
          <CancelBookingButton bookingId={booking.id} status={booking.status} label="Desistir da reserva" />
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-lg px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold leading-tight">{title}</h1>
          <p className="text-[var(--content-muted)]">{subtitle}</p>
        </header>
        {children}
        <p className="text-[0.8125rem] text-[var(--content-subtle)]">
          <Link href="/reservas" className="underline underline-offset-4">Voltar para Meus aluguéis</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}

function Resumo({
  linhas,
  total,
  extra = [],
}: {
  linhas: readonly (readonly [string, string])[];
  total: readonly [string, string];
  extra?: readonly (readonly [string, string])[];
}) {
  return (
    <div className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3 bg-[var(--surface-sunken)]">
      <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">Resumo</p>
      <dl className="space-y-2 text-[0.9375rem]">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-2 border-t font-semibold">
          <dt>{total[0]}</dt>
          <dd className="tabular-nums">{total[1]}</dd>
        </div>
        {extra.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

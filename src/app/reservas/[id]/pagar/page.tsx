import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { CircleCheck, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { isUuid } from '@/lib/profiles/queries';
import { getRenterBooking } from '@/lib/bookings/queries';
import { sweepExpiredBookings } from '@/lib/bookings/maintenance';
import { getOpenCharge, getOwnerPayoutAccount } from '@/lib/payments/queries';
import { formatBRL, formatBps } from '@/lib/money';
import { endReasonLabel, formatDateShort, formatDueDate } from '@/lib/bookings/format';
import { formatDeadline } from '@/lib/bookings/deadlines';
import { brDate } from '@/lib/time';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { CheckoutForm } from '@/components/payments/checkout-form';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { AutoRefresh, Countdown } from '@/components/payments/live';
import { PixCharge } from '@/components/payments/pix-charge';
import { PaymentMethodButtons } from '@/components/payments/payment-method-buttons';

export const metadata: Metadata = { title: 'Pagamento', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Pagamento da locação aceita.
 *
 * O proprietário aceitou; agora o locatário tem 24 horas (prazo gravado pelo
 * banco) para pagar a primeira mensalidade. Não existe retenção do valor antes
 * do aceite: o gateway (Asaas) cobra Pix e cartão na hora, sem pré-autorização,
 * então a ordem é solicitar → aceitar → pagar. Passou das 24 horas sem pagar, a
 * solicitação expira e a vaga volta para o anúncio — nada foi cobrado.
 *
 *   - aceita → escolher cartão (automático) ou Pix e criar a assinatura;
 *   - aguardando pagamento → Pix na própria tela (QR do Asaas) ou cartão na
 *     fatura do Asaas, sobre a MESMA cobrança;
 *   - ativa → só quando o webhook do Asaas confirmou. Voltar da página do
 *     banco não confirma nada: esta tela pergunta de novo ao servidor.
 */
export default async function PagarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reservas/${id}/pagar`);
  if (!isUuid(id)) notFound();

  // Prazo de pagamento vencido é encerrado pelo banco antes de mostrar.
  await sweepExpiredBookings();

  const booking = await getRenterBooking(id, user.id);
  if (!booking) notFound();

  const agora = new Date();
  const hoje = brDate(agora);

  if (booking.status === 'approved') {
    const contaDoDono = await getOwnerPayoutAccount(booking.ownerId);
    const [perfil] = await db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    return (
      <Shell title="Confirmar pagamento" subtitle={booking.spaceTitle}>
        <PrazoParaPagar prazo={booking.firstPaymentDeadlineAt} agora={agora} />
        <Resumo
          linhas={[
            ['Aluguel mensal', formatBRL(booking.monthlyRentCents)],
            [`Taxa de serviço (${formatBps(booking.renterFeeBps)})`, formatBRL(booking.renterFeeCents)],
          ]}
          total={['Total, cobrado todo mês', formatBRL(booking.totalChargedCents)]}
          extra={[
            ['A locação começa em', formatDateShort(booking.startDate)],
            ['Pago agora', 'primeira mensalidade'],
          ]}
        />
        {!contaDoDono?.canReceive ? (
          <Alert tone="critical" title="Ainda não é possível pagar">
            O proprietário deste espaço ainda não configurou o recebimento. Tente novamente mais
            tarde, ou fale com ele pelo chat.
          </Alert>
        ) : (
          <CheckoutForm bookingId={booking.id} cpfSugerido={perfil?.cpfCnpj} />
        )}
        <CancelBookingButton bookingId={booking.id} status={booking.status} label="Desistir da locação" />
      </Shell>
    );
  }

  if (booking.status === 'active') {
    const comecaDepois = booking.startDate > hoje;
    return (
      <Shell title="Pagamento confirmado" subtitle={booking.spaceTitle}>
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <CircleCheck className="size-6 shrink-0 text-[var(--color-positive)]" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">
              {comecaDepois ? `Tudo certo: sua locação começa em ${formatDateShort(booking.startDate)}.` : 'Tudo certo: sua locação está ativa.'}
            </p>
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              O pagamento foi confirmado pelo banco.
              {booking.nextDueDate ? ` Próximo vencimento: ${formatDueDate(booking.nextDueDate)}.` : ''} As instruções de
              acesso do proprietário já estão na página da locação.
            </p>
          </div>
        </div>
        <Link href={`/reservas/${booking.id}`} className={buttonVariants({ className: 'w-fit' })}>
          Ver instruções de acesso
        </Link>
      </Shell>
    );
  }

  if (booking.status === 'expired' || booking.status === 'cancelled' || booking.status === 'ended' || booking.status === 'rejected') {
    const motivo = endReasonLabel(booking.endReason, { status: booking.status, viewer: 'renter' });
    return (
      <Shell title="Esta locação não está mais em aberto" subtitle={booking.spaceTitle}>
        <Alert tone="info" title={motivo ?? 'Não há nada para pagar'}>
          {booking.endReason === 'payment_not_received' && booking.status === 'expired'
            ? 'O prazo de 24 horas para pagar terminou e a vaga voltou para o anúncio. Nada foi cobrado.'
            : 'Não há nada para pagar nesta locação.'}
        </Alert>
        <Link href={`/espacos/${booking.spaceSlug}`} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
          Ver o anúncio
        </Link>
      </Shell>
    );
  }

  if (booking.status === 'past_due') redirect(`/reservas/${booking.id}/pendente`);
  if (booking.status !== 'awaiting_payment') redirect(`/reservas/${booking.id}`);

  const cobranca = await getOpenCharge(booking.id);

  return (
    <Shell title="Pague a primeira mensalidade" subtitle={booking.spaceTitle}>
      {/* Pergunta de novo ao servidor a cada 5 s: a confirmação vem do webhook do Asaas. */}
      <AutoRefresh everyMs={5000} />

      <PrazoParaPagar prazo={booking.firstPaymentDeadlineAt} agora={agora} />

      <Resumo
        linhas={[
          ['Aluguel mensal', formatBRL(booking.monthlyRentCents)],
          [`Taxa de serviço (${formatBps(booking.renterFeeBps)})`, formatBRL(booking.renterFeeCents)],
        ]}
        total={['Total', formatBRL(booking.totalChargedCents)]}
        extra={[['A locação começa em', formatDateShort(booking.startDate)]]}
      />

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

      <CancelBookingButton bookingId={booking.id} status={booking.status} label="Desistir da locação" />
    </Shell>
  );
}

/** "Você tem até hoje às 15:30 para pagar — 3 h 05 min": o prazo é do banco, a contagem pelo relógio do servidor. */
function PrazoParaPagar({ prazo, agora }: { prazo: Date | null; agora: Date }) {
  if (!prazo) return null;
  return (
    <p className="flex items-start gap-2 text-[0.9375rem]" data-testid="prazo-pagamento">
      <Clock className="size-4 mt-1 shrink-0 text-[var(--content-muted)]" aria-hidden />
      <span>
        Você tem até <strong className="font-medium">{formatDeadline(prazo, agora)}</strong> para pagar —{' '}
        <Countdown target={prazo.toISOString()} serverNow={agora.toISOString()} className="font-medium" endedText="prazo encerrado" />.
        {' '}Depois disso a solicitação expira, a vaga volta para o anúncio e nada é cobrado.
      </span>
    </p>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-lg px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold leading-tight">{title}</h1>
          <p className="text-[var(--content-muted)] break-words">{subtitle}</p>
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

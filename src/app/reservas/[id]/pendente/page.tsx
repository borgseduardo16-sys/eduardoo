import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { isUuid } from '@/lib/profiles/queries';
import { getRenterBooking } from '@/lib/bookings/queries';
import { sweepExpiredBookings } from '@/lib/bookings/maintenance';
import { getOpenCharge } from '@/lib/payments/queries';
import { formatBRL } from '@/lib/money';
import { endReasonLabel, formatDueDate } from '@/lib/bookings/format';
import { formatDeadline } from '@/lib/bookings/deadlines';
import { PAYMENT_WINDOW_MINUTES } from '@/lib/bookings/payment-window';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { AutoRefresh, Countdown } from '@/components/payments/live';
import { PixCharge } from '@/components/payments/pix-charge';
import { PaymentMethodButtons } from '@/components/payments/payment-method-buttons';

export const metadata: Metadata = { title: 'Pagamento pendente', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Pagamento pendente. A cobrança do mês não foi concluída (cartão recusado, Pix
 * não pago no vencimento): a locação NÃO é encerrada na hora. A pessoa tem uma
 * janela TOTAL de 2 horas, gravada na própria locação, para regularizar — tentar
 * o cartão de novo ou pagar por Pix. Regularizou, a locação segue normalmente.
 * Passou das 2 horas, quem encerra é o banco, pelo relógio dele, e a vaga volta
 * para o anúncio.
 *
 * "Pagar" paga a MESMA cobrança (Pix na tela ou cartão na página segura do
 * Asaas) — nunca cria outra. Nada aqui confirma pagamento: só o webhook do
 * Asaas muda a locação, e esta tela pergunta de novo ao servidor sozinha.
 */
export default async function PagamentoPendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reservas/${id}/pendente`);
  if (!isUuid(id)) notFound();

  // Prazo vencido é encerrado pelo relógio do banco antes de mostrar.
  await sweepExpiredBookings();
  const b = await getRenterBooking(id, user.id);
  if (!b) notFound();

  const agora = new Date();

  if (b.status === 'active') {
    return (
      <Shell title="Pagamento confirmado" subtitle={b.spaceTitle}>
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <CircleCheck className="size-6 shrink-0 text-[var(--color-positive)]" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Tudo certo: sua locação continua ativa.</p>
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              O pagamento foi confirmado pelo banco
              {b.nextDueDate ? `. Próximo vencimento: ${formatDueDate(b.nextDueDate)}.` : '.'}
            </p>
          </div>
        </div>
        <Link href={`/reservas/${b.id}`} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
          Ver a locação
        </Link>
      </Shell>
    );
  }

  if (b.status === 'ended' || b.status === 'cancelled' || b.status === 'expired' || b.status === 'rejected') {
    return (
      <Shell title="Locação encerrada" subtitle={b.spaceTitle}>
        <Alert tone="info" title={endReasonLabel(b.endReason, { status: b.status, viewer: 'renter' }) ?? 'Esta locação não está mais ativa'}>
          {b.endReason === 'payment_not_received' && b.status === 'ended'
            ? `O prazo de ${PAYMENT_WINDOW_MINUTES / 60} horas para regularizar terminou. A locação foi encerrada, a cobrança automática foi interrompida e a vaga voltou para o anúncio.`
            : 'Não há pagamento pendente nesta locação. A cobrança automática foi interrompida.'}
        </Alert>
        <Link href={`/reservas/${b.id}`} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
          Ver o histórico da locação
        </Link>
      </Shell>
    );
  }

  if (b.status !== 'past_due' || !b.paymentIssueDeadlineAt) {
    redirect(`/reservas/${b.id}`);
  }

  const prazo = b.paymentIssueDeadlineAt;
  const cobranca = await getOpenCharge(b.id);
  // Cartão = cobrança automática; Pix mensal é pago a cada mês pela própria pessoa.
  const automatico = b.subscriptionMethod === 'credit_card';

  return (
    <Shell title="Pagamento pendente" subtitle={b.spaceTitle}>
      {/* Pergunta de novo ao servidor: a confirmação vem do webhook do Asaas. */}
      <AutoRefresh everyMs={8000} />

      <p className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed" data-testid="texto-pendente">
        <CircleAlert className="size-5 shrink-0 mt-0.5 text-[var(--color-critical)]" aria-hidden />
        <span>
          {automatico
            ? 'Não conseguimos concluir a cobrança automática deste mês. Regularize o pagamento para continuar usando este espaço.'
            : 'Não identificamos o pagamento da mensalidade deste mês. Regularize o pagamento para continuar usando este espaço.'}
        </span>
      </p>

      {/* Tempo restante — relógio do servidor, nunca o do aparelho. A janela é uma só, de 2 horas. */}
      <section
        aria-labelledby="prazo-titulo"
        className="rounded-[var(--radius-card)] border border-[var(--color-critical)] p-4 sm:p-5 space-y-2"
        data-testid="prazo-pendente"
      >
        <h2 id="prazo-titulo" className="flex items-center gap-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
          <Clock className="size-4" aria-hidden />
          Tempo restante
        </h2>
        <p className="text-[1.75rem] font-semibold leading-none">
          <Countdown target={prazo.toISOString()} serverNow={agora.toISOString()} endedText="prazo encerrado" />
        </p>
        <p className="text-[0.875rem] text-[var(--content-muted)]">
          Regularize até {formatDeadline(prazo, agora)}. É um prazo único de {PAYMENT_WINDOW_MINUTES / 60} horas, contado
          a partir da falha. Sem pagamento até lá, a locação é encerrada, a cobrança automática para e a vaga volta para
          o anúncio.
        </p>
      </section>

      {cobranca && (
        <dl className="rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-4 sm:p-5 space-y-2 text-[0.9375rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Valor em aberto</dt>
            <dd className="font-semibold tabular-nums">{formatBRL(cobranca.amountCents)}</dd>
          </div>
          {cobranca.failureReason && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--content-muted)]">Motivo informado</dt>
              <dd className="text-right">{cobranca.failureReason}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Regularizar: a mesma cobrança, cartão de novo ou Pix na tela. */}
      {!cobranca ? (
        <Alert tone="info" title="Carregando a cobrança">
          A cobrança em aberto ainda não chegou do gateway. Esta tela atualiza sozinha.
        </Alert>
      ) : cobranca.method === 'pix' && cobranca.pixPayload ? (
        <section aria-labelledby="pix-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4">
          <h2 id="pix-titulo" className="font-semibold">Pagar agora com Pix</h2>
          <PixCharge payload={cobranca.pixPayload} qrImage={cobranca.pixQrImage} />
          <PaymentMethodButtons bookingId={b.id} showPix={false} showCard cardLabel="Tentar o cartão de novo" primary="pix" />
        </section>
      ) : (
        <section aria-labelledby="regularizar-titulo" className="space-y-2.5" data-testid="formas-de-pagamento">
          <h2 id="regularizar-titulo" className="text-[0.9375rem] font-semibold">Como você quer regularizar?</h2>
          {cobranca.method === 'credit_card' && cobranca.payerStartedAt && (
            <p className="text-[0.875rem] text-[var(--content-muted)]" role="status">
              Se você já pagou na página do cartão, aguarde: a confirmação chega em instantes e esta tela atualiza sozinha.
            </p>
          )}
          <PaymentMethodButtons
            bookingId={b.id}
            showPix
            showCard
            pixLabel="Pagar com Pix — aprovação na hora"
            cardLabel="Tentar o cartão de novo"
            primary={automatico ? 'card' : 'pix'}
          />
        </section>
      )}

      <div className="border-t pt-4 space-y-1">
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Não quer continuar? Encerrar a locação para a cobrança automática na hora e a vaga volta para o anúncio.
        </p>
        <EndBookingButton bookingId={b.id} status={b.status} label="Encerrar locação" />
      </div>
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

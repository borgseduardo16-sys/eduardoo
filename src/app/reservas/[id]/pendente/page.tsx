import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { isUuid } from '@/lib/profiles/queries';
import { getRenterBooking } from '@/lib/bookings/queries';
import { formatBRL } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import { sweepExpiredRentals } from '@/lib/rentals/maintenance';
import { getOpenCharge } from '@/lib/rentals/queries';
import { PAYMENT_SECOND_WINDOW_MINUTES, paymentWindowState } from '@/lib/rentals/pricing';
import { endReasonLabel, unitLine } from '@/lib/rentals/format';
import { brTime } from '@/lib/rentals/time';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { AutoRefresh, Countdown } from '@/components/rentals/live';
import { PixCharge } from '@/components/rentals/pix-charge';
import { PaymentMethodButtons, PayNowChooser } from '@/components/rentals/payment-method-buttons';

export const metadata: Metadata = { title: 'Pagamento pendente', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Pagamento pendente (Parte 12). A cobrança automática do aluguel mensal
 * não foi concluída: o aluguel NÃO é cancelado na hora. São 40 minutos e,
 * depois, mais 1 hora; o prazo está gravado na reserva e quem encerra no
 * fim é o banco, pelo relógio dele.
 *
 * "Pagar agora" paga a MESMA cobrança (Pix na tela ou cartão na página
 * segura do Asaas) — nunca cria outra. "Cancelar aluguel" encerra na hora:
 * a recorrência para no gateway e a unidade é liberada. Nada aqui confirma
 * pagamento: só o webhook do Asaas muda a reserva, e esta tela pergunta de
 * novo ao servidor sozinha.
 */
export default async function PagamentoPendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/reservas/${id}/pendente`);
  if (!isUuid(id)) notFound();

  // Prazo vencido é encerrado pelo relógio do banco antes de mostrar.
  await sweepExpiredRentals();
  const b = await getRenterBooking(id, user.id);
  if (!b) notFound();

  const agora = new Date();
  const unidade = unitLine(b.unitLabel, b.groupName, b.spaceGroupCount);
  const subtitulo = [b.spaceTitle, unidade].filter(Boolean).join(' · ');

  if (b.status === 'active') {
    return (
      <Shell title="Pagamento confirmado" subtitle={subtitulo}>
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border p-4 sm:p-5">
          <CircleCheck className="size-6 shrink-0 text-[var(--color-positive)]" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Tudo certo: seu aluguel continua ativo.</p>
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              O pagamento foi confirmado pelo banco
              {b.nextDueDate ? `. Próxima cobrança: ${formatBookingDate(b.nextDueDate)}.` : '.'}
            </p>
          </div>
        </div>
        <Link href={`/reservas/${b.id}`} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
          Ver aluguel
        </Link>
      </Shell>
    );
  }

  if (b.status === 'ended' || b.status === 'cancelled' || b.status === 'expired') {
    return (
      <Shell title="Aluguel encerrado" subtitle={subtitulo}>
        <Alert tone="info" title={endReasonLabel(b.endReason) ?? 'Este aluguel não está mais ativo'}>
          {b.endReason === 'payment_not_received'
            ? 'O prazo para regularizar terminou. O aluguel foi encerrado, a cobrança automática foi interrompida e a unidade foi liberada.'
            : 'Não há pagamento pendente neste aluguel. A cobrança automática foi interrompida.'}
        </Alert>
        <Link href={`/reservas/${b.id}`} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>
          Ver histórico do aluguel
        </Link>
      </Shell>
    );
  }

  if (b.status !== 'past_due' || !b.paymentIssueStartedAt || !b.paymentIssueDeadlineAt) {
    redirect(`/reservas/${b.id}`);
  }

  const janela = paymentWindowState(b.paymentIssueStartedAt, b.paymentIssueDeadlineAt, agora);
  const cobranca = await getOpenCharge(b.id);
  // Cartão = cobrança automática; Pix mensal é pago a cada mês pela própria pessoa.
  const automatico = b.subscriptionMethod === 'credit_card';

  return (
    <Shell title="Pagamento pendente" subtitle={subtitulo}>
      {/* Pergunta de novo ao servidor: a confirmação vem do webhook do Asaas. */}
      <AutoRefresh everyMs={8000} />

      <p className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed" data-testid="texto-pendente">
        <CircleAlert className="size-5 shrink-0 mt-0.5 text-[var(--color-critical)]" aria-hidden />
        <span>
          {automatico
            ? 'Não conseguimos concluir a cobrança automática do seu aluguel. Regularize o pagamento para continuar utilizando este espaço.'
            : 'Não identificamos o pagamento da mensalidade do seu aluguel. Regularize o pagamento para continuar utilizando este espaço.'}
        </span>
      </p>

      {/* Tempo restante — relógio do servidor, nunca o do aparelho. */}
      <section
        aria-labelledby="prazo-titulo"
        className="rounded-[var(--radius-card)] border border-[var(--color-critical)] p-4 sm:p-5 space-y-2"
        data-testid="prazo-pendente"
      >
        <h2 id="prazo-titulo" className="flex items-center gap-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
          <Clock className="size-4" aria-hidden />
          {janela.phase === 'first' ? 'Tempo restante' : 'Último prazo'}
        </h2>
        <p className="text-[1.75rem] font-semibold leading-none">
          <Countdown target={janela.phaseEndsAt.toISOString()} serverNow={agora.toISOString()} endedText="prazo encerrado" />
        </p>
        <p className="text-[0.875rem] text-[var(--content-muted)]">
          {janela.phase === 'first'
            ? `Regularize até ${brTime(janela.phaseEndsAt)}. Depois disso, ainda há uma tolerância final de ${PAYMENT_SECOND_WINDOW_MINUTES / 60} hora, até ${brTime(janela.deadlineAt)}.`
            : `Até ${brTime(janela.deadlineAt)}. Sem pagamento até lá, o aluguel é encerrado, a cobrança automática para e a unidade é liberada.`}
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

      {/* Pagar agora: a mesma cobrança, Pix na tela ou cartão no Asaas. */}
      {!cobranca ? (
        <Alert tone="info" title="Carregando a cobrança">
          A cobrança em aberto ainda não chegou do gateway. Esta tela atualiza sozinha.
        </Alert>
      ) : cobranca.method === 'pix' && cobranca.pixPayload ? (
        <section aria-labelledby="pix-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4">
          <h2 id="pix-titulo" className="font-semibold">Pagar agora com Pix</h2>
          <PixCharge payload={cobranca.pixPayload} qrImage={cobranca.pixQrImage} />
          <PaymentMethodButtons bookingId={b.id} showPix={false} showCard cardLabel="Prefiro pagar com cartão" primary="pix" />
        </section>
      ) : (
        <div className="space-y-2.5">
          {cobranca.method === 'credit_card' && cobranca.payerStartedAt && (
            <p className="text-[0.875rem] text-[var(--content-muted)]" role="status">
              Se você já pagou na página do cartão, aguarde: a confirmação chega em instantes e esta tela atualiza sozinha.
            </p>
          )}
          <PayNowChooser bookingId={b.id} />
        </div>
      )}

      <div className="border-t pt-4 space-y-1">
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Não quer continuar? Cancelar encerra o aluguel agora: a cobrança automática para e a unidade é liberada.
        </p>
        <EndBookingButton bookingId={b.id} status={b.status} kind={b.kind} label="Cancelar aluguel" />
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

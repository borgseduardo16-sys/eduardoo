import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarX, CalendarX2, CircleAlert, Heart, ImageOff } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listRenterBookings } from '@/lib/bookings/queries';
import { listReviewedBookingIds } from '@/lib/reviews/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { brDate } from '@/lib/time';
import { bookingBadge, endReasonLabel, formatDateShort, formatDueDate } from '@/lib/bookings/format';
import { formatDeadline } from '@/lib/bookings/deadlines';
import {
  paymentStatusLabel,
  PAYMENT_STATUS_INFO,
  depositReleaseStatusLabel,
  DEPOSIT_RELEASE_STATUS_INFO,
} from '@/lib/payments/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { Countdown } from '@/components/payments/live';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Meus aluguéis' };
export const dynamic = 'force-dynamic';

type ReservaRow = Awaited<ReturnType<typeof listRenterBookings>>[number];

type Secao = 'pendente' | 'andamento' | 'inicio' | 'aguardando' | 'historico';

const SECOES: { key: Secao; titulo: string }[] = [
  { key: 'pendente', titulo: 'Pagamento pendente' },
  { key: 'andamento', titulo: 'Em andamento' },
  { key: 'inicio', titulo: 'Aguardando início' },
  { key: 'aguardando', titulo: 'Solicitações' },
  { key: 'historico', titulo: 'Histórico' },
];

/** Em que parte da tela a locação aparece — derivado do status e da data, nunca gravado. */
function secaoDe(r: ReservaRow, hoje: string): Secao {
  if (r.status === 'past_due') return 'pendente';
  if (r.status === 'requested' || r.status === 'approved' || r.status === 'awaiting_payment') return 'aguardando';
  if (r.status === 'active') return r.startDate > hoje ? 'inicio' : 'andamento';
  return 'historico';
}

/**
 * Meus aluguéis. Cada locação mostra o que importa a quem aluga: onde ela
 * está no fluxo (pedido, aceite, pagamento, ativa), a data de início, o
 * próximo vencimento, a situação do pagamento e, no fim, como terminou. O
 * "!" de problema de pagamento aparece só na locação que teve o problema.
 *
 * Todo prazo é do banco: a tela recebe a hora do servidor e os instantes
 * gravados; o relógio do aparelho não decide nada.
 */
export default async function ReservasPage() {
  const user = await requireUser('/reservas');
  const reservas = await listRenterBookings(user.id);
  const agora = new Date();
  const hoje = brDate(agora);

  const [urls, avaliadas] = await Promise.all([
    signImagePaths(reservas.map((r) => r.spaceCoverPath).filter(Boolean) as string[]),
    listReviewedBookingIds(user.id, 'renter_to_space'),
  ]);

  // Uma lista SÓ, ordenada por seção (sort estável) — não um <ul> por seção:
  // se o próprio cancelamento mudasse a locação de lista, o item trocaria de
  // pai no React e perderia o estado ("Cancelado.") antes de aparecer.
  const ordem = new Map(SECOES.map((s, i) => [s.key, i]));
  const ordenadas = reservas
    .map((r) => ({ r, secao: secaoDe(r, hoje) }))
    .sort((a, b) => (ordem.get(a.secao)! - ordem.get(b.secao)!));

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Meus aluguéis</h1>
            <p className="text-[var(--content-muted)]">
              {reservas.length === 0
                ? 'Você ainda não alugou nenhum espaço.'
                : `${reservas.length} ${reservas.length === 1 ? 'locação ou solicitação' : 'locações e solicitações'} no total.`}
            </p>
          </div>
          <Link
            href="/favoritos"
            className="shrink-0 inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <Heart className="size-4" aria-hidden />
            Favoritos
          </Link>
        </header>

        {reservas.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <CalendarX className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Encontre um espaço e peça o aluguel mensal — a solicitação aparece aqui na hora.
            </p>
            <Link href="/espacos" className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
              Explorar espaços
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenadas.map(({ r, secao }, i) => {
              const inicio = i === 0 || ordenadas[i - 1]!.secao !== secao;
              const titulo = SECOES.find((s) => s.key === secao)!.titulo;
              return (
                <div key={r.id}>
                  {inicio && (
                    <h2 className={`text-[0.8125rem] font-medium uppercase tracking-wide pb-3${i > 0 ? ' pt-5' : ''} ${secao === 'pendente' ? 'text-[var(--color-critical)]' : 'text-[var(--content-subtle)]'}`}>
                      {titulo}
                    </h2>
                  )}
                  <AluguelCard
                    r={r}
                    agora={agora}
                    hoje={hoje}
                    coverUrl={r.spaceCoverPath ? (urls.get(r.spaceCoverPath) ?? null) : null}
                    jaAvaliada={avaliadas.has(r.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function AluguelCard({
  r, agora, hoje, coverUrl, jaAvaliada,
}: {
  r: ReservaRow;
  agora: Date;
  hoje: string;
  coverUrl: string | null;
  jaAvaliada: boolean;
}) {
  const s = bookingBadge(r, hoje);
  const serverNow = agora.toISOString();
  const problema = r.status === 'past_due';
  const motivoFim = endReasonLabel(r.endReason, { status: r.status, viewer: 'renter' });

  return (
    <div
      className={`rounded-[var(--radius-card)] border p-4 space-y-3 ${problema ? 'border-[var(--color-critical)]' : ''}`}
      data-testid={problema ? 'aluguel-com-problema' : 'aluguel'}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0 size-16 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <ImageOff className="size-4 text-[var(--content-subtle)]" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-2">
            <div className="min-w-0">
              <Link href={`/espacos/${r.spaceSlug}`} className="font-medium line-clamp-2 break-words hover:underline">
                {problema && (
                  // O "!" fica SÓ na locação com problema de pagamento.
                  <CircleAlert className="inline size-4 mr-1 -mt-0.5 text-[var(--color-critical)]" aria-label="Pagamento pendente" />
                )}
                {r.spaceTitle}
              </Link>
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                {spaceTypeLabel(r.spaceType as SpaceTypeKey)}
                {r.spaceCity && ` · ${[r.spaceDistrict, r.spaceCity].filter(Boolean).join(', ')}`}
              </p>
            </div>
            <Badge tone={s.tone} className="shrink-0">{s.label}</Badge>
          </div>

          <p className="text-[0.8125rem] text-[var(--content-muted)]">
            Código {r.reference} · {r.status === 'requested' ? 'quer começar em' : 'início em'} {formatDateShort(r.startDate)}
          </p>
          <p className="text-[0.9375rem] font-medium tabular-nums">
            {formatBRL(r.totalChargedCents)}
            <span className="font-normal text-[var(--content-muted)]">{r.status === 'requested' ? ' /mês, se aceito' : ' /mês'}</span>
          </p>
        </div>
      </div>

      {/* Pedido aguardando resposta do proprietário: prazo de 24 h. */}
      {r.status === 'requested' && r.responseDeadlineAt && (
        <p className="text-[0.875rem] pt-1 border-t">
          O proprietário responde até {formatDeadline(r.responseDeadlineAt, agora)} —{' '}
          <Countdown target={r.responseDeadlineAt.toISOString()} serverNow={serverNow} className="font-medium" endedText="prazo encerrado" />
        </p>
      )}

      {/* Aceita: falta pagar. O prazo de 24 h corre no banco. */}
      {(r.status === 'approved' || r.status === 'awaiting_payment') && r.firstPaymentDeadlineAt && (
        <p className="text-[0.875rem] pt-1 border-t" data-testid="prazo-pagamento">
          Pague até {formatDeadline(r.firstPaymentDeadlineAt, agora)} para garantir a vaga —{' '}
          <Countdown target={r.firstPaymentDeadlineAt.toISOString()} serverNow={serverNow} className="font-medium" endedText="prazo encerrado" />
        </p>
      )}

      {/* Locação ativa: mensalidade, renovação automática, próximo vencimento. Sem contagem regressiva. */}
      {r.status === 'active' && (
        <div className="text-[0.875rem] pt-1 border-t space-y-1" data-testid="mensal-ativo">
          <p>
            {r.nextDueDate ? <>Próximo vencimento: <span className="font-medium">{formatDueDate(r.nextDueDate)}</span></> : 'Locação ativa'}
          </p>
          <p className="text-[var(--content-muted)]">
            {r.subscriptionStatus === 'active' || r.subscriptionStatus === 'pending_authorization' ? 'Renovação automática ativa' : 'Mensalidade'}
            {r.subscriptionMethod === 'credit_card' ? ' no cartão' : r.subscriptionMethod === 'pix' ? ' (Pix todo mês)' : ''}
            {r.paidCount > 0 ? ` · ${r.paidCount} ${r.paidCount === 1 ? 'mensalidade paga' : 'mensalidades pagas'}` : ''}
          </p>
        </div>
      )}

      {/* Pedido de encerramento feito pelo proprietário: o locatário precisa saber. */}
      {r.pendingEndDate && (r.status === 'active' || r.status === 'past_due') && (
        <p className="flex items-start gap-2 text-[0.875rem] pt-1 border-t" data-testid="pedido-encerramento">
          <CalendarX2 className="size-4 mt-0.5 shrink-0 text-[var(--color-caution)]" aria-hidden />
          <span>O proprietário pediu o encerramento desta locação para <strong>{formatDateShort(r.pendingEndDate)}</strong>.</span>
        </p>
      )}

      {/* Pagamento pendente: janela total de 2 h e caminho para resolver. Claro, sem alarde. */}
      {problema && r.paymentIssueDeadlineAt && (
        <div className="text-[0.875rem] pt-1 border-t space-y-2">
          <p>
            Não conseguimos concluir a cobrança deste mês. Tempo restante:{' '}
            <Countdown target={r.paymentIssueDeadlineAt.toISOString()} serverNow={serverNow} className="font-medium" endedText="prazo encerrado" />
            <span className="text-[var(--content-muted)]"> — até {formatDeadline(r.paymentIssueDeadlineAt, agora)}</span>
          </p>
          <Link href={`/reservas/${r.id}/pendente`} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
            Resolver pagamento
          </Link>
        </div>
      )}

      {['awaiting_payment', 'active', 'past_due', 'ended'].includes(r.status) && r.lastPaymentStatus && (
        <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-[var(--content-muted)]">
          Último pagamento
          {r.lastPaymentAmountCents !== null && ` ${formatBRL(r.lastPaymentAmountCents)}`}
          {r.lastPaymentDueDate && ` · venc. ${formatDateShort(r.lastPaymentDueDate)}`}
          <Badge tone={PAYMENT_STATUS_INFO[r.lastPaymentStatus]?.tone ?? 'neutral'}>
            {paymentStatusLabel(r.lastPaymentStatus)}
          </Badge>
        </p>
      )}

      {r.depositCents != null && r.depositCents > 0 && (
        <div className="text-[0.8125rem] text-[var(--content-muted)] space-y-1 pt-1 border-t">
          {!r.depositChargeStatus && r.status === 'approved' && (
            <p>Esta locação inclui caução de {formatBRL(r.depositCents)}, cobrada junto do primeiro pagamento.</p>
          )}
          {r.depositChargeStatus && !['confirmed', 'received'].includes(r.depositChargeStatus) && (
            <p className="flex flex-wrap items-center gap-1.5">
              Caução {formatBRL(r.depositCents)}
              <Badge tone={PAYMENT_STATUS_INFO[r.depositChargeStatus]?.tone ?? 'neutral'}>
                {paymentStatusLabel(r.depositChargeStatus)}
              </Badge>
              {r.depositInvoiceUrl && (
                <a href={r.depositInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline underline-offset-4">
                  Pagar caução
                </a>
              )}
            </p>
          )}
          {r.depositChargeStatus && ['confirmed', 'received'].includes(r.depositChargeStatus) && r.depositReleaseStatus && (
            <p className="flex flex-wrap items-center gap-1.5">
              Caução {formatBRL(r.depositCents)}
              <Badge tone={DEPOSIT_RELEASE_STATUS_INFO[r.depositReleaseStatus]?.tone ?? 'neutral'}>
                {depositReleaseStatusLabel(r.depositReleaseStatus)}
              </Badge>
              {r.depositReleaseStatus === 'partially_forfeited' && r.depositReleasedCents != null && r.depositForfeitedCents != null && (
                <span>({formatBRL(r.depositReleasedCents)} devolvida, {formatBRL(r.depositForfeitedCents)} retida)</span>
              )}
              {r.depositReleaseStatus === 'forfeited' && r.depositForfeitedCents != null && (
                <span>({formatBRL(r.depositForfeitedCents)})</span>
              )}
            </p>
          )}
        </div>
      )}

      {r.ownerResponse && r.status === 'rejected' && (
        <p className="text-[0.8125rem] text-[var(--content-subtle)]">Motivo do proprietário: {r.ownerResponse}</p>
      )}
      {motivoFim && ['ended', 'expired', 'cancelled'].includes(r.status) && (
        <p className="text-[0.8125rem] text-[var(--content-subtle)]">{motivoFim}.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(r.status === 'approved' || r.status === 'awaiting_payment') && (
          <Link href={`/reservas/${r.id}/pagar`} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
            {r.status === 'approved' ? 'Pagar agora' : 'Pagar'}
          </Link>
        )}
        <Link href={`/reservas/${r.id}`} className={buttonVariants({ size: 'sm', variant: 'secondary', className: 'w-fit' })}>
          Ver detalhes
        </Link>
      </div>

      <CancelBookingButton
        bookingId={r.id}
        status={r.status}
        label={r.status === 'requested' ? 'Cancelar solicitação' : 'Desistir da locação'}
      />
      <EndBookingButton bookingId={r.id} status={r.status} />
      <ReviewPrompt
        bookingId={r.id}
        kind="renter_to_space"
        status={r.status}
        alreadyReviewed={jaAvaliada}
        label="Como foi alugar este espaço?"
      />
    </div>
  );
}

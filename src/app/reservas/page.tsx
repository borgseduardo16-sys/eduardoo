import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarX, CircleAlert, Heart, ImageOff } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listRenterBookings } from '@/lib/bookings/queries';
import { listReviewedBookingIds } from '@/lib/reviews/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import {
  paymentStatusLabel,
  PAYMENT_STATUS_INFO,
  depositReleaseStatusLabel,
  DEPOSIT_RELEASE_STATUS_INFO,
} from '@/lib/payments/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { settingInt } from '@/lib/settings';
import { getGroupRules } from '@/lib/rentals/queries';
import { RENEWAL_WINDOW_MINUTES, paymentWindowState, temporaryDurationOptions, type PricedDurationOption } from '@/lib/rentals/pricing';
import { pricedDurationOptions } from '@/lib/rentals/booking';
import {
  endReasonLabel,
  formatRentalDuration,
  formatRentalPeriod,
  rentalBadge,
  rentalPhaseOf,
  unitLine,
} from '@/lib/rentals/format';
import { brTime } from '@/lib/rentals/time';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { Countdown } from '@/components/rentals/live';
import { RenewForm } from '@/components/rentals/renew-form';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Meus aluguéis' };
export const dynamic = 'force-dynamic';

type ReservaRow = Awaited<ReturnType<typeof listRenterBookings>>[number];

type Secao = 'pendente' | 'andamento' | 'proximos' | 'aguardando' | 'historico';

const SECOES: { key: Secao; titulo: string }[] = [
  { key: 'pendente', titulo: 'Pagamento pendente' },
  { key: 'andamento', titulo: 'Em andamento' },
  { key: 'proximos', titulo: 'Próximos' },
  { key: 'aguardando', titulo: 'Aguardando' },
  { key: 'historico', titulo: 'Histórico' },
];

/** Em que parte da tela o aluguel aparece — derivado do status e do relógio, nunca gravado. */
function secaoDe(r: ReservaRow, agora: Date): Secao {
  if (r.status === 'past_due') return 'pendente';
  if (r.status === 'requested' || r.status === 'approved' || r.status === 'awaiting_payment') return 'aguardando';
  if (r.status === 'active') {
    if (r.kind === 'temporary' && r.startsAt && r.startsAt.getTime() > agora.getTime()) return 'proximos';
    return 'andamento';
  }
  return 'historico';
}

/**
 * Meus aluguéis (Parte 12). A contagem regressiva do aluguel temporário
 * aparece AQUI (e no detalhe do aluguel), não na tela principal. O "!" de
 * problema de pagamento aparece só no aluguel que teve o problema.
 *
 * Todo tempo é do relógio do banco/servidor: a tela recebe a hora do
 * servidor e os instantes gravados; o relógio do aparelho não decide nada.
 */
export default async function ReservasPage() {
  const user = await requireUser('/reservas');
  const reservas = await listRenterBookings(user.id);
  const agora = new Date();

  // Durações para renovar: as regras ATUAIS do grupo de cada aluguel temporário que ainda pode renovar.
  const minCharge = await settingInt('booking.min_rent_cents', 3500);
  const renovaveis = reservas.filter((r) => {
    if (r.kind !== 'temporary' || r.status !== 'active' || !r.renewalAllowed || r.renewalId || !r.endsAt) return false;
    return agora.getTime() < r.endsAt.getTime() + RENEWAL_WINDOW_MINUTES * 60_000;
  });
  const duracoesPorReserva = new Map<string, PricedDurationOption[]>();
  await Promise.all(
    renovaveis.map(async (r) => {
      if (!r.groupId) return;
      const g = await getGroupRules(r.spaceId, r.groupId);
      if (g) duracoesPorReserva.set(r.id, await pricedDurationOptions(temporaryDurationOptions(g.rules, minCharge)));
    }),
  );

  const [urls, avaliadas] = await Promise.all([
    signImagePaths(reservas.map((r) => r.spaceCoverPath).filter(Boolean) as string[]),
    listReviewedBookingIds(user.id, 'renter_to_space'),
  ]);

  // Uma lista SO, ordenada por seção (sort estável) — não um <ul> por seção:
  // se o próprio cancelamento mudasse a reserva de lista, o item trocaria de
  // pai no React e perderia o estado ("Cancelado.") antes de aparecer.
  const ordem = new Map(SECOES.map((s, i) => [s.key, i]));
  const ordenadas = reservas
    .map((r) => ({ r, secao: secaoDe(r, agora) }))
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
                : `${reservas.length} ${reservas.length === 1 ? 'aluguel ou solicitação' : 'aluguéis e solicitações'} no total.`}
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
              Encontre um espaço e reserve por hora ou peça um aluguel mensal — ele aparece aqui na hora.
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
                    coverUrl={r.spaceCoverPath ? (urls.get(r.spaceCoverPath) ?? null) : null}
                    jaAvaliada={avaliadas.has(r.id)}
                    duracoesRenovar={duracoesPorReserva.get(r.id) ?? []}
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
  r, agora, coverUrl, jaAvaliada, duracoesRenovar,
}: {
  r: ReservaRow;
  agora: Date;
  coverUrl: string | null;
  jaAvaliada: boolean;
  duracoesRenovar: PricedDurationOption[];
}) {
  const fase = rentalPhaseOf(r, agora);
  const s = rentalBadge(r.status, fase);
  const temporario = r.kind === 'temporary';
  const unidade = unitLine(r.unitLabel, r.groupName, r.spaceGroupCount);
  const serverNow = agora.toISOString();
  const problema = r.status === 'past_due';

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
                  // O "!" fica SÓ no aluguel com problema de pagamento.
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

          {unidade && <p className="text-[0.8125rem] font-medium">{unidade}</p>}

          {temporario && r.startsAt && r.endsAt ? (
            <>
              <p className="text-[0.875rem]">
                {formatRentalPeriod(r.startsAt, r.endsAt, agora)}
                <span className="text-[var(--content-muted)]"> · {formatRentalDuration(r.durationUnits, r.durationUnit)}</span>
              </p>
              <p className="text-[0.9375rem] font-medium tabular-nums">
                {formatBRL(r.totalChargedCents)}
                <span className="font-normal text-[var(--content-muted)]">{r.status === 'active' || r.status === 'ended' ? ' pagos' : ' no total'}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                Código {r.reference} · a partir de {formatBookingDate(r.startDate)}
              </p>
              <p className="text-[0.9375rem] font-medium tabular-nums">
                {formatBRL(r.totalChargedCents)}
                <span className="font-normal text-[var(--content-muted)]">{r.status === 'requested' ? ' /mês, se aceito' : ' /mês'}</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Contagem regressiva do temporário: só aqui, pelo relógio do servidor. */}
      {temporario && r.status === 'active' && r.startsAt && r.endsAt && r.occupiedUntil && (
        <div className="text-[0.875rem] pt-1 border-t space-y-2" data-testid="contagem-aluguel">
          {fase === 'upcoming' && (
            <p>Começa em <Countdown target={r.startsAt.toISOString()} serverNow={serverNow} className="font-medium" /> ({brTime(r.startsAt)})</p>
          )}
          {fase === 'in_use' && (
            <p>Tempo restante: <Countdown target={r.endsAt.toISOString()} serverNow={serverNow} className="font-medium" /> — termina às {brTime(r.endsAt)}</p>
          )}
          {fase === 'renewal_window' && (
            <p className="text-[var(--color-caution)]">
              O horário terminou. A unidade fica guardada para você por mais{' '}
              <Countdown target={r.occupiedUntil.toISOString()} serverNow={serverNow} className="font-medium" endedText="instantes" />.
            </p>
          )}
          {r.renewalId ? (
            <p className="text-[var(--content-muted)]">
              Renovação feita.{' '}
              <Link href={`/reservas/${r.renewalId}`} className="text-[var(--accent)] underline underline-offset-4">Ver renovação</Link>
            </p>
          ) : r.renewalAllowed && duracoesRenovar.length > 0 && (fase === 'in_use' || fase === 'renewal_window' || fase === 'upcoming') ? (
            <RenewForm bookingId={r.id} durations={duracoesRenovar} idempotencyKey={crypto.randomUUID()} />
          ) : null}
        </div>
      )}

      {/* Aguardando pagamento do temporário: o prazo para pagar corre no servidor. */}
      {temporario && r.status === 'awaiting_payment' && r.holdExpiresAt && (
        <p className="text-[0.875rem] pt-1 border-t">
          Pague até {brTime(r.holdExpiresAt)} para garantir —{' '}
          <Countdown target={r.holdExpiresAt.toISOString()} serverNow={serverNow} className="font-medium" endedText="prazo encerrado" />
        </p>
      )}

      {/* Aluguel mensal ativo: mensalidade, renovação automática, próxima cobrança. Sem contagem regressiva. */}
      {!temporario && r.status === 'active' && (
        <div className="text-[0.875rem] pt-1 border-t space-y-1" data-testid="mensal-ativo">
          <p>
            <span className="tabular-nums">{formatBRL(r.totalChargedCents)}/mês</span>
            {r.subscriptionStatus === 'active' || r.subscriptionStatus === 'pending_authorization'
              ? ' · Renovação automática ativa'
              : ''}
            {r.subscriptionMethod === 'credit_card' ? ' (cartão)' : r.subscriptionMethod === 'pix' ? ' (Pix todo mês)' : ''}
          </p>
          {r.nextDueDate && <p className="text-[var(--content-muted)]">Próxima cobrança: {formatBookingDate(r.nextDueDate)}</p>}
        </div>
      )}

      {/* Pagamento pendente: prazo e caminho para resolver. Claro, sem alarde. */}
      {problema && r.paymentIssueStartedAt && r.paymentIssueDeadlineAt && (() => {
        const janela = paymentWindowState(r.paymentIssueStartedAt, r.paymentIssueDeadlineAt, agora);
        return (
        <div className="text-[0.875rem] pt-1 border-t space-y-2">
          <p>
            Não conseguimos concluir a cobrança deste mês.{' '}
            {janela.phase === 'first' ? 'Tempo restante: ' : 'Último prazo: '}
            <Countdown target={janela.phaseEndsAt.toISOString()} serverNow={serverNow} className="font-medium" endedText="prazo encerrado" />
            <span className="text-[var(--content-muted)]"> — até {brTime(janela.phaseEndsAt)}</span>
          </p>
          <Link href={`/reservas/${r.id}/pendente`} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
            Resolver pagamento
          </Link>
        </div>
        );
      })()}

      {['awaiting_payment', 'active', 'past_due', 'ended'].includes(r.status) && !temporario && r.lastPaymentStatus && (
        <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-[var(--content-muted)]">
          Último pagamento
          {r.lastPaymentAmountCents !== null && ` ${formatBRL(r.lastPaymentAmountCents)}`}
          {r.lastPaymentDueDate && ` · venc. ${formatBookingDate(r.lastPaymentDueDate)}`}
          <Badge tone={PAYMENT_STATUS_INFO[r.lastPaymentStatus]?.tone ?? 'neutral'}>
            {paymentStatusLabel(r.lastPaymentStatus)}
          </Badge>
        </p>
      )}

      {r.depositCents != null && r.depositCents > 0 && (
        <div className="text-[0.8125rem] text-[var(--content-muted)] space-y-1 pt-1 border-t">
          {!r.depositChargeStatus && r.status === 'approved' && (
            <p>Este aluguel inclui caução de {formatBRL(r.depositCents)}, cobrada junto do primeiro pagamento.</p>
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
      {endReasonLabel(r.endReason) && (r.status === 'ended' || r.status === 'expired' || r.status === 'cancelled') && (
        <p className="text-[0.8125rem] text-[var(--content-subtle)]">{endReasonLabel(r.endReason)}.</p>
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
        label={r.status === 'awaiting_payment' ? 'Desistir' : 'Cancelar solicitação'}
      />
      <EndBookingButton bookingId={r.id} status={r.status} kind={r.kind} />
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

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleAlert, ExternalLink, ImageOff, KeyRound, LifeBuoy, MapPin, MessageCircle, Navigation, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getBookingAddressForRenter, getBookingForParticipant, listEndRequests, type BookingDetail } from '@/lib/bookings/queries';
import { sweepExpiredBookings } from '@/lib/bookings/maintenance';
import { findConversation } from '@/lib/messaging/queries';
import { hasReviewedBooking } from '@/lib/reviews/queries';
import { getRatingSummaries } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import { getRenewalInfo } from '@/lib/bookings/renewal';
import { RenewalPanel } from '@/components/bookings/renewal-panel';
import { isUuid } from '@/lib/profiles/queries';
import { displayNameOr } from '@/lib/profiles/format';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { decideOwnerFee, formatBRL, formatBps, ownerNetFor } from '@/lib/money';
import { loadFeePolicy } from '@/lib/bookings/fees';
import { isPremiumFinancial } from '@/lib/premium/queries';
import { addDaysToDate, brDate, formatBrDateTime } from '@/lib/time';
import { bookingBadge, endReasonLabel, formatDateShort, formatDueDate } from '@/lib/bookings/format';
import { formatDeadline } from '@/lib/bookings/deadlines';
import { buildBookingTimeline } from '@/lib/bookings/timeline';
import { PAYMENT_WINDOW_MINUTES } from '@/lib/bookings/payment-window';
import {
  PAYMENT_STATUS_INFO,
  paymentStatusLabel,
  subscriptionStatusLabel,
  DEPOSIT_RELEASE_STATUS_INFO,
  depositReleaseStatusLabel,
} from '@/lib/payments/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PersonTrustCard } from '@/components/profile/person-trust-card';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { EndRequestPanel } from '@/components/bookings/end-request-panel';
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { AudioPlayer } from '@/components/audio/audio-player';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Countdown } from '@/components/payments/live';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Locação', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Papel = BookingDetail['viewerRole'];

/**
 * Página da locação — confirmação logo depois de solicitar e acompanhamento
 * dali em diante, para as DUAS partes.
 *
 * Só quem participa chega aqui: a consulta filtra por locatário/proprietário no
 * próprio WHERE; qualquer outro id dá 404, sem dizer se a locação existe. Os
 * valores vêm congelados da locação (centavos), nunca recalculados na tela.
 *
 * As INSTRUÇÕES DE ACESSO (texto e áudio) e o endereço exato seguem a mesma
 * regra: o proprietário, que as escreveu, vê sempre; o locatário só depois do
 * pagamento confirmado. A regra está nas consultas — esta página só mostra o
 * que elas devolvem.
 */
export default async function ReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enviada?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/reservas/${id}`);
  if (!isUuid(id)) notFound();

  // Prazo vencido é encerrado pelo relógio do banco antes de mostrar.
  await sweepExpiredBookings();
  const b = await getBookingForParticipant(id, user.id);
  if (!b) notFound();
  const agora = new Date();
  const serverNow = agora.toISOString();
  const hoje = brDate(agora);

  const papel = b.viewerRole;
  const outra = papel === 'renter' ? b.owner : b.renter;
  const kindAvaliacao = papel === 'renter' ? 'renter_to_space' : 'owner_to_renter';

  const [urls, endereco, conversa, jaAvaliou, reputacao, respostaDono, renovacao, pedidosEncerramento] = await Promise.all([
    signImagePaths([b.spaceCoverPath, outra.avatarPath].filter(Boolean) as string[]),
    papel === 'renter' ? getBookingAddressForRenter(b.id, user.id) : Promise.resolve(null),
    findConversation(b.spaceId, b.renterId),
    hasReviewedBooking(b.id, user.id, kindAvaliacao),
    // Reputação da OUTRA parte no papel dela nesta locação.
    getRatingSummaries([outra.id], papel === 'renter' ? 'renter_to_space' : 'owner_to_renter'),
    // Como o proprietário responde — só interessa a quem está do lado de quem pede.
    papel === 'renter' ? getOwnerResponseStats(outra.id) : Promise.resolve(null),
    // Renovação mensal (só existe depois do checkout, com assinatura).
    getRenewalInfo(b.id, user.id),
    listEndRequests(b.id),
  ]);

  const pedidoAberto = pedidosEncerramento.find((r) => r.status === 'pending') ?? null;

  // O proprietário que ainda não respondeu vê a taxa de AGORA (é a que o aceite vai gravar, com o Premium
  // dele como estiver); depois do aceite, o valor da locação — que a manutenção ajusta se o Premium acabar ou voltar.
  let taxaDoDonoBps = b.ownerFeeBps;
  let repasseDoDono = { netCents: b.ownerPayoutCents, feeCents: b.ownerFeeCents };
  let taxaReduzidaPeloPremium = false;
  if (papel === 'owner') {
    const politica = await loadFeePolicy();
    taxaReduzidaPeloPremium = b.ownerFeeBps < politica.owner.standardBps;
    if (b.status === 'requested') {
      const decisao = decideOwnerFee(b.monthlyRentCents, await isPremiumFinancial(b.ownerId), politica.owner);
      taxaDoDonoBps = decisao.bps;
      repasseDoDono = ownerNetFor(b.monthlyRentCents, decisao.bps);
      taxaReduzidaPeloPremium = decisao.reduced;
    }
  }
  const mostrarRenovacao = renovacao != null && ['active', 'past_due', 'ended'].includes(b.status);

  const selo = bookingBadge(b, hoje);
  const problema = b.status === 'past_due';
  const capa = b.spaceCoverPath ? (urls.get(b.spaceCoverPath) ?? null) : null;
  const nomeOutra = displayNameOr(outra.publicName);
  const historico = buildBookingTimeline(b, pedidosEncerramento, papel);
  const temInstrucoes = Boolean(b.accessInstructions) || b.hasAccessAudio;
  const sugestaoEncerramento = addDaysToDate(hoje, 30);
  const limiteEncerramento = addDaysToDate(hoje, 365);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <Link
          href={papel === 'renter' ? '/reservas' : '/meus-espacos/solicitacoes'}
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {papel === 'renter' ? 'Meus aluguéis' : 'Solicitações'}
        </Link>

        {sp.enviada === '1' && papel === 'renter' && b.status === 'requested' && (
          <Alert tone="success" title="Solicitação enviada">
            {nomeOutra} recebeu seu pedido e tem 24 horas para responder. Nada é cobrado agora: se aceitar, você terá
            24 horas para pagar. Você recebe uma notificação com a resposta.
          </Alert>
        )}

        {/* Cabeçalho: espaço + status */}
        <header className="flex gap-4">
          <div className="relative shrink-0 size-20 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
            {capa ? (
              <Image src={capa} alt="" fill sizes="80px" className="object-cover" unoptimized />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <ImageOff className="size-5 text-[var(--content-subtle)]" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              {spaceTypeLabel(b.spaceType as SpaceTypeKey)}
            </p>
            <h1 className="text-[1.25rem] sm:text-[1.5rem] font-semibold leading-snug break-words">
              {problema && (
                // O "!" fica só na locação com problema de pagamento.
                <CircleAlert className="inline size-5 mr-1.5 -mt-1 text-[var(--color-critical)]" aria-label="Pagamento pendente" />
              )}
              {b.spaceTitle}
            </h1>
            <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{[b.spaceDistrict, b.spaceCity].filter(Boolean).join(', ')}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge tone={selo.tone} dot>
                {selo.label}
              </Badge>
              <span className="text-[0.8125rem] text-[var(--content-subtle)]">Código {b.reference}</span>
            </div>
          </div>
        </header>

        {/* O locatário é avisado do pedido de encerramento assim que ele existe. */}
        {papel === 'renter' && pedidoAberto && (
          <Alert tone="warning" title={`O proprietário pediu o encerramento para ${formatDateShort(pedidoAberto.endDate)}`}>
            {pedidoAberto.reason ? `Motivo informado: ${pedidoAberto.reason}. ` : ''}
            Até lá a locação segue normalmente. A plataforma não cobra multa por este pedido; qualquer combinado,
            registre pelo chat.
          </Alert>
        )}

        <ProximosPassos b={b} papel={papel} nomeOutra={nomeOutra} agora={agora} hoje={hoje}>
          {/* Pagamento pendente: janela de 2 h correndo no servidor e caminho para resolver. */}
          {problema && b.paymentIssueDeadlineAt && (
            <div className="space-y-2 pt-1" data-testid="prazo-pendente">
              <p className="text-[0.9375rem]">
                Tempo para regularizar:{' '}
                <Countdown target={b.paymentIssueDeadlineAt.toISOString()} serverNow={serverNow} className="font-semibold" endedText="prazo encerrado" />
                <span className="text-[var(--content-muted)]"> — até {formatDeadline(b.paymentIssueDeadlineAt, agora)}</span>
              </p>
              {papel === 'renter' && (
                <Link href={`/reservas/${b.id}/pendente`} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
                  Resolver pagamento
                </Link>
              )}
            </div>
          )}
          {/* Aceita e ainda sem pagamento: o prazo de 24 h corre no banco. */}
          {(b.status === 'approved' || b.status === 'awaiting_payment') && b.firstPaymentDeadlineAt && (
            <p className="text-[0.9375rem]" data-testid="prazo-pagamento">
              Prazo para pagar: {formatDeadline(b.firstPaymentDeadlineAt, agora)} —{' '}
              <Countdown target={b.firstPaymentDeadlineAt.toISOString()} serverNow={serverNow} className="font-semibold" endedText="prazo encerrado" />
            </p>
          )}
          {b.status === 'requested' && b.responseDeadlineAt && (
            <p className="text-[0.9375rem]" data-testid="prazo-resposta">
              Prazo para responder: {formatDeadline(b.responseDeadlineAt, agora)} —{' '}
              <Countdown target={b.responseDeadlineAt.toISOString()} serverNow={serverNow} className="font-semibold" endedText="prazo encerrado" />
            </p>
          )}
        </ProximosPassos>

        {/* Como chegar e usar o espaço — texto, áudio e endereço, só com o pagamento confirmado (ou para quem escreveu). */}
        {(temInstrucoes || (papel === 'renter' && b.accessProvided && ['approved', 'awaiting_payment'].includes(b.status))) && (
          <section
            aria-labelledby="acesso-titulo"
            className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3"
            data-testid="instrucoes-de-acesso"
          >
            <h2 id="acesso-titulo" className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4 text-[var(--accent)]" aria-hidden />
              {papel === 'renter' ? 'Como chegar e usar o espaço' : 'Instruções de acesso que você enviou'}
            </h2>

            {temInstrucoes ? (
              <>
                {b.accessInstructions && (
                  <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line break-words">{b.accessInstructions}</p>
                )}
                {b.hasAccessAudio && (
                  <div className="rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3.5 py-3 text-[var(--content)]">
                    <AudioPlayer
                      src={`/api/reservas/${b.id}/audio`}
                      durationMs={b.accessAudioDurationMs}
                      label="Instruções de acesso em áudio"
                    />
                  </div>
                )}
                {papel === 'renter' && (
                  <p className="text-[0.75rem] text-[var(--content-subtle)]">
                    Visível só para você, porque a locação está confirmada. Dúvidas sobre o acesso: pergunte ao proprietário pelo chat.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
                O proprietário já escreveu as instruções de acesso. Elas aparecem aqui assim que o pagamento for confirmado.
              </p>
            )}
          </section>
        )}

        {/* Endereço exato e rota — só locatário, só com a locação confirmada */}
        {endereco && (
          <section aria-labelledby="endereco-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
            <div className="space-y-1.5">
              <h2 id="endereco-titulo" className="font-semibold">
                Endereço do espaço
              </h2>
              <p className="break-words">
                {[endereco.street, endereco.number].filter(Boolean).join(', ')}
                {endereco.complement ? ` — ${endereco.complement}` : ''}
              </p>
              <p className="text-[0.875rem] text-[var(--content-muted)]">
                {[endereco.district, endereco.city, endereco.state].filter(Boolean).join(', ')}
                {endereco.postalCode ? ` · CEP ${endereco.postalCode}` : ''}
              </p>
            </div>
            {endereco.lat != null && endereco.lng != null && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${endereco.lat},${endereco.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: 'sm' })}
                  data-testid="tracar-rota"
                >
                  <Navigation className="size-4" aria-hidden />
                  Traçar rota
                </a>
                <a
                  href={`https://waze.com/ul?ll=${endereco.lat},${endereco.lng}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: 'sm', variant: 'secondary' })}
                >
                  Abrir no Waze
                </a>
              </div>
            )}
            <p className="text-[0.75rem] text-[var(--content-subtle)]">
              Visível só para você, porque a locação está confirmada. A rota abre no aplicativo de mapas do seu aparelho.
            </p>
          </section>
        )}

        {/* Resumo: datas, valores congelados na locação, pagamento */}
        <section aria-labelledby="resumo-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4">
          <h2 id="resumo-titulo" className="font-semibold">
            Resumo
          </h2>
          <dl className="space-y-2 text-[0.9375rem]">
            <Linha rotulo="Início" valor={formatDateShort(b.startDate)} />
            {['active', 'past_due'].includes(b.status) && b.nextDueDate && (
              <Linha rotulo="Próximo vencimento" valor={formatDueDate(b.nextDueDate)} />
            )}
            {pedidoAberto && (
              <Linha rotulo="Encerramento previsto" valor={formatDateShort(pedidoAberto.endDate)} />
            )}
            <Linha rotulo="Aluguel mensal" valor={formatBRL(b.monthlyRentCents)} />
            {papel === 'renter' ? (
              <>
                <Linha rotulo={`Taxa de serviço (${formatBps(b.renterFeeBps)})`} valor={formatBRL(b.renterFeeCents)} />
                <Linha rotulo="Você paga por mês" valor={formatBRL(b.totalChargedCents)} destaque />
              </>
            ) : (
              <>
                <Linha
                  rotulo={`Taxa de serviço (${formatBps(taxaDoDonoBps)}${taxaReduzidaPeloPremium ? ', reduzida pelo Premium' : ''})`}
                  valor={`− ${formatBRL(repasseDoDono.feeCents)}`}
                />
                <Linha rotulo="Você recebe por mês" valor={formatBRL(repasseDoDono.netCents)} destaque />
              </>
            )}
            {['ended', 'expired', 'cancelled'].includes(b.status) && endReasonLabel(b.endReason, { status: b.status, viewer: papel }) && (
              <Linha rotulo="Como terminou" valor={endReasonLabel(b.endReason, { status: b.status, viewer: papel })!} />
            )}
            {b.depositCents != null && b.depositCents > 0 && (
              <Linha
                rotulo="Caução (devolvida ao fim, sem dano)"
                valor={formatBRL(b.depositCents)}
                extra={
                  b.depositChargeStatus && ['confirmed', 'received'].includes(b.depositChargeStatus) && b.depositReleaseStatus ? (
                    <Badge tone={DEPOSIT_RELEASE_STATUS_INFO[b.depositReleaseStatus]?.tone ?? 'neutral'}>
                      {depositReleaseStatusLabel(b.depositReleaseStatus)}
                    </Badge>
                  ) : b.depositChargeStatus ? (
                    <>
                      <Badge tone={PAYMENT_STATUS_INFO[b.depositChargeStatus]?.tone ?? 'neutral'}>
                        {paymentStatusLabel(b.depositChargeStatus)}
                      </Badge>
                      {papel === 'renter' && b.depositInvoiceUrl && ['pending', 'overdue'].includes(b.depositChargeStatus) && (
                        <a
                          href={b.depositInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[0.8125rem] text-[var(--accent)] underline underline-offset-4"
                        >
                          Pagar caução
                        </a>
                      )}
                    </>
                  ) : null
                }
              />
            )}
          </dl>

          {!mostrarRenovacao && (
            <div className="border-t pt-3 space-y-1.5 text-[0.875rem]">
              <p className="font-medium">Pagamento</p>
              {b.subscriptionStatus || b.lastPaymentStatus ? (
                <>
                  {b.subscriptionStatus && (
                    <p className="text-[var(--content-muted)]">Assinatura: {subscriptionStatusLabel(b.subscriptionStatus)}</p>
                  )}
                  {b.lastPaymentStatus && (
                    <p className="flex flex-wrap items-center gap-1.5 text-[var(--content-muted)]">
                      Última cobrança
                      {b.lastPaymentAmountCents !== null && ` ${formatBRL(b.lastPaymentAmountCents)}`}
                      {b.lastPaymentDueDate && ` · venc. ${formatDateShort(b.lastPaymentDueDate)}`}
                      <Badge tone={PAYMENT_STATUS_INFO[b.lastPaymentStatus]?.tone ?? 'neutral'}>
                        {paymentStatusLabel(b.lastPaymentStatus)}
                      </Badge>
                    </p>
                  )}
                  {/* Pagar sempre pelas telas daqui (Pix ou cartão sobre a MESMA cobrança). */}
                  {papel === 'renter' &&
                    b.lastPaymentStatus &&
                    ['pending', 'overdue'].includes(b.lastPaymentStatus) &&
                    (b.status === 'past_due' || b.status === 'awaiting_payment') && (
                      <Link
                        href={`/reservas/${b.id}/${b.status === 'past_due' ? 'pendente' : 'pagar'}`}
                        className="inline-block text-[var(--accent)] underline underline-offset-4"
                      >
                        {b.status === 'past_due' ? 'Resolver pagamento' : 'Ir para o pagamento'}
                      </Link>
                    )}
                </>
              ) : (
                <p className="text-[var(--content-muted)]">
                  {b.status === 'requested'
                    ? 'Nenhuma cobrança ainda — só depois que o proprietário aceitar.'
                    : b.status === 'approved'
                      ? papel === 'renter'
                        ? 'Aguardando você confirmar o pagamento.'
                        : 'Aguardando o locatário confirmar o pagamento.'
                      : b.status === 'awaiting_payment'
                        ? 'A cobrança está sendo gerada no gateway.'
                        : 'Nenhuma cobrança registrada para esta locação.'}
                </p>
              )}
              {papel === 'owner' && (
                <Link href="/meus-espacos/financeiro" className="inline-block text-[var(--accent)] underline underline-offset-4">
                  Ver recebimentos
                </Link>
              )}
            </div>
          )}
        </section>

        {mostrarRenovacao && renovacao && <RenewalPanel info={renovacao} />}

        {/* Ações da locação — cada componente decide sozinho se aparece pelo status */}
        <section aria-label="Ações da locação" className="space-y-3">
          {papel === 'owner' && (
            <RespondRequestActions
              bookingId={b.id}
              status={b.status}
              deadlineLabel={b.responseDeadlineAt ? formatDeadline(b.responseDeadlineAt, agora) : null}
              acceptBlockedReason={b.status === 'requested' && b.spaceQuantityAvailable <= 0 ? 'Sem vagas livres neste anúncio agora.' : null}
            />
          )}
          {papel === 'renter' && (b.status === 'approved' || b.status === 'awaiting_payment') && (
            <Link href={`/reservas/${b.id}/pagar`} className={buttonVariants({ size: 'lg', block: true })}>
              {b.status === 'approved' ? 'Pagar agora' : 'Ir para o pagamento'}
            </Link>
          )}
          {papel === 'renter' && b.status === 'past_due' && (
            <Link href={`/reservas/${b.id}/pendente`} className={buttonVariants({ size: 'lg', block: true })}>
              Resolver pagamento
            </Link>
          )}
          {papel === 'renter' ? (
            <CancelBookingButton
              bookingId={b.id}
              status={b.status}
              label={b.status === 'requested' ? 'Cancelar solicitação' : 'Desistir da locação'}
            />
          ) : (
            // O proprietário só desfaz o que aceitou e ainda não foi pago (o servidor confere).
            <CancelBookingButton
              bookingId={b.id}
              status={b.status}
              cancellable={['approved']}
              label="Desfazer o aceite"
              confirmText="Desfazer o aceite? A vaga volta para o anúncio e o locatário é avisado."
            />
          )}
          {papel === 'renter' ? (
            <EndBookingButton bookingId={b.id} status={b.status} label="Encerrar locação" />
          ) : (
            <EndRequestPanel
              bookingId={b.id}
              status={b.status}
              pending={pedidoAberto ? { endDate: pedidoAberto.endDate, reason: pedidoAberto.reason } : null}
              today={hoje}
              suggestedDate={sugestaoEncerramento}
              maxDate={limiteEncerramento}
            />
          )}
          <ReviewPrompt
            bookingId={b.id}
            kind={kindAvaliacao}
            status={b.status}
            alreadyReviewed={jaAvaliou}
            label={papel === 'renter' ? 'Como foi alugar este espaço?' : 'Como foi alugar seu espaço para este usuário?'}
            buttonLabel="Avaliar esta locação"
          />
        </section>

        {/* Histórico: só fatos gravados, na ordem em que aconteceram */}
        <section aria-labelledby="historico-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
          <h2 id="historico-titulo" className="font-semibold">Histórico</h2>
          <ol className="space-y-3 text-[0.875rem]" data-testid="historico-locacao">
            {historico.map((e, i) => (
              <li key={`${e.at.toISOString()}-${i}`} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--content-subtle)]" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium">{e.label}</p>
                  <p className="text-[0.8125rem] text-[var(--content-muted)]">
                    {formatBrDateTime(e.at)}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* A outra parte */}
        <section
          aria-labelledby="outra-parte-titulo"
          className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3"
        >
          <h2 id="outra-parte-titulo" className="font-semibold">
            {papel === 'renter' ? 'Proprietário' : 'Locatário'}
          </h2>
          {outra.active ? (
            <PersonTrustCard
              role={papel === 'renter' ? 'owner' : 'renter'}
              compact
              person={{
                ...outra,
                avatarUrl: outra.avatarPath ? (urls.get(outra.avatarPath) ?? null) : null,
              }}
              rating={reputacao.get(outra.id) ?? { average: null, count: 0 }}
              responseStats={respostaDono}
            />
          ) : (
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              Esta conta não está mais ativa na MyPlace. Em caso de dúvida sobre a locação, fale com o suporte.
            </p>
          )}
        </section>

        {/* Acessos rápidos */}
        <nav aria-label="Acessos rápidos" className="grid gap-2 sm:grid-cols-2">
          {papel === 'renter' ? (
            <StartConversationButton spaceId={b.spaceId} />
          ) : conversa ? (
            <Atalho href={`/mensagens/${conversa.id}`} icon={MessageCircle} titulo={`Conversar com ${nomeOutra}`} />
          ) : null}
          <Atalho href={`/espacos/${b.spaceSlug}`} icon={ExternalLink} titulo="Ver anúncio" />
          {outra.active && (
            <Atalho href={`/perfil/${outra.id}`} icon={UserRound} titulo={`Ver perfil de ${nomeOutra}`} />
          )}
          <Atalho href="/suporte" icon={LifeBuoy} titulo="Falar com o suporte" />
        </nav>

        {/* Relatar problema — a denúncia fica amarrada a esta locação */}
        {outra.active && ['approved', 'awaiting_payment', 'active', 'past_due', 'ended'].includes(b.status) && (
          <div className="flex justify-center pt-2">
            <ReportDialog
              targetType="user"
              targetId={outra.id}
              bookingId={b.id}
              targetLabel="um problema nesta locação"
              triggerLabel="Relatar problema nesta locação"
            />
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function Linha({
  rotulo,
  valor,
  destaque = false,
  extra,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--content-muted)]">{rotulo}</dt>
      <dd className={`tabular-nums text-right flex flex-wrap items-center justify-end gap-1.5 ${destaque ? 'font-semibold' : ''}`}>
        {valor}
        {extra}
      </dd>
    </div>
  );
}

function Atalho({
  href,
  icon: Icon,
  titulo,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--radius-card)] border p-3.5 text-[0.9375rem] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
    >
      <Icon className="size-4 shrink-0 text-[var(--accent)]" aria-hidden />
      <span className="min-w-0 truncate">{titulo}</span>
    </Link>
  );
}

/** O que acontece agora — em linguagem de gente, pelo status e pelo lado de quem lê. */
function ProximosPassos({
  b,
  papel,
  nomeOutra,
  agora,
  hoje,
  children,
}: {
  b: BookingDetail;
  papel: Papel;
  nomeOutra: string;
  agora: Date;
  hoje: string;
  children?: React.ReactNode;
}) {
  const t = textoDosPassos(b, nomeOutra, agora, hoje);
  if (!t) return null;

  return (
    <section
      aria-labelledby="passos-titulo"
      className={`rounded-[var(--radius-card)] p-4 sm:p-5 space-y-1.5 ${b.status === 'past_due' ? 'border border-[var(--color-critical)]' : 'bg-[var(--surface-sunken)]'}`}
    >
      <h2 id="passos-titulo" className="font-semibold">
        {b.status === 'past_due' ? 'Pagamento pendente' : ['rejected', 'expired', 'cancelled', 'ended'].includes(b.status) ? 'Situação' : 'Próximos passos'}
      </h2>
      <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">{t[papel]}</p>
      {children}
      {b.ownerResponse && b.status !== 'requested' && b.status !== 'rejected' && papel === 'renter' && (
        <p className="text-[0.875rem] text-[var(--content-muted)] whitespace-pre-line break-words">
          Mensagem do proprietário: “{b.ownerResponse}”
        </p>
      )}
      {b.status === 'rejected' && b.ownerResponse && (
        <p className="text-[0.875rem] text-[var(--content-subtle)]">Motivo informado: {b.ownerResponse}</p>
      )}
      {b.status === 'requested' && b.renterMessage && papel === 'owner' && (
        <p className="text-[0.875rem] text-[var(--content-muted)] whitespace-pre-line break-words">“{b.renterMessage}”</p>
      )}
      {['rejected', 'expired'].includes(b.status) && papel === 'renter' && (
        <Link href="/espacos" className="inline-block pt-1 text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
          Procurar outros espaços
        </Link>
      )}
    </section>
  );
}

type Textos = { renter: string; owner: string };

function textoDosPassos(b: BookingDetail, nomeOutra: string, agora: Date, hoje: string): Textos | null {
  const prazoResposta = b.responseDeadlineAt ? formatDeadline(b.responseDeadlineAt, agora) : null;
  const prazoPagamento = b.firstPaymentDeadlineAt ? formatDeadline(b.firstPaymentDeadlineAt, agora) : null;

  switch (b.status) {
    case 'requested':
      return {
        renter: `${nomeOutra} tem ${prazoResposta ? `até ${prazoResposta}` : '24 horas'} para aceitar ou recusar. Enquanto isso, você pode tirar dúvidas pelo chat. Nada é cobrado agora; se não houver resposta, a solicitação expira sozinha.`,
        owner: `Veja quem pediu e aceite ou recuse${prazoResposta ? ` até ${prazoResposta}` : ' em até 24 horas'}. Ao aceitar, você explica como a pessoa encontra e usa o espaço (texto ou áudio); ela só vê isso depois de pagar.`,
      };
    case 'approved':
    case 'awaiting_payment':
      return {
        renter: `Solicitação aceita! Pague${prazoPagamento ? ` até ${prazoPagamento}` : ' dentro de 24 horas'} para garantir a vaga. As instruções de acesso e o endereço exato aparecem aqui assim que o pagamento for confirmado.`,
        owner: `Você aceitou. ${nomeOutra} tem ${prazoPagamento ? `até ${prazoPagamento}` : '24 horas'} para pagar; sem pagamento, a solicitação expira e a vaga volta para o anúncio.`,
      };
    case 'active':
      if (b.startDate > hoje) {
        return {
          renter: `Pagamento confirmado. Sua locação começa em ${formatDateShort(b.startDate)}. As instruções de acesso já estão aqui embaixo.`,
          owner: `Pagamento confirmado. A locação começa em ${formatDateShort(b.startDate)}; a vaga já está reservada.`,
        };
      }
      return {
        renter: 'Locação ativa. A mensalidade é cobrada todo mês na mesma data, até você ou o proprietário encerrar — não há data de término. Qualquer combinado, registre pelo chat da plataforma.',
        owner: 'Locação ativa. A mensalidade é cobrada todo mês e o repasse acontece a cada pagamento confirmado. Se precisar do espaço de volta, use "Solicitar encerramento da locação".',
      };
    case 'past_due':
      return {
        renter: 'Não conseguimos concluir a cobrança deste mês. Regularize o pagamento dentro do prazo para continuar usando este espaço.',
        owner: `A cobrança deste mês não foi concluída. ${nomeOutra} tem ${b.paymentIssueDeadlineAt ? `até ${formatDeadline(b.paymentIssueDeadlineAt, agora)}` : `${PAYMENT_WINDOW_MINUTES / 60} horas`} para regularizar; sem pagamento, a locação é encerrada e a vaga volta para o anúncio.`,
      };
    case 'rejected':
      return {
        renter: 'O proprietário recusou esta solicitação. Nada foi cobrado. Que tal procurar outro espaço?',
        owner: 'Você recusou esta solicitação.',
      };
    case 'expired':
      return {
        renter:
          b.endReason === 'payment_not_received'
            ? 'O prazo de 24 horas para pagar terminou e a vaga voltou para o anúncio. Nada foi cobrado.'
            : 'Esta solicitação expirou sem resposta do proprietário. Nada foi cobrado.',
        owner:
          b.endReason === 'payment_not_received'
            ? 'O locatário não pagou dentro de 24 horas. A solicitação expirou e a vaga voltou para o anúncio.'
            : 'Esta solicitação expirou porque ficou sem resposta por mais de 24 horas.',
      };
    case 'cancelled':
      return {
        renter: b.endReason === 'cancelled_by_owner' ? 'O proprietário desfez o aceite antes do pagamento. Nada foi cobrado.' : 'Esta solicitação foi cancelada. Nada foi cobrado.',
        owner: b.endReason === 'cancelled_by_owner' ? 'Você desfez o aceite. A vaga voltou para o anúncio.' : `${nomeOutra} desistiu antes de pagar. A vaga voltou para o anúncio.`,
      };
    case 'ended': {
      const avaliar = {
        renter: ' Conte como foi — sua avaliação ajuda as próximas pessoas.',
        owner: ' Conte como foi alugar para esta pessoa — ajuda outros proprietários.',
      };
      switch (b.endReason) {
        case 'payment_not_received':
          return {
            renter: 'A locação foi encerrada porque o pagamento não foi regularizado dentro de 2 horas. A cobrança automática foi interrompida e a vaga voltou para o anúncio.',
            owner: 'A locação foi encerrada por falta de pagamento. A cobrança automática foi interrompida e a vaga voltou para o anúncio.',
          };
        case 'cancelled_by_renter':
          return {
            renter: 'Você encerrou esta locação. A cobrança automática foi interrompida e a vaga voltou para o anúncio.' + avaliar.renter,
            owner: `${nomeOutra} encerrou esta locação. A cobrança automática foi interrompida e a vaga voltou para o anúncio.` + avaliar.owner,
          };
        case 'owner_end_request':
          return {
            renter: 'A locação foi encerrada a pedido do proprietário, na data combinada. A cobrança automática foi interrompida.' + avaliar.renter,
            owner: 'A locação foi encerrada a seu pedido, na data escolhida. A cobrança automática foi interrompida e a vaga voltou para o anúncio.' + avaliar.owner,
          };
        default:
          return {
            renter: 'Locação encerrada.' + avaliar.renter,
            owner: 'Locação encerrada.' + avaliar.owner,
          };
      }
    }
    default:
      return null;
  }
}

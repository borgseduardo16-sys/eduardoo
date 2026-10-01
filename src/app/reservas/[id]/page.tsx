import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleAlert, ExternalLink, ImageOff, LifeBuoy, MapPin, MessageCircle, UserRound } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getBookingAddressForRenter, getBookingForParticipant, type BookingDetail } from '@/lib/bookings/queries';
import { findConversation } from '@/lib/messaging/queries';
import { hasReviewedBooking } from '@/lib/reviews/queries';
import { getRatingSummaries } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import { getRenewalInfo } from '@/lib/bookings/renewal';
import { RenewalPanel } from '@/components/bookings/renewal-panel';
import { isUuid } from '@/lib/profiles/queries';
import { displayNameOr } from '@/lib/profiles/format';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL, formatBps } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import {
  PAYMENT_STATUS_INFO,
  paymentStatusLabel,
  subscriptionStatusLabel,
  DEPOSIT_RELEASE_STATUS_INFO,
  depositReleaseStatusLabel,
} from '@/lib/payments/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { settingInt } from '@/lib/settings';
import { getGroupRules } from '@/lib/rentals/queries';
import { pricedDurationOptions } from '@/lib/rentals/booking';
import { sweepExpiredRentals } from '@/lib/rentals/maintenance';
import {
  RENEWAL_WINDOW_MINUTES,
  paymentWindowState,
  temporaryDurationOptions,
  type PricedDurationOption,
  type TemporaryPhase,
} from '@/lib/rentals/pricing';
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
import { PersonTrustCard } from '@/components/profile/person-trust-card';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Countdown } from '@/components/rentals/live';
import { RenewForm } from '@/components/rentals/renew-form';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Reserva', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Papel = BookingDetail['viewerRole'];

/**
 * Página da reserva (Fase 21) — confirmação logo depois de solicitar e
 * acompanhamento dali em diante, para as DUAS partes.
 *
 * Só quem participa da reserva chega aqui: a consulta filtra por
 * locatário/proprietário no próprio WHERE; qualquer outro id dá 404, sem
 * dizer se a reserva existe. Valores vêm congelados da reserva (centavos),
 * nunca recalculados na tela. O endereço exato só aparece para o locatário
 * com a reserva confirmada (primeiro pagamento aprovado).
 *
 * Parte 12: unidade alugada, aluguel por tempo (período, tempo restante pelo
 * relógio do servidor, renovação) e pagamento pendente (prazo e caminho
 * para resolver). O tempo restante fica aqui e em Meus aluguéis — nunca na
 * tela principal do app.
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
  await sweepExpiredRentals();
  const b = await getBookingForParticipant(id, user.id);
  if (!b) notFound();
  const agora = new Date();
  const serverNow = agora.toISOString();

  const papel = b.viewerRole;
  const outra = papel === 'renter' ? b.owner : b.renter;
  const kindAvaliacao = papel === 'renter' ? 'renter_to_space' : 'owner_to_renter';

  const [urls, endereco, conversa, jaAvaliou, reputacao, respostaDono, renovacao] = await Promise.all([
    signImagePaths([b.spaceCoverPath, outra.avatarPath].filter(Boolean) as string[]),
    papel === 'renter' ? getBookingAddressForRenter(b.id, user.id) : Promise.resolve(null),
    findConversation(b.spaceId, b.renterId),
    hasReviewedBooking(b.id, user.id, kindAvaliacao),
    // Reputação da OUTRA parte no papel dela nesta reserva.
    getRatingSummaries([outra.id], papel === 'renter' ? 'renter_to_space' : 'owner_to_renter'),
    // Como o proprietário responde — só interessa a quem está do lado de quem pede.
    papel === 'renter' ? getOwnerResponseStats(outra.id) : Promise.resolve(null),
    // Fase 23: renovação mensal (só existe depois do checkout, com assinatura).
    getRenewalInfo(b.id, user.id),
  ]);

  const temporario = b.kind === 'temporary';
  const fase = rentalPhaseOf(b, agora);
  const unidade = unitLine(b.unitLabel, b.groupName, b.spaceGroupCount);
  // Renovar: só quem aluga, com o grupo ainda permitindo, dentro da janela.
  const podeRenovar =
    papel === 'renter' && temporario && b.status === 'active' && b.renewalAllowed && !b.renewalId && b.groupId != null &&
    (fase === 'upcoming' || fase === 'in_use' || fase === 'renewal_window');
  let duracoesRenovar: PricedDurationOption[] = [];
  if (podeRenovar && b.groupId) {
    const [grupo, minCharge] = await Promise.all([
      getGroupRules(b.spaceId, b.groupId),
      settingInt('booking.min_rent_cents', 3500),
    ]);
    if (grupo) duracoesRenovar = await pricedDurationOptions(temporaryDurationOptions(grupo.rules, minCharge));
  }
  // Com aluguel rodando (ou encerrado), a renovação ganha seção própria e
  // substitui o resumo de pagamento — mesma informação, mais completa.
  const mostrarRenovacao = renovacao != null && ['active', 'past_due', 'ended'].includes(b.status);

  const status = rentalBadge(b.status, fase);
  const problema = b.status === 'past_due';
  const capa = b.spaceCoverPath ? (urls.get(b.spaceCoverPath) ?? null) : null;
  const nomeOutra = displayNameOr(outra.publicName);

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
            {nomeOutra} recebeu seu pedido e vai avaliar. Nada é cobrado até a solicitação ser
            aceita — você recebe uma notificação com a resposta.
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
                // O "!" fica só no aluguel com problema de pagamento.
                <CircleAlert className="inline size-5 mr-1.5 -mt-1 text-[var(--color-critical)]" aria-label="Pagamento pendente" />
              )}
              {b.spaceTitle}
            </h1>
            <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{[b.spaceDistrict, b.spaceCity].filter(Boolean).join(', ')}</span>
            </p>
            {unidade && <p className="text-[0.875rem] font-medium">{unidade}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <span className="text-[0.8125rem] text-[var(--content-subtle)]">Código {b.reference}</span>
            </div>
          </div>
        </header>

        {/* Aluguel por tempo: tempo restante pelo relógio do servidor + renovar. */}
        {temporario && b.status === 'active' && b.startsAt && b.endsAt && b.occupiedUntil && (
          <section
            aria-labelledby="tempo-titulo"
            className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3"
            data-testid="contagem-aluguel"
          >
            <h2 id="tempo-titulo" className="font-semibold">Tempo</h2>
            <p className="text-[0.9375rem]">{formatRentalPeriod(b.startsAt, b.endsAt, agora)}</p>
            {fase === 'upcoming' && (
              <p className="text-[0.9375rem]">
                Começa em <Countdown target={b.startsAt.toISOString()} serverNow={serverNow} className="font-semibold" />
              </p>
            )}
            {fase === 'in_use' && (
              <p className="text-[0.9375rem]">
                Tempo restante: <Countdown target={b.endsAt.toISOString()} serverNow={serverNow} className="font-semibold" />
                <span className="text-[var(--content-muted)]"> — termina às {brTime(b.endsAt)}</span>
              </p>
            )}
            {fase === 'renewal_window' && (
              <p className="text-[0.9375rem] text-[var(--color-caution)]">
                O horário terminou. A unidade fica guardada por mais{' '}
                <Countdown target={b.occupiedUntil.toISOString()} serverNow={serverNow} className="font-semibold" endedText="instantes" />
                {papel === 'renter' ? ' para você renovar.' : ' caso a renovação aconteça.'}
              </p>
            )}
            {b.renewalId ? (
              <p className="text-[0.875rem] text-[var(--content-muted)]">
                Renovação feita.{' '}
                <Link href={`/reservas/${b.renewalId}`} className="text-[var(--accent)] underline underline-offset-4">Ver renovação</Link>
              </p>
            ) : podeRenovar && duracoesRenovar.length > 0 ? (
              <div className="space-y-1.5 pt-1 border-t">
                <p className="text-[0.875rem] text-[var(--content-muted)] pt-2">
                  Precisa de mais tempo? A renovação continua na mesma unidade, a partir do fim deste período
                  {fase === 'renewal_window' ? '.' : ` — dá para renovar até ${RENEWAL_WINDOW_MINUTES} minutos depois do fim.`}
                </p>
                <RenewForm bookingId={b.id} durations={duracoesRenovar} idempotencyKey={crypto.randomUUID()} />
              </div>
            ) : null}
          </section>
        )}

        <ProximosPassos b={b} papel={papel} nomeOutra={nomeOutra} fase={fase} agora={agora}>
          {/* Pagamento pendente: prazo correndo no servidor e caminho para resolver. */}
          {problema && b.paymentIssueStartedAt && b.paymentIssueDeadlineAt && (
            <PrazoPendente
              inicio={b.paymentIssueStartedAt}
              prazo={b.paymentIssueDeadlineAt}
              agora={agora}
              href={papel === 'renter' ? `/reservas/${b.id}/pendente` : null}
            />
          )}
          {/* Aluguel por tempo esperando o pagamento: a unidade fica segura até o prazo. */}
          {temporario && b.status === 'awaiting_payment' && b.holdExpiresAt && (
            <p className="text-[0.9375rem]" data-testid="prazo-pagamento">
              Prazo para pagar: até {brTime(b.holdExpiresAt)} —{' '}
              <Countdown target={b.holdExpiresAt.toISOString()} serverNow={serverNow} className="font-semibold" endedText="prazo encerrado" />
            </p>
          )}
        </ProximosPassos>

        {/* Endereço exato — só locatário, só com a reserva confirmada */}
        {endereco && (
          <section aria-labelledby="endereco-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-1.5">
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
            <p className="text-[0.75rem] text-[var(--content-subtle)]">
              Visível só para você, porque a reserva está confirmada.
            </p>
          </section>
        )}

        {/* Resumo: período, valores congelados na reserva, pagamento */}
        <section aria-labelledby="resumo-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4">
          <h2 id="resumo-titulo" className="font-semibold">
            Resumo
          </h2>
          <dl className="space-y-2 text-[0.9375rem]">
            {unidade && <Linha rotulo="Unidade" valor={unidade} />}
            {temporario && b.startsAt && b.endsAt ? (
              <>
                <Linha rotulo="Quando" valor={formatRentalPeriod(b.startsAt, b.endsAt, agora)} />
                <Linha rotulo="Duração" valor={formatRentalDuration(b.durationUnits, b.durationUnit)} />
                <Linha rotulo="Valor do aluguel" valor={formatBRL(b.monthlyRentCents)} />
              </>
            ) : (
              <>
                <Linha rotulo="Início" valor={formatBookingDate(b.startDate)} />
                <Linha
                  rotulo="Término"
                  valor={b.endDate ? formatBookingDate(b.endDate) : 'Mensal, sem data de término'}
                />
                <Linha rotulo="Aluguel mensal" valor={formatBRL(b.monthlyRentCents)} />
              </>
            )}
            {papel === 'renter' ? (
              <>
                <Linha rotulo={`Taxa de serviço (${formatBps(b.renterFeeBps)})`} valor={formatBRL(b.renterFeeCents)} />
                <Linha rotulo={temporario ? 'Você paga' : 'Você paga por mês'} valor={formatBRL(b.totalChargedCents)} destaque />
              </>
            ) : (
              <>
                <Linha rotulo={`Taxa da plataforma (${formatBps(b.ownerFeeBps)})`} valor={`− ${formatBRL(b.ownerFeeCents)}`} />
                <Linha rotulo={temporario ? 'Você recebe' : 'Você recebe por mês'} valor={formatBRL(b.ownerPayoutCents)} destaque />
              </>
            )}
            {['ended', 'expired', 'cancelled'].includes(b.status) && endReasonLabel(b.endReason) && (
              <Linha rotulo="Como terminou" valor={endReasonLabel(b.endReason)!} />
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

          {b.renewedFromId && (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Renovação de um aluguel anterior, na mesma unidade.{' '}
              <Link href={`/reservas/${b.renewedFromId}`} className="text-[var(--accent)] underline underline-offset-4">
                Ver anterior
              </Link>
            </p>
          )}

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
                    {b.lastPaymentDueDate && ` · venc. ${formatBookingDate(b.lastPaymentDueDate)}`}
                    <Badge tone={PAYMENT_STATUS_INFO[b.lastPaymentStatus]?.tone ?? 'neutral'}>
                      {paymentStatusLabel(b.lastPaymentStatus)}
                    </Badge>
                  </p>
                )}
                {/* Pagar sempre pelas telas daqui (Pix ou cartão sobre a MESMA cobrança). */}
                {papel === 'renter' &&
                  b.lastPaymentStatus &&
                  ['pending', 'overdue'].includes(b.lastPaymentStatus) &&
                  (b.status === 'past_due' || b.status === 'awaiting_payment' ? (
                    <Link
                      href={`/reservas/${b.id}/${b.status === 'past_due' ? 'pendente' : 'pagar'}`}
                      className="inline-block text-[var(--accent)] underline underline-offset-4"
                    >
                      {b.status === 'past_due' ? 'Resolver pagamento' : 'Ir para o pagamento'}
                    </Link>
                  ) : b.lastPaymentInvoiceUrl ? (
                    <a
                      href={b.lastPaymentInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[var(--accent)] underline underline-offset-4"
                    >
                      Abrir cobrança para pagar
                    </a>
                  ) : null)}
                {b.status === 'active' && b.nextDueDate && (
                  <p className="text-[var(--content-muted)]">Próxima cobrança: {formatBookingDate(b.nextDueDate)}</p>
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
                      : 'Nenhuma cobrança registrada para esta reserva.'}
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

        {/* Ações da reserva — cada componente decide sozinho se aparece pelo status */}
        <section aria-label="Ações da reserva" className="space-y-3">
          {papel === 'owner' && <RespondRequestActions bookingId={b.id} status={b.status} />}
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
          <CancelBookingButton
            bookingId={b.id}
            // O proprietário só cancela o que aceitou e ainda não foi pago (o servidor confere).
            status={papel === 'owner' && b.status !== 'approved' ? 'indisponivel' : b.status}
            label={
              papel === 'owner'
                ? 'Cancelar reserva'
                : b.status === 'awaiting_payment'
                  ? 'Desistir da reserva'
                  : 'Cancelar solicitação'
            }
          />
          <EndBookingButton
            bookingId={b.id}
            status={b.status}
            kind={b.kind}
            label={papel === 'renter' ? 'Cancelar aluguel' : 'Encerrar aluguel'}
          />
          <ReviewPrompt
            bookingId={b.id}
            kind={kindAvaliacao}
            status={b.status}
            alreadyReviewed={jaAvaliou}
            label={papel === 'renter' ? 'Como foi alugar este espaço?' : 'Como foi alugar seu espaço para este usuário?'}
            buttonLabel="Avaliar esta locação"
          />
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
              Esta conta não está mais ativa na MyPlace. Em caso de dúvida sobre a reserva, fale com o suporte.
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

        {/* Relatar problema — a denúncia fica amarrada a esta reserva */}
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

/** Prazo do pagamento pendente: 40 minutos, depois mais 1 hora — pelo relógio do servidor. */
function PrazoPendente({ inicio, prazo, agora, href }: { inicio: Date; prazo: Date; agora: Date; href: string | null }) {
  const janela = paymentWindowState(inicio, prazo, agora);
  return (
    <div className="space-y-2 pt-1" data-testid="prazo-pendente">
      <p className="text-[0.9375rem]">
        {janela.phase === 'first' ? 'Tempo para regularizar: ' : 'Último prazo: '}
        <Countdown
          target={janela.phaseEndsAt.toISOString()}
          serverNow={agora.toISOString()}
          className="font-semibold"
          endedText="prazo encerrado"
        />
        <span className="text-[var(--content-muted)]"> — até {brTime(janela.phaseEndsAt)}</span>
      </p>
      {href && (
        <Link href={href} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
          Resolver pagamento
        </Link>
      )}
    </div>
  );
}

/** O que acontece agora — em linguagem de gente, pelo status e pelo lado de quem lê. */
function ProximosPassos({
  b,
  papel,
  nomeOutra,
  fase,
  agora,
  children,
}: {
  b: BookingDetail;
  papel: Papel;
  nomeOutra: string;
  fase: TemporaryPhase | null;
  agora: Date;
  children?: React.ReactNode;
}) {
  const t = textoDosPassos(b, nomeOutra, fase, agora);
  if (!t) return null;

  return (
    <section
      aria-labelledby="passos-titulo"
      className={`rounded-[var(--radius-card)] p-4 sm:p-5 space-y-1.5 ${b.status === 'past_due' ? 'border border-[var(--color-critical)]' : 'bg-[var(--surface-sunken)]'}`}
    >
      <h2 id="passos-titulo" className="font-semibold">
        {b.status === 'past_due' ? 'Pagamento pendente' : 'Próximos passos'}
      </h2>
      <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">{t[papel]}</p>
      {children}
      {b.status === 'rejected' && b.ownerResponse && (
        <p className="text-[0.875rem] text-[var(--content-subtle)]">Motivo informado: {b.ownerResponse}</p>
      )}
      {b.status === 'requested' && b.renterMessage && papel === 'owner' && (
        <p className="text-[0.875rem] text-[var(--content-muted)] whitespace-pre-line break-words">“{b.renterMessage}”</p>
      )}
      {b.status === 'rejected' && papel === 'renter' && (
        <Link href="/espacos" className="inline-block pt-1 text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
          Procurar outros espaços
        </Link>
      )}
    </section>
  );
}

type Textos = { renter: string; owner: string };

function textoDosPassos(b: BookingDetail, nomeOutra: string, fase: TemporaryPhase | null, agora: Date): Textos | null {
  const temporario = b.kind === 'temporary';

  if (b.status === 'requested') {
    return {
      renter: `${nomeOutra} vai analisar sua solicitação. Enquanto isso, você pode tirar dúvidas pelo chat. Se não houver resposta em alguns dias, o pedido expira sozinho — sem cobrança.`,
      owner: `Veja quem pediu, tire dúvidas pelo chat e aceite ou recuse. Nada é cobrado de ninguém até você aceitar.`,
    };
  }
  if (b.status === 'approved') {
    return {
      renter: 'Solicitação aceita! Confirme o pagamento para garantir o espaço. O endereço exato aparece aqui assim que o primeiro pagamento for aprovado.',
      owner: `Você aceitou. Agora ${nomeOutra} precisa confirmar o pagamento — você recebe uma notificação quando isso acontecer.`,
    };
  }
  if (b.status === 'awaiting_payment') {
    if (temporario && b.holdExpiresAt) {
      const ate = brTime(b.holdExpiresAt);
      return {
        renter: `A unidade fica segura para você até ${ate}. Pague com Pix ou cartão até lá; se o prazo passar, a reserva se desfaz sozinha e nada é cobrado. O endereço exato aparece aqui assim que o pagamento for aprovado.`,
        owner: `${nomeOutra} reservou e está pagando. Se o pagamento não for aprovado até ${ate}, a reserva se desfaz sozinha e a unidade volta a ficar livre.`,
      };
    }
    return {
      renter: 'Pagamento em processamento. Assim que for aprovado, a reserva fica ativa e o endereço exato aparece aqui.',
      owner: 'O pagamento do locatário está em processamento. A reserva fica ativa assim que for aprovado.',
    };
  }
  if (b.status === 'active') {
    if (temporario && b.startsAt && b.endsAt) {
      const periodo = formatRentalPeriod(b.startsAt, b.endsAt, agora);
      if (fase === 'upcoming') {
        return {
          renter: `Reserva confirmada e paga: ${periodo}. O endereço exato está logo abaixo.`,
          owner: `Reserva confirmada e paga: ${periodo}.`,
        };
      }
      if (fase === 'renewal_window') {
        return {
          renter: `O horário terminou. A unidade fica guardada por até ${RENEWAL_WINDOW_MINUTES} minutos para você renovar; depois disso, é liberada.`,
          owner: `O horário terminou. A unidade fica guardada por até ${RENEWAL_WINDOW_MINUTES} minutos caso ${nomeOutra} renove; depois, volta a ficar livre.`,
        };
      }
      if (fase === 'finished') {
        return { renter: 'Aluguel concluído.', owner: 'Aluguel concluído.' };
      }
      return {
        renter: `Aluguel em andamento até ${brTime(b.endsAt)}. Qualquer combinado, registre pelo chat da plataforma.`,
        owner: `Aluguel em andamento até ${brTime(b.endsAt)}.`,
      };
    }
    return {
      renter: 'Aluguel ativo. A mensalidade é cobrada todo mês até você cancelar — não há data de término. Qualquer combinado, registre pelo chat da plataforma.',
      owner: 'Aluguel ativo. Os repasses acontecem automaticamente a cada pagamento aprovado.',
    };
  }
  if (b.status === 'past_due') {
    const ate = b.paymentIssueDeadlineAt ? ` até ${brTime(b.paymentIssueDeadlineAt)}` : '';
    return {
      renter: 'Não conseguimos concluir a cobrança automática do seu aluguel. Regularize o pagamento para continuar utilizando este espaço.',
      owner: `A cobrança deste mês não foi concluída. ${nomeOutra} tem${ate} para regularizar; se não regularizar, o aluguel é encerrado e a unidade é liberada automaticamente.`,
    };
  }
  if (b.status === 'rejected') {
    return {
      renter: 'O proprietário recusou esta solicitação. Nada foi cobrado. Que tal procurar outro espaço?',
      owner: 'Você recusou esta solicitação.',
    };
  }
  if (b.status === 'expired') {
    if (b.endReason === 'hold_expired') {
      return {
        renter: 'O prazo para pagar terminou e a reserva foi desfeita. Nada foi cobrado.',
        owner: 'O pagamento não foi concluído a tempo. A reserva foi desfeita e a unidade voltou a ficar livre.',
      };
    }
    return {
      renter: 'Esta solicitação expirou sem resposta. Nada foi cobrado.',
      owner: 'Esta solicitação expirou sem resposta.',
    };
  }
  if (b.status === 'cancelled') {
    return { renter: 'Esta reserva foi cancelada.', owner: 'Esta reserva foi cancelada.' };
  }
  if (b.status === 'ended') {
    const avaliar = { renter: ' Conte como foi — sua avaliação ajuda as próximas pessoas.', owner: ' Conte como foi alugar para esta pessoa — ajuda outros proprietários.' };
    switch (b.endReason) {
      case 'payment_not_received':
        return {
          renter: 'O aluguel foi encerrado porque o pagamento não foi regularizado no prazo. A cobrança automática foi interrompida e a unidade foi liberada.',
          owner: 'O aluguel foi encerrado por falta de pagamento. A cobrança automática foi interrompida e a unidade voltou a ficar livre.',
        };
      case 'cancelled_by_renter':
        return {
          renter: 'Você cancelou este aluguel. A cobrança automática foi interrompida e a unidade foi liberada.' + avaliar.renter,
          owner: `${nomeOutra} cancelou este aluguel. A cobrança automática foi interrompida e a unidade voltou a ficar livre.` + avaliar.owner,
        };
      case 'cancelled_by_owner':
        return {
          renter: 'O proprietário encerrou este aluguel. A cobrança automática foi interrompida.' + avaliar.renter,
          owner: 'Você encerrou este aluguel. A cobrança automática foi interrompida e a unidade voltou a ficar livre.' + avaliar.owner,
        };
      default:
        return {
          renter: (temporario ? 'Aluguel concluído.' : 'Aluguel encerrado.') + avaliar.renter,
          owner: (temporario ? 'Aluguel concluído.' : 'Aluguel encerrado.') + avaliar.owner,
        };
    }
  }
  return null;
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, ImageOff, LifeBuoy, MapPin, MessageCircle, UserRound } from 'lucide-react';
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
import { BOOKING_STATUS_INFO, formatBookingDate } from '@/lib/bookings/format';
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
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { ReportDialog } from '@/components/safety/report-dialog';
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

  const b = await getBookingForParticipant(id, user.id);
  if (!b) notFound();

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
  // Com aluguel rodando (ou encerrado), a renovação ganha seção própria e
  // substitui o resumo de pagamento — mesma informação, mais completa.
  const mostrarRenovacao = renovacao != null && ['active', 'past_due', 'ended'].includes(b.status);

  const status = BOOKING_STATUS_INFO[b.status as keyof typeof BOOKING_STATUS_INFO] ?? {
    label: b.status,
    tone: 'neutral' as const,
  };
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
          {papel === 'renter' ? 'Minhas reservas' : 'Solicitações'}
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
            <h1 className="text-[1.25rem] sm:text-[1.5rem] font-semibold leading-snug break-words">{b.spaceTitle}</h1>
            <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{[b.spaceDistrict, b.spaceCity].filter(Boolean).join(', ')}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
              <span className="text-[0.8125rem] text-[var(--content-subtle)]">Código {b.reference}</span>
            </div>
          </div>
        </header>

        <ProximosPassos b={b} papel={papel} nomeOutra={nomeOutra} />

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
            <Linha rotulo="Início" valor={formatBookingDate(b.startDate)} />
            <Linha
              rotulo="Término"
              valor={b.endDate ? formatBookingDate(b.endDate) : 'Mensal, sem data de término'}
            />
            <Linha rotulo="Aluguel mensal" valor={formatBRL(b.monthlyRentCents)} />
            {papel === 'renter' ? (
              <>
                <Linha rotulo={`Taxa de serviço (${formatBps(b.renterFeeBps)})`} valor={formatBRL(b.renterFeeCents)} />
                <Linha rotulo="Você paga por mês" valor={formatBRL(b.totalChargedCents)} destaque />
              </>
            ) : (
              <>
                <Linha rotulo={`Taxa da plataforma (${formatBps(b.ownerFeeBps)})`} valor={`− ${formatBRL(b.ownerFeeCents)}`} />
                <Linha rotulo="Você recebe por mês" valor={formatBRL(b.ownerPayoutCents)} destaque />
              </>
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
                    {b.lastPaymentDueDate && ` · venc. ${formatBookingDate(b.lastPaymentDueDate)}`}
                    <Badge tone={PAYMENT_STATUS_INFO[b.lastPaymentStatus]?.tone ?? 'neutral'}>
                      {paymentStatusLabel(b.lastPaymentStatus)}
                    </Badge>
                  </p>
                )}
                {papel === 'renter' &&
                  b.lastPaymentInvoiceUrl &&
                  b.lastPaymentStatus &&
                  ['pending', 'overdue'].includes(b.lastPaymentStatus) && (
                    <a
                      href={b.lastPaymentInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[var(--accent)] underline underline-offset-4"
                    >
                      Abrir cobrança para pagar
                    </a>
                  )}
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
          {papel === 'renter' && b.status === 'approved' && (
            <Link href={`/reservas/${b.id}/pagar`} className={buttonVariants({ size: 'lg', block: true })}>
              Pagar agora
            </Link>
          )}
          <CancelBookingButton
            bookingId={b.id}
            status={b.status}
            label={papel === 'renter' ? 'Cancelar solicitação' : 'Cancelar reserva'}
          />
          <EndBookingButton bookingId={b.id} status={b.status} />
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

/** O que acontece agora — em linguagem de gente, pelo status e pelo lado de quem lê. */
function ProximosPassos({ b, papel, nomeOutra }: { b: BookingDetail; papel: Papel; nomeOutra: string }) {
  const texto: Record<string, { renter: string; owner: string }> = {
    requested: {
      renter: `${nomeOutra} vai analisar sua solicitação. Enquanto isso, você pode tirar dúvidas pelo chat. Se não houver resposta em alguns dias, o pedido expira sozinho — sem cobrança.`,
      owner: `Veja quem pediu, tire dúvidas pelo chat e aceite ou recuse. Nada é cobrado de ninguém até você aceitar.`,
    },
    approved: {
      renter: 'Solicitação aceita! Confirme o pagamento para garantir o espaço. O endereço exato aparece aqui assim que o primeiro pagamento for aprovado.',
      owner: `Você aceitou. Agora ${nomeOutra} precisa confirmar o pagamento — você recebe uma notificação quando isso acontecer.`,
    },
    awaiting_payment: {
      renter: 'Pagamento em processamento. Assim que for aprovado, a reserva fica ativa e o endereço exato aparece aqui.',
      owner: 'O pagamento do locatário está em processamento. A reserva fica ativa assim que for aprovado.',
    },
    active: {
      renter: 'Aluguel ativo. As próximas cobranças são automáticas, todo mês. Qualquer combinado, registre pelo chat da plataforma.',
      owner: 'Aluguel ativo. Os repasses acontecem automaticamente a cada pagamento aprovado.',
    },
    past_due: {
      renter: 'Há um pagamento em atraso. Regularize pelo link da cobrança, logo abaixo no resumo, para manter a reserva.',
      owner: 'O pagamento do locatário está em atraso. Você é avisado assim que for regularizado.',
    },
    rejected: {
      renter: 'O proprietário recusou esta solicitação. Nada foi cobrado. Que tal procurar outro espaço?',
      owner: 'Você recusou esta solicitação.',
    },
    expired: {
      renter: 'Esta solicitação expirou sem resposta. Nada foi cobrado.',
      owner: 'Esta solicitação expirou sem resposta.',
    },
    cancelled: {
      renter: 'Esta reserva foi cancelada.',
      owner: 'Esta reserva foi cancelada.',
    },
    ended: {
      renter: 'Aluguel encerrado. Conte como foi — sua avaliação ajuda as próximas pessoas.',
      owner: 'Aluguel encerrado. Conte como foi alugar para esta pessoa — ajuda outros proprietários.',
    },
  };

  const t = texto[b.status];
  if (!t) return null;

  return (
    <section aria-labelledby="passos-titulo" className="rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-4 sm:p-5 space-y-1.5">
      <h2 id="passos-titulo" className="font-semibold">
        Próximos passos
      </h2>
      <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">{t[papel]}</p>
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

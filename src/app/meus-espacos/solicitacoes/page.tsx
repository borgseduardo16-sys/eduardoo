import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { countOwnerPendingRequests, listOwnerBookingRequests, type BookingStatus } from '@/lib/bookings/queries';
import { listReviewedBookingIds, parsePage } from '@/lib/reviews/queries';
import { getRatingSummaries } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import {
  MIN_DECIDED_FOR_RATE,
  RESPONSE_TIME_LABEL,
  responseRatePercent,
  typicalResponseBucket,
} from '@/lib/bookings/response-format';
import { displayNameOr } from '@/lib/profiles/format';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { decideOwnerFee, formatBRL, formatBps, ownerNetFor } from '@/lib/money';
import { loadFeePolicy, type FeePolicy } from '@/lib/bookings/fees';
import { isPremiumFinancial } from '@/lib/premium/queries';
import { addDaysToDate, brDate, formatBrDate } from '@/lib/time';
import { bookingBadge, endReasonLabel, formatDateShort, formatDueDate } from '@/lib/bookings/format';
import { formatDeadline } from '@/lib/bookings/deadlines';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { EndRequestPanel } from '@/components/bookings/end-request-panel';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { PersonTrustCard } from '@/components/profile/person-trust-card';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Pager } from '@/components/ui/pager';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Solicitações' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/**
 * Filtros por estado. Os estados seguem o fluxo, sem redundância:
 *   pendente → aceita (falta pagar) → em andamento → encerrada
 * "Aguardando início" não é filtro à parte: é uma locação em andamento cuja
 * data de início ainda não chegou (o selo do cartão diz isso).
 */
const FILTROS = [
  { key: 'todas', label: 'Todas', status: undefined },
  { key: 'pendentes', label: 'Pendentes', status: ['requested'] },
  { key: 'aceitas', label: 'Aceitas', status: ['approved', 'awaiting_payment'] },
  { key: 'andamento', label: 'Em andamento', status: ['active', 'past_due'] },
  { key: 'encerradas', label: 'Encerradas', status: ['rejected', 'expired', 'cancelled', 'ended'] },
] as const;

type Linha = Awaited<ReturnType<typeof listOwnerBookingRequests>>[number];

/**
 * Quanto o proprietário recebe por mês nesta locação. Depois do aceite é o valor CONGELADO. Enquanto o
 * pedido está pendente, é o de AGORA: a taxa é decidida ao aceitar, com o Premium dele como estiver
 * nesse instante — mostrar a conta feita no dia do pedido prometeria o que o aceite pode não gravar.
 */
function repasseDoCartao(s: Linha, politica: FeePolicy, premiumFinanceiro: boolean): { payoutCents: number; reduzida: boolean; bps: number | null } {
  if (s.status !== 'requested') return { payoutCents: s.ownerPayoutCents, reduzida: false, bps: null };
  const decisao = decideOwnerFee(s.monthlyRentCents, premiumFinanceiro, politica.owner);
  return { payoutCents: ownerNetFor(s.monthlyRentCents, decisao.bps).netCents, reduzida: decisao.reduced, bps: decisao.bps };
}

/** Uma linha de texto sobre onde a locação está, com os prazos que importam ao proprietário. */
function situacaoDoCartao(s: Linha, agora: Date, hoje: string): string | null {
  switch (s.status) {
    case 'approved':
    case 'awaiting_payment':
      return s.firstPaymentDeadlineAt
        ? `Aguardando o pagamento do locatário até ${formatDeadline(s.firstPaymentDeadlineAt, agora)}. Sem pagamento, a solicitação expira e a vaga volta para o anúncio.`
        : 'Aguardando o pagamento do locatário.';
    case 'active': {
      const comeco = s.startDate > hoje ? `Começa em ${formatDateShort(s.startDate)}.` : `Em andamento desde ${formatDateShort(s.startDate)}.`;
      const vencimento = s.nextDueDate ? ` Próximo vencimento: ${formatDueDate(s.nextDueDate)}.` : '';
      const pagas = s.paidCount > 0 ? ` ${s.paidCount} ${s.paidCount === 1 ? 'mensalidade paga' : 'mensalidades pagas'}.` : '';
      return `${comeco}${vencimento}${pagas}`;
    }
    case 'past_due':
      return s.paymentIssueDeadlineAt
        ? `Pagamento pendente: o locatário tem até ${formatDeadline(s.paymentIssueDeadlineAt, agora)} para regularizar. Depois disso a locação é encerrada e a vaga volta para o anúncio.`
        : 'Pagamento pendente: o locatário ainda pode regularizar.';
    case 'rejected':
    case 'expired':
    case 'cancelled':
    case 'ended': {
      const motivo = endReasonLabel(s.endReason, { status: s.status, viewer: 'owner' });
      return motivo ? `${motivo}.` : null;
    }
    default:
      return null;
  }
}

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>;
}) {
  const user = await requireUser('/meus-espacos/solicitacoes');
  const { filtro = 'todas', pagina } = await searchParams;
  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];
  const page = parsePage(pagina);

  const [linhas, pendentesTotal, minhasRespostas, politicaTaxas, premiumFinanceiro] = await Promise.all([
    listOwnerBookingRequests(user.id, ativo.status ? ([...ativo.status] as BookingStatus[]) : undefined, {
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    countOwnerPendingRequests(user.id),
    getOwnerResponseStats(user.id),
    loadFeePolicy(),
    isPremiumFinancial(user.id),
  ]);
  const solicitacoes = linhas.slice(0, PAGE_SIZE);
  const agora = new Date();
  const hoje = brDate(agora);
  const sugestaoEncerramento = addDaysToDate(hoje, 30);
  const limiteEncerramento = addDaysToDate(hoje, 365);
  const minhaTaxa = responseRatePercent(minhasRespostas);
  const minhaFaixa = typicalResponseBucket(minhasRespostas);

  const [urls, avaliadas, reputacoes] = await Promise.all([
    signImagePaths(
      solicitacoes.flatMap((s) => [s.spaceCoverPath, s.renterAvatarPath]).filter(Boolean) as string[],
    ),
    listReviewedBookingIds(user.id, 'owner_to_renter'),
    // Reputação de cada interessado COMO LOCATÁRIO, numa consulta só.
    getRatingSummaries(solicitacoes.map((s) => s.renterId), 'owner_to_renter'),
  ]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <OwnerSubnav active="solicitacoes" pendingCount={pendentesTotal} />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Solicitações</h1>
          <p className="text-[var(--content-muted)]">
            {pendentesTotal === 0
              ? 'Nenhuma solicitação aguardando resposta.'
              : `${pendentesTotal} ${pendentesTotal === 1 ? 'solicitação aguardando' : 'solicitações aguardando'} resposta.`}
          </p>
          {/* O mesmo número que quem vê o anúncio vê — dito aqui primeiro para quem anuncia. */}
          <p className="text-[0.875rem] text-[var(--content-subtle)] leading-relaxed" data-testid="minha-taxa-resposta">
            {minhaTaxa != null
              ? `Nos últimos 12 meses você respondeu ${minhasRespostas.answered} de ${minhasRespostas.decided} solicitações (${minhaTaxa}%)` +
                (minhaFaixa ? `, normalmente ${RESPONSE_TIME_LABEL[minhaFaixa]}` : '') +
                '. Quem vê seus anúncios vê essa informação.'
              : `Sua taxa de resposta aparece nos seus anúncios a partir de ${MIN_DECIDED_FOR_RATE} solicitações respondidas ou vencidas` +
                (minhasRespostas.decided > 0 ? ` (até agora: ${minhasRespostas.decided}).` : '.')}{' '}
            Você tem 24 horas para responder; pedido sem resposta vence sozinho e conta como não respondido.
          </p>
        </header>

        <nav aria-label="Filtrar por status" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          {FILTROS.map((f) => {
            const selecionado = f.key === ativo.key;
            return (
              <Link
                key={f.key}
                href={f.key === 'todas' ? '/meus-espacos/solicitacoes' : `/meus-espacos/solicitacoes?filtro=${f.key}`}
                aria-current={selecionado ? 'page' : undefined}
                className={cn(
                  'shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                  selecionado
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                    : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {solicitacoes.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <Inbox className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Quando alguém solicitar um dos seus espaços, aparece aqui.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {solicitacoes.map((s) => {
              const url = s.spaceCoverPath ? urls.get(s.spaceCoverPath) : null;
              const info = bookingBadge(s, hoje);
              const situacao = situacaoDoCartao(s, agora, hoje);
              const semVaga = s.status === 'requested' && s.spaceQuantityAvailable <= 0;
              const repasse = repasseDoCartao(s, politicaTaxas, premiumFinanceiro);
              return (
                <li key={s.id} id={`reserva-${s.id}`} className="rounded-[var(--radius-card)] border p-4 space-y-3 scroll-mt-20">
                  <div className="flex gap-3">
                    <div className="relative shrink-0 size-16 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
                      {url ? (
                        <Image src={url} alt="" fill sizes="64px" className="object-cover" unoptimized />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <ImageOff className="size-4 text-[var(--content-subtle)]" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* No celular o selo de status desce: ao lado do título, cortava o nome do espaço em "Depósito…". */}
                      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-2">
                        <div className="min-w-0">
                          <Link href={`/espacos/${s.spaceSlug}`} className="font-medium line-clamp-2 break-words hover:underline">
                            {s.spaceTitle}
                          </Link>
                          <p className="text-[0.8125rem] text-[var(--content-muted)]">
                            {spaceTypeLabel(s.spaceType as SpaceTypeKey)}
                            {s.spaceCity && ` · ${[s.spaceDistrict, s.spaceCity].filter(Boolean).join(', ')}`}
                          </p>
                        </div>
                        <Badge tone={info.tone} className="shrink-0">
                          {info.label}
                        </Badge>
                      </div>
                      <p className="text-[0.8125rem] text-[var(--content-muted)]">
                        {displayNameOr(s.renterPublicName, 'Interessado')} · quer começar em {formatDateShort(s.startDate)} · pediu em {formatBrDate(s.requestedAt)}
                      </p>
                      <p className="text-[0.9375rem] font-medium tabular-nums">
                        Você recebe {formatBRL(repasse.payoutCents)} por mês
                        <span className="font-normal text-[var(--content-muted)]">
                          {' '}
                          (aluguel {formatBRL(s.monthlyRentCents)}, já com a taxa de serviço
                          {repasse.bps != null ? ` de ${formatBps(repasse.bps)}` : ''}
                          {repasse.reduzida ? ', reduzida pelo Premium' : ''})
                        </span>
                      </p>
                    </div>
                  </div>

                  {s.renterMessage && (
                    <p className="text-[0.875rem] text-[var(--content-muted)] bg-[var(--surface-sunken)] rounded-[var(--radius-field)] p-3 whitespace-pre-line break-words">
                      “{s.renterMessage}”
                    </p>
                  )}

                  {/*
                    Sobre o interessado: aberto enquanto a decisão está
                    pendente (é quando importa), recolhido depois.
                  */}
                  <details open={s.status === 'requested'} className="group rounded-[var(--radius-field)] border px-3 py-2">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[0.875rem] font-medium flex items-center justify-between gap-2">
                      Sobre o interessado
                      <span className="text-[0.75rem] font-normal text-[var(--content-subtle)] group-open:hidden">mostrar</span>
                      <span className="text-[0.75rem] font-normal text-[var(--content-subtle)] hidden group-open:inline">ocultar</span>
                    </summary>
                    <PersonTrustCard
                      role="renter"
                      compact
                      className="pt-3 pb-1"
                      person={{
                        id: s.renterId,
                        publicName: s.renterPublicName,
                        avatarUrl: s.renterAvatarPath ? (urls.get(s.renterAvatarPath) ?? null) : null,
                        createdAt: s.renterCreatedAt,
                        emailVerified: s.renterEmailVerified,
                        phoneVerified: s.renterPhoneVerified,
                        identityVerified: s.renterIdentityVerified,
                        completedBookingsCount: s.renterCompletedBookings,
                      }}
                      rating={reputacoes.get(s.renterId) ?? { average: null, count: 0 }}
                    />
                  </details>

                  {s.status === 'requested' && (
                    <p
                      className={cn('text-[0.8125rem]', semVaga ? 'text-[var(--color-critical)]' : 'text-[var(--content-muted)]')}
                      data-testid="vagas-do-anuncio"
                    >
                      {semVaga
                        ? 'Este anúncio está sem vagas livres agora. Para aceitar, uma locação precisa terminar antes.'
                        : `Vagas livres agora: ${s.spaceQuantityAvailable} de ${s.spaceQuantityOffered}. Aceitar esta solicitação ocupa uma.`}
                    </p>
                  )}

                  {situacao && <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{situacao}</p>}

                  {s.ownerResponse && s.status !== 'requested' && (
                    <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                      Sua resposta: {s.ownerResponse}
                    </p>
                  )}

                  <RespondRequestActions
                    bookingId={s.id}
                    status={s.status}
                    deadlineLabel={s.responseDeadlineAt ? formatDeadline(s.responseDeadlineAt, agora) : null}
                    acceptBlockedReason={semVaga ? 'Sem vagas livres neste anúncio agora.' : null}
                  />
                  <CancelBookingButton
                    bookingId={s.id}
                    status={s.status}
                    cancellable={['approved']}
                    label="Desfazer o aceite"
                    confirmText="Desfazer o aceite? A vaga volta para o anúncio e o locatário é avisado."
                  />
                  <EndRequestPanel
                    bookingId={s.id}
                    status={s.status}
                    pending={s.pendingEndDate ? { endDate: s.pendingEndDate, reason: s.pendingEndReason } : null}
                    today={hoje}
                    suggestedDate={sugestaoEncerramento}
                    maxDate={limiteEncerramento}
                  />
                  <Link
                    href={`/reservas/${s.id}`}
                    className="inline-block text-[0.8125rem] text-[var(--accent)] underline underline-offset-4"
                  >
                    Ver detalhes e instruções de acesso
                  </Link>
                  <ReviewPrompt
                    bookingId={s.id}
                    kind="owner_to_renter"
                    status={s.status}
                    alreadyReviewed={avaliadas.has(s.id)}
                    label="Como foi alugar seu espaço para este usuário?"
                  />

                  {['active', 'past_due', 'ended'].includes(s.status) && (
                    <ReportDialog
                      targetType="user"
                      targetId={s.renterId}
                      bookingId={s.id}
                      targetLabel="um problema nesta locação"
                      triggerLabel="Relatar problema nesta locação"
                      variant="ghost"
                      className="!px-0 text-[0.8125rem] text-[var(--content-muted)]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Pager
          page={page}
          hasMore={linhas.length > PAGE_SIZE}
          href={(p) => {
            const q = new URLSearchParams();
            if (ativo.key !== 'todas') q.set('filtro', ativo.key);
            if (p > 1) q.set('pagina', String(p));
            const qs = q.toString();
            return `/meus-espacos/solicitacoes${qs ? `?${qs}` : ''}`;
          }}
          label="solicitações"
        />
      </main>

      <SiteFooter />
    </>
  );
}

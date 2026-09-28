import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { countOwnerPendingRequests, listOwnerBookingRequests, type BookingStatus } from '@/lib/bookings/queries';
import { listReviewedBookingIds, parsePage } from '@/lib/reviews/queries';
import { getRatingSummaries } from '@/lib/reviews/reputation';
import { displayNameOr } from '@/lib/profiles/format';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { bookingStatusLabel, formatBookingDate } from '@/lib/bookings/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { ReviewPrompt } from '@/components/reviews/review-prompt';
import { PersonTrustCard } from '@/components/profile/person-trust-card';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Pager } from '@/components/ui/pager';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Solicitações' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const FILTROS = [
  { key: 'todas', label: 'Todas', status: undefined },
  { key: 'pendentes', label: 'Pendentes', status: ['requested'] },
  { key: 'aceitas', label: 'Aceitas', status: ['approved'] },
  { key: 'encerradas', label: 'Encerradas', status: ['rejected', 'expired', 'cancelled', 'ended'] },
] as const;

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>;
}) {
  const user = await requireUser('/meus-espacos/solicitacoes');
  const { filtro = 'todas', pagina } = await searchParams;
  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];
  const page = parsePage(pagina);

  const [linhas, pendentesTotal] = await Promise.all([
    listOwnerBookingRequests(user.id, ativo.status ? ([...ativo.status] as BookingStatus[]) : undefined, {
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    countOwnerPendingRequests(user.id),
  ]);
  const solicitacoes = linhas.slice(0, PAGE_SIZE);

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
              Quando alguém solicitar um dos seus espaços, a solicitação aparece aqui.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {solicitacoes.map((s) => {
              const url = s.spaceCoverPath ? urls.get(s.spaceCoverPath) : null;
              const info = { label: bookingStatusLabel(s.status) };
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
                        <Badge tone={
                          s.status === 'approved' || s.status === 'active' ? 'positive'
                          : s.status === 'requested' ? 'caution'
                          : s.status === 'past_due' ? 'critical'
                          : 'neutral'
                        } className="shrink-0">
                          {info.label}
                        </Badge>
                      </div>
                      <p className="text-[0.8125rem] text-[var(--content-muted)]">
                        {displayNameOr(s.renterPublicName, 'Interessado')} · a partir de {formatBookingDate(s.startDate)} · solicitado em {formatBookingDate(s.requestedAt)}
                      </p>
                      <p className="text-[0.9375rem] font-medium tabular-nums">
                        Você recebe {formatBRL(s.ownerPayoutCents)}
                        <span className="font-normal text-[var(--content-muted)]"> /mês (aluguel {formatBRL(s.monthlyRentCents)})</span>
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

                  {s.ownerResponse && s.status !== 'requested' && (
                    <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                      Sua resposta: {s.ownerResponse}
                    </p>
                  )}

                  <RespondRequestActions bookingId={s.id} status={s.status} />
                  <Link
                    href={`/reservas/${s.id}`}
                    className="inline-block text-[0.8125rem] text-[var(--accent)] underline underline-offset-4"
                  >
                    Ver detalhes da reserva
                  </Link>
                  <EndBookingButton bookingId={s.id} status={s.status} />
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

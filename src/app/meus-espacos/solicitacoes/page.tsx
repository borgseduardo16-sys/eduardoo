import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerBookingRequests, type BookingStatus } from '@/lib/bookings/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { bookingStatusLabel, formatBookingDate } from '@/lib/bookings/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { RespondRequestActions } from '@/components/bookings/respond-request-actions';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Solicitações' };
export const dynamic = 'force-dynamic';

const FILTROS = [
  { key: 'todas', label: 'Todas', status: undefined },
  { key: 'pendentes', label: 'Pendentes', status: ['requested'] },
  { key: 'aceitas', label: 'Aceitas', status: ['approved'] },
  { key: 'encerradas', label: 'Encerradas', status: ['rejected', 'expired', 'cancelled', 'ended'] },
] as const;

export default async function SolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireUser('/meus-espacos/solicitacoes');
  const { filtro = 'todas' } = await searchParams;
  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];

  const solicitacoes = await listOwnerBookingRequests(
    user.id,
    ativo.status ? ([...ativo.status] as BookingStatus[]) : undefined,
  );
  const pendentesTotal = await listOwnerBookingRequests(user.id, ['requested']);

  const urls = await signImagePaths(solicitacoes.map((s) => s.spaceCoverPath).filter(Boolean) as string[]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <OwnerSubnav active="solicitacoes" pendingCount={pendentesTotal.length} />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Solicitações</h1>
          <p className="text-[var(--content-muted)]">
            {pendentesTotal.length === 0
              ? 'Nenhuma solicitação aguardando resposta.'
              : `${pendentesTotal.length} ${pendentesTotal.length === 1 ? 'solicitação aguardando' : 'solicitações aguardando'} resposta.`}
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
                <li key={s.id} className="rounded-[var(--radius-card)] border p-4 space-y-3">
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/espacos/${s.spaceSlug}`} className="font-medium truncate hover:underline block">
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
                        {s.renterName ?? 'Interessado'} · a partir de {formatBookingDate(s.startDate)} · solicitado em {formatBookingDate(s.requestedAt)}
                      </p>
                      <p className="text-[0.9375rem] font-medium tabular-nums">
                        Você recebe {formatBRL(s.ownerPayoutCents)}
                        <span className="font-normal text-[var(--content-muted)]"> /mês (aluguel {formatBRL(s.monthlyRentCents)})</span>
                      </p>
                    </div>
                  </div>

                  {s.renterMessage && (
                    <p className="text-[0.875rem] text-[var(--content-muted)] bg-[var(--surface-sunken)] rounded-[var(--radius-field)] p-3">
                      “{s.renterMessage}”
                    </p>
                  )}

                  {s.ownerResponse && s.status !== 'requested' && (
                    <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                      Sua resposta: {s.ownerResponse}
                    </p>
                  )}

                  <RespondRequestActions bookingId={s.id} status={s.status} />
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

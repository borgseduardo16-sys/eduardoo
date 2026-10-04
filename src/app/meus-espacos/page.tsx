import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { eq } from 'drizzle-orm';
import { ImageOff, Plus } from 'lucide-react';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerSpaces, countOwnerSpacesByStatus } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { PriceTag } from '@/components/espacos/price-tag';
import { availabilityText, totalPlaceText } from '@/lib/spaces/quantity';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { getOwnerOverview, getSpaceBookingCounts, listUpcomingRenewals } from '@/lib/bookings/owner-dashboard';
import { getOwnerPayoutSummary } from '@/lib/payments/queries';
import { getRatingSummaries } from '@/lib/reviews/reputation';
import { ratingSummaryLabel } from '@/lib/reviews/format';
import { formatBRL } from '@/lib/money';
import { formatDateShort } from '@/lib/bookings/format';
import { TOTAL_STEPS } from '@/lib/spaces/schemas';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { SpaceCardActions } from '@/components/anunciar/space-card-actions';
import { PromotionBadge } from '@/components/promotions/promotion-badge';
import { getMonthlyBenefitUsage, getActivePromotionsForSpaces } from '@/lib/promotions/queries';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Meus espaços' };
export const dynamic = 'force-dynamic';

const FILTROS = [
  { key: 'todos', label: 'Todos', status: undefined },
  { key: 'ativos', label: 'Ativos', status: ['published'] },
  { key: 'rascunhos', label: 'Rascunhos', status: ['draft'] },
  { key: 'alugados', label: 'Alugados', status: ['rented'] },
  { key: 'pausados', label: 'Pausados', status: ['paused'] },
] as const;

const STATUS_BADGE: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'positive' },
  paused: { label: 'Pausado', tone: 'caution' },
  rented: { label: 'Alugado', tone: 'accent' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

export default async function MeusEspacosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireUser('/meus-espacos');
  const { filtro = 'todos' } = await searchParams;

  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];
  const [spaces, contagem, benefitUsage, [perfil]] = await Promise.all([
    listOwnerSpaces(user.id, ativo.status ? [...ativo.status] : undefined),
    countOwnerSpacesByStatus(user.id),
    getMonthlyBenefitUsage(user.id),
    db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, user.id)).limit(1),
  ]);

  const [urls, promocoesPorEspaco, contagemPorEspaco, resumo, renovacoes, repasses, reputacao] = await Promise.all([
    signImagePaths(spaces.map((s) => s.coverPath).filter(Boolean) as string[]),
    getActivePromotionsForSpaces(spaces.map((s) => s.id)),
    getSpaceBookingCounts(user.id, spaces.filter((s) => s.status !== 'draft').map((s) => s.id)),
    getOwnerOverview(user.id),
    listUpcomingRenewals(user.id, 5),
    getOwnerPayoutSummary(user.id),
    getRatingSummaries([user.id], 'renter_to_space'),
  ]);
  const total = Object.values(contagem).reduce((a, b) => a + b, 0);
  const minhaNota = reputacao.get(user.id);
  const notaTexto = minhaNota ? ratingSummaryLabel(minhaNota.average, minhaNota.count) : null;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <OwnerSubnav active="espacos" />

        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Meus espaços</h1>
            <p className="text-[var(--content-muted)]">
              {total === 0
                ? 'Você ainda não tem nenhum anúncio.'
                : `${total} ${total === 1 ? 'anúncio' : 'anúncios'} no total.`}
            </p>
          </div>
          <Link
            href="/anunciar"
            className="shrink-0 inline-flex items-center gap-2 h-11 px-4 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Novo espaço</span>
          </Link>
        </header>

        {total > 0 && (
          <section aria-labelledby="resumo-painel" className="rounded-[var(--radius-card)] border" data-testid="painel-proprietario">
            <h2 id="resumo-painel" className="sr-only">Resumo dos seus aluguéis</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4 [&>div]:p-4 [&>div]:border-b sm:[&>div]:border-b-0 [&>div:nth-child(odd)]:border-r sm:[&>div]:border-r sm:[&>div:last-child]:border-r-0 [&>div:nth-last-child(-n+2)]:border-b-0">
              <Numero
                rotulo="Solicitações pendentes"
                valor={String(resumo.pendingRequests)}
                href={resumo.pendingRequests > 0 ? '/meus-espacos/solicitacoes?filtro=pendentes' : undefined}
                apoio={resumo.awaitingPayment > 0 ? `${resumo.awaitingPayment} aguardando pagamento` : undefined}
              />
              <Numero
                rotulo="Locações ativas"
                valor={String(resumo.activeRentals)}
                href={resumo.activeRentals > 0 ? '/meus-espacos/solicitacoes?filtro=andamento' : undefined}
                apoio={resumo.pastDue > 0 ? `${resumo.pastDue} com pagamento pendente` : undefined}
              />
              <Numero
                rotulo="Vagas livres"
                valor={resumo.slotsOffered > 0 ? `${resumo.slotsAvailable} de ${resumo.slotsOffered}` : '—'}
                apoio="nos anúncios publicados"
              />
              <Numero
                rotulo="Você recebe por mês"
                valor={formatBRL(resumo.monthlyPayoutCents)}
                apoio="das locações ativas, já com a taxa descontada"
                href="/meus-espacos/financeiro"
              />
            </dl>
            {(notaTexto || repasses.settledCents > 0 || repasses.pendingCents > 0) && (
              <p className="border-t px-4 py-2.5 text-[0.8125rem] text-[var(--content-muted)]">
                {[
                  notaTexto ? `Avaliação como proprietário: ${notaTexto}` : null,
                  repasses.settledCents > 0 ? `Já recebido: ${formatBRL(repasses.settledCents)}` : null,
                  repasses.pendingCents > 0 ? `A receber: ${formatBRL(repasses.pendingCents)}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </section>
        )}

        {renovacoes.length > 0 && (
          <section aria-labelledby="renovacoes-titulo" className="space-y-2">
            <h2 id="renovacoes-titulo" className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
              Próximos vencimentos
            </h2>
            <ul className="divide-y rounded-[var(--radius-card)] border" data-testid="proximos-vencimentos">
              {renovacoes.map((r) => (
                <li key={r.bookingId} className="flex items-center justify-between gap-3 px-4 py-3 text-[0.875rem]">
                  <div className="min-w-0">
                    <Link href={`/reservas/${r.bookingId}`} className="font-medium truncate block hover:underline">
                      {r.spaceTitle}
                    </Link>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">
                      {r.pastDue ? 'Pagamento pendente · ' : ''}
                      {r.renterName ? `${r.renterName} · ` : ''}vence em {formatDateShort(r.dueDate)}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums font-medium">{formatBRL(r.ownerPayoutCents)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {total > 0 && (
          <nav aria-label="Filtrar por situação" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {FILTROS.map((f) => {
              const n = f.status ? f.status.reduce((a, s) => a + (contagem[s] ?? 0), 0) : total;
              const selecionado = f.key === ativo.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === 'todos' ? '/meus-espacos' : `/meus-espacos?filtro=${f.key}`}
                  aria-current={selecionado ? 'page' : undefined}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-pill)]',
                    'text-[0.875rem] border transition-colors',
                    selecionado
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                  )}
                >
                  {f.label}
                  <span className="tabular-nums text-[0.75rem] opacity-70">{n}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {spaces.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <p className="font-medium">
              {total === 0 ? 'Nenhum anúncio ainda' : `Nenhum anúncio em "${ativo.label.toLowerCase()}"`}
            </p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              {total === 0
                ? 'Uma garagem parada, um cômodo sem uso, um galpão ocioso — anunciar leva poucos minutos e é gratuito.'
                : 'Tente outro filtro para ver seus outros anúncios.'}
            </p>
            {total === 0 && (
              <Link
                href="/anunciar"
                className="inline-flex items-center gap-2 h-11 px-5 mt-2 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
              >
                <Plus className="size-4" aria-hidden />
                Anunciar meu primeiro espaço
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {spaces.map((s) => {
              const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft!;
              const url = s.coverPath ? urls.get(s.coverPath) : null;
              const promocao = promocoesPorEspaco.get(s.id) ?? null;

              const movimento = contagemPorEspaco.get(s.id);
              return (
                <li key={s.id} className="rounded-[var(--radius-card)] border overflow-hidden">
                  <div className="flex gap-4 p-3 sm:p-4">
                    <div className="relative shrink-0 size-20 sm:size-24 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
                      {url ? (
                        <Image src={url} alt="" fill sizes="96px" className="object-cover" unoptimized />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <ImageOff className="size-5 text-[var(--content-subtle)]" aria-hidden />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-medium truncate">
                          {s.title?.trim() || `${spaceTypeLabel(s.type as SpaceTypeKey)} sem título`}
                        </h2>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {promocao && <PromotionBadge type={promocao.type} size="xs" data-testid="promocao-badge" />}
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </span>
                      </div>

                      <p className="text-[0.875rem] text-[var(--content-muted)] truncate">
                        {spaceTypeLabel(s.type as SpaceTypeKey)}
                        {s.city && ` · ${s.district ? `${s.district}, ` : ''}${s.city}`}
                      </p>

                      <p className="text-[0.875rem]">
                        {s.status === 'draft' ? (
                          <span className="text-[var(--content-muted)]">
                            Etapa {s.draftStep} de {TOTAL_STEPS}
                            {s.photoCount > 0 && ` · ${s.photoCount} ${s.photoCount === 1 ? 'foto' : 'fotos'}`}
                          </span>
                        ) : (
                          <PriceTag summary={s} />
                        )}
                      </p>
                      {s.status !== 'draft' && (
                        <p className="text-[0.8125rem] text-[var(--content-muted)]" data-testid="resumo-vagas">
                          {[
                            availabilityText(s.type, s.quantityAvailable, s.quantityOffered),
                            movimento?.pending ? `${movimento.pending} ${movimento.pending === 1 ? 'solicitação pendente' : 'solicitações pendentes'}` : null,
                            movimento?.active ? `${movimento.active} ${movimento.active === 1 ? 'locação ativa' : 'locações ativas'}` : null,
                          ].filter(Boolean).join(' · ')}
                          {totalPlaceText(s.type, s.quantityOffered, s.quantityTotal) && ` · ${totalPlaceText(s.type, s.quantityOffered, s.quantityTotal)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    <SpaceCardActions
                      spaceId={s.id} slug={s.slug} title={s.title} status={s.status} draftStep={s.draftStep}
                      activePromotion={promocao} benefitUsage={benefitUsage} cpfSugerido={perfil?.cpfCnpj}
                    />
                  </div>
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

/** Um número do painel: rótulo pequeno, valor grande e, se houver, uma linha de apoio. Link só quando leva a algum lugar útil. */
function Numero({ rotulo, valor, apoio, href }: { rotulo: string; valor: string; apoio?: string; href?: string }) {
  const conteudo = (
    <>
      <dt className="text-[0.75rem] text-[var(--content-subtle)]">{rotulo}</dt>
      <dd className="text-[1.375rem] font-semibold tabular-nums leading-tight mt-0.5">{valor}</dd>
      {apoio && <dd className="text-[0.75rem] text-[var(--content-muted)] mt-0.5 leading-snug">{apoio}</dd>}
    </>
  );
  return href ? (
    <div>
      <Link href={href} className="block -m-4 p-4 hover:bg-[var(--surface-sunken)] transition-colors">{conteudo}</Link>
    </div>
  ) : (
    <div>{conteudo}</div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { getCurrentUser } from '@/lib/auth/dal';
import { getFavoriteState } from '@/lib/favorites/queries';
import { getViewerActiveBookingForSpace } from '@/lib/bookings/queries';
import { bookingStatusLabel } from '@/lib/bookings/format';
import { listReviewsForSpace, parsePage } from '@/lib/reviews/queries';
import { getReputation } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import { getSpaceAvailability, earliestOpenEndedStart } from '@/lib/spaces/availability';
import { getUserWaitlistEntry } from '@/lib/waitlist/queries';
import { getPublicPriceHistory } from '@/lib/spaces/price-history';
import { formatBookingDate as formatarData } from '@/lib/bookings/format';
import { serverEnv, isIntegrationConfigured } from '@/lib/env';
import { unitNounFor, type SpaceTypeKey } from '@/lib/spaces/types';
import { settingInt } from '@/lib/settings';
import { getSpaceUnitGroups } from '@/lib/rentals/queries';
import { operatingHoursLabel, temporaryDurationOptions } from '@/lib/rentals/pricing';
import { addDaysToDate } from '@/lib/rentals/time';
import { getOwnerPayoutAccount, getRenterBillingProfile } from '@/lib/payments/queries';
import { RentalPanel } from '@/components/rentals/rental-panel';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SpacePreview } from '@/components/anunciar/space-preview';
import { AreaMap } from '@/components/map/area-map';
import { PersonTrustCard } from '@/components/profile/person-trust-card';
import { RatingSummaryLine } from '@/components/reviews/rating-summary';
import { Pager } from '@/components/ui/pager';
import { ReportDialog } from '@/components/safety/report-dialog';
import { ProtectionNotice } from '@/components/safety/protection-notice';
import { VisitChecklist } from '@/components/safety/visit-checklist';
import { FavoriteButton } from '@/components/favorites/favorite-button';
import { PriceAlertToggle } from '@/components/favorites/price-alert-toggle';
import { ShareButton } from '@/components/espacos/share-button';
import { ReviewsList } from '@/components/reviews/reviews-list';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { WaitlistPanel } from '@/components/waitlist/waitlist-panel';
import { PriceHistory } from '@/components/espacos/price-history';
import { PublicAvailability } from '@/components/calendar/public-availability';
import { ViewTracker } from '@/components/analytics/track';
import { SimilarSpaces } from '@/components/espacos/similar-spaces';
import { listSimilarSpaces } from '@/lib/spaces/similar';
import { similarTypes } from '@/lib/spaces/similar-rank';
import { listUserFavoriteIds } from '@/lib/favorites/queries';
import { todayInSaoPaulo } from '@/lib/dates';
import { sharePreviewDescription } from '@/lib/spaces/share-preview';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

/** Compartilhar/Favoritar: mais compactos no celular, para caberem lado a lado. */
const ACAO_COMPACTA = 'h-10 px-3 text-[0.875rem] sm:h-11 sm:px-4 sm:text-[0.9375rem]';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const space = await getPublicSpaceBySlug(slug);
  if (!space) return { title: 'Espaço não encontrado' };

  // Prévia do link (WhatsApp, redes): tipo, preço e localização GERAL. Tudo
  // sai de `getPublicSpaceBySlug`, que nem seleciona o endereço.
  const descricao = sharePreviewDescription(space);
  const url = `${serverEnv.NEXT_PUBLIC_SITE_URL}/espacos/${space.slug}`;

  return {
    title: space.title,
    description: descricao,
    alternates: { canonical: url },
    // A imagem em si vem do arquivo opengraph-image.tsx desta mesma rota —
    // o Next liga isso sozinho pela convenção de arquivo, sem precisar
    // listar `images` aqui. O que fica explícito é o resto do cartão.
    openGraph: { title: space.title, description: descricao, url, type: 'website' },
    twitter: { card: 'summary_large_image', title: space.title, description: descricao },
  };
}

/**
 * Página pública do anúncio.
 *
 * Tudo que aparece aqui vem de `getPublicSpaceBySlug`, que não seleciona rua,
 * número, complemento nem a coordenada exata. Um erro de template não tem como
 * vazar o endereço: o dado nem chega neste arquivo.
 */
export default async function EspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ avaliacoes?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [space, viewer] = await Promise.all([getPublicSpaceBySlug(slug), getCurrentUser()]);

  if (!space) notFound();

  const isOwner = viewer?.id === space.ownerId;
  const paginaAvaliacoes = parsePage(sp.avaliacoes);

  const [estadoFavorito, existingBooking, reviewsPage, ownerReputation, ownerResponse, disponibilidade, entradaEspera, historicoPreco, semelhantes, favoritosIds] = await Promise.all([
    viewer ? getFavoriteState(viewer.id, space.id) : Promise.resolve(null),
    viewer && !isOwner ? getViewerActiveBookingForSpace(space.id, viewer.id) : Promise.resolve(null),
    listReviewsForSpace(space.id, { page: paginaAvaliacoes }),
    space.owner ? getReputation(space.owner.id) : Promise.resolve(null),
    space.owner ? getOwnerResponseStats(space.owner.id) : Promise.resolve(null),
    getSpaceAvailability(space.id),
    viewer && !isOwner ? getUserWaitlistEntry(space.id, viewer.id) : Promise.resolve(null),
    getPublicPriceHistory(space.id, space.publishedAt),
    // Fase 23: parecidos e disponíveis agora (o dono não precisa ver).
    isOwner
      ? Promise.resolve([])
      : listSimilarSpaces(
          {
            id: space.id,
            type: space.type,
            priceMonthlyCents: space.priceMonthlyCents,
            city: space.city,
            district: space.district,
            approxLat: space.approxLat,
            approxLng: space.approxLng,
            featureKeys: space.features.map((f) => f.key),
          },
          { availableNow: true, limit: 4 },
        ),
    viewer && !isOwner ? listUserFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  // Parte 12: unidades, grupos e o que dá para alugar agora.
  const [grupos, contaDoDono, cobrancaDoLocatario, minCharge, holdMinutes, maxAdvanceDays, renterFeeBps] = await Promise.all([
    getSpaceUnitGroups(space.id),
    getOwnerPayoutAccount(space.ownerId),
    viewer && !isOwner ? getRenterBillingProfile(viewer.id) : Promise.resolve(null),
    settingInt('booking.min_rent_cents', 3500),
    settingInt('rental.hold_minutes', 15),
    settingInt('rental.max_advance_days', 30),
    settingInt('fees.renter_fee_bps', 300),
  ]);
  const nomeUnidade = unitNounFor(space.type);
  const reservaveis = grupos
    .filter((g) => g.rules.allowsTemporary)
    .map((g) => ({
      id: g.id,
      name: g.name,
      hoursLabel: operatingHoursLabel(g.rules),
      durations: temporaryDurationOptions(g.rules, minCharge),
      availableNow: g.totalUnits - g.occupiedNow,
      total: g.totalUnits,
      renewalAllowed: g.rules.renewalAllowed,
    }))
    .filter((g) => g.durations.length > 0);
  const bloqueioTemporario = !isIntegrationConfigured('payments')
    ? 'A reserva por tempo ainda não está ativa: os pagamentos da plataforma não foram configurados.'
    : !contaDoDono?.canReceive || !contaDoDono.providerWalletId
      ? 'A reserva por tempo fica disponível assim que o proprietário configurar o recebimento.'
      : null;
  const favorited = estadoFavorito != null;
  const hoje = todayInSaoPaulo();
  // Fase 23: alugado, pausado ou com reserva vigente — a página abre, mas não
  // convida a solicitar; oferece a lista de espera.
  const disponivel = disponibilidade?.openForRequests ?? false;
  const motivoIndisponivel =
    space.status === 'paused'
      ? 'O proprietário pausou este anúncio por enquanto.'
      : `Todas as ${unitNounFor(space.type).plural} estão alugadas por mês. Como o aluguel mensal não tem data para terminar, não há previsão de quando uma fica livre.`;

  // Uma chamada só para assinar fotos do anúncio, foto do proprietário e de quem avaliou.
  const urls = await signImagePaths(
    [
      ...space.images.flatMap((i) => [i.storagePath, i.thumbPath]),
      space.owner?.avatarPath,
      ...reviewsPage.rows.map((r) => r.author.avatarPath),
      ...semelhantes.map((s) => s.coverPath),
    ].filter(Boolean) as string[],
  );
  const shareUrl = `${serverEnv.NEXT_PUBLIC_SITE_URL}/espacos/${space.slug}`;
  // Busca com critérios parecidos: dá para ver mais e salvar como alerta.
  const buscaParecida = `/espacos?${new URLSearchParams({
    tipos: similarTypes(space.type).join(','),
    ...(space.city ? { onde: space.city } : {}),
  }).toString()}`;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {/* Conta a visualização (só um contador do dia; o dono não conta). */}
        <ViewTracker spaceId={space.id} />
        {/*
          No celular a volta é só a seta (o nome continua para leitor de tela):
          com o texto, a linha passava da largura da tela abaixo de ~430 px.
        */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/espacos"
            aria-label="Todos os espaços"
            className="inline-flex items-center gap-1.5 shrink-0 min-h-10 min-w-10 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Todos os espaços</span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <ShareButton title={space.title} url={shareUrl} spaceId={space.id} className={ACAO_COMPACTA} />
            {!isOwner && (
              <FavoriteButton
                spaceId={space.id}
                initialFavorited={favorited}
                loggedIn={Boolean(viewer)}
                variant="page"
                className={ACAO_COMPACTA}
              />
            )}
          </div>
        </div>

        {!isOwner && estadoFavorito && (
          <div className="flex justify-end -mt-6">
            <PriceAlertToggle spaceId={space.id} initialEnabled={estadoFavorito.priceAlert} />
          </div>
        )}

        {isOwner && (
          <Alert tone="info" title="Este anúncio é seu">
            É assim que as outras pessoas veem.{' '}
            <Link href={`/anunciar/${space.id}/revisao`} className="underline underline-offset-2">
              Editar anúncio
            </Link>
          </Alert>
        )}

        <SpacePreview
          data={{
            type: space.type,
            title: space.title,
            description: space.description,
            district: space.district,
            city: space.city,
            state: space.state,
            sizeM2: space.sizeM2,
            ceilingHeightM: space.ceilingHeightM,
            priceMonthlyCents: space.priceMonthlyCents,
            tempFromCents: space.tempFromCents,
            tempFromUnits: space.tempFromUnits,
            tempFromUnit: space.tempFromUnit,
            availableFrom: space.availableFrom,
            accessHours: space.accessHours,
            allowedItems: space.allowedItems,
            forbiddenItems: space.forbiddenItems,
            rulesText: space.rulesText,
            photos: space.images.map((i) => ({
              id: i.id,
              url: urls.get(i.storagePath) ?? null,
              thumbUrl: i.thumbPath ? (urls.get(i.thumbPath) ?? null) : null,
              alt: i.alt,
            })),
            features: space.features,
          }}
          emptyPhotosText="O proprietário ainda não adicionou fotos deste espaço."
        />

        {/*
          "Tenho interesse" — a chamada principal da pagina. Se quem ve ja
          tem uma solicitacao em aberto pra este espaco, mostra o status dela
          em vez de deixar mandar outra as cegas.
        */}
        {!isOwner && (existingBooking || !disponivel) && (
          <section className="rounded-[var(--radius-card)] border-2 p-5 sm:p-6 space-y-3">
            {existingBooking ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[1.0625rem]">
                    {existingBooking.status === 'requested' || existingBooking.status === 'approved'
                      ? 'Sua solicitação'
                      : 'Seu aluguel'}
                  </p>
                  <Badge
                    tone={
                      existingBooking.status === 'requested' || existingBooking.status === 'past_due'
                        ? 'caution'
                        : 'positive'
                    }
                  >
                    {bookingStatusLabel(existingBooking.status)}
                  </Badge>
                </div>
                <p className="text-[0.875rem] text-[var(--content-muted)]">
                  Código {existingBooking.reference}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/reservas/${existingBooking.id}`}
                    className="inline-flex items-center gap-1.5 h-11 px-5 font-medium rounded-[var(--radius-field)] border hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    {existingBooking.status === 'requested' || existingBooking.status === 'approved'
                      ? 'Ver detalhes da solicitação'
                      : 'Ver meu aluguel'}
                  </Link>
                  <StartConversationButton spaceId={space.id} />
                </div>
              </>
            ) : !disponivel ? (
              <div className="space-y-3" data-testid="espaco-indisponivel">
                <div className="space-y-1">
                  <p className="font-semibold text-[1.0625rem]">Indisponível no momento</p>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{motivoIndisponivel}</p>
                </div>
                <WaitlistPanel
                  spaceId={space.id}
                  slug={space.slug}
                  loggedIn={Boolean(viewer)}
                  entry={
                    entradaEspera
                      ? {
                          status: entradaEspera.status,
                          joinedAtLabel: formatarData(entradaEspera.joinedAt),
                          notifiedAtLabel: entradaEspera.notifiedAt ? formatarData(entradaEspera.notifiedAt) : null,
                        }
                      : null
                  }
                />
                <p className="text-[0.875rem] text-[var(--content-muted)]">
                  {semelhantes.length > 0 ? (
                    <>
                      Encontramos espaços semelhantes próximos.{' '}
                      <a href="#semelhantes" className="font-medium text-[var(--accent)] underline underline-offset-4">
                        Ver alternativas
                      </a>
                    </>
                  ) : (
                    <>
                      Ainda não há espaços parecidos disponíveis por perto.{' '}
                      <Link href={buscaParecida} className="font-medium text-[var(--accent)] underline underline-offset-4">
                        Criar um alerta para quando aparecer
                      </Link>
                    </>
                  )}
                </p>
              </div>
            ) : null}
          </section>
        )}

        {/* Parte 12: unidades, regras e reserva (por tempo ou mensal). */}
        {(isOwner || disponivel) && grupos.length > 0 && (
          <RentalPanel
            slug={space.slug}
            spaceId={space.id}
            noun={nomeUnidade}
            groups={grupos}
            loggedIn={Boolean(viewer)}
            ownerView={isOwner}
            temporaryBookable={reservaveis}
            temporaryBlockedReason={bloqueioTemporario}
            monthlyOpen={disponivel && !(existingBooking && existingBooking.kind === 'continuous')}
            depositNote={space.depositEnabled ? 'O aluguel mensal exige caução de 1 mês de aluguel, devolvida ao final sem dano.' : null}
            temporaryFormProps={{
              needsCpf: !cobrancaDoLocatario,
              renterFeeBps,
              today: hoje,
              maxDate: addDaysToDate(hoje, maxAdvanceDays),
              holdMinutes,
              idempotencyKey: crypto.randomUUID(),
            }}
          />
        )}

        {/* Fase 23: ocupado → as alternativas vêm logo aqui, não no fim da página. */}
        {!isOwner && !disponivel && !existingBooking && semelhantes.length > 0 && (
          <SimilarSpaces
            spaces={semelhantes}
            coverUrls={urls}
            favoriteIds={favoritosIds}
            loggedIn={Boolean(viewer)}
            title="Espaços semelhantes disponíveis"
            description="Este espaço está indisponível no momento. Estes são parecidos, ficam perto e estão disponíveis agora."
            searchHref={buscaParecida}
          />
        )}

        {/* Fase 23: quando dá para começar, e as datas indisponíveis (sem motivo). Só para o mensal. */}
        {disponivel && disponibilidade && space.priceMonthlyCents != null && (
          <PublicAvailability
            today={hoje}
            earliestStart={earliestOpenEndedStart({
              today: hoje,
              availableFrom: disponibilidade.availableFrom,
              blocks: disponibilidade.upcomingBlocks,
            })}
            input={{
              today: hoje,
              availableFrom: disponibilidade.availableFrom,
              occupied: [],
              blocked: disponibilidade.upcomingBlocks,
            }}
          />
        )}

        {/* Fase 23: só aparece quando o preço mudou de verdade depois da publicação. */}
        {historicoPreco && <PriceHistory history={historicoPreco} />}

        {/* Sobre o proprietário + Por que confiar neste anúncio? — só sinais reais */}
        {space.owner && ownerReputation && (
          <PersonTrustCard
            role="owner"
            person={{
              ...space.owner,
              avatarUrl: space.owner.avatarPath ? (urls.get(space.owner.avatarPath) ?? null) : null,
            }}
            rating={ownerReputation.asOwner}
            responseStats={ownerResponse}
          />
        )}

        {/* Avaliações do espaço */}
        <section id="avaliacoes" aria-labelledby="avaliacoes-titulo" className="space-y-4 scroll-mt-20">
          <h2 id="avaliacoes-titulo" className="font-semibold text-[1.125rem]">
            Avaliações
          </h2>
          {space.ratingCount > 0 ? (
            <>
              <RatingSummaryLine average={space.ratingAvg} count={space.ratingCount} size="lg" />
              <h3 className="text-[0.9375rem] font-medium text-[var(--content-muted)]">
                Comentários de quem alugou este espaço
              </h3>
              <ReviewsList reviews={reviewsPage.rows} avatarUrls={urls} viewerId={viewer?.id ?? null} />
              <Pager
                page={reviewsPage.page}
                hasMore={reviewsPage.hasMore}
                href={(p) => `/espacos/${space.slug}${p > 1 ? `?avaliacoes=${p}` : ''}#avaliacoes`}
                label="avaliações"
              />
            </>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-dashed p-6 sm:p-8 text-center space-y-2">
              <p className="text-[0.9375rem]">Este espaço ainda não possui avaliações.</p>
              <p className="text-[0.8125rem] text-[var(--content-subtle)] max-w-sm mx-auto leading-relaxed">
                Depois da primeira locação concluída, os usuários poderão compartilhar sua experiência.
              </p>
            </div>
          )}
        </section>

        {/* Onde fica — área, não ponto */}
        {space.approxLat != null && space.approxLng != null && (
          <section className="space-y-3">
            <h2 className="font-semibold">Onde fica</h2>
            <p className="text-[var(--content-muted)]">
              {[space.district, space.city, space.state].filter(Boolean).join(', ')}
            </p>
            <AreaMap lat={space.approxLat} lng={space.approxLng} />
          </section>
        )}

        {!isOwner && (disponivel || existingBooking) && semelhantes.length > 0 && (
          <SimilarSpaces
            spaces={semelhantes}
            coverUrls={urls}
            favoriteIds={favoritosIds}
            loggedIn={Boolean(viewer)}
            title="Espaços semelhantes"
            description="Do mesmo tipo ou parecido, perto daqui, com preço próximo e disponíveis agora. Distâncias aproximadas a partir deste anúncio."
            searchHref={buscaParecida}
          />
        )}

        <ProtectionNotice variant="card" />

        <div className="rounded-[var(--radius-card)] border p-5 sm:p-6">
          <VisitChecklist spaceType={space.type as SpaceTypeKey} spaceId={space.id} />
        </div>

        {!isOwner && (
          <div className="flex justify-center pt-2">
            <ReportDialog
              targetType="space"
              targetId={space.id}
              targetLabel="este anúncio"
              triggerLabel="Denunciar este anúncio"
            />
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

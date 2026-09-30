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
import { formatBRL } from '@/lib/money';
import { serverEnv } from '@/lib/env';
import type { SpaceTypeKey } from '@/lib/spaces/types';
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
import { buttonVariants } from '@/components/ui/button';
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

  const local = [space.district, space.city].filter(Boolean).join(', ');
  const descricaoBase = space.description?.slice(0, 160)?.trim();
  // A localizacao aproximada entra na descricao do compartilhamento (alem de
  // ja aparecer, visualmente, na imagem gerada abaixo) — pedido explicito.
  const descricao = [descricaoBase, local ? `${local}.` : null].filter(Boolean).join(' — ') || undefined;
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

  const [estadoFavorito, existingBooking, reviewsPage, ownerReputation, ownerResponse, disponibilidade, entradaEspera, historicoPreco] = await Promise.all([
    viewer ? getFavoriteState(viewer.id, space.id) : Promise.resolve(null),
    viewer && !isOwner ? getViewerActiveBookingForSpace(space.id, viewer.id) : Promise.resolve(null),
    listReviewsForSpace(space.id, { page: paginaAvaliacoes }),
    space.owner ? getReputation(space.owner.id) : Promise.resolve(null),
    space.owner ? getOwnerResponseStats(space.owner.id) : Promise.resolve(null),
    getSpaceAvailability(space.id),
    viewer && !isOwner ? getUserWaitlistEntry(space.id, viewer.id) : Promise.resolve(null),
    getPublicPriceHistory(space.id, space.publishedAt),
  ]);
  const favorited = estadoFavorito != null;
  const hoje = new Date().toISOString().slice(0, 10);
  // Fase 23: alugado, pausado ou com reserva vigente — a página abre, mas não
  // convida a solicitar; oferece a lista de espera.
  const disponivel = disponibilidade?.openForRequests ?? false;
  const motivoIndisponivel =
    space.status === 'paused'
      ? 'O proprietário pausou este anúncio por enquanto.'
      : 'Este espaço está alugado. Como o aluguel é mensal e sem data para terminar, não há previsão de quando ele volta.';

  // Uma chamada só para assinar fotos do anúncio, foto do proprietário e de quem avaliou.
  const urls = await signImagePaths(
    [
      ...space.images.flatMap((i) => [i.storagePath, i.thumbPath]),
      space.owner?.avatarPath,
      ...reviewsPage.rows.map((r) => r.author.avatarPath),
    ].filter(Boolean) as string[],
  );
  const shareUrl = `${serverEnv.NEXT_PUBLIC_SITE_URL}/espacos/${space.slug}`;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
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
            <ShareButton title={space.title} url={shareUrl} className={ACAO_COMPACTA} />
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
        {!isOwner && (
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
              </div>
            ) : (
              <>
                <p className="font-semibold text-[1.0625rem]">Tenho interesse neste espaço</p>
                <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                  Envie uma solicitação de aluguel com o período que você precisa. O
                  proprietário recebe, avalia e decide se aceita antes de qualquer cobrança.
                </p>
                {space.depositEnabled && (
                  <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                    Este anúncio exige caução de {formatBRL(space.priceMonthlyCents)} (1 mês de
                    aluguel), devolvida ao final sem dano.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/espacos/${space.slug}/solicitar`} className={buttonVariants({ size: 'lg' })}>
                    Solicitar aluguel
                  </Link>
                  {viewer ? (
                    <StartConversationButton spaceId={space.id} />
                  ) : (
                    <Link
                      href={`/entrar?next=${encodeURIComponent(`/espacos/${space.slug}`)}`}
                      className={buttonVariants({ variant: 'secondary', size: 'lg' })}
                    >
                      Entrar para conversar
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Fase 23: quando dá para começar, e as datas indisponíveis (sem motivo). */}
        {disponivel && disponibilidade && (
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

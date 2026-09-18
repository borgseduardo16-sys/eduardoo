import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { getCurrentUser } from '@/lib/auth/dal';
import { isFavorited } from '@/lib/favorites/queries';
import { getViewerActiveBookingForSpace } from '@/lib/bookings/queries';
import { bookingStatusLabel } from '@/lib/bookings/format';
import { computeTrustProfile } from '@/lib/safety/trust';
import { serverEnv } from '@/lib/env';
import type { SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SpacePreview } from '@/components/anunciar/space-preview';
import { AreaMap } from '@/components/map/area-map';
import { TrustBadges } from '@/components/safety/trust-badges';
import { ReportDialog } from '@/components/safety/report-dialog';
import { ProtectionNotice } from '@/components/safety/protection-notice';
import { VisitChecklist } from '@/components/safety/visit-checklist';
import { FavoriteButton } from '@/components/favorites/favorite-button';
import { ShareButton } from '@/components/espacos/share-button';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const space = await getPublicSpaceBySlug(slug);
  if (!space) return { title: 'Espaço não encontrado' };

  const descricao = space.description?.slice(0, 160) ?? undefined;
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
export default async function EspacoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [space, viewer] = await Promise.all([getPublicSpaceBySlug(slug), getCurrentUser()]);

  if (!space) notFound();

  const isOwner = viewer?.id === space.ownerId;

  const [urls, favorited, existingBooking] = await Promise.all([
    signImagePaths(space.images.flatMap((i) => [i.storagePath, i.thumbPath].filter(Boolean) as string[])),
    viewer ? isFavorited(viewer.id, space.id) : Promise.resolve(false),
    viewer && !isOwner ? getViewerActiveBookingForSpace(space.id, viewer.id) : Promise.resolve(null),
  ]);
  const shareUrl = `${serverEnv.NEXT_PUBLIC_SITE_URL}/espacos/${space.slug}`;

  const trust = space.owner
    ? computeTrustProfile({
        createdAt: space.owner.createdAt,
        emailVerified: true, // conta ativa só existe com e-mail confirmado
        phoneVerified: Boolean(space.owner.phoneVerifiedAt),
        documentVerified: Boolean(space.owner.documentVerifiedAt),
        completedBookings: space.owner.completedBookingsCount,
        upheldReports: space.owner.upheldReportCount,
        ratingAvg: space.ratingAvg ? Number(space.ratingAvg) : null,
        ratingCount: space.ratingCount,
      })
    : null;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/espacos"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Todos os espaços
          </Link>

          <div className="flex items-center gap-2">
            <ShareButton title={space.title} url={shareUrl} />
            {!isOwner && (
              <FavoriteButton
                spaceId={space.id}
                initialFavorited={favorited}
                loggedIn={Boolean(viewer)}
                variant="page"
              />
            )}
          </div>
        </div>

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
                  <p className="font-semibold text-[1.0625rem]">Sua solicitação</p>
                  <Badge tone={existingBooking.status === 'approved' ? 'positive' : 'caution'}>
                    {bookingStatusLabel(existingBooking.status)}
                  </Badge>
                </div>
                <p className="text-[0.875rem] text-[var(--content-muted)]">
                  Código {existingBooking.reference}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/reservas"
                    className="inline-flex items-center gap-1.5 h-11 px-5 font-medium rounded-[var(--radius-field)] border hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    Ver em “Minhas reservas”
                  </Link>
                  <StartConversationButton spaceId={space.id} />
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-[1.0625rem]">Tenho interesse neste espaço</p>
                <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                  Envie uma solicitação de aluguel com o período que você precisa. O
                  proprietário recebe, avalia e decide se aceita antes de qualquer cobrança.
                </p>
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

        {/* Quem anuncia */}
        {space.owner && trust && (
          <section className="rounded-[var(--radius-card)] border p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-semibold">Quem anuncia</h2>
              <p className="text-[var(--content-muted)]">
                {space.owner.fullName ?? 'Proprietário'}
              </p>
            </div>
            <TrustBadges
              input={{
                createdAt: space.owner.createdAt,
                emailVerified: true,
                phoneVerified: Boolean(space.owner.phoneVerifiedAt),
                documentVerified: Boolean(space.owner.documentVerifiedAt),
                completedBookings: space.owner.completedBookingsCount,
                upheldReports: space.owner.upheldReportCount,
                ratingAvg: space.ratingAvg ? Number(space.ratingAvg) : null,
                ratingCount: space.ratingCount,
              }}
            />
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
            />
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { getCurrentUser } from '@/lib/auth/dal';
import { computeTrustProfile } from '@/lib/safety/trust';
import type { SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SpacePreview } from '@/components/anunciar/space-preview';
import { TrustBadges } from '@/components/safety/trust-badges';
import { ReportDialog } from '@/components/safety/report-dialog';
import { ProtectionNotice } from '@/components/safety/protection-notice';
import { VisitChecklist } from '@/components/safety/visit-checklist';
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

  return {
    title: space.title,
    description: space.description?.slice(0, 160) ?? undefined,
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

  const urls = await signImagePaths(space.images.map((i) => i.storagePath));
  const isOwner = viewer?.id === space.ownerId;

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
        <Link
          href="/espacos"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Todos os espaços
        </Link>

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
              id: i.id, url: urls.get(i.storagePath) ?? null, alt: i.alt,
            })),
            features: space.features,
          }}
        />

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

        {/* Alugar ainda não existe — dizemos isso em vez de mostrar um botão morto. */}
        <section className="rounded-[var(--radius-card)] border border-dashed p-5 text-center space-y-2">
          <p className="font-medium">Reserva ainda não disponível</p>
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed max-w-md mx-auto">
            A conversa com o proprietário e o pagamento pela plataforma entram nas próximas
            fases. Por enquanto os anúncios estão no ar para você conhecer o que existe na
            sua região.
          </p>
        </section>

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

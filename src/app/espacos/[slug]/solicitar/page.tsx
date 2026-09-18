import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ImageOff, MapPin } from 'lucide-react';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { getViewerActiveBookingForSpace } from '@/lib/bookings/queries';
import { requireUser } from '@/lib/auth/dal';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { settingInt } from '@/lib/settings';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { bookingStatusLabel } from '@/lib/bookings/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { RequestBookingForm } from '@/components/bookings/request-booking-form';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Solicitar aluguel' };
export const dynamic = 'force-dynamic';

export default async function SolicitarAluguelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser(`/espacos/${slug}/solicitar`);
  const space = await getPublicSpaceBySlug(slug);
  if (!space) notFound();

  const isOwner = space.ownerId === user.id;

  const [urls, existing, renterFeeBps, ownerFeeBps] = await Promise.all([
    signImagePaths(space.images.slice(0, 1).map((i) => i.thumbPath ?? i.storagePath).filter(Boolean) as string[]),
    isOwner ? Promise.resolve(null) : getViewerActiveBookingForSpace(space.id, user.id),
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
  ]);

  const capa = space.images[0];
  const capaUrl = capa ? urls.get(capa.thumbPath ?? capa.storagePath) : null;
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <Link
          href={`/espacos/${space.slug}`}
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar ao anúncio
        </Link>

        <div className="flex gap-4 p-4 rounded-[var(--radius-card)] border">
          <div className="relative shrink-0 size-20 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
            {capaUrl ? (
              <Image src={capaUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <ImageOff className="size-5 text-[var(--content-subtle)]" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              {spaceTypeLabel(space.type as SpaceTypeKey)}
            </p>
            <h1 className="font-semibold leading-snug truncate">{space.title}</h1>
            <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{[space.district, space.city].filter(Boolean).join(', ')}</span>
            </p>
            <p className="font-semibold tabular-nums">
              {formatBRL(space.priceMonthlyCents)}
              <span className="font-normal text-[var(--content-muted)] text-[0.875rem]"> /mês</span>
            </p>
          </div>
        </div>

        {isOwner ? (
          <Alert tone="info" title="Este anúncio é seu">
            Você não pode solicitar aluguel do seu próprio espaço.
          </Alert>
        ) : existing ? (
          <div className="rounded-[var(--radius-card)] border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <p className="font-medium">Você já tem uma solicitação para este espaço</p>
              <Badge tone={existing.status === 'approved' ? 'positive' : 'caution'}>
                {bookingStatusLabel(existing.status)}
              </Badge>
            </div>
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              Código {existing.reference}. Acompanhe o andamento na sua área de reservas.
            </p>
            <Link
              href="/reservas"
              className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              Ver em “Minhas reservas”
            </Link>
          </div>
        ) : (
          <RequestBookingForm
            spaceId={space.id}
            spaceTitle={space.title}
            monthlyRentCents={space.priceMonthlyCents}
            renterFeeBps={renterFeeBps}
            ownerFeeBps={ownerFeeBps}
            minStartDate={hoje}
          />
        )}
      </main>

      <SiteFooter />
    </>
  );
}

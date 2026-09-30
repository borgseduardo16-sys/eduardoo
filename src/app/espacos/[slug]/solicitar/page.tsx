import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ImageOff, MapPin } from 'lucide-react';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { getViewerActiveBookingForSpace } from '@/lib/bookings/queries';
import { getReputation } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import { getSpaceAvailability, earliestOpenEndedStart } from '@/lib/spaces/availability';
import { requireUser } from '@/lib/auth/dal';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { settingInt } from '@/lib/settings';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { bookingStatusLabel, formatBookingDate } from '@/lib/bookings/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { RequestBookingForm } from '@/components/bookings/request-booking-form';
import { PersonTrustCard } from '@/components/profile/person-trust-card';
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

  const [urls, existing, renterFeeBps, ownerFeeBps, ownerReputation, ownerResponse, disponibilidade] = await Promise.all([
    signImagePaths(
      [...space.images.slice(0, 1).map((i) => i.thumbPath ?? i.storagePath), space.owner?.avatarPath].filter(
        Boolean,
      ) as string[],
    ),
    isOwner ? Promise.resolve(null) : getViewerActiveBookingForSpace(space.id, user.id),
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
    space.owner ? getReputation(space.owner.id) : Promise.resolve(null),
    space.owner ? getOwnerResponseStats(space.owner.id) : Promise.resolve(null),
    getSpaceAvailability(space.id),
  ]);

  const capa = space.images[0];
  const capaUrl = capa ? urls.get(capa.thumbPath ?? capa.storagePath) : null;
  const hoje = new Date().toISOString().slice(0, 10);
  // Primeira data possível de verdade (Fase 23): "disponível a partir de" e
  // os bloqueios do calendário — o servidor confere de novo ao enviar.
  const inicioMinimo = earliestOpenEndedStart({
    today: hoje,
    availableFrom: disponibilidade?.availableFrom ?? null,
    blocks: disponibilidade?.upcomingBlocks ?? [],
  });
  const aberto = disponibilidade?.openForRequests ?? false;

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

        {/*
          Confiança no momento da decisão (Fase 21): quem é o proprietário e
          o que vale saber do espaço, antes de enviar — só dado real.
        */}
        {!isOwner && !existing && aberto && (
          <>
            <section aria-labelledby="antes-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
              <h2 id="antes-titulo" className="font-semibold">Antes de enviar</h2>
              <dl className="grid gap-3 sm:grid-cols-2 text-[0.875rem]">
                {space.availableFrom && (
                  <div>
                    <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Disponível a partir de</dt>
                    <dd>{formatBookingDate(space.availableFrom)}</dd>
                  </div>
                )}
                {space.accessHours && (
                  <div>
                    <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Horário de acesso</dt>
                    <dd className="break-words">{space.accessHours}</dd>
                  </div>
                )}
                {space.rulesText && (
                  <div className="sm:col-span-2">
                    <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Regras do espaço</dt>
                    <dd className="whitespace-pre-line break-words line-clamp-4">{space.rulesText}</dd>
                  </div>
                )}
              </dl>
              <Link
                href={`/espacos/${space.slug}`}
                className="inline-block text-[0.8125rem] text-[var(--accent)] underline underline-offset-4"
              >
                Ver fotos, características e regras completas
              </Link>
            </section>

            {space.owner && ownerReputation && (
              <section aria-label="Sobre este proprietário" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
                <h2 className="font-semibold">Sobre este proprietário</h2>
                <PersonTrustCard
                  role="owner"
                  compact
                  person={{
                    ...space.owner,
                    avatarUrl: space.owner.avatarPath ? (urls.get(space.owner.avatarPath) ?? null) : null,
                  }}
                  rating={ownerReputation.asOwner}
                  responseStats={ownerResponse}
                />
              </section>
            )}
          </>
        )}

        {space.depositEnabled && (
          <Alert tone="info" title={`Este anúncio exige caução de ${formatBRL(space.priceMonthlyCents)}`}>
            Equivale a 1 mês de aluguel, cobrada junto do primeiro pagamento se a solicitação for
            aceita. Devolvida integralmente ao fim do aluguel, sem dano registrado.
          </Alert>
        )}

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
              href={`/reservas/${existing.id}`}
              className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              Ver detalhes da solicitação
            </Link>
          </div>
        ) : !aberto ? (
          <Alert tone="warning" title="Este espaço não está disponível para solicitação agora">
            <p>
              {space.status === 'paused'
                ? 'O proprietário pausou o anúncio.'
                : 'Ele está alugado no momento.'}{' '}
              <Link href={`/espacos/${space.slug}`} className="underline underline-offset-2">
                Voltar ao anúncio
              </Link>{' '}
              para entrar na lista de espera.
            </p>
          </Alert>
        ) : (
          <>
            {inicioMinimo > hoje && (
              <Alert tone="info" title={`Disponível a partir de ${formatBookingDate(inicioMinimo)}`}>
                {(disponibilidade?.upcomingBlocks.length ?? 0) > 0
                  ? 'O proprietário bloqueou algumas datas no calendário. Como o aluguel é mensal e sem data para terminar, ele só pode começar depois do último bloqueio.'
                  : 'É a data a partir da qual o proprietário disponibilizou o espaço.'}
              </Alert>
            )}
            <RequestBookingForm
              spaceId={space.id}
              spaceTitle={space.title}
              monthlyRentCents={space.priceMonthlyCents}
              renterFeeBps={renterFeeBps}
              ownerFeeBps={ownerFeeBps}
              minStartDate={inicioMinimo}
            />
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

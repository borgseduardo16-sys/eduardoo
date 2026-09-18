import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarX, Heart, ImageOff } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listRenterBookings } from '@/lib/bookings/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { bookingStatusLabel, formatBookingDate } from '@/lib/bookings/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CancelBookingButton } from '@/components/bookings/cancel-booking-button';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Minhas reservas' };
export const dynamic = 'force-dynamic';

function ehAtiva(status: string) {
  return status === 'requested' || status === 'approved' || status === 'active' || status === 'past_due' || status === 'awaiting_payment';
}

export default async function ReservasPage() {
  const user = await requireUser('/reservas');
  const reservas = await listRenterBookings(user.id);
  const urls = await signImagePaths(reservas.map((r) => r.spaceCoverPath).filter(Boolean) as string[]);

  // Uma lista SO, ordenada com as ativas primeiro (sort e estavel, entao a
  // ordem original de cada grupo se mantem) — nao duas arrays/<ul> separadas
  // por status. Se uma reserva mudasse de lista quando o proprio cancelamento
  // muda o status dela, o item trocaria de pai no React (de um <ul> pro
  // outro) e perderia a identidade mesmo com a mesma `key`, desmontando o
  // CancelBookingButton antes dele mostrar "Cancelado." — a mesma armadilha
  // do RespondRequestActions, so que causada pela lista, nao por um `&&`.
  const reservasOrdenadas = [...reservas].sort((a, b) => Number(!ehAtiva(a.status)) - Number(!ehAtiva(b.status)));

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Minhas reservas</h1>
            <p className="text-[var(--content-muted)]">
              {reservas.length === 0
                ? 'Você ainda não solicitou nenhum espaço.'
                : `${reservas.length} ${reservas.length === 1 ? 'solicitação' : 'solicitações'} no total.`}
            </p>
          </div>
          <Link
            href="/favoritos"
            className="shrink-0 inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <Heart className="size-4" aria-hidden />
            Favoritos
          </Link>
        </header>

        {reservas.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <CalendarX className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Encontre um espaço e envie uma solicitação de aluguel — ela aparece aqui assim que enviada.
            </p>
            <Link
              href="/espacos"
              className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              Explorar espaços
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reservasOrdenadas.map((r, i) => {
              const ativa = ehAtiva(r.status);
              const inicioDoGrupo = i === 0 || ehAtiva(reservasOrdenadas[i - 1].status) !== ativa;
              return (
                <div key={r.id}>
                  {inicioDoGrupo && (
                    <h2 className={`text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)] pb-3${i > 0 ? ' pt-5' : ''}`}>
                      {ativa ? 'Em andamento' : 'Encerradas'}
                    </h2>
                  )}
                  <ReservaCard r={r} coverUrl={r.spaceCoverPath ? (urls.get(r.spaceCoverPath) ?? null) : null} />
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

type ReservaRow = Awaited<ReturnType<typeof listRenterBookings>>[number];

function ReservaCard({ r, coverUrl }: { r: ReservaRow; coverUrl: string | null }) {
  return (
    <div className="rounded-[var(--radius-card)] border p-4 space-y-3">
      <div className="flex gap-3">
        <div className="relative shrink-0 size-16 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <ImageOff className="size-4 text-[var(--content-subtle)]" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/espacos/${r.spaceSlug}`} className="font-medium truncate hover:underline block">
                {r.spaceTitle}
              </Link>
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                {spaceTypeLabel(r.spaceType as SpaceTypeKey)}
                {r.spaceCity && ` · ${[r.spaceDistrict, r.spaceCity].filter(Boolean).join(', ')}`}
              </p>
            </div>
            <Badge tone={
              r.status === 'approved' || r.status === 'active' ? 'positive'
              : r.status === 'requested' ? 'caution'
              : r.status === 'past_due' ? 'critical'
              : 'neutral'
            } className="shrink-0">
              {bookingStatusLabel(r.status)}
            </Badge>
          </div>
          <p className="text-[0.8125rem] text-[var(--content-muted)]">
            Código {r.reference} · a partir de {formatBookingDate(r.startDate)}
          </p>
          <p className="text-[0.9375rem] font-medium tabular-nums">
            {formatBRL(r.totalChargedCents)}
            <span className="font-normal text-[var(--content-muted)]"> /mês, se aceito</span>
          </p>
        </div>
      </div>

      {r.ownerResponse && r.status === 'rejected' && (
        <p className="text-[0.8125rem] text-[var(--content-subtle)]">Motivo do proprietário: {r.ownerResponse}</p>
      )}

      {r.status === 'approved' && (
        <Link href={`/reservas/${r.id}/pagar`} className={buttonVariants({ size: 'sm', className: 'w-fit' })}>
          Pagar agora
        </Link>
      )}

      <CancelBookingButton bookingId={r.id} status={r.status} label="Cancelar solicitação" />
    </div>
  );
}

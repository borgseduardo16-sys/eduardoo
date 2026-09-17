import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, MapPin, SlidersHorizontal } from 'lucide-react';
import { listPublishedSpaces } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, spaceTypeOptions, type SpaceTypeKey } from '@/lib/spaces/types';
import { SpacesMap, type MapSpace } from '@/components/map/spaces-map';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Espaços disponíveis',
  description: 'Garagens, depósitos, galpões e salas disponíveis para alugar por mês.',
};

/** Sempre fresco: um anúncio recém-publicado precisa aparecer na hora. */
export const dynamic = 'force-dynamic';

export default async function EspacosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; cidade?: string }>;
}) {
  const { tipo, cidade } = await searchParams;

  const spaces = await listPublishedSpaces({ type: tipo, city: cidade, limit: 48 });
  const urls = await signImagePaths(spaces.map((s) => s.coverPath).filter(Boolean) as string[]);

  const tipos = spaceTypeOptions();

  /*
   * Marcadores do mapa. Sai da MESMA consulta da lista, entao o mapa nunca
   * mostra um anuncio que a lista nao mostra. A coordenada e a aproximada:
   * `listPublishedSpaces` nao seleciona a exata.
   */
  const noMapa: MapSpace[] = spaces
    .filter((s) => s.approxLat != null && s.approxLng != null)
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      typeLabel: spaceTypeLabel(s.type as SpaceTypeKey),
      priceMonthlyCents: s.priceMonthlyCents,
      district: s.district,
      city: s.city,
      lat: s.approxLat as number,
      lng: s.approxLng as number,
    }));

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold">
            {tipo ? `${spaceTypeLabel(tipo as SpaceTypeKey)}s disponíveis` : 'Espaços disponíveis'}
            {cidade && ` em ${cidade}`}
          </h1>
          <p className="text-[var(--content-muted)]">
            {spaces.length === 0
              ? 'Nenhum espaço encontrado.'
              : `${spaces.length} ${spaces.length === 1 ? 'espaço' : 'espaços'} para alugar por mês.`}
          </p>
        </header>

        <nav aria-label="Filtrar por tipo" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <Link
            href="/espacos"
            aria-current={!tipo ? 'page' : undefined}
            className={cn(
              'shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
              !tipo
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
            )}
          >
            Todos
          </Link>
          {tipos.map((t) => (
            <Link
              key={t.value}
              href={`/espacos?tipo=${t.value}`}
              aria-current={tipo === t.value ? 'page' : undefined}
              className={cn(
                'shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                tipo === t.value
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                  : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {noMapa.length > 0 && <SpacesMap spaces={noMapa} />}

        {spaces.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 sm:p-16 text-center space-y-3">
            <SlidersHorizontal className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              {tipo || cidade
                ? 'Tente remover os filtros para ver todos os espaços disponíveis.'
                : 'Ainda não há espaços publicados. Se você tem um espaço parado, pode ser o primeiro.'}
            </p>
            <Link
              href={tipo || cidade ? '/espacos' : '/anunciar'}
              className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              {tipo || cidade ? 'Ver todos os espaços' : 'Anunciar meu espaço'}
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((s) => {
              const url = s.coverPath ? urls.get(s.coverPath) : null;
              return (
                <li key={s.id}>
                  <Link href={`/espacos/${s.slug}`} className="group block space-y-3">
                    <div className="relative aspect-[4/3] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border">
                      {url ? (
                        <Image
                          src={url} alt="" fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <ImageOff className="size-6 text-[var(--content-subtle)]" aria-hidden />
                        </div>
                      )}
                      {s.photoCount > 1 && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-[var(--radius-pill)] bg-black/55 text-white text-[0.6875rem] tabular-nums">
                          {s.photoCount} fotos
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--accent)]">
                        {spaceTypeLabel(s.type as SpaceTypeKey)}
                      </p>
                      <h2 className="font-medium leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                        {s.title}
                      </h2>
                      <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {[s.district, s.city].filter(Boolean).join(', ')}
                        </span>
                      </p>
                      <p className="pt-0.5">
                        <span className="font-semibold tabular-nums">
                          {formatBRL(s.priceMonthlyCents)}
                        </span>
                        <span className="text-[var(--content-muted)] text-[0.875rem]"> /mês</span>
                      </p>
                    </div>
                  </Link>
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

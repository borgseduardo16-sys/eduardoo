import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { HeartOff, ImageOff, MapPin } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listUserFavoriteSpaces } from '@/lib/favorites/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { FavoriteButton } from '@/components/favorites/favorite-button';

export const metadata: Metadata = { title: 'Meus favoritos' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  paused: 'Pausado pelo anunciante',
  rented: 'Alugado no momento',
  archived: 'Não está mais disponível',
  draft: 'Não está mais disponível',
  removed: 'Não está mais disponível',
};

export default async function FavoritosPage() {
  const user = await requireUser('/favoritos');
  const favoritos = await listUserFavoriteSpaces(user.id);

  const urls = await signImagePaths(favoritos.map((f) => f.coverPath).filter(Boolean) as string[]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold">Meus favoritos</h1>
          <p className="text-[var(--content-muted)]">
            {favoritos.length === 0
              ? 'Você ainda não salvou nenhum espaço.'
              : `${favoritos.length} ${favoritos.length === 1 ? 'espaço salvo' : 'espaços salvos'}.`}
          </p>
        </header>

        {favoritos.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 sm:p-16 text-center space-y-3">
            <HeartOff className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Toque no coração de um anúncio para guardá-lo aqui e comparar depois.
            </p>
            <Link
              href="/espacos"
              className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              Explorar espaços
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favoritos.map((f) => {
              const url = f.coverPath ? urls.get(f.coverPath) : null;
              const indisponivel = f.status !== 'published';
              return (
                <li key={f.id}>
                  <div className="group block space-y-3">
                    <Link href={`/espacos/${f.slug}`} className="block">
                      <div className="relative aspect-[4/3] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border">
                        {url ? (
                          <Image
                            src={url} alt="" fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className={indisponivel ? 'object-cover opacity-50' : 'object-cover transition-transform duration-300 group-hover:scale-[1.02]'}
                            unoptimized
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center">
                            <ImageOff className="size-6 text-[var(--content-subtle)]" aria-hidden />
                          </div>
                        )}
                        {indisponivel && (
                          <span className="absolute top-2 left-2 px-2 py-1 rounded-[var(--radius-pill)] bg-black/70 text-white text-[0.6875rem] font-medium">
                            {STATUS_LABEL[f.status] ?? 'Indisponível'}
                          </span>
                        )}
                        <span className="absolute top-2 right-2">
                          <FavoriteButton spaceId={f.id} initialFavorited loggedIn />
                        </span>
                      </div>
                    </Link>

                    <Link href={`/espacos/${f.slug}`} className="block space-y-1">
                      <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--accent)]">
                        {spaceTypeLabel(f.type as SpaceTypeKey)}
                      </p>
                      <h2 className="font-medium leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                        {f.title}
                      </h2>
                      <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{[f.district, f.city].filter(Boolean).join(', ')}</span>
                      </p>
                      <p className="pt-0.5">
                        <span className="font-semibold tabular-nums">{formatBRL(f.priceMonthlyCents)}</span>
                        <span className="text-[var(--content-muted)] text-[0.875rem]"> /mês</span>
                      </p>
                    </Link>
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

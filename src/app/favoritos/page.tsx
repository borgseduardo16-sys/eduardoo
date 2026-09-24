import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { HeartOff, ImageOff, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listUserFavoriteSpaces, type FavoriteSpace } from '@/lib/favorites/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { PromotionBadge } from '@/components/promotions/promotion-badge';
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

  // Separado de proposito (pedido explicito): quem esta comparando opcoes
  // quer ver primeiro o que ainda da pra reservar.
  const disponiveis = favoritos.filter((f) => f.status === 'published');
  const indisponiveis = favoritos.filter((f) => f.status !== 'published');

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
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
          <>
            {disponiveis.length > 0 && (
              <section className="space-y-4">
                {indisponiveis.length > 0 && (
                  <h2 className="text-[0.9375rem] font-medium text-[var(--content-muted)]">
                    Disponíveis ({disponiveis.length})
                  </h2>
                )}
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {disponiveis.map((f) => (
                    <FavoriteCard key={f.id} favorito={f} coverUrl={f.coverPath ? (urls.get(f.coverPath) ?? null) : null} />
                  ))}
                </ul>
              </section>
            )}

            {indisponiveis.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-[0.9375rem] font-medium text-[var(--content-muted)]">
                  Indisponíveis ({indisponiveis.length})
                </h2>
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {indisponiveis.map((f) => (
                    <FavoriteCard key={f.id} favorito={f} coverUrl={f.coverPath ? (urls.get(f.coverPath) ?? null) : null} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function FavoriteCard({ favorito: f, coverUrl }: { favorito: FavoriteSpace; coverUrl: string | null }) {
  const indisponivel = f.status !== 'published';
  const precoMudou = f.priceCentsAtFavorite != null && f.priceCentsAtFavorite !== f.priceMonthlyCents;
  const subiu = precoMudou && f.priceMonthlyCents > (f.priceCentsAtFavorite ?? 0);

  return (
    <li>
      <div className="group block space-y-3">
        <Link href={`/espacos/${f.slug}`} className="block">
          <div className="relative aspect-[4/3] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border">
            {coverUrl ? (
              <Image
                src={coverUrl} alt="" fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className={indisponivel ? 'object-cover opacity-50' : 'object-cover transition-transform duration-300 group-hover:scale-[1.02]'}
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <ImageOff className="size-6 text-[var(--content-subtle)]" aria-hidden />
              </div>
            )}
            {indisponivel ? (
              <span className="absolute top-2 left-2 px-2 py-1 rounded-[var(--radius-pill)] bg-black/70 text-white text-[0.6875rem] font-medium">
                {STATUS_LABEL[f.status] ?? 'Indisponível'}
              </span>
            ) : (
              f.promotionType && (
                <span className="absolute top-2 left-2">
                  <PromotionBadge type={f.promotionType} size="xs" />
                </span>
              )
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
          {precoMudou && (
            <p
              className={
                'flex items-center gap-1 text-[0.8125rem] font-medium ' +
                (subiu ? 'text-[var(--color-caution)]' : 'text-[var(--color-positive)]')
              }
            >
              {subiu ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
              O preço mudou — era {formatBRL(f.priceCentsAtFavorite!)} quando você favoritou.
            </p>
          )}
        </Link>
      </div>
    </li>
  );
}

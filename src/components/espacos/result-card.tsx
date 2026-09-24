import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, MapPin } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { formatDistance } from '@/lib/spaces/format';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { FavoriteButton } from '@/components/favorites/favorite-button';
import { PromotionBadge } from '@/components/promotions/promotion-badge';
import type { PublicSpace } from '@/lib/spaces/queries';

/**
 * Card de resultado da busca.
 *
 * Só mostra o que existe de verdade no banco: nenhuma nota, nenhuma
 * quantidade de vaga inventada. `featureLabels` vem vazio quando o anúncio
 * não marcou característica nenhuma, e nesse caso a linha de características
 * simplesmente não aparece — em vez de um "—" ou um placeholder genérico.
 */
export function ResultCard({
  space,
  coverUrl,
  favorited,
  loggedIn,
}: {
  space: PublicSpace;
  coverUrl: string | null;
  favorited: boolean;
  loggedIn: boolean;
}) {
  return (
    <li data-testid="resultado-card" data-space-id={space.id}>
      <Link href={`/espacos/${space.slug}`} className="group block space-y-3">
        <div className="relative aspect-[4/3] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border">
          {coverUrl ? (
            <Image
              src={coverUrl} alt="" fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <ImageOff className="size-6 text-[var(--content-subtle)]" aria-hidden />
            </div>
          )}

          {space.photoCount > 1 && (
            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-[var(--radius-pill)] bg-black/55 text-white text-[0.6875rem] tabular-nums">
              {space.photoCount} fotos
            </span>
          )}

          {(space.promotionType || space.distanceMeters != null) && (
            <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
              {space.promotionType && (
                <PromotionBadge type={space.promotionType} size="xs" data-testid="resultado-promocao" />
              )}
              {space.distanceMeters != null && (
                <span
                  data-testid="resultado-distancia"
                  className="px-2 py-0.5 rounded-[var(--radius-pill)] bg-[var(--surface)]/90 backdrop-blur-sm text-[0.6875rem] font-medium"
                >
                  ≈ {formatDistance(space.distanceMeters)}
                </span>
              )}
            </span>
          )}

          <span className="absolute top-2 right-2">
            <FavoriteButton spaceId={space.id} initialFavorited={favorited} loggedIn={loggedIn} />
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--accent)]">
            {spaceTypeLabel(space.type as SpaceTypeKey)}
          </p>
          <h2 className="font-medium leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
            {space.title}
          </h2>
          <p className="flex items-center gap-1 text-[0.875rem] text-[var(--content-muted)]">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{[space.district, space.city].filter(Boolean).join(', ')}</span>
          </p>

          {space.featureLabels.length > 0 && (
            <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">
              {space.featureLabels.join(' • ')}
            </p>
          )}

          <p className="pt-0.5">
            <span className="font-semibold tabular-nums">{formatBRL(space.priceMonthlyCents)}</span>
            <span className="text-[var(--content-muted)] text-[0.875rem]"> /mês</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

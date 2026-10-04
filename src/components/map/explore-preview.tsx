'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ImageOff, MapPin, Star, X } from 'lucide-react';
import type { ExplorePin, MapPreview } from '@/lib/maps/explore';
import { formatBRL } from '@/lib/money';
import { availabilityText } from '@/lib/spaces/quantity';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { formatRating } from '@/lib/reviews/format';
import { formatDistance, haversineMeters, type LatLngLike } from '@/lib/maps/geo';
import { CategoryIcon, categoryLabel } from './category-icon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Prévia ao tocar num marcador: o que a pessoa precisa para decidir se abre o
 * anúncio — foto, título, valor por mês, nota, distância, vagas — e o botão
 * "Ver espaço". Os dados do marcador chegam na hora; a foto e as
 * características vêm de uma segunda chamada (URL assinada do bucket privado),
 * por isso o cartão aparece já preenchido e a imagem entra depois.
 *
 * Aviso de privacidade fixo: o ponto no mapa não é o endereço. Em tipos
 * comerciais o ponto é mais preciso, mas rua e número continuam escondidos até
 * a locação ser confirmada — vale para qualquer tipo.
 */
export function ExplorePreview({
  pin, preview, previewFailed, reference, referenceLabel, onClose, className,
}: {
  pin: ExplorePin;
  preview: MapPreview | null;
  previewFailed: boolean;
  reference: LatLngLike;
  referenceLabel: string;
  onClose: () => void;
  className?: string;
}) {
  const nota = pin.ratingCount > 0 ? formatRating(pin.ratingAvg) : null;
  const distancia = formatDistance(haversineMeters(reference, { lat: pin.lat, lng: pin.lng }));
  const local = preview ? [preview.district, preview.city].filter(Boolean).join(', ') : '';

  return (
    <section
      aria-label={`Prévia: ${pin.title}`}
      data-testid="previa-espaco"
      className={cn(
        'rounded-[var(--radius-card)] border bg-[var(--surface)] shadow-[var(--shadow-raised)] p-3 flex gap-3',
        className,
      )}
    >
      <div className="relative shrink-0 size-24 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
        {preview?.coverUrl ? (
          <Image src={preview.coverUrl} alt="" fill sizes="96px" className="object-cover" unoptimized />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            {preview || previewFailed ? (
              <ImageOff className="size-5 text-[var(--content-subtle)]" aria-hidden />
            ) : (
              <span className="size-5 rounded-full border-2 border-[var(--content-subtle)] border-t-transparent animate-spin" aria-hidden />
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--accent)] min-w-0">
            <CategoryIcon category={pin.category} className="size-3.5 shrink-0" />
            <span className="truncate">{spaceTypeLabel(pin.type as SpaceTypeKey) || categoryLabel(pin.category)}</span>
          </p>
          <button
            type="button" onClick={onClose} aria-label="Fechar prévia" data-testid="fechar-previa"
            className="shrink-0 -mt-1.5 -mr-1.5 p-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <h3 className="font-medium leading-snug line-clamp-2 break-words text-[0.9375rem]">{pin.title}</h3>

        <p className="text-[0.9375rem]">
          {pin.priceMonthlyCents != null ? (
            <>
              <span className="font-semibold tabular-nums">{formatBRL(pin.priceMonthlyCents)}</span>
              <span className="text-[var(--content-muted)] text-[0.8125rem]"> /mês</span>
            </>
          ) : (
            <span className="text-[var(--content-muted)]">Sem preço definido</span>
          )}
        </p>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-[var(--content-muted)]">
          {nota ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-current text-[var(--color-caution)]" aria-hidden />
              <span className="tabular-nums">{nota}</span>
              <span className="tabular-nums">({pin.ratingCount})</span>
            </span>
          ) : (
            <span>Sem avaliações</span>
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            a {distancia} {referenceLabel === 'sua localização' ? 'de você' : `de ${referenceLabel}`}
          </span>
        </p>

        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          {availabilityText(pin.type, pin.quantityAvailable, pin.quantityOffered)}
          {local ? ` · ${local}` : ''}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {pin.promotion && <Badge tone="accent">Destaque</Badge>}
          {pin.outside && <Badge tone="neutral">Fora do raio</Badge>}
          <Link
            href={`/espacos/${pin.slug}`}
            data-testid="ver-espaco"
            className="ml-auto inline-flex items-center h-9 px-4 rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            Ver espaço
          </Link>
        </div>

        <p className="text-[0.6875rem] leading-snug text-[var(--content-subtle)]">
          O ponto no mapa não é o endereço. A rua e o número aparecem só depois da locação confirmada.
        </p>
      </div>
    </section>
  );
}

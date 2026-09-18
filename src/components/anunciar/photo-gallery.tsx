'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GalleryPhoto = { id: string; url: string | null; thumbUrl?: string | null; alt: string | null };

/**
 * Galeria de fotos com visualização em tamanho maior.
 *
 * Mostra a capa grande + até 4 miniaturas; se houver mais fotos, a última
 * miniatura ganha um "+N" e abre a mesma visualização — nunca escondemos
 * foto real que o proprietário enviou, só limitamos quantas aparecem de
 * cara na grade.
 *
 * Tocar em qualquer foto abre a visualização em tela cheia, com setas e
 * teclado para navegar entre TODAS as fotos (não só as que couberam na
 * grade) — "permitir abrir imagem, navegar entre imagens, visualizar em
 * tamanho maior" (Parte 3, seção 15).
 */
export function PhotoGallery({
  photos,
  title,
  emptyText = 'Sem fotos ainda',
}: {
  photos: GalleryPhoto[];
  title: string;
  emptyText?: string;
}) {
  const [aberto, setAberto] = useState<number | null>(null);

  const fechar = useCallback(() => setAberto(null), []);
  const anterior = useCallback(
    () => setAberto((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const proxima = useCallback(
    () => setAberto((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (aberto === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowLeft') anterior();
      if (e.key === 'ArrowRight') proxima();
    }
    document.addEventListener('keydown', onKey);
    // Trava o scroll do fundo enquanto a visualizacao esta aberta.
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
    };
  }, [aberto, fechar, anterior, proxima]);

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/10] rounded-[var(--radius-card)] border border-dashed grid place-items-center text-[0.875rem] text-[var(--content-subtle)]">
        <div className="flex flex-col items-center gap-2">
          <ImageOff className="size-5" aria-hidden />
          {emptyText}
        </div>
      </div>
    );
  }

  const capa = photos[0]!;
  const resto = photos.slice(1, 5);
  const restantes = photos.length - 5;

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAberto(0)}
          data-testid="galeria-capa"
          className="relative block w-full aspect-[16/10] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border"
        >
          {capa.url ? (
            <Image
              src={capa.url} alt={capa.alt ?? title}
              fill sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover" unoptimized priority
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[0.875rem] text-[var(--content-subtle)]">
              Foto indisponível
            </div>
          )}
        </button>

        {resto.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {resto.map((p, i) => {
              const ultima = i === resto.length - 1 && restantes > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAberto(i + 1)}
                  className="relative aspect-square rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border"
                >
                  {(p.thumbUrl ?? p.url) && (
                    <Image
                      src={(p.thumbUrl ?? p.url)!}
                      alt={p.alt ?? `Foto ${i + 2} de ${title}`}
                      fill sizes="160px" className="object-cover"
                      unoptimized
                    />
                  )}
                  {ultima && (
                    <span className="absolute inset-0 grid place-items-center bg-black/55 text-white font-medium text-[0.9375rem]">
                      +{restantes}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {aberto !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${title}`}
          data-testid="galeria-modal"
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}
        >
          <div className="flex items-center justify-between p-4 text-white shrink-0">
            <span data-testid="galeria-contador" className="text-[0.8125rem] tabular-nums">{aberto + 1} / {photos.length}</span>
            <button type="button" onClick={fechar} aria-label="Fechar" data-testid="galeria-fechar" className="p-2 -mr-2 hover:opacity-75">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center px-2 pb-4 min-h-0">
            {photos[aberto]!.url ? (
              <Image
                src={photos[aberto]!.url!}
                alt={photos[aberto]!.alt ?? `Foto ${aberto + 1} de ${title}`}
                fill
                sizes="100vw"
                className="object-contain"
                unoptimized
                priority
              />
            ) : (
              <p className="text-white/70 text-[0.875rem]">Foto indisponível</p>
            )}

            {photos.length > 1 && (
              <>
                <button
                  type="button" onClick={anterior} aria-label="Foto anterior"
                  data-testid="galeria-anterior"
                  className={cn(
                    'absolute left-2 sm:left-4 top-1/2 -translate-y-1/2',
                    'size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button" onClick={proxima} aria-label="Próxima foto"
                  data-testid="galeria-proxima"
                  className={cn(
                    'absolute right-2 sm:right-4 top-1/2 -translate-y-1/2',
                    'size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  <ChevronRight className="size-5" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

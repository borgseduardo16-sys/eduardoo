'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Star, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  uploadSpaceImageAction, deleteSpaceImageAction, reorderSpaceImagesAction,
} from '@/lib/storage/actions';
import { MAX_PHOTOS, MIN_PHOTOS_TO_PUBLISH } from '@/lib/spaces/schemas';
import { ACCEPT_ATTRIBUTE, MAX_IMAGE_BYTES, sniffImageType } from '@/lib/storage/images';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PhotoItem = { id: string; url: string | null; alt: string | null };

/**
 * Etapa 4: fotos.
 *
 * Cada foto sobe em uma requisição própria, e não todas de uma vez: numa
 * conexão de celular, mandar 10 fotos num pacote só significa que a falha de
 * uma perde as outras nove. Uma por vez também deixa o progresso visível.
 *
 * A validação de formato acontece nos dois lados. Aqui é só cortesia — evita
 * gastar o upload de um arquivo que o servidor vai recusar. Quem decide é o
 * servidor, que lê os bytes de verdade.
 */
export function PhotosForm({
  spaceId, initialPhotos,
}: {
  spaceId: string;
  initialPhotos: PhotoItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [uploading, setUploading] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);

    const restantes = MAX_PHOTOS - photos.length;
    const lote = Array.from(files).slice(0, restantes);

    if (files.length > restantes) {
      setError(`Você pode ter no máximo ${MAX_PHOTOS} fotos. Enviamos as ${restantes} primeiras.`);
    }

    setUploading(lote.length);

    for (const file of lote) {
      // Pré-checagem: não gasta upload com arquivo que será recusado.
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`"${file.name}" passa de 8 MB e não foi enviada.`);
        setUploading((n) => n - 1);
        continue;
      }
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!sniffImageType(head)) {
        setError(`"${file.name}" não é uma imagem JPG, PNG ou WEBP.`);
        setUploading((n) => n - 1);
        continue;
      }

      const fd = new FormData();
      fd.set('spaceId', spaceId);
      fd.set('file', file);

      const res = await uploadSpaceImageAction(fd);
      setUploading((n) => n - 1);

      if (!res.ok) {
        setError(res.message ?? 'Não foi possível enviar a foto.');
        break;
      }
    }

    if (inputRef.current) inputRef.current.value = '';
    startTransition(() => router.refresh());
  }

  async function remover(imageId: string) {
    setError(null);
    const antes = photos;
    setPhotos((p) => p.filter((x) => x.id !== imageId)); // some na hora

    const fd = new FormData();
    fd.set('spaceId', spaceId);
    fd.set('imageId', imageId);
    const res = await deleteSpaceImageAction(fd);

    if (!res.ok) {
      setPhotos(antes); // desfaz se o servidor recusou
      setError(res.message ?? 'Não foi possível remover a foto.');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function mover(index: number, direcao: -1 | 1) {
    const destino = index + direcao;
    if (destino < 0 || destino >= photos.length) return;

    const nova = [...photos];
    [nova[index], nova[destino]] = [nova[destino]!, nova[index]!];
    setPhotos(nova);

    const fd = new FormData();
    fd.set('spaceId', spaceId);
    for (const p of nova) fd.append('imageIds', p.id);

    const res = await reorderSpaceImagesAction(fd);
    if (!res.ok) {
      setPhotos(photos);
      setError(res.message ?? 'Não foi possível reordenar.');
    }
  }

  const podePublicar = photos.length >= MIN_PHOTOS_TO_PUBLISH;

  return (
    <div>
      {error && <Alert tone="warning" className="mb-5">{error}</Alert>}

      {/* Área de envio */}
      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 p-8 rounded-[var(--radius-card)]',
          'border border-dashed cursor-pointer text-center transition-colors',
          'hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]',
          photos.length >= MAX_PHOTOS && 'opacity-50 pointer-events-none',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={photos.length >= MAX_PHOTOS}
        />
        {uploading > 0 ? (
          <>
            <LoaderCircle className="size-6 animate-spin text-[var(--accent)]" aria-hidden />
            <span className="text-[0.9375rem] font-medium">
              Enviando {uploading} {uploading === 1 ? 'foto' : 'fotos'}…
            </span>
          </>
        ) : (
          <>
            <ImagePlus className="size-6 text-[var(--content-muted)]" aria-hidden />
            <span className="text-[0.9375rem] font-medium">
              {photos.length === 0 ? 'Adicionar fotos' : 'Adicionar mais fotos'}
            </span>
            <span className="text-[0.8125rem] text-[var(--content-muted)]">
              JPG, PNG ou WEBP · até 8 MB cada · máximo {MAX_PHOTOS}
            </span>
          </>
        )}
      </label>

      {/* Grade */}
      {photos.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              className="relative group rounded-[var(--radius-field)] overflow-hidden border bg-[var(--surface-sunken)] aspect-[4/3]"
            >
              {photo.url ? (
                <Image
                  src={photo.url}
                  alt={photo.alt ?? `Foto ${i + 1} do espaço`}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[0.75rem] text-[var(--content-subtle)]">
                  Foto indisponível
                </div>
              )}

              {i === 0 && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-pill)] bg-[var(--accent)] text-[var(--accent-content)] text-[0.6875rem] font-medium">
                  <Star className="size-3" aria-hidden />
                  Capa
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 p-1.5 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent">
                <span className="flex gap-0.5">
                  <button
                    type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                    aria-label={`Mover foto ${i + 1} para trás`}
                    className="p-1.5 rounded bg-black/40 text-white disabled:opacity-30 hover:bg-black/60"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button" onClick={() => mover(i, 1)} disabled={i === photos.length - 1}
                    aria-label={`Mover foto ${i + 1} para frente`}
                    className="p-1.5 rounded bg-black/40 text-white disabled:opacity-30 hover:bg-black/60"
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </button>
                </span>
                <button
                  type="button" onClick={() => remover(photo.id)}
                  aria-label={`Remover foto ${i + 1}`}
                  className="p-1.5 rounded bg-black/40 text-white hover:bg-[var(--color-critical)]"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
        A primeira foto é a capa — é ela que aparece na busca. Mostre o espaço vazio, com luz
        do dia, e inclua o acesso (portão, porta, corredor).
      </p>

      {/* Navegação: aqui não é <form>, então os botões navegam direto */}
      <div className="sticky bottom-0 -mx-4 sm:mx-0 mt-8 px-4 sm:px-0 py-4 bg-[var(--surface)]/95 backdrop-blur-sm border-t sm:border-t-0 flex items-center gap-3">
        <Button
          type="button" variant="ghost" size="lg" className="shrink-0 px-3"
          onClick={() => router.push(`/anunciar/${spaceId}/caracteristicas`)}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Voltar</span>
        </Button>
        <Button
          type="button" size="lg" className="flex-1" loading={pending || uploading > 0}
          disabled={!podePublicar}
          onClick={() => router.push(`/anunciar/${spaceId}/descricao`)}
        >
          {podePublicar ? 'Continuar' : `Adicione ao menos ${MIN_PHOTOS_TO_PUBLISH} foto`}
          {podePublicar && !pending && <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

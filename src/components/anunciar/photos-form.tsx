'use client';

import {
  useCallback, useEffect, useOptimistic, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, ImagePlus,
  LoaderCircle, Star, Trash2, TriangleAlert,
} from 'lucide-react';
import {
  uploadSpaceImageAction, deleteSpaceImageAction, reorderSpaceImagesAction,
} from '@/lib/storage/actions';
import { MAX_PHOTOS, MIN_PHOTOS_TO_PUBLISH } from '@/lib/spaces/schemas';
import { PHOTO_SUGGESTIONS, RECOMMENDED_PHOTOS } from '@/lib/spaces/photos';
import { ACCEPT_ATTRIBUTE, sniffImageType } from '@/lib/storage/images';
import { resizeBeforeUpload, excedeLimite } from '@/lib/storage/client-resize';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PhotoItem = { id: string; url: string | null; alt: string | null };

/** Uma foto escolhida que ainda não terminou de subir. */
type Pendente = {
  key: string;
  nome: string;
  /** URL local (`blob:`) para mostrar a prévia antes de o envio terminar. */
  preview: string;
  estado: 'verificando' | 'enviando' | 'enviada' | 'erro';
  erro?: string;
  /** true quando o navegador não conseguiu desenhar a prévia. */
  semPrevia?: boolean;
};

/** Mudança aplicada na hora, antes da confirmação do servidor. */
type Ajuste = { tipo: 'remover'; id: string } | { tipo: 'ordem'; ids: string[] };

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
 *
 * Esta etapa NÃO bloqueia o rascunho. Dá para seguir sem foto e voltar
 * depois; o mínimo aparece como aviso e é cobrado na publicação.
 */
export function PhotosForm({
  spaceId, initialPhotos,
}: {
  spaceId: string;
  initialPhotos: PhotoItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * A lista de fotos NÃO é copiada para o estado.
   *
   * Copiar com `useState(initialPhotos)` parece funcionar e não funciona: a
   * cópia é feita uma vez só, então depois de um envio bem-sucedido o
   * `router.refresh()` traz a lista nova do servidor e a tela continua
   * mostrando a antiga — a foto enviada só apareceria recarregando a página.
   *
   * Com `useOptimistic` quem manda é sempre o servidor. As mudanças locais
   * (remover, reordenar) aparecem na hora e são descartadas quando a resposta
   * chega — se o servidor recusar, a tela volta sozinha ao estado real.
   */
  const [photos, ajustar] = useOptimistic<PhotoItem[], Ajuste>(
    initialPhotos,
    (atual, ajuste) => {
      if (ajuste.tipo === 'remover') return atual.filter((p) => p.id !== ajuste.id);
      const porId = new Map(atual.map((p) => [p.id, p]));
      return ajuste.ids.map((id) => porId.get(id)).filter(Boolean) as PhotoItem[];
    },
  );

  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [, startTransition] = useTransition();

  /* Libera as URLs locais das prévias ao sair da tela. */
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const abertas = previews.current;
    return () => {
      for (const url of abertas) URL.revokeObjectURL(url);
      abertas.clear();
    };
  }, []);

  const atualizarPendente = useCallback((key: string, patch: Partial<Pendente>) => {
    setPendentes((lista) => lista.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }, []);

  const descartarPendente = useCallback((key: string) => {
    setPendentes((lista) => {
      const alvo = lista.find((p) => p.key === key);
      if (alvo) {
        URL.revokeObjectURL(alvo.preview);
        previews.current.delete(alvo.preview);
      }
      return lista.filter((p) => p.key !== key);
    });
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setAviso(null);
    setSucesso(null);

    const restantes = MAX_PHOTOS - photos.length - pendentes.length;
    if (restantes <= 0) {
      setAviso(`Você já tem o máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }

    const lote = Array.from(files).slice(0, restantes);
    if (files.length > restantes) {
      setAviso(
        `O máximo é ${MAX_PHOTOS} fotos. Pegamos as ${restantes} primeiras desta seleção.`,
      );
    }

    // Prévia de todas de uma vez: a pessoa vê o que escolheu na hora.
    const fila = lote.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return {
        file,
        item: {
          key: crypto.randomUUID(),
          nome: file.name,
          preview,
          estado: 'verificando' as const,
        },
      };
    });
    setPendentes((lista) => [...lista, ...fila.map((f) => f.item)]);
    if (inputRef.current) inputRef.current.value = '';

    setOcupado(true);
    let enviadas = 0;

    for (const { file: original, item } of fila) {
      // Pré-checagem pelos bytes, não pela extensão: um .txt renomeado para
      // .jpg é recusado aqui sem gastar o upload.
      const head = new Uint8Array(await original.slice(0, 16).arrayBuffer());
      if (!sniffImageType(head)) {
        atualizarPendente(item.key, {
          estado: 'erro',
          erro: 'Esse arquivo não é uma imagem JPG, PNG ou WEBP.',
        });
        continue;
      }

      /*
       * Reduz antes de enviar. Foto de celular recente passa de 8 MB e seria
       * recusada pelo servidor — reduzir aqui é o que deixa uma foto legítima
       * passar, além de encurtar bastante o envio em rede móvel.
       */
      const file = await resizeBeforeUpload(original);

      if (excedeLimite(file)) {
        atualizarPendente(item.key, {
          estado: 'erro',
          erro: 'Essa foto é muito grande. Escolha uma imagem menor.',
        });
        continue;
      }

      atualizarPendente(item.key, { estado: 'enviando' });

      const fd = new FormData();
      fd.set('spaceId', spaceId);
      fd.set('file', file);

      const res = await uploadSpaceImageAction(fd);

      if (res.ok) {
        enviadas += 1;
        /*
         * Marca como enviada e mantém na tela. Tirar agora deixaria um buraco
         * até a lista do servidor chegar — a foto sumiria por um instante
         * logo depois de a pessoa ver "enviada".
         */
        atualizarPendente(item.key, { estado: 'enviada' });
      } else {
        // A mensagem técnica fica no log do servidor; aqui vai o que resolve.
        atualizarPendente(item.key, {
          estado: 'erro',
          erro: res.message ?? 'Não conseguimos enviar essa foto. Tente novamente.',
        });
      }
    }

    setOcupado(false);
    if (enviadas > 0) {
      setSucesso(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);

      /*
       * Busca a lista nova do servidor e tira as prévias na MESMA transição:
       * as duas mudanças entram juntas na tela, sem piscar.
       * As URLs locais são liberadas na saída da tela (ver o efeito acima).
       */
      startTransition(() => {
        router.refresh();
        setPendentes((lista) => lista.filter((p) => p.estado === 'erro'));
      });
    }
  }

  function remover(imageId: string) {
    setAviso(null);
    setSucesso(null);

    startTransition(async () => {
      ajustar({ tipo: 'remover', id: imageId }); // some na hora

      const fd = new FormData();
      fd.set('spaceId', spaceId);
      fd.set('imageId', imageId);
      const res = await deleteSpaceImageAction(fd);

      // Recusado: a mudança local é descartada no fim da transição e a tela
      // volta ao que o servidor diz. Só precisamos explicar o motivo.
      if (!res.ok) {
        setAviso(res.message ?? 'Não foi possível remover a foto.');
        return;
      }
      router.refresh();
    });
  }

  /** Salva uma nova ordem. A primeira da lista é a capa. */
  function salvarOrdem(ids: string[]) {
    setAviso(null);

    startTransition(async () => {
      ajustar({ tipo: 'ordem', ids });

      const fd = new FormData();
      fd.set('spaceId', spaceId);
      for (const id of ids) fd.append('imageIds', id);

      const res = await reorderSpaceImagesAction(fd);
      if (!res.ok) {
        setAviso(res.message ?? 'Não foi possível reordenar.');
        return;
      }
      router.refresh();
    });
  }

  function mover(index: number, direcao: -1 | 1) {
    const destino = index + direcao;
    if (destino < 0 || destino >= photos.length) return;
    const ids = photos.map((p) => p.id);
    [ids[index], ids[destino]] = [ids[destino]!, ids[index]!];
    salvarOrdem(ids);
  }

  /** Manda a foto para a primeira posição — a capa. */
  function definirCapa(index: number) {
    if (index === 0) return;
    const ids = photos.map((p) => p.id);
    const [escolhida] = ids.splice(index, 1);
    ids.unshift(escolhida!);
    salvarOrdem(ids);
  }

  const total = photos.length;
  const faltamParaPublicar = Math.max(MIN_PHOTOS_TO_PUBLISH - total, 0);
  const cheio = total + pendentes.length >= MAX_PHOTOS;

  return (
    <div>
      {/* ------------------------------------------------------------------
          Recomendação. Orienta, não cobra: nenhum item vira campo obrigatório
          e nada aqui trava o rascunho.
         ------------------------------------------------------------------ */}
      <section className="mb-6 p-4 sm:p-5 rounded-[var(--radius-card)] border bg-[var(--surface-sunken)]">
        <div className="flex items-start gap-3">
          <Camera className="size-[1.125rem] shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <h2 className="font-medium leading-snug">
                Adicione boas fotos para ajudar as pessoas a conhecerem seu espaço.
              </h2>
              <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                Recomendamos {RECOMMENDED_PHOTOS} fotos. Estas são sugestões do que mostrar —
                você envia as fotos que fizerem sentido para o seu espaço.
              </p>
            </div>

            <ol className="space-y-2">
              {PHOTO_SUGGESTIONS.map((s, i) => (
                <li key={s.titulo} className="flex gap-2.5 text-[0.875rem]">
                  <span
                    aria-hidden
                    className="shrink-0 size-5 mt-px grid place-items-center rounded-[var(--radius-pill)] bg-[var(--surface)] border text-[0.6875rem] font-medium tabular-nums text-[var(--content-muted)]"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{s.titulo}</span>
                    <span className="text-[var(--content-muted)]"> — {s.dica}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p
              className="text-[0.8125rem] text-[var(--content-muted)] tabular-nums"
              data-testid="contador-fotos"
              aria-live="polite"
            >
              {total} de {RECOMMENDED_PHOTOS} fotos recomendadas
              {total > RECOMMENDED_PHOTOS && ' (acima da recomendação, ótimo)'}
            </p>
          </div>
        </div>
      </section>

      {aviso && <Alert tone="warning" className="mb-5">{aviso}</Alert>}
      {sucesso && <Alert tone="success" className="mb-5">{sucesso}</Alert>}

      {/* Área de envio */}
      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 p-8 rounded-[var(--radius-card)]',
          'border border-dashed cursor-pointer text-center transition-colors',
          'hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]',
          cheio && 'opacity-50 pointer-events-none',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="sr-only"
          data-testid="input-fotos"
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={cheio}
        />
        <ImagePlus className="size-6 text-[var(--content-muted)]" aria-hidden />
        <span className="text-[0.9375rem] font-medium">
          {total === 0 ? 'Escolher fotos' : 'Adicionar mais fotos'}
        </span>
        <span className="text-[0.8125rem] text-[var(--content-muted)]">
          JPG, PNG ou WEBP · até 8 MB cada · máximo {MAX_PHOTOS}
        </span>
      </label>

      {/* Grade: primeiro o que já está salvo, depois o que ainda está subindo */}
      {(photos.length > 0 || pendentes.length > 0) && (
        <ul className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="grade-fotos">
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              data-testid="foto-salva"
              className="relative rounded-[var(--radius-field)] overflow-hidden border bg-[var(--surface-sunken)] aspect-[4/3]"
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

              {i === 0 ? (
                <span
                  data-testid="selo-capa"
                  className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-pill)] bg-[var(--accent)] text-[var(--accent-content)] text-[0.6875rem] font-medium"
                >
                  <Star className="size-3" aria-hidden />
                  Capa
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => definirCapa(i)}
                  className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-pill)] bg-black/50 text-white text-[0.6875rem] font-medium hover:bg-black/70"
                >
                  <Star className="size-3" aria-hidden />
                  Usar como capa
                </button>
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

          {pendentes.map((p) => (
            <li
              key={p.key}
              data-testid={
                p.estado === 'erro' ? 'foto-falhou'
                  : p.estado === 'enviada' ? 'foto-enviada'
                    : 'foto-enviando'
              }
              className="relative rounded-[var(--radius-field)] overflow-hidden border bg-[var(--surface-sunken)] aspect-[4/3]"
            >
              {/*
                Prévia local: a pessoa confere a foto antes de o envio acabar.
                Arquivo que não é imagem de verdade não desenha — nesse caso
                sai de cena em vez de deixar o texto alternativo quebrado
                atravessado na mensagem de erro.
              */}
              {!p.semPrevia && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.preview}
                  alt=""
                  onError={() => atualizarPendente(p.key, { semPrevia: true })}
                  className={cn(
                    'absolute inset-0 size-full object-cover',
                    p.estado !== 'erro' && 'opacity-60',
                  )}
                />
              )}

              {p.estado === 'enviada' ? (
                <div className="absolute inset-0 grid place-items-center bg-black/20">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-pill)] bg-[var(--color-positive)] text-white text-[0.75rem] font-medium">
                    <Check className="size-3.5" aria-hidden />
                    Enviada
                  </span>
                </div>
              ) : p.estado !== 'erro' ? (
                <div className="absolute inset-0 grid place-items-center bg-black/25">
                  <span className="flex flex-col items-center gap-1.5 text-white">
                    <LoaderCircle className="size-5 animate-spin" aria-hidden />
                    <span className="text-[0.75rem] font-medium">
                      {p.estado === 'verificando' ? 'Verificando…' : 'Enviando…'}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center bg-black/65">
                  <TriangleAlert className="size-4 text-white" aria-hidden />
                  <p className="text-[0.75rem] leading-snug text-white">{p.erro}</p>
                  <button
                    type="button"
                    onClick={() => descartarPendente(p.key)}
                    className="mt-1 text-[0.75rem] underline underline-offset-2 text-white"
                  >
                    Remover
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
        A primeira foto é a capa — é ela que aparece na busca. Use “Usar como capa” para trocar,
        ou as setas para reordenar. Mostre o espaço vazio e com luz do dia.
      </p>

      {/* Regra de publicação, dita antes de a pessoa chegar na revisão */}
      <div className="mt-5" data-testid="regra-publicacao">
        {faltamParaPublicar > 0 ? (
          <Alert tone="info">
            Para <strong className="font-medium">publicar</strong> são necessárias no mínimo{' '}
            {MIN_PHOTOS_TO_PUBLISH} fotos
            {total > 0 && ` — falta${faltamParaPublicar === 1 ? '' : 'm'} ${faltamParaPublicar}`}.
            Você pode continuar agora e voltar aqui depois: o rascunho fica salvo.
          </Alert>
        ) : (
          <Alert tone="success">
            Você já tem o mínimo de {MIN_PHOTOS_TO_PUBLISH} fotos para publicar.
            {total < RECOMMENDED_PHOTOS &&
              ` Com ${RECOMMENDED_PHOTOS} o anúncio costuma receber mais contatos.`}
          </Alert>
        )}
      </div>

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
          type="button" size="lg" className="flex-1" loading={ocupado}
          data-testid="continuar"
          onClick={() => router.push(`/anunciar/${spaceId}/descricao`)}
        >
          Continuar
          {!ocupado && <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

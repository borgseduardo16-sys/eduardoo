/*
 * Mídia real (vídeos de verdade) embutida no HTML único pelo `pnpm site`.
 *
 * O build grava cada vídeo num <script type="text/plain" id="k-midia-<id>" data-modo="…">:
 *   modo "loop"  → MP4 (H.264) em base64            → vira um blob: URL para o <video>
 *   modo "scrub" → quadros WebP em base64, separados por "|" → viram <img> (blob:) para o canvas
 * Nada é decodificado antes de a seção chegar perto da tela.
 */

const cacheVideo = new Map<string, string>();
const cacheQuadros = new Map<string, HTMLImageElement[]>();

function tag(id: string): HTMLScriptElement | null {
  return document.getElementById(`k-midia-${id}`) as HTMLScriptElement | null;
}

function b64ParaBlob(b64: string, tipo: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** URL (blob:) do vídeo em loop `id`, ou null se ele não foi embutido. */
export function urlDoVideo(id: string): string | null {
  if (cacheVideo.has(id)) return cacheVideo.get(id)!;
  const t = tag(id);
  if (!t?.textContent) return null;
  const url = URL.createObjectURL(b64ParaBlob(t.textContent.trim(), t.dataset.mime ?? 'video/mp4'));
  cacheVideo.set(id, url);
  return url;
}

/** Quadros do vídeo "scrub" `id` (imagens prontas para drawImage), ou [] se não existir. */
export function quadrosDoVideo(id: string): HTMLImageElement[] {
  if (cacheQuadros.has(id)) return cacheQuadros.get(id)!;
  const t = tag(id);
  if (!t?.textContent) return [];
  const lista = t.textContent.trim().split('|').map((b64) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = URL.createObjectURL(b64ParaBlob(b64, 'image/webp'));
    return img;
  });
  cacheQuadros.set(id, lista);
  return lista;
}

'use client';

import { MAX_IMAGE_BYTES } from './images';

/**
 * Reduz a foto no navegador antes de enviar.
 *
 * NAO e otimizacao — resolve um problema concreto: foto de iPhone recente
 * passa facil de 8 MB, que e o teto do upload. Sem reduzir antes, uma foto
 * perfeitamente legitima seria recusada, e a pessoa nao teria como saber o
 * que fazer a respeito.
 *
 * Reduzir aqui tambem corta o tempo de envio em rede movel, que e onde a
 * maior parte dos anuncios vai ser criada.
 *
 * O que isto NAO faz: garantir a remocao do metadado. O canvas de fato
 * descarta o EXIF, mas o cliente pode ser contornado — quem garante e o
 * servidor, em src/lib/storage/process.ts. Aqui e conveniencia; la e regra.
 */

/** Acima disso o servidor reduziria de qualquer jeito. */
const MAX_EDGE = 2400;
const QUALITY = 0.85;

/** Arquivo pequeno o suficiente passa direto, sem reencodar a toa. */
const SKIP_BELOW_BYTES = 1_500_000;

export async function resizeBeforeUpload(file: File): Promise<File> {
  if (typeof document === 'undefined') return file;
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file, {
      // O navegador aplica a orientacao do EXIF ao decodificar, entao a foto
      // nao sai deitada depois que o metadado e descartado.
      imageOrientation: 'from-image',
    });

    const escala = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );

    // Se o resultado nao ficou menor, o original serve melhor.
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    // Formato que o navegador nao decodifica, memoria insuficiente, canvas
    // bloqueado: seguimos com o original e deixamos o servidor decidir.
    return file;
  }
}

/** Passa do teto mesmo depois de reduzir? Serve para a mensagem de erro. */
export function excedeLimite(file: File): boolean {
  return file.size > MAX_IMAGE_BYTES;
}

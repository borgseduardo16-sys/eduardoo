import 'server-only';
import sharp, { type Sharp } from 'sharp';
import { MIN_DIMENSION, type AcceptedMime } from './images';

/**
 * Processamento das fotos antes de guardar.
 *
 * POR QUE ISTO EXISTE — e nao e otimizacao
 *
 * Foto tirada de celular carrega EXIF, e o EXIF carrega **a coordenada GPS do
 * lugar onde a foto foi tirada**, com precisao de poucos metros. Tambem
 * carrega modelo do aparelho, numero de serie e horario.
 *
 * Guardar o arquivo original anularia toda a protecao de localizacao do
 * produto: o mapa publico mostra um ponto deslocado ~250 m, mas a primeira
 * foto tirada dentro da garagem entregaria o endereco exato para qualquer
 * pessoa que baixasse a imagem e abrisse os metadados.
 *
 * A remocao acontece por REENCODE, nao por "apagar a tag EXIF". Reencodar
 * produz um arquivo novo a partir dos pixels, entao nao sobra metadado algum
 * — nem os campos proprietarios que cada fabricante inventa e que uma lista
 * de exclusao sempre acabaria deixando passar.
 *
 * Roda no SERVIDOR. O navegador tambem reduz a imagem antes de enviar, mas
 * isso e conveniencia de banda: quem garante a remocao e este arquivo, porque
 * o que vem do cliente nunca decide nada.
 */

/** Maior lado da imagem principal. Acima disso e peso sem ganho visivel. */
const MAX_EDGE = 2000;
/** Miniatura para as grades de listagem. */
const THUMB_EDGE = 640;

const MAIN_QUALITY = 82;
const THUMB_QUALITY = 74;

export type ProcessedImage = {
  main: { bytes: Uint8Array; width: number; height: number; sizeBytes: number };
  thumb: { bytes: Uint8Array; width: number; height: number; sizeBytes: number };
  mime: 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'webp';
};

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

/**
 * Reencoda a foto, remove todo metadado e gera a miniatura.
 *
 * WEBP entra quando a origem ja e WEBP; o resto vira JPEG. Converter tudo
 * para WEBP economizaria banda, mas nem todo aplicativo de galeria abre WEBP
 * quando a pessoa baixa a propria foto, e esse atrito nao compensa.
 */
export async function processUploadedImage(
  bytes: Uint8Array,
  sourceMime: AcceptedMime,
): Promise<ProcessedImage> {
  const paraWebp = sourceMime === 'image/webp';

  let pipeline: Sharp;
  try {
    pipeline = sharp(bytes, {
      // Um "zip bomb" de imagem (poucos KB que expandem para gigapixels) e
      // vetor de negacao de servico conhecido. O limite corta isso.
      limitInputPixels: 100_000_000,
      failOn: 'error',
    });
  } catch {
    throw new ImageProcessingError('Não foi possível ler a imagem. Tente outro arquivo.');
  }

  const meta = await pipeline.metadata().catch(() => null);
  if (!meta?.width || !meta?.height) {
    throw new ImageProcessingError('Não foi possível ler as dimensões da imagem.');
  }
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) {
    throw new ImageProcessingError(
      `A foto precisa ter pelo menos ${MIN_DIMENSION} x ${MIN_DIMENSION} pixels. ` +
        `Esta tem ${meta.width} x ${meta.height}.`,
    );
  }

  /*
   * `rotate()` sem argumento aplica a orientacao do EXIF aos PIXELS antes de
   * o metadado ser descartado. Sem isso, foto tirada de lado ficaria deitada
   * no anuncio — a informacao de rotacao vive justamente no EXIF que vamos
   * remover.
   *
   * NAO chamar `withMetadata()` aqui e deliberado, e a parte mais importante
   * desta funcao. O sharp descarta metadado por padrao na saida; `withMetadata`
   * faz o CONTRARIO do que o nome sugere a quem le rapido — ele PRESERVA o
   * metadado da origem. Uma versao anterior chamava `withMetadata({})`
   * achando que o objeto vazio limpava tudo, e o resultado era a coordenada
   * GPS da foto sobrevivendo intacta ate o arquivo publicado.
   * Ver scripts/verify-images.ts, que existe para isso nao voltar.
   */
  const base = () =>
    sharp(bytes, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate()

  const encode = (s: Sharp, quality: number) =>
    paraWebp ? s.webp({ quality }) : s.jpeg({ quality, mozjpeg: true, progressive: true });

  const [mainBuf, thumbBuf] = await Promise.all([
    encode(base().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }), MAIN_QUALITY)
      .toBuffer({ resolveWithObject: true }),
    encode(base().resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'inside', withoutEnlargement: true }), THUMB_QUALITY)
      .toBuffer({ resolveWithObject: true }),
  ]);

  return {
    main: {
      bytes: new Uint8Array(mainBuf.data),
      width: mainBuf.info.width,
      height: mainBuf.info.height,
      sizeBytes: mainBuf.data.byteLength,
    },
    thumb: {
      bytes: new Uint8Array(thumbBuf.data),
      width: thumbBuf.info.width,
      height: thumbBuf.info.height,
      sizeBytes: thumbBuf.data.byteLength,
    },
    mime: paraWebp ? 'image/webp' : 'image/jpeg',
    extension: paraWebp ? 'webp' : 'jpg',
  };
}

/**
 * Confere se sobrou metadado sensivel na saida.
 *
 * Usado pelos testes. Em producao a garantia e o reencode; isto existe para
 * que a garantia seja VERIFICAVEL, e nao apenas afirmada.
 */
export async function extractMetadata(bytes: Uint8Array) {
  const meta = await sharp(bytes).metadata();
  return {
    /** Bloco EXIF cru, para os testes inspecionarem tags binarias. */
    exifBytes: meta.exif ? new Uint8Array(meta.exif) : null,
    hasExif: Boolean(meta.exif),
    hasXmp: Boolean(meta.xmp),
    hasIcc: Boolean(meta.icc),
    hasIptc: Boolean(meta.iptc),
    width: meta.width,
    height: meta.height,
    format: meta.format,
  };
}

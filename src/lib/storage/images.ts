/**
 * Validacao de fotos de anuncio.
 *
 * Modulo PURO de proposito, sem `server-only`: nao toca em segredo, banco nem
 * rede. Isso permite duas coisas — testar a validacao isolada, e usar a mesma
 * checagem no navegador para recusar um arquivo de 8 MB antes de gastar o
 * upload. A validacao do cliente e cortesia; a que decide e a do servidor,
 * que roda exatamente este codigo.
 *
 * POR QUE VALIDAR POR MAGIC BYTES E NAO POR EXTENSAO
 *
 * `foto.jpg` nao prova nada: extensao e nome de arquivo, e o `Content-Type`
 * vem do navegador — os dois sao escolhidos por quem envia. Um .php renomeado
 * para .jpg passaria nas duas checagens.
 *
 * Os primeiros bytes do arquivo, nao. Eles sao o formato de verdade. Por isso
 * a validacao aqui le o conteudo e ignora completamente o que o cliente
 * afirmou que o arquivo e.
 *
 * Isso nao substitui o resto: o bucket e privado, os arquivos sao servidos por
 * URL assinada e com prazo, e o caminho inclui o id do dono.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
/*
 * Piso baixo de proposito: so descarta arquivo truncado ou vazio. Quem decide
 * se e foto de verdade e a checagem de DIMENSAO mais abaixo — um WEBP de cor
 * solida em 640x480 cabe em 600 bytes, e recusa-lo por tamanho seria recusar
 * uma foto legitima pelo motivo errado.
 */
export const MIN_IMAGE_BYTES = 128;

/** Abaixo disso e icone, miniatura ou pixel de rastreamento — nao foto de espaco. */
export const MIN_DIMENSION = 200;

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

/** Aceito no atributo `accept` do input. So conveniencia — nao e validacao. */
export const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

type Sniffed = { mime: AcceptedMime; extension: 'jpg' | 'png' | 'webp' };

/**
 * Descobre o formato lendo os primeiros bytes.
 * Devolve null quando nao e nenhum dos formatos aceitos.
 */
export function sniffImageType(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 89 'P' 'N' 'G' 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => bytes[i] === b)) {
    return { mime: 'image/png', extension: 'png' };
  }

  // WEBP: 'RIFF' .... 'WEBP'
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }

  return null;
}

export type ValidatedImage = {
  bytes: Uint8Array;
  mime: AcceptedMime;
  extension: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

/**
 * Le e valida um arquivo enviado. Lanca `ImageValidationError` com mensagem
 * pronta para mostrar a pessoa — nunca com detalhe tecnico interno.
 */
export async function validateImage(file: File): Promise<ValidatedImage> {
  if (!(file instanceof File) || file.size === 0) {
    throw new ImageValidationError('Arquivo vazio ou inválido.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
    throw new ImageValidationError(`A foto passa de ${mb} MB. Envie uma imagem menor.`);
  }
  if (file.size < MIN_IMAGE_BYTES) {
    throw new ImageValidationError('O arquivo parece estar corrompido ou incompleto.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);

  if (!sniffed) {
    throw new ImageValidationError(
      'Formato não aceito. Envie uma foto em JPG, PNG ou WEBP.',
    );
  }

  const dimensions = readDimensions(bytes, sniffed.extension);

  // Imagem minuscula costuma ser icone ou pixel de rastreamento, nao foto.
  if (dimensions && (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION)) {
    throw new ImageValidationError(
      `A foto precisa ter pelo menos ${MIN_DIMENSION} x ${MIN_DIMENSION} pixels. ` +
        `Esta tem ${dimensions.width} x ${dimensions.height}.`,
    );
  }

  return {
    bytes,
    mime: sniffed.mime,
    extension: sniffed.extension,
    sizeBytes: file.size,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

/**
 * Le largura e altura direto do cabecalho, sem decodificar a imagem inteira.
 *
 * Decodificar exigiria uma biblioteca nativa e abriria uma superficie de
 * ataque bem maior (parsers de imagem sao alvo classico). Ler o cabecalho
 * resolve o que precisamos: saber a proporcao e recusar imagem minuscula.
 */
function readDimensions(
  bytes: Uint8Array,
  extension: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  try {
    if (extension === 'png') {
      // IHDR comeca no byte 16: largura e altura em big-endian.
      return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }

    if (extension === 'jpg') {
      // Percorre os marcadores ate achar um SOF (Start of Frame).
      let offset = 2;
      while (offset < bytes.length - 9) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1]!;
        // SOF0..SOF15, pulando DHT (C4), JPG (C8) e DAC (CC), que nao sao frame.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return {
            height: view.getUint16(offset + 5, false),
            width: view.getUint16(offset + 7, false),
          };
        }
        offset += 2 + view.getUint16(offset + 2, false);
      }
      return null;
    }

    if (extension === 'webp') {
      const format = String.fromCharCode(...bytes.slice(12, 16));
      if (format === 'VP8X') {
        // 24 bits little-endian, valor guardado menos 1.
        const w = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
        const h = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
        return { width: w, height: h };
      }
      if (format === 'VP8 ') {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      }
      if (format === 'VP8L') {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
  } catch {
    // Cabecalho truncado ou malformado: seguimos sem as dimensoes.
    return null;
  }

  return null;
}

export const SPACE_IMAGES_BUCKET = 'space-images';

/**
 * Caminho do arquivo no bucket.
 *
 * O id do dono entra no caminho de proposito: mesmo que uma politica de
 * Storage seja escrita errada no futuro, a regra "so mexe no que esta embaixo
 * do seu id" fica expressavel em uma linha.
 */
export function buildImagePath(ownerId: string, spaceId: string, extension: string): string {
  const unico = crypto.randomUUID();
  return `${ownerId}/${spaceId}/${unico}.${extension}`;
}

/** Extrai o id do dono de um caminho. Usado para conferir antes de apagar. */
export function ownerFromPath(path: string): string | null {
  const first = path.split('/')[0];
  return first && /^[0-9a-f-]{36}$/i.test(first) ? first : null;
}

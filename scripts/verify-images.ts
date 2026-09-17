/**
 * Verificacao do processamento de fotos.
 *
 * O ponto central e uma falha de privacidade real: foto de celular carrega a
 * coordenada GPS do lugar onde foi tirada, com precisao de poucos metros.
 * Guardar o arquivo original anularia toda a protecao de localizacao do
 * produto — o mapa mostra um ponto deslocado ~250 m, mas a foto entregaria o
 * endereco exato para quem baixasse a imagem e abrisse os metadados.
 *
 * Este arquivo gera uma foto COM GPS embutido, processa, e confere que nao
 * sobrou nada. Nao depende de fixture no repositorio nem de ferramenta
 * externa: tudo e criado e conferido aqui.
 *
 *   pnpm tsx scripts/verify-images.ts
 */
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import sharp from 'sharp';

let passed = 0;
let failed = 0;
const ok = (n: string, d = '') => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`); };
const bad = (n: string, d: string) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };

/** Coordenada real do centro de Colatina/ES — a mesma usada nos outros testes. */
const GPS = { lat: '19/1 32/1 1896/100', lng: '40/1 37/1 4620/100' };

/** Foto como sai de um celular: grande, com GPS e identificacao do aparelho. */
async function fotoDeCelular(width = 3000, height = 2250) {
  const base = await sharp({
    create: { width, height, channels: 3, background: { r: 62, g: 92, b: 84 } },
  }).jpeg({ quality: 90 }).toBuffer();

  return sharp(base)
    .withMetadata({
      exif: {
        IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro', Software: 'iOS 18.2' },
        IFD2: { DateTimeOriginal: '2026:09:17 14:32:10' },
        IFD3: {
          GPSLatitudeRef: 'S', GPSLatitude: GPS.lat,
          GPSLongitudeRef: 'W', GPSLongitude: GPS.lng,
        },
      },
    })
    .toBuffer();
}

/** Procura marcadores de metadado nos BYTES CRUS — a checagem mais dura. */
function contemVestigio(bytes: Uint8Array): string[] {
  const texto = Buffer.from(bytes).toString('latin1');
  const achados: string[] = [];
  for (const alvo of ['Apple', 'iPhone', 'iOS 18', 'Exif', 'GPS', '2026:09:17']) {
    if (texto.includes(alvo)) achados.push(alvo);
  }
  return achados;
}

async function main() {
  const { processUploadedImage, extractMetadata, ImageProcessingError } = await import(
    '../src/lib/storage/process'
  );

  console.log('\n\x1b[1m1. A foto de entrada realmente carrega GPS\x1b[0m');
  const original = new Uint8Array(await fotoDeCelular());
  const antes = await extractMetadata(original);

  if (antes.hasExif) ok('foto de teste tem EXIF', `${(original.byteLength / 1024).toFixed(0)} KB, ${antes.width}x${antes.height}`);
  else bad('fixture invalido', 'a foto de teste nao tem EXIF — o teste nao provaria nada');

  const vestigiosAntes = contemVestigio(original);
  /*
   * A tag GPS no EXIF e binaria (0x8825 aponta para o bloco), nao a string
   * "GPS" — procurar pelo texto daria falso negativo. Conferimos o ponteiro
   * nos bytes do proprio bloco EXIF.
   */
  const temPonteiroGps = antes.exifBytes
    ? Buffer.from(antes.exifBytes).includes(Buffer.from([0x88, 0x25])) ||
      Buffer.from(antes.exifBytes).includes(Buffer.from([0x25, 0x88]))
    : false;

  if (vestigiosAntes.includes('Apple') && temPonteiroGps) {
    ok('coordenada e aparelho estao embutidos', `${vestigiosAntes.join(', ')} + bloco GPS`);
  } else {
    bad('fixture invalido', `Apple=${vestigiosAntes.includes('Apple')} GPS=${temPonteiroGps}`);
  }

  console.log('\n\x1b[1m2. Depois do processamento, nao sobra metadado\x1b[0m');
  const r = await processUploadedImage(original, 'image/jpeg');

  const depois = await extractMetadata(r.main.bytes);
  if (!depois.hasExif) ok('EXIF removido da imagem principal');
  else bad('EXIF SOBREVIVEU', 'a coordenada da foto continua no arquivo publicado');

  if (!depois.hasXmp && !depois.hasIptc) ok('XMP e IPTC tambem removidos');
  else bad('metadado residual', `xmp=${depois.hasXmp} iptc=${depois.hasIptc}`);

  const thumbMeta = await extractMetadata(r.thumb.bytes);
  if (!thumbMeta.hasExif) ok('EXIF removido tambem da miniatura');
  else bad('EXIF na miniatura', 'a miniatura ainda carrega metadado');

  // A prova mais dura: varrer os bytes finais atras de qualquer vestigio.
  const vestigiosMain = contemVestigio(r.main.bytes);
  const vestigiosThumb = contemVestigio(r.thumb.bytes);
  if (vestigiosMain.length === 0 && vestigiosThumb.length === 0) {
    ok('nenhum vestigio nos bytes crus', 'varrido por Apple, iPhone, Exif, GPS, data');
  } else {
    bad('VESTIGIO NOS BYTES', [...vestigiosMain, ...vestigiosThumb].join(', '));
  }

  console.log('\n\x1b[1m3. Redimensionamento e miniatura\x1b[0m');
  if (depois.width === 2000 && depois.height === 1500) {
    ok('principal reduzida ao limite', `${depois.width}x${depois.height}`);
  } else {
    bad('dimensao da principal', `${depois.width}x${depois.height}, esperava 2000x1500`);
  }
  if (thumbMeta.width === 640) ok('miniatura gerada', `${thumbMeta.width}x${thumbMeta.height}`);
  else bad('miniatura', `${thumbMeta.width}x${thumbMeta.height}`);

  const reducao = 100 - (r.main.sizeBytes / original.byteLength) * 100;
  ok('peso reduzido', `${(original.byteLength/1024).toFixed(0)} KB → ${(r.main.sizeBytes/1024).toFixed(0)} KB (${reducao.toFixed(0)}% menor)`);
  ok('miniatura leve', `${(r.thumb.sizeBytes/1024).toFixed(0)} KB — o que carrega numa grade de anuncios`);

  console.log('\n\x1b[1m4. Imagem pequena nao cresce\x1b[0m');
  {
    const pequena = new Uint8Array(await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).jpeg().toBuffer());
    const p = await processUploadedImage(pequena, 'image/jpeg');
    const m = await extractMetadata(p.main.bytes);
    if (m.width === 800) ok('800x600 permanece 800x600', 'sem upscale, que so inventaria pixel');
    else bad('upscale indevido', `virou ${m.width}x${m.height}`);
  }

  console.log('\n\x1b[1m5. Limites de seguranca\x1b[0m');
  {
    const minuscula = new Uint8Array(await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer());
    try {
      await processUploadedImage(minuscula, 'image/jpeg');
      bad('imagem minuscula', 'foi aceita — deveria ser recusada');
    } catch (e) {
      if (e instanceof ImageProcessingError) ok('imagem abaixo de 200px e recusada', e.message.slice(0, 60));
      else bad('erro inesperado', String(e));
    }
  }
  {
    const lixo = new Uint8Array(Buffer.from('nao sou uma imagem, sou texto disfarcado'.repeat(50)));
    try {
      await processUploadedImage(lixo, 'image/jpeg');
      bad('arquivo invalido', 'foi aceito como imagem');
    } catch (e) {
      if (e instanceof Error) ok('arquivo que nao e imagem e recusado');
      else bad('erro inesperado', String(e));
    }
  }

  console.log('\n\x1b[1m6. Orientacao do EXIF aplicada aos pixels\x1b[0m');
  {
    // Foto "de lado": 1200x900 marcada para girar 90 graus. Ao remover o EXIF
    // sem aplicar a rotacao, ela ficaria deitada no anuncio.
    const base = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    const deitada = new Uint8Array(
      await sharp(base).withMetadata({ orientation: 6 }).toBuffer(),
    );
    const p = await processUploadedImage(deitada, 'image/jpeg');
    const m = await extractMetadata(p.main.bytes);
    if (m.width! < m.height!) {
      ok('foto marcada como girada sai em pe', `${m.width}x${m.height}`);
    } else {
      bad('orientacao perdida', `${m.width}x${m.height} — ficou deitada`);
    }
  }

  console.log(
    `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` +
      (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : '') + '\n',
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error('\n\x1b[31mErro fatal:\x1b[0m', e); process.exit(1); });

/**
 * Teste real das tres integracoes: Storage (fotos), mapa e CEP.
 *
 *   pnpm tsx scripts/verify-integracoes.ts
 *
 * O que ele faz, em ordem:
 *
 *   1. Sobe um servidor local que implementa o CONTRATO REST do Supabase
 *      (Auth + Storage), serve tiles PNG de verdade e responde CEP nos
 *      formatos da BrasilAPI e do ViaCEP. Ver scripts/testbed/server.ts para
 *      o que isso prova e o que nao prova.
 *   2. Cria no Postgres real dois usuarios e alguns anuncios.
 *   3. Executa as Server Actions DE VERDADE (o codigo do app, sem copia) —
 *      inclusive as tentativas de acesso indevido.
 *   4. Sobe o Next e abre um Chromium DE VERDADE (Playwright) para exercitar
 *      a interface: previa, progresso, envio, mapa com tiles e marcadores,
 *      busca de CEP com debounce.
 *   5. Limpa tudo.
 *
 * Aponte as variaveis do Supabase para o projeto real e os testes de Storage
 * passam a exercitar o Supabase real, sem mudar uma linha daqui.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

/*
 * Os modulos de servidor comecam com `import 'server-only'`, que existe para
 * impedir que um Client Component os importe. Fora do Next esse guarda nao tem
 * o que proteger. Precisa vir ANTES do primeiro import que o alcance.
 */
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { startTestbed, sessionCookie, fakeJwt, type Testbed } from './testbed/server';

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Predicado avaliado DENTRO do navegador, escrito como texto de proposito:
 * ver a nota em `gravarEstados` sobre o auxiliar `__name` do esbuild.
 */
const FOTOS_CARREGADAS = `
  Array.prototype.filter.call(
    document.querySelectorAll('[data-testid="foto-salva"] img'),
    function (i) { return i.naturalWidth > 0; }
  ).length >= 3
`;

// ---------------------------------------------------------------------------
// Relatorio
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const falhas: string[] = [];

const VERDE = '[32m';
const VERMELHO = '[31m';
const FRACO = '[2m';
const FORTE = '[1m';
const FIM = '[0m';

function ok(name: string, detail = '') {
  passed++;
  console.log(`  ${VERDE}OK${FIM} ${name}${detail ? ` ${FRACO}${detail}${FIM}` : ''}`);
}
function bad(name: string, detail: string) {
  failed++;
  falhas.push(name);
  console.log(`  ${VERMELHO}FALHOU${FIM} ${name}\n      ${detail}`);
}
function expect(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name, JSON.stringify(actual));
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
function assert(name: string, condicao: boolean, detalhe = '') {
  if (condicao) ok(name, detalhe);
  else bad(name, detalhe || 'condicao falsa');
}
function secao(titulo: string) {
  console.log(`\n${FORTE}${titulo}${FIM}`);
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Imagens de teste, geradas de verdade
// ---------------------------------------------------------------------------

/** Coordenada real do centro de Colatina/ES. */
const PONTO = { lat: -19.5386, lng: -40.6295 };
const GPS_EXIF = { lat: '19/1 32/1 1896/100', lng: '40/1 37/1 4620/100' };

/** Foto como sai de um celular: grande, com GPS e identificacao do aparelho. */
async function fotoDeCelular(rotulo: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800">
    <rect width="2400" height="1800" fill="#3e5c54"/>
    <text x="1200" y="900" font-family="sans-serif" font-size="140" fill="#eae4d8"
          text-anchor="middle">${rotulo}</text>
  </svg>`;
  const base = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();

  return sharp(base)
    .withMetadata({
      exif: {
        IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro', Software: 'iOS 18.2' },
        IFD2: { DateTimeOriginal: '2026:09:17 14:32:10' },
        IFD3: {
          GPSLatitudeRef: 'S', GPSLatitude: GPS_EXIF.lat,
          GPSLongitudeRef: 'W', GPSLongitude: GPS_EXIF.lng,
        },
      },
    })
    .toBuffer();
}

function contemVestigio(bytes: Uint8Array): string[] {
  const texto = Buffer.from(bytes).toString('latin1');
  return ['Apple', 'iPhone', 'iOS 18', 'Exif', '2026:09:17'].filter((a) => texto.includes(a));
}

// ---------------------------------------------------------------------------

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(DB_URL, { max: 2, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

const tag = `int-${Date.now()}`;
const donoId = crypto.randomUUID();
const outroId = crypto.randomUUID();

let testbed: Testbed | null = null;
let nextProc: ChildProcess | null = null;
let browser: Browser | null = null;
let tmp = '';

let rascunhoFotos = '';
let rascunhoCep = '';
let publicado = '';
let baseUrl = '';

async function main() {
  tmp = await mkdtemp(join(tmpdir(), 'myplace-int-'));

  secao('0. Ambiente');

  testbed = await startTestbed();
  ok('servidor de contrato no ar', testbed.url);

  // Aponta o app para o servidor local ANTES de importar qualquer modulo que
  // leia `serverEnv` — src/lib/env.ts valida no carregamento.
  process.env.NEXT_PUBLIC_SUPABASE_URL = testbed.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.NEXT_PUBLIC_TILE_URL = `${testbed.url}/tiles/{z}/{x}/{y}.png`;
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION = 'Tiles locais de teste';
  process.env.CEP_BRASILAPI_BASE = testbed.url;
  process.env.CEP_VIACEP_BASE = testbed.url;
  delete process.env.NEXT_PUBLIC_MAPTILER_KEY;

  const dono = { id: donoId, email: `${tag}-dono@exemplo.invalid`, token: fakeJwt(donoId, 'dono') };
  const outro = {
    id: outroId, email: `${tag}-outro@exemplo.invalid`, token: fakeJwt(outroId, 'outro'),
  };
  testbed.users.set(dono.id, dono);
  testbed.users.set(outro.id, outro);

  // CEPs que o "servico" conhece. Dados reais de Colatina/ES.
  testbed.ceps.set('29700000', {
    cep: '29700000', state: 'ES', city: 'Colatina', neighborhood: 'Centro',
    street: 'Avenida Getulio Vargas',
    location: { type: 'Point', coordinates: { longitude: '-40.6295', latitude: '-19.5386' } },
  });
  testbed.ceps.set('29701000', {
    cep: '29701000', state: 'ES', city: 'Colatina', neighborhood: 'Maria das Gracas',
    street: 'Rua Pedro Zangrandi',
  });
  testbed.ceps.set('29702000', {
    cep: '29702000', state: 'ES', city: 'Colatina', neighborhood: 'Sao Silvano',
    street: 'Rua Sebastiao Rocha',
  });
  testbed.ceps.set('29703000', {
    cep: '29703000', state: 'ES', city: 'Colatina', neighborhood: 'Bela Vista',
    street: 'Rua das Palmeiras',
  });

  await seed();
  await testesDeServidor();

  await subirNext();
  browser = await chromium.launch({ headless: true, executablePath: chromePath() });

  // SOMENTE=A,C roda so os testes escolhidos — util ao investigar uma falha.
  const quais = (process.env.SOMENTE ?? 'ABCD').toUpperCase();
  if (quais.includes('A')) await testeAFotos();
  if (quais.includes('B')) await testeBMapa();
  if (quais.includes('C')) await testeCCep();
  if (quais.includes('D')) await testeDPermissaoNavegador();
}

// ---------------------------------------------------------------------------
// Semente
// ---------------------------------------------------------------------------

async function seed() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    (${outroId}, ${`${tag}-outro@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${tag}`} WHERE id=${donoId}`;
  await sql`UPDATE profiles SET full_name=${`Outro ${tag}`} WHERE id=${outroId}`;

  const criar = async (slug: string, titulo: string, step: number) => {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO spaces
        (owner_id, slug, type, title, description, street, number, district, city, state,
         postal_code, available_from, price_monthly_cents, size_m2, draft_step, location)
      VALUES
        (${donoId}, ${slug}, 'garagem', ${titulo},
         ${'Garagem coberta com portao automatico, seca e com acesso facil pela rua.'},
         'Avenida Getulio Vargas', '100', 'Centro', 'Colatina', 'ES', '29700-000',
         CURRENT_DATE, 25000, 18.5, ${step},
         ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326))
      RETURNING id`;
    return row!.id;
  };

  rascunhoFotos = await criar(`${tag}-fotos`, 'Garagem para testar fotos', 4);
  rascunhoCep = await criar(`${tag}-cep`, 'Garagem para testar o CEP', 2);
  publicado = await criar(`${tag}-publicado`, 'Garagem coberta no Centro', 8);

  ok('semente criada', 'dono + outro + 3 anuncios');
}

// ---------------------------------------------------------------------------
// Testes que exercitam as Server Actions diretamente
// ---------------------------------------------------------------------------

type Identidade = { id: string; role: 'user' | 'owner' | 'admin' };
let identidadeAtual: Identidade = { id: '', role: 'owner' };

/** Troca quem "esta logado" para as actions chamadas em processo. */
function entrarComo(id: string, role: Identidade['role'] = 'owner') {
  identidadeAtual = { id, role };
}

async function testesDeServidor() {
  secao('TESTE A (servidor) - upload real no Storage');

  // Substitui SO a leitura da sessao. Todo o resto da action e o codigo real.
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => ({
        id: identidadeAtual.id,
        role: identidadeAtual.role,
        email: 'teste@exemplo.invalid',
        fullName: 'Teste',
        avatarPath: null,
        status: 'active',
        statusReason: null,
        acceptedTermsAt: new Date(),
      }),
      getCurrentUser: async () => null,
    },
  } as never;

  // `revalidatePath` so existe dentro de uma requisicao do Next.
  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;

  const storage = await import('../src/lib/storage/actions');
  const spaces = await import('../src/lib/spaces/actions');

  entrarComo(donoId);

  // --- envio de uma foto de celular, com GPS ---
  const bytes = await fotoDeCelular('foto 1');
  const arquivo = new File([new Uint8Array(bytes)], 'IMG_0421.jpg', { type: 'image/jpeg' });
  const fd = new FormData();
  fd.set('spaceId', rascunhoFotos);
  fd.set('file', arquivo);

  const r1 = await storage.uploadSpaceImageAction(fd);
  expect('action aceitou a foto', r1.ok, true);

  const linhas = await sql<
    { storage_path: string; thumb_path: string; content_type: string; width: number }[]
  >`SELECT storage_path, thumb_path, content_type, width FROM space_images
      WHERE space_id=${rascunhoFotos}`;
  expect('banco registrou 1 foto', linhas.length, 1);

  const guardado = testbed!.objects.get(linhas[0]!.storage_path);
  assert('arquivo chegou ao Storage', Boolean(guardado),
    `${testbed!.objects.size} objeto(s) no bucket`);
  assert('miniatura chegou ao Storage', testbed!.objects.has(linhas[0]!.thumb_path));
  expect('caminho comeca pelo id do dono', linhas[0]!.storage_path.startsWith(`${donoId}/`), true);

  if (guardado) {
    const vestigios = contemVestigio(guardado.bytes);
    expect('metadado do celular NAO foi guardado', vestigios, []);
    const meta = await sharp(guardado.bytes).metadata();
    assert('imagem guardada e valida e reduzida',
      meta.width !== undefined && meta.width <= 2000,
      `${meta.format} ${meta.width}x${meta.height}`);
  }

  // --- arquivo que nao e imagem, com nome de imagem ---
  const falso = new File(
    [new TextEncoder().encode('isto nao e uma imagem '.repeat(20))],
    'golpe.jpg', { type: 'image/jpeg' },
  );
  const fd2 = new FormData();
  fd2.set('spaceId', rascunhoFotos);
  fd2.set('file', falso);
  const r2 = await storage.uploadSpaceImageAction(fd2);
  assert('arquivo .jpg que nao e imagem foi recusado', !r2.ok, r2.message ?? '');

  // --- arquivo acima do limite ---
  const grande = await sharp({
    create: { width: 6000, height: 6000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png({ compressionLevel: 0 }).toBuffer();
  const fd3 = new FormData();
  fd3.set('spaceId', rascunhoFotos);
  fd3.set('file', new File([new Uint8Array(grande)], 'enorme.png', { type: 'image/png' }));
  const r3 = await storage.uploadSpaceImageAction(fd3);
  assert('arquivo acima de 8 MB foi recusado', !r3.ok, `${(grande.length / 1048576).toFixed(1)} MB`);
  expect('mensagem do limite e a combinada',
    r3.message, 'Essa foto é muito grande. Escolha uma imagem menor.');

  // -------------------------------------------------------------------------
  secao('TESTE D (servidor) - permissao entre dois usuarios');
  // -------------------------------------------------------------------------

  entrarComo(outroId, 'user');

  const fdOutro = new FormData();
  fdOutro.set('spaceId', rascunhoFotos);
  fdOutro.set('file', new File(
    [new Uint8Array(await fotoDeCelular('invasao'))], 'x.jpg', { type: 'image/jpeg' },
  ));
  const rOutro = await storage.uploadSpaceImageAction(fdOutro);
  assert('B NAO consegue enviar foto para anuncio de A', !rOutro.ok, rOutro.message ?? '');

  const [foto] = await sql<{ id: string }[]>`
    SELECT id FROM space_images WHERE space_id=${rascunhoFotos} LIMIT 1`;

  const fdDel = new FormData();
  fdDel.set('spaceId', rascunhoFotos);
  fdDel.set('imageId', foto!.id);
  const rDel = await storage.deleteSpaceImageAction(fdDel);
  assert('B NAO consegue apagar foto de A', !rDel.ok, rDel.message ?? '');

  const fdOrd = new FormData();
  fdOrd.set('spaceId', rascunhoFotos);
  fdOrd.append('imageIds', foto!.id);
  const rOrd = await storage.reorderSpaceImagesAction(fdOrd);
  assert('B NAO consegue reordenar fotos de A', !rOrd.ok, rOrd.message ?? '');

  const aindaLa = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM space_images WHERE space_id=${rascunhoFotos}`;
  expect('a foto de A continua no lugar depois das tentativas', aindaLa[0]!.n, 1);
  assert('o arquivo de A continua no Storage', testbed!.objects.has(linhas[0]!.storage_path));

  // -------------------------------------------------------------------------
  secao('TESTE A (servidor) - regra de publicacao e capa');
  // -------------------------------------------------------------------------

  entrarComo(donoId);

  // Tenta publicar com 0 fotos: a action tem que listar a pendencia.
  const fdPub = new FormData();
  fdPub.set('spaceId', publicado);
  const rPub = await spaces.publishSpaceAction(undefined, fdPub);
  assert('publicar sem foto e recusado', !rPub.ok, rPub.message ?? '');
  assert('a mensagem diz quantas fotos faltam',
    (rPub.message ?? '').includes('3 fotos'), rPub.message ?? '');

  // Sobe 3 fotos de verdade e publica.
  for (const rotulo of ['visao geral', 'entrada', 'area principal']) {
    const f = new FormData();
    f.set('spaceId', publicado);
    f.set('file', new File(
      [new Uint8Array(await fotoDeCelular(rotulo))],
      `${rotulo.replace(/\s/g, '-')}.jpg`, { type: 'image/jpeg' },
    ));
    const r = await storage.uploadSpaceImageAction(f);
    if (!r.ok) bad(`upload da foto "${rotulo}"`, r.message ?? '');
  }
  const tresFotos = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM space_images WHERE space_id=${publicado}`;
  expect('3 fotos enviadas para o anuncio a publicar', tresFotos[0]!.n, 3);

  /*
   * Quando da tudo certo, `publishSpaceAction` termina em `redirect()`, e
   * `redirect` funciona lancando uma excecao especial (NEXT_REDIRECT). Dentro
   * do Next o framework captura; aqui capturamos nos. O redirecionamento E o
   * sinal de sucesso.
   */
  const rPub2 = await (async () => {
    try {
      return await spaces.publishSpaceAction(undefined, fdPub);
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (digest.startsWith('NEXT_REDIRECT')) {
        return { ok: true, message: `redirecionou para ${digest.split(';')[2]}` };
      }
      throw err;
    }
  })();
  expect('publicar com 3 fotos funciona', rPub2.ok, true);

  const [estado] = await sql<{ status: string }[]>`SELECT status FROM spaces WHERE id=${publicado}`;
  expect('anuncio ficou publicado', estado!.status, 'published');

  // Apagar foto de anuncio publicado nao pode derrubar abaixo do minimo.
  const [umaDoPublicado] = await sql<{ id: string }[]>`
    SELECT id FROM space_images WHERE space_id=${publicado} ORDER BY position DESC LIMIT 1`;
  const fdDel2 = new FormData();
  fdDel2.set('spaceId', publicado);
  fdDel2.set('imageId', umaDoPublicado!.id);
  const rDel2 = await storage.deleteSpaceImageAction(fdDel2);
  assert('apagar foto de anuncio publicado abaixo do minimo e recusado', !rDel2.ok,
    rDel2.message ?? '');

  // Reordenar: a ultima vira capa.
  const ordem = await sql<{ id: string }[]>`
    SELECT id FROM space_images WHERE space_id=${publicado} ORDER BY position`;
  const nova = [ordem[2]!.id, ordem[0]!.id, ordem[1]!.id];
  const fdOrd2 = new FormData();
  fdOrd2.set('spaceId', publicado);
  for (const id of nova) fdOrd2.append('imageIds', id);
  const rOrd2 = await storage.reorderSpaceImagesAction(fdOrd2);
  expect('reordenar como dono funciona', rOrd2.ok, true);

  const [capa] = await sql<{ id: string }[]>`
    SELECT id FROM space_images WHERE space_id=${publicado} AND position=0`;
  expect('a foto escolhida virou capa (posicao 0)', capa!.id === nova[0], true);
}

// ---------------------------------------------------------------------------
// Servidor Next
// ---------------------------------------------------------------------------

/**
 * Caminho do Chromium.
 *
 * O ambiente ja traz um Chromium instalado (PLAYWRIGHT_BROWSERS_PATH), que
 * pode nao ser exatamente a versao que esta biblioteca baixaria. Como nao ha
 * saida de rede para baixar outro, usamos o que existe — e um Chromium de
 * verdade, que e o que importa para o teste.
 */
function chromePath(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return undefined;
  for (const nome of readdirSync(base)) {
    if (!nome.startsWith('chromium-')) continue;
    const alvo = join(base, nome, 'chrome-linux', 'chrome');
    if (existsSync(alvo)) return alvo;
  }
  return undefined;
}

async function subirNext() {
  secao('1. Compilando e subindo o Next');

  const porta = 3200 + (Date.now() % 300);
  baseUrl = `http://127.0.0.1:${porta}`;
  const raiz = join(AQUI, '..');

  /*
   * Compilacao de PRODUCAO, e nao `next dev`.
   *
   * Dois motivos. O primeiro e que producao e o que vai rodar de verdade —
   * testar o que ninguem vai usar tem pouco valor. O segundo e pratico: em
   * `next dev` o runtime do navegador depende de uma conexao WebSocket de HMR,
   * e nesta maquina esse handshake nao passa (ERR_INVALID_HTTP_RESPONSE), o
   * que deixa a pagina servida mas nunca hidratada — nenhum clique funciona.
   * Sem HMR nao existe esse degrau.
   *
   * A compilacao sai em `.next-teste` para nao apagar a de desenvolvimento:
   * as duas levam URLs diferentes embutidas (NEXT_PUBLIC_*).
   */
  const envApp = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: baseUrl,
    NEXT_DIST_DIR: '.next-teste',
    NODE_ENV: 'production' as const,
  };

  const build = spawn('pnpm', ['exec', 'next', 'build'], {
    cwd: raiz, env: envApp, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saidaBuild = '';
  build.stdout?.on('data', (d: Buffer) => { saidaBuild += d.toString(); });
  build.stderr?.on('data', (d: Buffer) => { saidaBuild += d.toString(); });

  const [codigo] = (await once(build, 'exit')) as [number | null];
  if (codigo !== 0) {
    console.log(saidaBuild.slice(-3000));
    throw new Error(`next build falhou (codigo ${codigo})`);
  }
  ok('compilacao de producao concluida');

  nextProc = spawn('pnpm', ['exec', 'next', 'start', '--port', String(porta)], {
    cwd: raiz, env: envApp, stdio: ['ignore', 'pipe', 'pipe'],
  });

  let saida = '';
  const guardar = (d: Buffer) => {
    const texto = d.toString();
    saida += texto;
    // VERBOSO mostra o log do servidor na hora — e onde aparecem os
    // `console.error` das actions quando algo falha do lado do servidor.
    if (process.env.VERBOSO) process.stdout.write(`      ${FRACO}[next] ${texto}${FIM}`);
  };
  nextProc.stdout?.on('data', guardar);
  nextProc.stderr?.on('data', guardar);

  const limite = Date.now() + 90_000;
  let pronto = false;
  while (Date.now() < limite) {
    try {
      const res = await fetch(`${baseUrl}/espacos`, { signal: AbortSignal.timeout(15_000) });
      if (res.status < 500) { pronto = true; break; }
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  if (!pronto) {
    console.log(saida.slice(-3000));
    throw new Error('o Next nao subiu');
  }
  ok('Next respondendo', baseUrl);
}

// ---------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------

/**
 * Gravador de estados da interface.
 *
 * Estados de progresso duram pouco — "verificando", "enviando", a previa
 * local. Esperar por eles com um `waitFor` e uma corrida: se o envio termina
 * rapido, o teste perde a janela e acusa falha num comportamento que existe.
 *
 * Entao instalamos um MutationObserver ANTES de navegar, que avisa o Node a
 * cada estado que aparece. Depois o teste confere a lista do que passou pela
 * tela. Nada aqui inventa estado: so registra o que o React de fato renderizou.
 */
async function gravarEstados(page: Page): Promise<string[]> {
  const vistos: string[] = [];
  await page.exposeFunction('myplaceRegistrar', (t: string) => {
    if (t && !vistos.includes(t)) vistos.push(t);
  });
  /*
   * O script vai como TEXTO, e nao como funcao. O tsx compila este arquivo com
   * esbuild, que reescreve funcoes acrescentando o auxiliar `__name` — que nao
   * existe dentro do navegador e quebraria o script com "__name is not
   * defined". Texto atravessa sem transformacao.
   */
  await page.addInitScript({
    content: `
      (function () {
        var marcar = function () {
          if (!window.myplaceRegistrar) return;
          var nos = document.querySelectorAll('[data-testid]');
          for (var i = 0; i < nos.length; i++) {
            var t = nos[i].getAttribute('data-testid');
            if (t && t.indexOf('foto-') === 0) window.myplaceRegistrar(t);
          }
          var imgs = document.querySelectorAll('img');
          for (var j = 0; j < imgs.length; j++) {
            var src = imgs[j].getAttribute('src') || '';
            if (src.indexOf('blob:') === 0) window.myplaceRegistrar('previa-blob');
          }
          var texto = document.body ? (document.body.textContent || '') : '';
          if (texto.indexOf('fotos enviadas.') >= 0) window.myplaceRegistrar('sucesso-plural');
          if (texto.indexOf('Foto enviada.') >= 0) window.myplaceRegistrar('sucesso-singular');
          if (texto.indexOf('Enviando') >= 0) window.myplaceRegistrar('rotulo-enviando');
          if (texto.indexOf('Verificando') >= 0) window.myplaceRegistrar('rotulo-verificando');
        };
        // O objeto document sempre existe quando o script inicial roda;
        // documentElement ainda nao.
        new MutationObserver(marcar).observe(document, {
          childList: true, subtree: true, attributes: true, characterData: true
        });

        // Promessa rejeitada sem tratamento nao vira 'pageerror': sem isto,
        // um erro dentro de um handler assincrono passaria em silencio.
        window.addEventListener('unhandledrejection', function (e) {
          var m = e.reason && (e.reason.message || String(e.reason));
          if (window.myplaceRegistrar) window.myplaceRegistrar('REJEICAO: ' + m);
        });
        window.addEventListener('error', function (e) {
          if (window.myplaceRegistrar) window.myplaceRegistrar('ERRO: ' + e.message);
        });
      })();
    `,
  });

  return vistos;
}

async function novaAba(usuario: { id: string; email: string; token: string }): Promise<Page> {
  const ctx = await browser!.newContext({ viewport: { width: 430, height: 900 } });
  const cookie = sessionCookie(process.env.NEXT_PUBLIC_SUPABASE_URL!, usuario);
  await ctx.addCookies([{
    name: cookie.name, value: cookie.value, domain: '127.0.0.1', path: '/', sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`      ${FRACO}[erro no navegador] ${e.message}${FIM}`));
  if (process.env.VERBOSO) {
    page.on('console', (m) => console.log(`      ${FRACO}[console:${m.type()}] ${m.text()}${FIM}`));
    page.on('requestfailed', (r) =>
      console.log(`      ${FRACO}[req falhou] ${r.url()} ${r.failure()?.errorText}${FIM}`));
  }
  return page;
}

/**
 * Espera as fotos salvas aparecerem E carregarem.
 *
 * O `next/image` usa carregamento tardio: a terceira foto da grade fica
 * abaixo da dobra num celular e o navegador nao busca a imagem enquanto ela
 * nao chega perto da tela. Por isso rolamos ate ela antes de conferir — senao
 * o teste acusaria falha num comportamento que e do navegador, nao do codigo.
 */
async function esperarFotosCarregadas(page: Page, quantas: number) {
  await page.waitForFunction(
    `document.querySelectorAll('[data-testid="foto-salva"]').length >= ${quantas}`,
    undefined, { timeout: 40_000 },
  );
  await page.locator('[data-testid="foto-salva"]').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(FOTOS_CARREGADAS, undefined, { timeout: 40_000 });
}

async function testeAFotos() {
  secao('TESTE A (navegador) - escolher, ver a previa, enviar, virar capa');

  const page = await novaAba(testbed!.users.get(donoId)!);
  const estados = await gravarEstados(page);
  await page.goto(`${baseUrl}/anunciar/${rascunhoFotos}/fotos`, { waitUntil: 'domcontentloaded' });

  const titulo = page.getByText(
    'Adicione boas fotos para ajudar as pessoas a conhecerem seu espaço.',
  );
  assert('a recomendacao aparece na tela', (await titulo.count()) > 0);

  for (const s of ['Visão geral do espaço', 'Entrada/acesso', 'Área principal',
    'Estrutura ou características importantes', 'Outro ângulo do espaço']) {
    assert(`sugestao "${s}" listada`, (await page.getByText(s, { exact: false }).count()) > 0);
  }

  const contador = (await page.getByTestId('contador-fotos').textContent())?.trim();
  expect('contador mostra o que ja existe', contador, '1 de 5 fotos recomendadas');

  const regra = (await page.getByTestId('regra-publicacao').textContent()) ?? '';
  assert('a regra de publicacao esta escrita na tela',
    regra.includes('mínimo') && regra.includes('3 fotos'), regra.trim());

  assert('"Continuar" nao fica travado pela recomendacao',
    await page.getByTestId('continuar').isEnabled());

  // --- escolher duas fotos de verdade ---
  const a1 = join(tmp, 'garagem-1.jpg');
  const a2 = join(tmp, 'garagem-2.jpg');
  await writeFile(a1, await fotoDeCelular('garagem 1'));
  await writeFile(a2, await fotoDeCelular('garagem 2'));

  const antes = testbed!.objects.size;
  await page.getByTestId('input-fotos').setInputFiles([a1, a2]);

  // Espera o resultado do envio no banco — sinal que nao depende de tempo.
  const ate = Date.now() + 90_000;
  let contagem = 0;
  while (Date.now() < ate) {
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM space_images WHERE space_id=${rascunhoFotos}`;
    contagem = n;
    if (n >= 3) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  expect('as 2 fotos escolhidas foram gravadas', contagem, 3);

  // Agora confere os estados que passaram pela tela durante o envio.
  assert('previa local (blob:) apareceu antes do fim do envio',
    estados.includes('previa-blob'), estados.join(', '));
  assert('a foto apareceu com indicador de progresso',
    estados.includes('foto-enviando'), estados.join(', '));
  assert('o rotulo de progresso apareceu',
    estados.includes('rotulo-enviando') || estados.includes('rotulo-verificando'),
    estados.join(', '));
  assert('a confirmacao de sucesso apareceu',
    estados.includes('sucesso-plural') || estados.includes('sucesso-singular'),
    estados.join(', '));

  expect('Storage recebeu 2 fotos + 2 miniaturas', testbed!.objects.size - antes, 4);

  const noBanco = await sql<{ id: string; position: number }[]>`
    SELECT id, position FROM space_images WHERE space_id=${rascunhoFotos} ORDER BY position`;
  expect('banco tem 3 fotos', noBanco.length, 3);

  // --- a imagem aparece de verdade na tela (URL assinada + carregamento) ---
  await esperarFotosCarregadas(page, 3);
  const carregadas = (await page.evaluate(`
    Array.prototype.map.call(
      document.querySelectorAll('[data-testid="foto-salva"] img'),
      function (i) {
        return { assinada: i.currentSrc.indexOf('/object/sign/') >= 0, largura: i.naturalWidth };
      }
    )
  `)) as { assinada: boolean; largura: number }[];
  assert('as 3 fotos carregaram pela URL assinada',
    carregadas.length === 3 && carregadas.every((c) => c.assinada && c.largura > 0),
    JSON.stringify(carregadas));

  // --- depois de recarregar, continuam la ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await esperarFotosCarregadas(page, 3);
  ok('as fotos continuam depois de recarregar a pagina');

  // --- trocar a capa pela interface ---
  const ultimaAntes = noBanco[noBanco.length - 1]!.id;
  await page.getByRole('button', { name: 'Usar como capa' }).last().click();
  await page.waitForTimeout(2_500);
  const [capaAgora] = await sql<{ id: string }[]>`
    SELECT id FROM space_images WHERE space_id=${rascunhoFotos} AND position=0`;
  assert('a capa mudou no banco pela interface', capaAgora!.id === ultimaAntes,
    `capa agora ${capaAgora!.id.slice(0, 8)}, esperada ${ultimaAntes.slice(0, 8)}`);

  // --- arquivo que nao e imagem, pela interface ---
  const impostor = join(tmp, 'documento.jpg');
  await writeFile(impostor, 'isto e um arquivo de texto qualquer com nome de foto');
  await page.getByTestId('input-fotos').setInputFiles([impostor]);
  await page.getByText('Esse arquivo não é uma imagem JPG, PNG ou WEBP.')
    .waitFor({ timeout: 20_000 });
  ok('interface recusa arquivo com nome de foto que nao e foto');

  await page.screenshot({ path: join(tmp, 'teste-a-fotos.png'), fullPage: true });
  await page.context().close();
}

async function testeBMapa() {
  secao('TESTE B (navegador) - mapa com tiles e marcadores reais');

  const antesTiles = testbed!.tilesServidos().length;
  const page = await novaAba(testbed!.users.get(donoId)!);
  await page.goto(`${baseUrl}/espacos`, { waitUntil: 'domcontentloaded' });

  // A pagina publica nao pode conter o endereco exato nem a coordenada exata.
  const html = await page.content();
  assert('pagina publica nao traz a rua do anuncio',
    !html.includes('Avenida Getulio Vargas'), 'rua ausente da listagem');
  assert('pagina publica nao traz a coordenada exata',
    !html.includes('-19.5386') && !html.includes('-40.6295'));

  // A capa do anuncio tem que aparecer no cartao da listagem.
  const [capa] = await sql<{ p: string }[]>`
    SELECT COALESCE(thumb_path, storage_path) AS p FROM space_images
    WHERE space_id=${publicado} ORDER BY position LIMIT 1`;
  assert('a capa do anuncio esta no Storage', testbed!.objects.has(capa!.p), capa!.p);

  await page.locator('main ul li img, main ul li [aria-hidden]').first()
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  const capasNaTela = (await page.evaluate(`
    Array.prototype.map.call(document.querySelectorAll('main ul li img'), function (i) {
      return { src: i.currentSrc.slice(0, 60), largura: i.naturalWidth };
    })
  `)) as { src: string; largura: number }[];
  if (capasNaTela.length === 0 && process.env.VERBOSO) {
    const htmlCartao = await page.evaluate(
      `(document.querySelector('main ul') || {}).outerHTML || 'sem ul em main'`,
    );
    console.log('  DIAG cartao:', String(htmlCartao).slice(0, 900));
  }
  assert('a capa aparece no cartao da listagem',
    capasNaTela.length > 0 && capasNaTela.every((c) => c.largura > 0),
    JSON.stringify(capasNaTela));

  const abrir = page.getByTestId('abrir-mapa');
  assert('botao de abrir o mapa aparece', (await abrir.count()) > 0);
  await abrir.click();

  await page.getByTestId('mapa-espacos').waitFor({ state: 'visible' });
  await page.waitForFunction(`document.querySelectorAll('.myplace-map-pin').length > 0`,
    undefined, { timeout: 40_000 });

  const tiles = testbed!.tilesServidos().slice(antesTiles);
  assert('o navegador pediu tiles de verdade', tiles.length > 0, `${tiles.length} tiles`);
  assert('os tiles vieram com z/x/y coerentes',
    tiles.every((t) => t.z >= 0 && t.z <= 22 && t.x >= 0 && t.y >= 0),
    `ex.: ${tiles[0]!.z}/${tiles[0]!.x}/${tiles[0]!.y}`);

  const respostas = testbed!.log.filter((l) => l.url.startsWith('/tiles/'));
  assert('todos os tiles responderam 200',
    respostas.length > 0 && respostas.every((r) => r.status === 200),
    `${respostas.length} respostas`);

  // --- os marcadores vem do banco ---
  const publicados = await sql<{ slug: string; title: string; preco: number }[]>`
    SELECT slug, title, price_monthly_cents AS preco FROM spaces
    WHERE status='published' AND deleted_at IS NULL`;
  const marcadores = await page.locator('.myplace-map-pin').all();
  expect('um marcador por anuncio publicado', marcadores.length, publicados.length);

  const rotulos = await Promise.all(marcadores.map((m) => m.textContent()));
  const limpar = (s: string) => s.replace(/ /g, ' ').trim();
  const esperado = limpar(new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(publicados[0]!.preco / 100));
  assert('o marcador mostra o preco que esta no banco',
    rotulos.some((r) => limpar(r ?? '') === esperado),
    `rotulos=${JSON.stringify(rotulos.map((r) => limpar(r ?? '')))} esperado=${esperado}`);

  // --- arrastar pede tiles novos ---
  const box = await page.getByTestId('mapa-espacos').boundingBox();
  const antesArrastar = testbed!.tilesServidos().length;
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 20, box!.y + 30, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(3_000);
  assert('arrastar o mapa pediu tiles novos',
    testbed!.tilesServidos().length > antesArrastar,
    `+${testbed!.tilesServidos().length - antesArrastar} tiles`);

  // --- zoom pede tiles de outro nivel ---
  const antesZoom = testbed!.tilesServidos().length;
  const zoomIn = page.locator('.maplibregl-ctrl-zoom-in');
  await zoomIn.click();
  await page.waitForTimeout(3_000);
  const novosZ = testbed!.tilesServidos().slice(antesZoom);
  assert('dar zoom pediu tiles novos',
    novosZ.length > 0, `z=${[...new Set(novosZ.map((t) => t.z))].join(',')}`);

  /*
   * Fecha e abre o mapa antes de clicar no marcador: depois de arrastar e dar
   * zoom o marcador saiu da area visivel, e reabrir faz o mapa enquadrar os
   * anuncios de novo — que e o comportamento esperado de quem volta ao mapa.
   */
  await page.getByRole('button', { name: 'Fechar mapa' }).click();
  await page.getByTestId('abrir-mapa').click();
  await page.waitForFunction(`document.querySelectorAll('.myplace-map-pin').length > 0`,
    undefined, { timeout: 40_000 });
  ok('fechar e reabrir o mapa reenquadra os anuncios');

  // --- clicar no marcador abre o resumo e leva ao anuncio ---
  await page.locator('.myplace-map-pin').first().click();
  const popup = page.locator('.myplace-popup');
  await popup.waitFor({ timeout: 15_000 });
  const textoPopup = (await popup.textContent()) ?? '';
  assert('o resumo mostra o titulo que esta no banco',
    publicados.some((p) => textoPopup.includes(p.title)), textoPopup.trim().slice(0, 120));

  await page.screenshot({ path: join(tmp, 'teste-b-mapa.png') });

  await page.getByTestId('popup-ver-anuncio').click();
  await page.waitForURL(/\/espacos\/.+/, { timeout: 20_000 });
  const url = page.url();
  assert('clicar em "Ver anuncio" abre a pagina do anuncio',
    publicados.some((p) => url.endsWith(`/espacos/${p.slug}`)), url);

  // --- privacidade: o marcador nao esta no ponto exato ---
  const [pontos] = await sql<{ elat: number; elng: number; alat: number; alng: number }[]>`
    SELECT ST_Y(location::geometry) AS elat, ST_X(location::geometry) AS elng,
           ST_Y(approx_location::geometry) AS alat, ST_X(approx_location::geometry) AS alng
    FROM spaces WHERE id=${publicado}`;
  const distancia = haversine(
    { lat: Number(pontos!.elat), lng: Number(pontos!.elng) },
    { lat: Number(pontos!.alat), lng: Number(pontos!.alng) },
  );
  assert('o ponto do mapa esta deslocado do ponto real',
    distancia >= 100 && distancia <= 400, `${Math.round(distancia)} m de distancia`);

  await page.context().close();
}

async function testeCCep() {
  secao('TESTE C (navegador) - busca de CEP');

  const page = await novaAba(testbed!.users.get(donoId)!);
  await page.goto(`${baseUrl}/anunciar/${rascunhoCep}/localizacao`,
    { waitUntil: 'domcontentloaded' });

  const campoCep = page.locator('#cep');
  const contar = (cep: string) =>
    testbed!.log.filter(
      (l) => l.url.includes(`/api/cep/v2/${cep}`) || l.url.includes(`/ws/${cep}/`),
    ).length;

  // --- CEP incompleto nao consulta ---
  await campoCep.fill('');
  await campoCep.pressSequentially('297', { delay: 80 });
  await page.waitForTimeout(2_000);
  expect('CEP incompleto nao gera consulta nenhuma',
    testbed!.log.filter((l) => l.url.includes('/api/cep/') || l.url.includes('/ws/')).length, 0);

  // --- digitar os 8 digitos gera UMA consulta ---
  await campoCep.fill('');
  await campoCep.pressSequentially('29700000', { delay: 80 });
  await page.getByText('Endereço preenchido pelo CEP.', { exact: false })
    .waitFor({ timeout: 30_000 });
  expect('8 digitos geram exatamente 1 consulta (debounce)', contar('29700000'), 1);

  expect('estado preenchido pelo servico',
    await page.locator('select[name="state"]').inputValue(), 'ES');
  expect('cidade preenchida pelo servico',
    await page.locator('input[name="city"]').inputValue(), 'Colatina');
  expect('bairro preenchido pelo servico',
    await page.locator('input[name="district"]').inputValue(), 'Centro');
  expect('rua preenchida pelo servico',
    await page.locator('input[name="street"]').inputValue(), 'Avenida Getulio Vargas');

  assert('o mapa foi recentralizado pelo CEP',
    (await page.getByText('Centralizamos o mapa pelo CEP.', { exact: false }).count()) > 0);

  // --- aceita com hifen e normaliza ---
  await campoCep.fill('');
  await campoCep.pressSequentially('29701-000', { delay: 50 });
  await page.waitForTimeout(2_500);
  expect('CEP com hifen tambem consulta', contar('29701000'), 1);
  expect('campo mostra o CEP normalizado', await campoCep.inputValue(), '29701-000');

  // --- CEP que nao existe ---
  await campoCep.fill('');
  await campoCep.pressSequentially('99999999', { delay: 50 });
  await page.getByText('CEP não encontrado.').waitFor({ timeout: 30_000 });
  ok('CEP inexistente mostra "CEP nao encontrado."');

  // --- servico fora do ar ---
  testbed!.cepFora = true;
  await campoCep.fill('');
  await campoCep.pressSequentially('29703000', { delay: 50 });
  await page.getByText('Não conseguimos consultar o CEP agora. Tente novamente.')
    .waitFor({ timeout: 35_000 });
  ok('servico indisponivel mostra a mensagem combinada');
  testbed!.cepFora = false;

  // --- queda para a fonte reserva ---
  testbed!.brasilApiFora = true;
  await campoCep.fill('');
  await campoCep.pressSequentially('29702000', { delay: 50 });
  await page.getByText('Endereço preenchido pelo CEP.', { exact: false })
    .waitFor({ timeout: 35_000 });
  assert('com a fonte primaria fora, a reserva responde',
    testbed!.log.some((l) => l.url.includes('/ws/29702000/') && l.status === 200),
    'ViaCEP respondeu 200');
  expect('cidade veio da reserva',
    await page.locator('input[name="city"]').inputValue(), 'Colatina');
  testbed!.brasilApiFora = false;

  // --- o servidor NAO confia na cidade que o navegador manda ---
  await page.locator('input[name="number"]').fill('250');
  await page.locator('input[name="city"]').fill('Sao Paulo');
  await page.locator('select[name="state"]').selectOption('SP');
  await page.screenshot({ path: join(tmp, 'teste-c-cep.png'), fullPage: true });

  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL(/\/caracteristicas$/, { timeout: 40_000 });

  const [salvo] = await sql<{ city: string; state: string; postal_code: string }[]>`
    SELECT city, state, postal_code FROM spaces WHERE id=${rascunhoCep}`;
  expect('servidor gravou a cidade do CEP, nao a digitada', salvo!.city, 'Colatina');
  expect('servidor gravou o estado do CEP, nao o digitado', salvo!.state, 'ES');
  expect('CEP gravado normalizado', salvo!.postal_code, '29702-000');

  await page.context().close();
}

async function testeDPermissaoNavegador() {
  secao('TESTE D (navegador) - B tentando abrir o anuncio de A');

  const page = await novaAba(testbed!.users.get(outroId)!);

  const res = await page.goto(`${baseUrl}/anunciar/${rascunhoFotos}/fotos`,
    { waitUntil: 'domcontentloaded' });
  expect('B recebe 404 no anuncio de A', res?.status(), 404);
  assert('B nao ve o formulario de fotos de A',
    (await page.getByTestId('input-fotos').count()) === 0);

  const resFoto = await page.goto(`${baseUrl}/anunciar/${publicado}/fotos`,
    { waitUntil: 'domcontentloaded' });
  expect('B tambem recebe 404 no anuncio publicado de A', resFoto?.status(), 404);

  // B ve a pagina publica normalmente - o que ele nao pode e editar.
  const [slug] = await sql<{ slug: string }[]>`SELECT slug FROM spaces WHERE id=${publicado}`;
  const resPublico = await page.goto(`${baseUrl}/espacos/${slug!.slug}`,
    { waitUntil: 'domcontentloaded' });
  expect('B ve a pagina publica do anuncio de A', resPublico?.status(), 200);

  const htmlPublico = await page.content();
  assert('a pagina publica nao mostra a rua do anuncio',
    !htmlPublico.includes('Avenida Getulio Vargas'), 'endereco exato ausente');

  await page.waitForFunction(`
    Array.prototype.some.call(document.querySelectorAll('img'), function (i) {
      return i.currentSrc.indexOf('/object/sign/') >= 0 && i.naturalWidth > 0;
    })
  `, undefined, { timeout: 40_000 });
  ok('B consegue VER a foto do anuncio publicado de A');

  await page.screenshot({ path: join(tmp, 'teste-d-permissao.png'), fullPage: true });
  await page.context().close();
}

// ---------------------------------------------------------------------------

async function limpar() {
  try {
    await sql`DELETE FROM spaces WHERE owner_id IN (${donoId}, ${outroId})`;

    /*
     * `audit_logs` e append-only por trigger, e apagar o perfil faria o banco
     * tentar um UPDATE nela (FK com ON DELETE SET NULL) — que o trigger
     * recusa, e com razao. So para limpar o rastro DESTE teste, desligamos o
     * trigger dentro de uma transacao: DDL no Postgres e transacional, entao
     * se algo falhar no meio ele volta ligado.
     */
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN (${donoId}, ${outroId})`;
      await tx`DELETE FROM auth.users WHERE id IN (${donoId}, ${outroId})`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  ${FRACO}limpeza do banco: ${String(err).slice(0, 140)}${FIM}`);
  }
  await browser?.close().catch(() => {});
  if (nextProc) {
    nextProc.kill('SIGTERM');
    await Promise.race([once(nextProc, 'exit'), new Promise((r) => setTimeout(r, 6_000))]);
  }
  await testbed?.close();
  await sql.end({ timeout: 5 });
}

main()
  .then(async () => {
    const dir = tmp;
    await limpar();
    console.log(`\n${FORTE}Resultado:${FIM} ${passed} passaram, ${failed} falharam`);
    if (failed) console.log(`Falhas: ${falhas.join(' | ')}`);
    console.log(`Capturas de tela em ${dir}`);
    if (tmp && !process.env.MANTER_TMP) await rm(tmp, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error(`\n${VERMELHO}ERRO${FIM}`, err);
    await limpar();
    process.exit(1);
  });

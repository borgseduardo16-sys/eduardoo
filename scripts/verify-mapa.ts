/**
 * Verificação do MAPA DE EXPLORAÇÃO: categorias, validação dos parâmetros,
 * a consulta de marcadores/grupos contra Postgres real e as rotas da API.
 *
 *   pnpm tsx scripts/verify-mapa.ts
 *
 * Usa uma região isolada do mapa (no meio do Brasil) para a contagem não
 * depender dos anúncios que outros testes deixaram no banco.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { SPACE_TYPES } from '../src/lib/spaces/types';
import {
  MAP_CATEGORIES, categoryOfType, parseCategoriesParam, typesOfCategories, typesWithoutCategory,
} from '../src/lib/spaces/categories';
import {
  MAX_INDIVIDUAL_PINS, MAX_OUTSIDE_PINS, clusterCellDegrees, parseExploreQuery, type ExploreQuery,
} from '../src/lib/maps/explore-params';
import { criarAnuncio } from './lib/fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 4, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;
const falhas: string[] = [];

function ok(name: string, detail = '') {
  passed++;
  console.log(`  \x1b[32mOK\x1b[0m ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`);
}
function bad(name: string, detail: string) {
  failed++;
  falhas.push(name);
  console.log(`  \x1b[31mFALHOU\x1b[0m ${name}\n      ${detail}`);
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
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

const tag = `mapa-${Date.now()}`;
const donoId = crypto.randomUUID();

/** Graus de latitude/longitude para um deslocamento em metros (suficiente para o teste, perto do equador). */
const grauLat = (m: number) => m / 111_320;

async function main() {
  // =========================================================================
  secao('1. Categorias');
  // =========================================================================
  expect('todo tipo de espaço pertence a uma categoria do mapa', typesWithoutCategory(), []);
  const todosOsTipos = MAP_CATEGORIES.flatMap((c) => [...c.types]).sort();
  expect('nenhum tipo aparece em duas categorias', todosOsTipos, [...SPACE_TYPES].sort());
  expect('garagem agrupa vaga, estacionamento e garagem', typesOfCategories(['garagem']).sort(),
    ['estacionamento', 'garagem', 'vaga_carro', 'vaga_moto']);
  expect('tipo desconhecido cai em "outros", nunca some do mapa', categoryOfType('tipo_que_nao_existe'), 'outros');
  expect('parâmetro de categorias ignora o que não existe', parseCategoriesParam('garagem,loja,xyz,'), ['garagem', 'loja']);
  expect('parâmetro vazio = sem filtro', parseCategoriesParam(''), []);

  // =========================================================================
  secao('2. Validação dos parâmetros');
  // =========================================================================
  const q = (s: string) => parseExploreQuery(new URLSearchParams(s));
  assert('sem área, recusa', !q('z=12').ok);
  assert('área invertida, recusa', !q('w=10&s=0&e=5&n=1').ok);
  assert('latitude fora do mundo, recusa', !q('w=0&s=0&e=1&n=95').ok);
  const valido = q('w=-51&s=-11&e=-49&n=-9&z=99&lat=-10&lng=-50&raio=2000&preco=30000&tipos=garagem,loja&disp=1');
  assert('parâmetros válidos passam', valido.ok);
  if (valido.ok) {
    expect('zoom é limitado a 22', valido.value.zoom, 22);
    expect('raio e preço entram como números inteiros', [valido.value.radiusMeters, valido.value.priceMaxCents], [2000, 30000]);
    expect('categorias e disponibilidade entram', [valido.value.categories, valido.value.availableNow], [['garagem', 'loja'], true]);
  }
  const semCentro = q('w=-51&s=-11&e=-49&n=-9&raio=2000');
  assert('raio sem ponto de referência é ignorado (não existe "perto de quem")', semCentro.ok && semCentro.value.radiusMeters === null);
  const raioAbsurdo = q('w=-51&s=-11&e=-49&n=-9&lat=-10&lng=-50&raio=99999999');
  assert('raio absurdo é ignorado', raioAbsurdo.ok && raioAbsurdo.value.radiusMeters === null);
  const precoRuim = q('w=-51&s=-11&e=-49&n=-9&preco=abc');
  assert('preço ilegível é ignorado, não vira erro', precoRuim.ok && precoRuim.value.priceMaxCents === null);
  assert('célula de agrupamento encolhe com o zoom', clusterCellDegrees(14) < clusterCellDegrees(10));

  // =========================================================================
  secao('3. Consulta de marcadores (Postgres real)');
  // =========================================================================
  await sql`INSERT INTO auth.users (id, email) VALUES (${donoId}, ${`${tag}@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${tag}`} WHERE id=${donoId}`;

  const { exploreSpaces, getMapPreview } = await import('../src/lib/maps/explore');

  // Região isolada, diferente a cada execução (o deslocamento vem do relógio).
  const salto = (Date.now() % 997) / 100; // 0 a 9,96 graus
  const centro = { lat: -3 - salto * 0.5, lng: -60 - salto * 0.5 };
  const dentro = (m: number, graus: number) => ({
    lat: centro.lat + grauLat(m) * Math.cos(graus),
    lng: centro.lng + grauLat(m) * Math.sin(graus),
  });

  // Dentro de 2 km: cinco espaços de tipos diferentes.
  const perto = [
    { slug: 'g', tipo: 'garagem', preco: 8000, p: dentro(300, 0.3) },
    { slug: 'd', tipo: 'deposito', preco: 15000, p: dentro(900, 1.5) },
    { slug: 'l', tipo: 'loja', preco: 25000, p: dentro(1200, 2.6) },
    { slug: 'e', tipo: 'escritorio', preco: 40000, p: dentro(1500, 3.8) },
    { slug: 'o', tipo: 'oficina', preco: 12000, p: dentro(1800, 5.0) },
  ];
  const idDe = new Map<string, string>();
  for (const x of perto) {
    idDe.set(x.slug, await criarAnuncio(sql, {
      ownerId: donoId, slug: `${tag}-${x.slug}`, tipo: x.tipo, precoCents: x.preco, lat: x.p.lat, lng: x.p.lng,
    }));
  }
  // Fora do raio (~6 km): três comuns, um Destaque, um bem avaliado.
  for (const [i, graus] of [0.5, 2.0, 4.0].entries()) {
    const p = dentro(6000, graus);
    idDe.set(`longe${i}`, await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-longe${i}`, precoCents: 20000, lat: p.lat, lng: p.lng }));
  }
  const pDestaque = dentro(6500, 1.0);
  const idDestaque = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-destaque`, precoCents: 22000, lat: pDestaque.lat, lng: pDestaque.lng });
  await sql`INSERT INTO promotions (space_id, owner_id, type, status, source, started_at, expires_at)
    VALUES (${idDestaque}, ${donoId}, 'destaque', 'active', 'purchase', now(), now() + interval '7 days')`;
  const pBom = dentro(7000, 3.0);
  const idBom = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-bom`, precoCents: 21000, lat: pBom.lat, lng: pBom.lng });
  await sql`UPDATE spaces SET rating_avg = 4.8, rating_count = 5 WHERE id = ${idBom}`;
  // Uma nota 5 sozinha NÃO torna relevante (mínimo de avaliações).
  const pUma = dentro(7200, 4.5);
  const idUma = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-uma`, precoCents: 21000, lat: pUma.lat, lng: pUma.lng });
  await sql`UPDATE spaces SET rating_avg = 5.0, rating_count = 1 WHERE id = ${idUma}`;
  // Rascunho perto: nunca aparece.
  const idRascunho = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-rascunho`, precoCents: 9000, status: 'draft', lat: dentro(200, 0.1).lat, lng: dentro(200, 0.1).lng });
  // Disponível só daqui a 30 dias.
  const idFuturo = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-futuro`, precoCents: 9500, lat: dentro(500, 2.2).lat, lng: dentro(500, 2.2).lng });
  await sql`UPDATE spaces SET available_from = (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30 WHERE id = ${idFuturo}`;

  const area = {
    west: centro.lng - 0.2, south: centro.lat - 0.2, east: centro.lng + 0.2, north: centro.lat + 0.2,
  };
  const base: ExploreQuery = {
    bbox: area, zoom: 12, center: centro, radiusMeters: 2000, priceMaxCents: null, categories: [], availableNow: false,
  };
  const ids = (r: { pins: { id: string }[] }) => new Set(r.pins.map((p) => p.id));

  const r1 = await exploreSpaces(base);
  const esperadosPerto = ['g', 'd', 'l', 'e', 'o'].map((s) => idDe.get(s)!);
  assert('dentro do raio aparecem todos os espaços próximos',
    esperadosPerto.every((id) => ids(r1).has(id)), `${r1.pins.filter((p) => !p.outside).length} perto`);
  assert('o espaço que só fica disponível em 30 dias aparece (a disponibilidade é filtro, não padrão)', ids(r1).has(idFuturo));
  assert('rascunho nunca aparece', !ids(r1).has(idRascunho));
  expect('total conta o que está dentro do raio (5 + o de 30 dias)', r1.total, 6);
  assert('fora do raio aparece o Destaque', ids(r1).has(idDestaque));
  assert('fora do raio aparece o bem avaliado (nota boa e avaliações suficientes)', ids(r1).has(idBom));
  assert('uma única avaliação 5 não basta para "relevante"', !ids(r1).has(idUma));
  assert('fora do raio, anúncio comum não aparece',
    [0, 1, 2].every((i) => !ids(r1).has(idDe.get(`longe${i}`)!)));
  expect('só 2 marcadores fora do raio (Destaque + bem avaliado)', r1.outsideShown, 2);
  assert('o marcador de fora vem marcado como "fora do raio"', r1.pins.find((p) => p.id === idDestaque)?.outside === true);
  assert('o Destaque traz o selo da promoção', r1.pins.find((p) => p.id === idDestaque)?.promotion === 'destaque');
  assert('Destaque vem antes dos comuns fora do raio na ordem de resposta',
    r1.pins.findIndex((p) => p.id === idDestaque) < r1.pins.findIndex((p) => p.id === idBom));

  const semRaio = await exploreSpaces({ ...base, radiusMeters: null });
  expect('sem raio, tudo que está na área conta (6 perto + 3 longe + Destaque + 2 avaliados)', semRaio.total, 12);
  assert('sem raio, anúncio comum de longe aparece', ids(semRaio).has(idDe.get('longe0')!));
  expect('sem raio, nenhum marcador é "fora do raio"', semRaio.pins.filter((p) => p.outside).length, 0);

  const preco = await exploreSpaces({ ...base, priceMaxCents: 15000 });
  assert('filtro de preço: só até R$ 150', preco.pins.filter((p) => !p.outside).every((p) => (p.priceMonthlyCents ?? 0) <= 15000),
    `${preco.pins.filter((p) => !p.outside).length} resultados`);
  expect('filtro de preço: garagem, depósito e oficina (e o de 30 dias, R$ 95)', preco.total, 4);

  const categoria = await exploreSpaces({ ...base, categories: ['garagem'] });
  // Perto há duas garagens: a "g" e a que só abre em 30 dias (o tipo padrão da fixture é garagem).
  expect('filtro de categoria: só garagem', categoria.pins.filter((p) => !p.outside).map((p) => p.category), ['garagem', 'garagem']);
  expect('filtro de categoria: o total acompanha', categoria.total, 2);
  const duas = await exploreSpaces({ ...base, categories: ['loja', 'escritorio'] });
  expect('duas categorias juntas', duas.pins.filter((p) => !p.outside).map((p) => p.category).sort(), ['escritorio', 'loja']);

  const agora = await exploreSpaces({ ...base, availableNow: true });
  assert('"disponível agora" tira o que só abre depois', !ids(agora).has(idFuturo));
  assert('"disponível agora" mantém os que abrem hoje', esperadosPerto.every((id) => ids(agora).has(id)));

  // ---- Privacidade: o marcador é sempre o ponto PÚBLICO.
  const [garagem] = await sql<{ al: number; ag: number; el: number; eg: number }[]>`
    SELECT ST_Y(approx_location) AS al, ST_X(approx_location) AS ag, ST_Y(location) AS el, ST_X(location) AS eg
      FROM spaces WHERE id = ${idDe.get('g')!}`;
  const pinGaragem = r1.pins.find((p) => p.id === idDe.get('g')!)!;
  expect('garagem (residencial): o marcador é o ponto aproximado', [pinGaragem.lat, pinGaragem.lng], [garagem!.al, garagem!.ag]);
  assert('garagem: o ponto do marcador NÃO é o exato', pinGaragem.lat !== garagem!.el || pinGaragem.lng !== garagem!.eg);
  const [loja] = await sql<{ el: number; eg: number }[]>`
    SELECT ST_Y(location) AS el, ST_X(location) AS eg FROM spaces WHERE id = ${idDe.get('l')!}`;
  const pinLoja = r1.pins.find((p) => p.id === idDe.get('l')!)!;
  expect('loja (comercial): o marcador é o ponto exato, por regra do banco', [pinLoja.lat, pinLoja.lng], [loja!.el, loja!.eg]);
  const chaves = Object.keys(pinGaragem).sort();
  assert('o marcador não carrega rua, número nem dono', !chaves.some((k) => /street|number|owner|complement|address/i.test(k)), chaves.join(','));

  // ---- Agrupamento: muita coisa na mesma área vira círculos com contagem.
  await sql`
    INSERT INTO spaces (owner_id, slug, type, title, description, street, number, district, city, state,
                        available_from, price_monthly_cents, quantity_offered, size_m2, draft_step, location, approx_location)
    SELECT ${donoId}, ${`${tag}-massa-`} || g, 'garagem', 'Espaço em massa ' || g,
           'Descricao com mais de vinte caracteres para passar na regra do banco.',
           'Rua Exata', '1', 'Centro', 'Cidade Teste', 'TO',
           (now() AT TIME ZONE 'America/Sao_Paulo')::date, 10000 + g, 1, 18, 8,
           ST_SetSRID(ST_MakePoint(${centro.lng + 0.12} + (g % 10) * 0.0004, ${centro.lat + 0.12} + (g / 10) * 0.0004), 4326),
           NULL
      FROM generate_series(0, 119) g`;
  const massa = await sql<{ id: string }[]>`SELECT id FROM spaces WHERE slug LIKE ${`${tag}-massa-%`}`;
  for (const m of massa) {
    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${m.id}, ${`${donoId}/${m.id}/f${n}.jpg`}, ${n})`;
    }
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE slug LIKE ${`${tag}-massa-%`}`;

  const cheio = await exploreSpaces({ ...base, radiusMeters: null, zoom: 11 });
  assert('com 120+ espaços na área, o mapa agrupa', cheio.clusters.length > 0, `${cheio.clusters.length} grupos`);
  const somaGrupos = cheio.clusters.reduce((s, c) => s + c.count, 0);
  const individuais = cheio.pins.filter((p) => !p.outside).length;
  expect('nada se perde: grupos + marcadores individuais = total', somaGrupos + individuais, cheio.total);
  assert('a resposta tem tamanho limitado, não importa quantos anúncios existam',
    cheio.pins.length + cheio.clusters.length <= 220, `${cheio.pins.length} marcadores + ${cheio.clusters.length} grupos`);
  assert('os Destaques continuam individuais mesmo com a área agrupada', cheio.pins.some((p) => p.id === idDestaque));
  const maior = [...cheio.clusters].sort((a, b) => b.count - a.count)[0]!;
  assert('o grupo informa a área que cobre (para dar zoom ao tocar)',
    maior.bounds[0] <= maior.lng && maior.bounds[2] >= maior.lng && maior.bounds[1] <= maior.lat && maior.bounds[3] >= maior.lat);
  assert('o grupo está dentro da área pedida', maior.lng >= area.west && maior.lng <= area.east && maior.lat >= area.south && maior.lat <= area.north);

  // Dando zoom no aglomerado, os marcadores individuais voltam.
  const zoomNoGrupo = await exploreSpaces({
    ...base, radiusMeters: null, zoom: 18,
    bbox: { west: centro.lng + 0.119, south: centro.lat + 0.119, east: centro.lng + 0.124, north: centro.lat + 0.124 },
  });
  assert('com zoom na área, volta a mostrar espaço por espaço ou grupos bem menores',
    zoomNoGrupo.clusters.length === 0 || Math.max(...zoomNoGrupo.clusters.map((c) => c.count)) < maior.count,
    `${zoomNoGrupo.pins.length} marcadores + ${zoomNoGrupo.clusters.length} grupos`);

  const paginaVazia = await exploreSpaces({ ...base, bbox: { west: 10, south: 10, east: 10.1, north: 10.1 }, center: null, radiusMeters: null });
  expect('área sem espaços devolve vazio, sem erro', [paginaVazia.pins.length, paginaVazia.clusters.length, paginaVazia.total], [0, 0, 0]);

  // ---- Prévia
  const previa = await getMapPreview(idDe.get('g')!);
  assert('prévia de espaço publicado traz título, preço e vagas', previa?.title != null && previa.priceMonthlyCents === 8000 && previa.quantityOffered === 1);
  expect('prévia de rascunho não existe', await getMapPreview(idRascunho), null);
  expect('prévia de id inexistente não existe', await getMapPreview(crypto.randomUUID()), null);
  const chavesPrevia = Object.keys(previa ?? {});
  assert('a prévia não carrega endereço nem dono', !chavesPrevia.some((k) => /street|number|owner|complement/i.test(k)), chavesPrevia.join(','));

  // =========================================================================
  secao('4. Rotas da API');
  // =========================================================================
  const { NextRequest } = await import('next/server');
  const { GET: getMapa } = await import('../src/app/api/mapa/route');
  const { GET: getPrevia } = await import('../src/app/api/mapa/previa/[id]/route');

  const ipTeste = `10.${Date.now() % 250}.1.1`;
  const chamar = (qs: string, ip = ipTeste) =>
    getMapa(new NextRequest(`http://localhost/api/mapa?${qs}`, { headers: { 'x-forwarded-for': ip } }));

  const resp = await chamar(`w=${area.west}&s=${area.south}&e=${area.east}&n=${area.north}&z=12&lat=${centro.lat}&lng=${centro.lng}&raio=2000`);
  expect('API responde 200 para uma área válida', resp.status, 200);
  const corpo = (await resp.json()) as { pins: unknown[]; clusters: unknown[]; total: number };
  assert('API devolve marcadores, grupos e total', Array.isArray(corpo.pins) && Array.isArray(corpo.clusters) && typeof corpo.total === 'number');
  expect('API não deixa a resposta ser guardada em cache', resp.headers.get('cache-control'), 'no-store');
  expect('API recusa área inválida com 400', (await chamar('w=1&s=1&e=0&n=0')).status, 400);

  const respPrevia = await getPrevia(
    new NextRequest('http://localhost/x', { headers: { 'x-forwarded-for': ipTeste } }),
    { params: Promise.resolve({ id: idDe.get('g')! }) },
  );
  expect('prévia: 200 para espaço publicado', respPrevia.status, 200);
  const respRascunho = await getPrevia(
    new NextRequest('http://localhost/x', { headers: { 'x-forwarded-for': ipTeste } }),
    { params: Promise.resolve({ id: idRascunho }) },
  );
  expect('prévia: 404 para rascunho', respRascunho.status, 404);
  const respLixo = await getPrevia(
    new NextRequest('http://localhost/x', { headers: { 'x-forwarded-for': ipTeste } }),
    { params: Promise.resolve({ id: "'; DROP TABLE spaces; --" }) },
  );
  expect('prévia: 404 para id que não é UUID (sem tocar no banco)', respLixo.status, 404);

  const ipLimite = `10.250.${Date.now() % 250}.9`;
  let primeira429 = 0;
  for (let i = 1; i <= 130; i++) {
    const r = await chamar('w=1&s=1&e=0&n=0', ipLimite);
    if (r.status === 429) { primeira429 = i; break; }
  }
  assert('limite por IP: depois de 120 consultas no minuto, responde 429', primeira429 > 0 && primeira429 <= 121, `na consulta ${primeira429}`);
  const outroIp = await chamar('w=1&s=1&e=0&n=0', `10.251.${Date.now() % 250}.9`);
  expect('o limite é por IP: outro endereço continua passando', outroIp.status, 400);

  assert('o teste respeitou o teto de marcadores individuais', MAX_INDIVIDUAL_PINS === 60 && MAX_OUTSIDE_PINS === 12);

  // Limpeza do que este teste criou.
  await sql`DELETE FROM spaces WHERE owner_id = ${donoId}`;

  console.log(`\n${passed} verificações passaram, ${failed} falharam.`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(` - ${f}`);
  }
}

main()
  .catch((err) => {
    console.error('\nErro inesperado:', err);
    failed++;
  })
  .finally(async () => {
    await sql`DELETE FROM spaces WHERE owner_id = ${donoId}`.catch(() => {});
    // Este teste não grava nada em audit_logs, então o usuário sai sem precisar mexer no trigger de só-acrescentar.
    await sql`DELETE FROM auth.users WHERE id = ${donoId}`.catch(() => {});
    await sql.end({ timeout: 2 }).catch(() => {});
    process.exit(failed > 0 ? 1 : 0);
  });

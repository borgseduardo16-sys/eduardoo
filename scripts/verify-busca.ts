/**
 * Verificacao da busca, mapa e favoritos (Parte 3).
 *
 * Testa contra um Postgres real: cria anuncios publicados em lugares e
 * precos diferentes, roda a busca de verdade, confere numero e ORDEM dos
 * resultados. Para CEP e geocodificacao, sobe o mesmo servidor de contrato
 * usado em verify-integracoes.ts (ver scripts/testbed/server.ts) — a rede
 * externa e bloqueada neste ambiente, e um teste que so verifica "a funcao
 * nao explodiu" sem checar o valor de volta nao prova nada.
 *
 *   pnpm tsx scripts/verify-busca.ts
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
import { startTestbed, type Testbed } from './testbed/server';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 1, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;
function ok(name: string, detail = '') {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`);
}
function bad(name: string, detail: string) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`);
}
function expect(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name, JSON.stringify(actual));
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
function assert(name: string, condicao: boolean, detalhe = '') {
  if (condicao) ok(name, detalhe);
  else bad(name, detalhe || 'condicao falsa');
}

/** Distancia real em metros — usada so para CONFERIR o que o banco calculou. */
function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const tag = `busca-${Date.now()}`;
const dono = crypto.randomUUID();
const userA = crypto.randomUUID();
const userB = crypto.randomUUID();

// Pontos reais.
const CENTRO_COLATINA = { lat: -19.5386, lng: -40.6295 };
const SAO_SILVANO = { lat: -19.5450, lng: -40.6320 }; // ~900m do centro
const VILA_VELHA = { lat: -20.3297, lng: -40.2925 }; // ~100km de Colatina

type Seed = {
  slug: string; title: string; type: string; district: string; city: string; state: string;
  price: number; point: { lat: number; lng: number }; features?: string[]; availableInDays?: number;
};

const SEEDS: Seed[] = [
  { slug: 's1', title: 'Garagem coberta no Centro', type: 'garagem', district: 'Centro', city: 'Colatina', state: 'ES', price: 20000, point: CENTRO_COLATINA, features: ['coberto', 'portao'] },
  { slug: 's2', title: 'Vaga de moto no São Silvano', type: 'vaga_moto', district: 'Sao Silvano', city: 'Colatina', state: 'ES', price: 8000, point: SAO_SILVANO, features: ['coberto'] },
  { slug: 's3', title: 'Depósito para guardar móveis', type: 'deposito', district: 'Centro', city: 'Vila Velha', state: 'ES', price: 45000, point: VILA_VELHA, features: [] },
  { slug: 's4', title: 'Galpão grande com pé-direito alto', type: 'galpao', district: 'Centro', city: 'Colatina', state: 'ES', price: 350000, point: CENTRO_COLATINA, features: ['acesso_caminhao'] },
  { slug: 's5', title: 'Sala comercial disponível só mês que vem', type: 'sala', district: 'Centro', city: 'Colatina', state: 'ES', price: 60000, point: CENTRO_COLATINA, features: [], availableInDays: 45 },
];

let testbed: Testbed;
const ids: Record<string, string> = {};

async function seed() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${dono}, ${`${tag}-dono@exemplo.invalid`}),
    (${userA}, ${`${tag}-a@exemplo.invalid`}),
    (${userB}, ${`${tag}-b@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner' WHERE id=${dono}`;

  for (const s of SEEDS) {
    const slug = `${tag}-${s.slug}`;
    const disponivel = s.availableInDays
      ? sql`CURRENT_DATE + ${s.availableInDays}::int`
      : sql`CURRENT_DATE`;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
        available_from, price_monthly_cents, size_m2, location)
      VALUES (${dono}, ${slug}, ${s.type}, ${s.title},
        'Descricao com mais de vinte caracteres para passar na regra do banco.',
        ${s.district}, ${s.city}, ${s.state}, ${disponivel}, ${s.price}, 20,
        ST_SetSRID(ST_MakePoint(${s.point.lng}, ${s.point.lat}), 4326))
      RETURNING id`;
    const id = row!.id;
    ids[s.slug] = id;

    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position)
        VALUES (${id}, ${`${dono}/${id}/f${n}.jpg`}, ${n})`;
    }
    for (const f of s.features ?? []) {
      await sql`INSERT INTO space_features (space_id, feature_key) VALUES (${id}, ${f})`;
    }
    await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  }

  // Um anuncio PAUSADO no mesmo lugar — nunca pode aparecer em busca nenhuma.
  const [pausado] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, price_monthly_cents, size_m2, location, status)
    VALUES (${dono}, ${`${tag}-pausado`}, 'garagem', 'Garagem pausada no Centro',
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      'Centro', 'Colatina', 'ES', CURRENT_DATE, 15000, 20,
      ST_SetSRID(ST_MakePoint(${CENTRO_COLATINA.lng}, ${CENTRO_COLATINA.lat}), 4326), 'draft')
    RETURNING id`;
  ids.pausado = pausado!.id;
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${ids.pausado}, ${`${dono}/${ids.pausado}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${ids.pausado}`;
  await sql`UPDATE spaces SET status='paused' WHERE id=${ids.pausado}`;

  ok('semente criada', `${SEEDS.length} publicados + 1 pausado, dono + 2 usuarios`);
}

async function main() {
  console.log('\n\x1b[1m0. Ambiente\x1b[0m');
  testbed = await startTestbed();
  ok('servidor de contrato no ar (CEP e geocodificacao)', testbed.url);

  process.env.CEP_BRASILAPI_BASE = testbed.url;
  process.env.CEP_VIACEP_BASE = testbed.url;
  process.env.GEOCODING_NOMINATIM_BASE = testbed.url;
  process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  testbed.ceps.set('29700000', {
    cep: '29700000', state: 'ES', city: 'Colatina', neighborhood: 'Centro',
    street: 'Avenida Getulio Vargas',
    location: { coordinates: { latitude: String(CENTRO_COLATINA.lat), longitude: String(CENTRO_COLATINA.lng) } },
  });
  testbed.ceps.set('29701000', {
    cep: '29701000', state: 'ES', city: 'Colatina', neighborhood: 'Sao Silvano',
    street: 'Rua Pedro Zangrandi',
    // Sem coordenada de proposito: testa o caminho "CEP achou, mas so a cidade".
  });
  testbed.geocodes.set('avenida beira mar, vila velha, es', {
    lat: VILA_VELHA.lat, lon: VILA_VELHA.lng, display_name: 'Avenida Beira Mar, Vila Velha - ES',
  });

  await seed();

  const { listPublishedSpaces, matchKnownLocation, effectiveSort } = await import('../src/lib/spaces/queries');
  const { resolveLocation } = await import('../src/lib/spaces/resolve-location');
  const { matchSpaceTypeKeyword } = await import('../src/lib/spaces/keywords');
  const { listUserFavoriteIds, listUserFavoriteSpaces } = await import('../src/lib/favorites/queries');

  // ===========================================================================
  console.log('\n\x1b[1m1. Busca por texto\x1b[0m');
  // ===========================================================================
  {
    const porTitulo = await listPublishedSpaces({ textQuery: 'móveis', limit: 10 });
    assert('texto do titulo acha o anuncio certo', porTitulo.some((r) => r.id === ids.s3), `${porTitulo.length} resultado(s)`);

    const porCidade = await listPublishedSpaces({ textQuery: 'Colatina', limit: 20 });
    const idsColatina = porCidade.map((r) => r.id);
    assert('texto de cidade acha os anuncios de Colatina',
      [ids.s1, ids.s2, ids.s4, ids.s5].every((id) => idsColatina.includes(id)));
    assert('texto de cidade NAO traz o de Vila Velha', !idsColatina.includes(ids.s3));

    expect('palavra-chave "moto" reconhece o tipo vaga_moto', matchSpaceTypeKeyword('procuro moto pra guardar'), 'vaga_moto');
    expect('palavra-chave "depósito" reconhece o tipo deposito', matchSpaceTypeKeyword('quero um depósito'), 'deposito');
    expect('palavra sem relacao nenhuma nao reconhece nada', matchSpaceTypeKeyword('xablau'), null);
  }

  // ===========================================================================
  console.log('\n\x1b[1m2. Distancia — filtro, ordenacao e o numero bate\x1b[0m');
  // ===========================================================================
  {
    const perto = await listPublishedSpaces({
      point: CENTRO_COLATINA, radiusMeters: 2_000, sort: 'distance', limit: 10,
    });
    const idsPerto = perto.map((r) => r.id);
    assert('raio de 2 km inclui os 2 anuncios de Colatina perto', idsPerto.includes(ids.s1) && idsPerto.includes(ids.s2));
    assert('raio de 2 km NAO inclui Vila Velha (a ~100 km)', !idsPerto.includes(ids.s3));

    /*
     * A distancia mostrada NUNCA e a partir do ponto exato — e sempre do
     * `approx_location`, deslocado por design ate 300 m (migracao 0007,
     * `fuzz_location`). s1/s4/s5 estao no MESMO ponto exato da busca, entao
     * a distancia deles E o proprio deslocamento de privacidade: fica em
     * [0, 300] m, nunca 0. Por isso as checagens abaixo sao por FAIXA, e nao
     * por um numero fixo — um numero fixo estaria testando o deslocamento
     * aleatorio, nao a busca.
     */
    const primeiro = perto[0]!;
    assert('mais proximo vem de quem esta no mesmo ponto da busca (nao do que esta a ~900 m)',
      [ids.s1, ids.s4, ids.s5].includes(primeiro.id),
      `${primeiro.title}: ${Math.round(primeiro.distanceMeters ?? -1)} m`);

    for (const idProximo of [ids.s1, ids.s4, ids.s5]) {
      const r = perto.find((x) => x.id === idProximo)!;
      assert(`${r.title.slice(0, 24)}…: distancia cabe no deslocamento de privacidade (<= 300 m)`,
        r.distanceMeters !== null && r.distanceMeters > 0 && r.distanceMeters <= 305,
        `${Math.round(r.distanceMeters ?? -1)} m`);
    }

    const doSaoSilvano = perto.find((r) => r.id === ids.s2)!;
    const distanciaReal = haversine(CENTRO_COLATINA, SAO_SILVANO);
    assert('a distancia mostrada fica perto da real, dentro da margem de privacidade (+-300 m)',
      Math.abs((doSaoSilvano.distanceMeters ?? 0) - distanciaReal) <= 305,
      `banco: ${Math.round(doSaoSilvano.distanceMeters ?? 0)} m, real: ${Math.round(distanciaReal)} m`);

    /*
     * Checagem PRECISA do calculo em si (sem a ofuscacao de privacidade no
     * meio): dois pontos LITERAIS via SQL direto, comparados com o mesmo
     * haversine usado acima.
     *
     * Tolerancia de 1%, nao de poucos metros: `ST_Distance` em `geography`
     * usa o elipsoide WGS84 (o formato real da Terra, ligeiramente achatado
     * nos polos); o haversine daqui usa esfera perfeita. Os dois SEMPRE
     * divergem um pouco — para ~750 m isso da uns 3 m de diferenca — e essa
     * divergencia e esperada, nao bug. O que a checagem prova e que as duas
     * contas concordam DE VERDADE, nao que sao a mesma formula.
     */
    const [pg] = await sql<{ metros: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${CENTRO_COLATINA.lng}, ${CENTRO_COLATINA.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${SAO_SILVANO.lng}, ${SAO_SILVANO.lat}), 4326)::geography
      ) AS metros`;
    assert('ST_Distance do Postgres bate com o haversine em JS (sem ofuscacao, tolerancia de elipsoide)',
      Math.abs(pg!.metros - distanciaReal) / distanciaReal < 0.01,
      `postgres: ${pg!.metros.toFixed(1)} m, haversine: ${distanciaReal.toFixed(1)} m, diferenca: ${(Math.abs(pg!.metros - distanciaReal) / distanciaReal * 100).toFixed(2)}%`);

    const longe = await listPublishedSpaces({ point: CENTRO_COLATINA, radiusMeters: 500, limit: 10 });
    assert('raio de 500 m exclui o Sao Silvano (a ~900 m)', !longe.some((r) => r.id === ids.s2));

    const qualquerDistancia = await listPublishedSpaces({ point: VILA_VELHA, sort: 'distance', limit: 20 });
    assert('sem raio, qualquer distancia entra (Vila Velha aparece buscando do proprio ponto)',
      qualquerDistancia[0]?.id === ids.s3);

    expect('pedir "distance" sem ponto de referencia cai para "recent"', effectiveSort('distance', false), 'recent');
    expect('pedir "distance" com ponto mantem "distance"', effectiveSort('distance', true), 'distance');
    expect('sem pedido e sem ponto, o padrao e "recent"', effectiveSort(undefined, false), 'recent');
  }

  // ===========================================================================
  console.log('\n\x1b[1m3. Preco, tipo, caracteristicas e disponibilidade\x1b[0m');
  // ===========================================================================
  {
    const faixa = await listPublishedSpaces({ priceMinCents: 10000, priceMaxCents: 30000, limit: 20 });
    const idsFaixa = faixa.map((r) => r.id);
    expect('faixa de preco pega so o que esta dentro', idsFaixa.sort(), [ids.s1].sort());

    const porTipo = await listPublishedSpaces({ type: 'vaga_moto', limit: 20 });
    expect('filtro de tipo pega so aquele tipo', porTipo.map((r) => r.id), [ids.s2]);

    const comCoberto = await listPublishedSpaces({ featureKeys: ['coberto'], limit: 20 });
    const idsCoberto = comCoberto.map((r) => r.id).sort();
    expect('filtro de UMA caracteristica', idsCoberto, [ids.s1, ids.s2].sort());

    const comDuas = await listPublishedSpaces({ featureKeys: ['coberto', 'portao'], limit: 20 });
    expect('filtro de DUAS caracteristicas (E, nao OU)', comDuas.map((r) => r.id), [ids.s1]);

    const disponivelHoje = await listPublishedSpaces({ availableNow: true, limit: 20 });
    const idsHoje = disponivelHoje.map((r) => r.id);
    assert('disponivel agora inclui o que ja esta disponivel', idsHoje.includes(ids.s1));
    assert('disponivel agora EXCLUI o que so libera daqui 45 dias', !idsHoje.includes(ids.s5));

    const ordenadoPreco = await listPublishedSpaces({ city: 'Colatina', sort: 'price_asc', limit: 20 });
    const precos = ordenadoPreco.map((r) => r.priceMonthlyCents);
    assert('ordenar por menor preco vem crescente', precos.every((p, i) => i === 0 || p >= precos[i - 1]!), JSON.stringify(precos));
  }

  // ===========================================================================
  console.log('\n\x1b[1m4. Privacidade e visibilidade\x1b[0m');
  // ===========================================================================
  {
    const tudoColatina = await listPublishedSpaces({ city: 'Colatina', limit: 50 });
    assert('anuncio PAUSADO nunca aparece na busca por texto/cidade nenhuma',
      !tudoColatina.some((r) => r.id === ids.pausado));

    const pertoDoPausado = await listPublishedSpaces({ point: CENTRO_COLATINA, radiusMeters: 100, limit: 50 });
    assert('anuncio pausado tambem nao aparece na busca por distancia',
      !pertoDoPausado.some((r) => r.id === ids.pausado));
  }

  // ===========================================================================
  console.log('\n\x1b[1m5. Resolver "onde" — CEP, cidade real, geocodificacao\x1b[0m');
  // ===========================================================================
  {
    const porGps = await resolveLocation({ lat: CENTRO_COLATINA.lat, lng: CENTRO_COLATINA.lng });
    expect('GPS direto: source=gps', porGps.source, 'gps');
    expect('GPS direto: usa o ponto exato mandado', porGps.point, CENTRO_COLATINA);

    const porCep = await resolveLocation({ onde: '29700-000' });
    expect('CEP com coordenada: source=cep', porCep.source, 'cep');
    assert('CEP com coordenada devolve um ponto perto do centro',
      porCep.point != null && haversine(porCep.point, CENTRO_COLATINA) < 50);

    const cepSemCoordenada = await resolveLocation({ onde: '29701000' });
    expect('CEP sem coordenada: ainda assim source=cep', cepSemCoordenada.source, 'cep');
    expect('CEP sem coordenada: sem ponto', cepSemCoordenada.point, null);
    expect('CEP sem coordenada: filtra pela cidade do CEP', cepSemCoordenada.cityFilter, 'Colatina');

    const cepInexistente = await resolveLocation({ onde: '00000-000' });
    expect('CEP que nao existe: marca cepNotFound', cepInexistente.cepNotFound, true);

    const porCidade = await resolveLocation({ onde: 'colatina' });
    expect('cidade real (minusculo, sem coordenada): source=city_match', porCidade.source, 'city_match');
    expect('cidade real: filtro exato', porCidade.cityFilter, 'Colatina');
    expect('cidade real: sem inventar ponto', porCidade.point, null);

    const porBairro = await resolveLocation({ onde: 'sao silv' });
    expect('bairro real por prefixo: source=city_match', porBairro.source, 'city_match');
    expect('bairro real: filtro de bairro', porBairro.districtFilter, 'Sao Silvano');

    const porEndereco = await resolveLocation({ onde: 'Avenida Beira Mar, Vila Velha, ES' });
    expect('endereco sem cidade conhecida: cai pra geocodificacao', porEndereco.source, 'geocoded');
    assert('geocodificacao devolve o ponto certo',
      porEndereco.point != null && haversine(porEndereco.point, VILA_VELHA) < 50);

    const semNada = await resolveLocation({ onde: 'lugar-que-nao-existe-em-lugar-nenhum-abc123' });
    expect('nada resolve: source=unresolved', semNada.source, 'unresolved');
  }

  // ===========================================================================
  console.log('\n\x1b[1m6. Catalogo de cidade/bairro (matchKnownLocation)\x1b[0m');
  // ===========================================================================
  {
    expect('cidade exata', await matchKnownLocation('Colatina'), { kind: 'city', city: 'Colatina', state: 'ES' });
    expect('cidade por prefixo', await matchKnownLocation('Colat'), { kind: 'city', city: 'Colatina', state: 'ES' });
    expect('bairro exato', await matchKnownLocation('Sao Silvano'), { kind: 'district', district: 'Sao Silvano', city: 'Colatina', state: 'ES' });
    expect('erro de digitacao pequeno ainda acha por similaridade',
      (await matchKnownLocation('Collatina'))?.city, 'Colatina');
    expect('texto sem relacao nenhuma nao acha nada', await matchKnownLocation('xyzabc999'), null);
  }

  // ===========================================================================
  console.log('\n\x1b[1m7. Favoritos — CRUD e permissao entre dois usuarios\x1b[0m');
  // ===========================================================================
  {
    /*
     * O mock precisa existir ANTES de `favorites/actions` ser importado pela
     * primeira vez, e precisa ser UMA SO funcao pelo resto do teste: import
     * estatico destrutura `requireUserOrThrow` na hora do `import` — trocar
     * o require.cache depois disso nao alcanca quem ja importou. Por isso o
     * "trocar de usuario" e o "deslogar" abaixo mudam um objeto mutavel que
     * a MESMA funcao mock le a cada chamada, em vez de trocar a funcao.
     */
    const sessao: { logado: boolean; userId: string } = { logado: true, userId: userA };
    const dalPath = req.resolve('../src/lib/auth/dal.ts');
    req.cache[dalPath] = {
      id: dalPath, filename: dalPath, loaded: true,
      exports: {
        requireUserOrThrow: async () => {
          if (!sessao.logado) throw new Error('sem sessao (mock)');
          return { id: sessao.userId, role: 'user' };
        },
        getCurrentUser: async () => null,
      },
    } as never;
    const cachePath = req.resolve('next/cache');
    req.cache[cachePath] = {
      id: cachePath, filename: cachePath, loaded: true,
      exports: { revalidatePath: () => {}, revalidateTag: () => {} },
    } as never;

    const { toggleFavoriteAction } = await import('../src/lib/favorites/actions');

    const fdFavoritar = new FormData();
    fdFavoritar.set('spaceId', ids.s1!);
    const rFav = await toggleFavoriteAction(fdFavoritar);
    expect('A favorita o espaco s1', rFav, { ok: true, favorited: true });

    const favsA1 = await listUserFavoriteIds(userA);
    assert('favorito de A ficou salvo no banco', favsA1.has(ids.s1!));

    // B favorita o MESMO espaco — tem que ser independente do favorito de A.
    sessao.userId = userB;
    const fdFavoritarB = new FormData();
    fdFavoritarB.set('spaceId', ids.s1!);
    await toggleFavoriteAction(fdFavoritarB);
    const favsB = await listUserFavoriteIds(userB);
    assert('favorito de B tambem ficou salvo, independente do de A', favsB.has(ids.s1!));

    const linhaCrua = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM favorites WHERE space_id=${ids.s1}`;
    expect('existem DUAS linhas de favorito para o mesmo espaco (uma por usuario)', linhaCrua[0]!.n, 2);

    // A tenta "desfavoritar" de novo (alterna) — so mexe no PROPRIO favorito.
    sessao.userId = userA;
    const fdDesfavoritar = new FormData();
    fdDesfavoritar.set('spaceId', ids.s1!);
    const rDesfav = await toggleFavoriteAction(fdDesfavoritar);
    expect('A desfavorita (alterna de novo)', rDesfav, { ok: true, favorited: false });

    const favsA2 = await listUserFavoriteIds(userA);
    assert('favorito de A sumiu', !favsA2.has(ids.s1!));
    const favsBDepois = await listUserFavoriteIds(userB);
    assert('favorito de B continua intacto — A nao mexeu nele', favsBDepois.has(ids.s1!));

    const listaB = await listUserFavoriteSpaces(userB);
    assert('pagina de favoritos de B mostra o espaco s1', listaB.some((f) => f.id === ids.s1));

    // Pausar o s1 nao apaga o favorito — so muda o status mostrado.
    await sql`UPDATE spaces SET status='paused' WHERE id=${ids.s1}`;
    const listaBDepoisDePausar = await listUserFavoriteSpaces(userB);
    const favS1 = listaBDepoisDePausar.find((f) => f.id === ids.s1);
    assert('favorito de anuncio pausado continua aparecendo, com o status certo',
      favS1?.status === 'paused', JSON.stringify(favS1?.status));
    await sql`UPDATE spaces SET status='published' WHERE id=${ids.s1}`;

    // Sem sessao: a acao recusa, nao finge sucesso.
    sessao.logado = false;
    const fdSemSessao = new FormData();
    fdSemSessao.set('spaceId', ids.s1!);
    const rSemSessao = await toggleFavoriteAction(fdSemSessao);
    assert('sem sessao, a action recusa em vez de gravar', !rSemSessao.ok, rSemSessao.message ?? '');
  }
}

async function limpar() {
  try {
    await sql`DELETE FROM favorites WHERE user_id IN (${userA}, ${userB})`;
    await sql`DELETE FROM spaces WHERE owner_id = ${dono}`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN (${dono}, ${userA}, ${userB})`;
      await tx`DELETE FROM auth.users WHERE id IN (${dono}, ${userA}, ${userB})`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 160)}\x1b[0m`);
  }
  await testbed?.close();
  await sql.end({ timeout: 5 });
}

main()
  .then(async () => {
    await limpar();
    console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('\n\x1b[31mErro fatal:\x1b[0m', err);
    await limpar();
    process.exit(1);
  });

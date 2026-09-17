/**
 * Verificacao do sistema de anuncios (Fase 2).
 *
 * O foco e o requisito mais importante do pedido: **outro usuario nao pode
 * editar anuncio alheio**, e **o endereco exato nao vaza** na pagina publica.
 *
 * Testa contra um Postgres real, exercitando as mesmas funcoes que a
 * aplicacao usa. Cria dados, tenta violar cada regra, confirma que e recusado,
 * e limpa tudo ao final.
 *
 *   pnpm tsx scripts/verify-spaces.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

/*
 * `queries.ts` e marcado com `server-only`, que existe para impedir que ele
 * seja importado por um Client Component. Fora do Next.js esse guarda nao tem
 * o que proteger e so atrapalha o teste, entao neutralizamos o modulo aqui.
 * Precisa vir ANTES do primeiro import que o alcance.
 */
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { slugify, buildSlug } from '../src/lib/spaces/slug';
import { sniffImageType, buildImagePath, ownerFromPath } from '../src/lib/storage/images';
import { requiresMeasurement, asksMeasurement, priceHintFor } from '../src/lib/spaces/types';
import { validateMeasurements, priceStepSchema, contentStepSchema, locationStepSchema } from '../src/lib/spaces/schemas';

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
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
/** Distancia em metros entre dois pontos, pela formula de haversine. */
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

async function mustReject(name: string, fn: () => Promise<unknown>, fragment: string) {
  try {
    await fn();
    bad(name, 'o banco ACEITOU algo que deveria recusar');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(fragment.toLowerCase())) ok(name, `bloqueado: ${fragment}`);
    else bad(name, `recusou por outro motivo: ${msg.slice(0, 150)}`);
  }
}

async function main() {
  const tag = `sp-${Date.now()}`;
  const dono = crypto.randomUUID();
  const estranho = crypto.randomUUID();
  let spaceId = '';
  let slug = '';

  try {
    // =====================================================================
    console.log('\n\x1b[1m1. Regras puras do formulario\x1b[0m');
    expect('galpao exige altura', requiresMeasurement('galpao', 'ceiling_height_m'), true);
    expect('vaga de moto nao pergunta altura', asksMeasurement('vaga_moto', 'ceiling_height_m'), false);
    expect('vaga de carro nao exige metragem', requiresMeasurement('vaga_carro', 'size_m2'), false);
    expect('"outro" nao tem faixa de preco', priceHintFor('outro'), null);
    {
      const erros = validateMeasurements('galpao', { sizeM2: 200, ceilingHeightM: null });
      if (erros.ceilingHeightM) ok('galpao sem altura acusa erro');
      else bad('validacao de medida', 'aceitou galpao sem altura');
    }
    expect('titulo curto e recusado', contentStepSchema.safeParse({ title: 'Garagem', description: 'x'.repeat(30) }).success, false);
    expect('preco no passado e recusado', priceStepSchema.safeParse({ priceMonthlyCents: 18000, availableFrom: '2020-01-01' }).success, false);
    expect('coordenada fora do Brasil e recusada', locationStepSchema.safeParse({
      state: 'ES', city: 'Colatina', district: 'Centro', street: 'Rua A', number: '1',
      lat: 48.85, lng: 2.35, // Paris
    }).success, false);

    console.log('\n\x1b[1m2. Slug\x1b[0m');
    expect('acentos viram ascii', slugify('Garagem Coberta Próxima ao Centro'), 'garagem-coberta-proxima-ao-centro');
    {
      const a = buildSlug('Galpão 200m²'), b = buildSlug('Galpão 200m²');
      if (a !== b && a.startsWith('galpao-200m')) ok('slug e unico entre chamadas', `${a} / ${b}`);
      else bad('slug', `${a} vs ${b}`);
    }

    console.log('\n\x1b[1m3. Caminho de armazenamento das fotos\x1b[0m');
    {
      const path = buildImagePath(dono, 'abc', 'jpg');
      expect('caminho comeca pelo id do dono', ownerFromPath(path), dono);
      expect('caminho de terceiro nao casa com o dono', ownerFromPath('outro/x/y.jpg'), null);
      expect('JPEG reconhecido pelos bytes', sniffImageType(new Uint8Array([0xff,0xd8,0xff,0,0,0,0,0,0,0,0,0]))?.mime, 'image/jpeg');
      expect('executavel nao passa por imagem', sniffImageType(new Uint8Array([0x4d,0x5a,0x90,0,0,0,0,0,0,0,0,0])), null);
    }

    // =====================================================================
    console.log('\n\x1b[1m4. Rascunho e publicacao\x1b[0m');
    await sql`INSERT INTO auth.users (id, email) VALUES
      (${dono}, ${`dono-${tag}@example.com`}), (${estranho}, ${`estranho-${tag}@example.com`})`;
    await sql`UPDATE profiles SET role='owner', full_name='Dono Teste' WHERE id=${dono}`;

    slug = buildSlug('Galpao com entrada para caminhao');
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, status, title, price_monthly_cents, draft_step)
      VALUES (${dono}, ${slug}, 'galpao', 'draft', '', 1, 2) RETURNING id`;
    spaceId = draft.id;
    ok('rascunho criado com preco placeholder');

    await mustReject(
      'rascunho incompleto NAO vira publicado',
      () => sql`UPDATE spaces SET status='published' WHERE id=${spaceId}`,
      'spaces_published_requires',
    );

    // Preenche como o formulario faria, etapa por etapa.
    await sql`UPDATE spaces SET
      state='ES', city='Colatina', district='Sao Silvano', street='Rua das Palmeiras',
      number='120', postal_code='29703000',
      location = ST_SetSRID(ST_MakePoint(-40.6295,-19.5386),4326),
      draft_step=3 WHERE id=${spaceId}`;
    await sql`UPDATE spaces SET size_m2=200, ceiling_height_m=5.5, draft_step=4 WHERE id=${spaceId}`;
    await sql`INSERT INTO space_images (space_id, storage_path, content_type, width, height, position)
              VALUES (${spaceId}, ${`${dono}/${spaceId}/capa.jpg`}, 'image/jpeg', 1600, 1200, 0)`;
    await sql`UPDATE spaces SET
      title='Galpao 200 m2 com entrada para caminhao',
      description='Galpao amplo, piso de concreto, portao alto para caminhao truck. Energia trifasica e banheiro.',
      draft_step=6 WHERE id=${spaceId}`;
    await sql`UPDATE spaces SET price_monthly_cents=180000, available_from=CURRENT_DATE, draft_step=7 WHERE id=${spaceId}`;
    await sql`INSERT INTO space_features (space_id, feature_key) VALUES
      (${spaceId},'acesso_caminhao'),(${spaceId},'energia'),(${spaceId},'banheiro')`;

    await sql`UPDATE spaces SET status='published', published_at=now(), draft_step=8 WHERE id=${spaceId}`;
    ok('anuncio completo publica');

    console.log('\n\x1b[1m5. Privacidade da localizacao\x1b[0m');
    {
      const [row] = await sql<{ dist: number; iguais: boolean }[]>`
        SELECT ST_Distance(location::geography, approx_location::geography) AS dist,
               ST_Equals(location, approx_location) AS iguais
        FROM spaces WHERE id=${spaceId}`;
      if (!row.iguais && row.dist > 100 && row.dist < 400) {
        ok('ponto publico e deslocado do exato', `${Math.round(row.dist)} m`);
      } else {
        bad('deslocamento', `dist=${Math.round(row.dist)} iguais=${row.iguais}`);
      }

      // Duas leituras seguidas tem que dar o mesmo ponto: deslocamento
      // sorteado a cada acesso permitiria triangular o centro real.
      await sql`UPDATE spaces SET title = title WHERE id=${spaceId}`;
      const [depois] = await sql<{ dist: number }[]>`
        SELECT ST_Distance(location::geography, approx_location::geography) AS dist
        FROM spaces WHERE id=${spaceId}`;
      if (Math.abs(depois.dist - row.dist) < 0.01) ok('deslocamento e estavel entre edicoes');
      else bad('deslocamento instavel', `${row.dist} → ${depois.dist}`);
    }

    // =====================================================================
    console.log('\n\x1b[1m6. Permissoes — o teste central\x1b[0m');
    const { getOwnedSpace, getPublicSpaceBySlug, listPublishedSpaces, NotSpaceOwnerError } =
      await import('../src/lib/spaces/queries');

    try {
      await getOwnedSpace(spaceId, dono);
      ok('o dono consegue abrir o proprio anuncio para editar');
    } catch (e) {
      bad('dono bloqueado', e instanceof Error ? e.message : String(e));
    }

    try {
      await getOwnedSpace(spaceId, estranho);
      bad('OUTRO USUARIO CONSEGUIU EDITAR', 'falha grave de autorizacao');
    } catch (e) {
      if (e instanceof NotSpaceOwnerError) ok('outro usuario NAO consegue editar anuncio alheio');
      else bad('erro inesperado', e instanceof Error ? e.message : String(e));
    }

    console.log('\n\x1b[1m7. O que a pagina publica devolve\x1b[0m');
    {
      const pub = await getPublicSpaceBySlug(slug);
      if (!pub) {
        bad('pagina publica', 'anuncio publicado nao foi encontrado');
      } else {
        const campos = Object.keys(pub);
        const vazando = campos.filter((c) =>
          ['street', 'number', 'complement', 'postalCode', 'location', 'lat', 'lng'].includes(c),
        );
        if (vazando.length === 0) {
          ok('consulta publica nao traz endereco exato', `${campos.length} campos, nenhum sensivel`);
        } else {
          bad('VAZAMENTO DE ENDERECO', vazando.join(', '));
        }

        const serializado = JSON.stringify(pub);
        if (!serializado.includes('Palmeiras') && !serializado.includes('29703000')) {
          ok('rua e CEP nao aparecem nem serializando o objeto inteiro');
        } else {
          bad('VAZAMENTO', 'rua ou CEP presentes no objeto publico');
        }

        expect('mas o bairro aparece', pub.district, 'Sao Silvano');

        /*
         * Mede a DISTANCIA entre o ponto publico e o exato, nao a diferenca de
         * latitude.
         *
         * O deslocamento e um vetor em direcao derivada do id do espaco: se
         * calhar de apontar para leste ou oeste, a latitude quase nao muda e
         * todo o deslocamento vai para a longitude. Conferir um eixo so
         * acusaria vazamento onde nao ha — foi exatamente o que aconteceu, e o
         * teste falhava em ~1 de cada 3 execucoes.
         */
        if (pub.approxLat != null && pub.approxLng != null) {
          const metros = haversine(
            { lat: pub.approxLat, lng: pub.approxLng },
            { lat: -19.5386, lng: -40.6295 },
          );
          if (metros > 100 && metros < 400) {
            ok('a coordenada publica e a aproximada', `${Math.round(metros)} m do ponto real`);
          } else {
            bad('coordenada publica', `deslocamento de ${Math.round(metros)} m (esperado 100-400)`);
          }
        } else {
          bad('coordenada publica', 'aproximada ausente');
        }
      }
    }

    console.log('\n\x1b[1m8. Marketplace mostra so o que deve\x1b[0m');
    {
      const lista = await listPublishedSpaces({ limit: 50 });
      if (lista.some((s) => s.id === spaceId)) ok('anuncio publicado aparece na listagem');
      else bad('listagem', 'anuncio publicado nao apareceu');

      await sql`UPDATE spaces SET status='paused' WHERE id=${spaceId}`;
      const pausado = await listPublishedSpaces({ limit: 50 });
      if (!pausado.some((s) => s.id === spaceId)) ok('anuncio pausado some da listagem');
      else bad('listagem', 'anuncio pausado continuou aparecendo');

      if ((await getPublicSpaceBySlug(slug)) === null) ok('pagina de anuncio pausado nao abre');
      else bad('pagina publica', 'anuncio pausado ainda acessivel');

      await sql`UPDATE spaces SET status='published' WHERE id=${spaceId}`;

      // Rascunho de outra pessoa nunca pode entrar na vitrine.
      const outroSlug = buildSlug('rascunho alheio');
      await sql`INSERT INTO spaces (owner_id, slug, type, status, title, price_monthly_cents)
                VALUES (${estranho}, ${outroSlug}, 'deposito', 'draft', '', 1)`;
      const comRascunho = await listPublishedSpaces({ limit: 50 });
      if (!comRascunho.some((s) => s.slug === outroSlug)) ok('rascunho nao aparece no marketplace');
      else bad('listagem', 'rascunho vazou para o marketplace');
    }

    console.log('\n\x1b[1m9. Exclusao preserva historico\x1b[0m');
    {
      const [b] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-SP-${tag.slice(-5)}`}, ${spaceId}, ${estranho}, ${dono}, 'ended',
          CURRENT_DATE, 180000, 300, 300, 5400, 5400, 185400, 174600)
        RETURNING id`;

      // Com reserva no historico, apagar de vez levaria junto o registro
      // financeiro — o correto e arquivar.
      await mustReject(
        'apagar anuncio com reserva e impedido pelo banco',
        () => sql`DELETE FROM spaces WHERE id=${spaceId}`,
        'violates foreign key',
      );

      await sql`UPDATE spaces SET status='archived', deleted_at=now() WHERE id=${spaceId}`;
      const arquivado = await listPublishedSpaces({ limit: 50 });
      if (!arquivado.some((s) => s.id === spaceId)) ok('arquivado some do marketplace');
      else bad('arquivamento', 'continuou visivel');

      const [ainda] = await sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM bookings WHERE id=${b.id}`;
      expect('a reserva continua registrada', ainda.total, 1);
    }
  } finally {
    await sql`DELETE FROM bookings WHERE owner_id=${dono}`;
    await sql`DELETE FROM spaces WHERE owner_id IN (${dono}, ${estranho})`;
    await sql`DELETE FROM auth.users WHERE id IN (${dono}, ${estranho})`;
  }

  console.log(
    `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` +
      (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : '') + '\n',
  );
  await sql.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('\n\x1b[31mErro fatal:\x1b[0m', err);
  await sql.end();
  process.exit(1);
});

/**
 * Parte 12 no navegador DE VERDADE (Chromium + compilação de produção do
 * Next), em tela de celular (390 × 844):
 *
 *   1. o proprietário configura "Como alugar" pela tela (3 vagas, por mês e
 *      por hora) e publica;
 *   2. o locatário reserva 2 horas pela página do anúncio, vê o QR do Pix e a
 *      tela confirma sozinha quando o webhook chega;
 *   3. o tempo restante aparece em Meus aluguéis — e NÃO na tela principal;
 *   4. com a cobrança automática recusada: aviso "Pagamento pendente" ao abrir
 *      o app, com X; ponto no menu "Meus aluguéis"; "!" SÓ no aluguel com
 *      problema; tela de resolução com "Pagar agora" (Pix na mesma cobrança) e
 *      "Cancelar aluguel"; tudo some quando o pagamento é resolvido.
 *
 * Mesma infraestrutura de scripts/verify-integracoes.ts: dublê HTTP dos
 * serviços externos (scripts/testbed/server.ts), Postgres real, webhooks pela
 * rota HTTP real. As capturas de tela ficam numa pasta temporária (impressa
 * no fim) — servem para a revisão visual.
 *
 *   pnpm tsx scripts/verify-alugueis-navegador.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { computeBookingAmounts } from '../src/lib/money';
import { fakeJwt, sessionCookie, startTestbed, type Testbed, type TestbedUser } from './testbed/server';

const AQUI = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida.');
const sql = postgres(url, { max: 3, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;
const falhas: string[] = [];
const ok = (n: string, d = '') => { passed++; console.log(`  \x1b[32mOK\x1b[0m ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`); };
const bad = (n: string, d: string) => { failed++; falhas.push(n); console.log(`  \x1b[31mFALHOU\x1b[0m ${n}\n      ${d}`); };
const expect = (n: string, a: unknown, e: unknown) =>
  JSON.stringify(a) === JSON.stringify(e) ? ok(n, JSON.stringify(a)) : bad(n, `esperava ${JSON.stringify(e)}, veio ${JSON.stringify(a)}`);
const assert = (n: string, c: boolean, d = '') => (c ? ok(n, d) : bad(n, d || 'condição falsa'));
const secao = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

function gerarCpfValido(): string {
  const nove = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (digs: number[], pesos: number[]) => {
    const resto = digs.reduce((acc, d, i) => acc + d * pesos[i]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = dv(nove, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...nove, dv1, dv([...nove, dv1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])].join('');
}

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

const tag = `alnav-${Date.now()}`;
const CELULAR = { width: 390, height: 844 };
const PONTO = { lat: -9.97, lng: -48.21 };
let testbed: Testbed;
let browser: Browser | null = null;
let nextProc: ChildProcess | null = null;
let baseUrl = '';
let telas = '';
const espacos: string[] = [];

async function foto(rotulo: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
    <rect width="1600" height="1200" fill="${cor}"/>
    <text x="800" y="620" font-family="sans-serif" font-size="96" fill="#f4f1ea" text-anchor="middle">${rotulo}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function subirNext() {
  secao('1. Compilando e subindo o Next (produção)');
  const porta = 3600 + (Date.now() % 300);
  baseUrl = `http://127.0.0.1:${porta}`;
  const raiz = join(AQUI, '..');
  const envApp = { ...process.env, NEXT_PUBLIC_SITE_URL: baseUrl, NEXT_DIST_DIR: '.next-teste', NODE_ENV: 'production' as const };
  const build = spawn('pnpm', ['exec', 'next', 'build'], { cwd: raiz, env: envApp, stdio: ['ignore', 'pipe', 'pipe'] });
  let saidaBuild = '';
  build.stdout?.on('data', (d: Buffer) => { saidaBuild += d.toString(); });
  build.stderr?.on('data', (d: Buffer) => { saidaBuild += d.toString(); });
  const [codigo] = (await once(build, 'exit')) as [number | null];
  if (codigo !== 0) {
    console.log(saidaBuild.slice(-3000));
    throw new Error(`next build falhou (código ${codigo})`);
  }
  ok('compilação de produção concluída');
  nextProc = spawn('pnpm', ['exec', 'next', 'start', '--port', String(porta)], { cwd: raiz, env: envApp, stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '';
  nextProc.stdout?.on('data', (d: Buffer) => { saida += d.toString(); });
  nextProc.stderr?.on('data', (d: Buffer) => { saida += d.toString(); if (process.env.VERBOSO) process.stdout.write(d.toString()); });
  const limite = Date.now() + 90_000;
  while (Date.now() < limite) {
    try {
      const res = await fetch(`${baseUrl}/espacos`, { signal: AbortSignal.timeout(15_000) });
      if (res.status < 500) { ok('Next respondendo', baseUrl); return; }
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  console.log(saida.slice(-3000));
  throw new Error('o Next não subiu');
}

async function novaAba(usuario: TestbedUser): Promise<Page> {
  const ctx = await browser!.newContext({ viewport: CELULAR, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const cookie = sessionCookie(process.env.NEXT_PUBLIC_SUPABASE_URL!, usuario);
  await ctx.addCookies([{ name: cookie.name, value: cookie.value, domain: '127.0.0.1', path: '/', sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`      \x1b[2m[erro no navegador] ${e.message}\x1b[0m`));
  return page;
}

const foto_ = async (page: Page, nome: string) => page.screenshot({ path: join(telas, `${nome}.png`), fullPage: true });

const webhook = (event: string, payment: Record<string, unknown>) =>
  fetch(`${baseUrl}/api/webhooks/asaas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN! },
    body: JSON.stringify({ event, payment }),
  });

async function main() {
  secao('0. Ambiente');
  testbed = await startTestbed();
  telas = await mkdtemp(join(tmpdir(), 'myplace-p12-telas-'));
  process.env.NEXT_PUBLIC_SUPABASE_URL = testbed.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  process.env.NEXT_PUBLIC_TILE_URL = `${testbed.url}/tiles/{z}/{x}/{y}.png`;
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION = 'Tiles locais de teste';
  delete process.env.NEXT_PUBLIC_MAPTILER_KEY;
  process.env.ASAAS_API_BASE_URL = `${testbed.url}/v3`;
  process.env.ASAAS_API_KEY = testbed.asaasApiKey;
  process.env.ASAAS_ENV = 'sandbox';
  process.env.ASAAS_WEBHOOK_TOKEN = `token-${tag}`;
  ok('dublê dos serviços externos no ar', testbed.url);

  // ---- pessoas ----
  const dono: TestbedUser = { id: crypto.randomUUID(), email: `${tag}-dono@exemplo.invalid`, token: '' };
  const loc: TestbedUser = { id: crypto.randomUUID(), email: `${tag}-loc@exemplo.invalid`, token: '' };
  dono.token = fakeJwt(dono.id, dono.email);
  loc.token = fakeJwt(loc.id, loc.email);
  testbed.users.set(dono.id, dono);
  testbed.users.set(loc.id, loc);
  await sql`INSERT INTO auth.users (id, email) VALUES (${dono.id}, ${dono.email}), (${loc.id}, ${loc.email})`;
  await sql`UPDATE profiles SET role='owner', full_name='Dona Marta' WHERE id=${dono.id}`;
  await sql`UPDATE profiles SET full_name='Lucas Locatário' WHERE id=${loc.id}`;
  const wallet = crypto.randomUUID();
  testbed.asaasSubaccounts.set(`acc_${tag}`, { id: `acc_${tag}`, apiKey: 'chave-teste', walletId: wallet });
  await sql`INSERT INTO owner_payout_accounts (owner_id, provider, provider_wallet_id, status, can_receive)
            VALUES (${dono.id}, 'asaas', ${wallet}, 'approved', true)`;

  // ---- rascunho do proprietário, pronto até a etapa de preço (sem grupo ainda) ----
  const [rasc] = await sql<{ id: string; slug: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, street, number, district, city, state, postal_code,
      available_from, size_m2, draft_step, location)
    VALUES (${dono.id}, ${`${tag}-estac`}, 'estacionamento', 'Estacionamento coberto no Centro',
      'Estacionamento coberto, com portão eletrônico e câmeras, a duas quadras da praça central.',
      'Avenida Teste', '500', 'Centro', 'Palmas', 'TO', '77000000', CURRENT_DATE, 60, 7,
      ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326))
    RETURNING id, slug`;
  espacos.push(rasc!.id);
  for (const [n, cor] of ['#3d5a80', '#4f6d7a', '#56636b'].entries()) {
    const caminho = `${dono.id}/${rasc!.id}/foto-${n}.jpg`;
    testbed.objects.set(caminho, { bytes: await foto(`Vaga ${n + 1}`, cor), contentType: 'image/jpeg' });
    await sql`INSERT INTO space_images (space_id, storage_path, content_type, width, height, position)
              VALUES (${rasc!.id}, ${caminho}, 'image/jpeg', 1600, 1200, ${n})`;
  }
  ok('sementes', 'proprietária com recebimento configurado, locatário, rascunho de estacionamento com fotos');

  await subirNext();
  browser = await chromium.launch({ headless: true, executablePath: chromePath() });

  // =========================================================================
  secao('2. Proprietária configura "Como alugar" pela tela e publica');
  // =========================================================================
  const pDono = await novaAba(dono);
  await pDono.goto(`${baseUrl}/anunciar/${rasc!.id}/preco`, { waitUntil: 'domcontentloaded' });
  await pDono.getByRole('button', { name: 'Mais vagas' }).click();
  await pDono.getByRole('button', { name: 'Mais vagas' }).click();
  await pDono.getByText('Os dois', { exact: true }).click();
  await pDono.locator('#g0-monthlyPrice').fill('300,00');
  await pDono.locator('#g0-tempPrice').fill('20,00');
  await pDono.locator('#g0-tempMaxUnits').fill('5');
  await foto_(pDono, '01-dono-como-alugar');
  await pDono.locator('form button[type="submit"]').last().click();
  await pDono.waitForURL(/\/regras$/, { timeout: 30_000 });
  const grupos = await sql<{ id: string; c: boolean; t: boolean; m: number; tp: number; tm: number; n: number }[]>`
    SELECT g.id, g.allows_continuous AS c, g.allows_temporary AS t, g.monthly_price_cents AS m, g.temp_price_cents AS tp,
           g.temp_max_units AS tm, (SELECT count(*)::int FROM space_units u WHERE u.group_id = g.id AND u.active) AS n
      FROM space_unit_groups g WHERE g.space_id = ${rasc!.id}`;
  expect('gravado pelo servidor: 1 grupo, 3 vagas, R$ 300/mês e R$ 20/h até 5 h (centavos)',
    grupos.map((g) => [g.c, g.t, g.m, g.tp, g.tm, g.n]), [[true, true, 30000, 2000, 5, 3]]);
  await pDono.locator('form button[type="submit"]').last().click();
  await pDono.waitForURL(/\/revisao$/, { timeout: 30_000 });
  await pDono.getByRole('button', { name: 'Publicar espaço' }).click();
  await pDono.waitForURL(/\/promover$|\/publicado$/, { timeout: 30_000 });
  if (/\/promover$/.test(pDono.url())) {
    await pDono.getByRole('link', { name: 'Não quero promover' }).click();
    await pDono.waitForURL(/\/publicado$/, { timeout: 30_000 });
  }
  const [{ status }] = await sql<{ status: string }[]>`SELECT status::text FROM spaces WHERE id=${rasc!.id}`;
  expect('anúncio publicado pela tela', status, 'published');

  // =========================================================================
  secao('3. Locatário reserva 2 horas pela página do anúncio e paga com Pix');
  // =========================================================================
  const pLoc = await novaAba(loc);
  await pLoc.goto(`${baseUrl}/espacos/${rasc!.slug}`, { waitUntil: 'domcontentloaded' });
  const resumo = await pLoc.getByTestId('resumo-unidades').textContent();
  expect('a página mostra quantas vagas há e quantas estão livres', resumo?.trim(), '3 vagas · 3 disponíveis · 0 ocupadas');
  await pLoc.locator('#duracao').selectOption('2:hour');
  await pLoc.locator('#cpfCnpj').fill(gerarCpfValido());
  await foto_(pLoc, '02-locatario-reservar');
  await pLoc.getByRole('button', { name: 'Reservar e pagar' }).click();
  await pLoc.waitForURL(/\/reservas\/[0-9a-f-]+\/pagar$/, { timeout: 30_000 });
  const reservaId = /\/reservas\/([0-9a-f-]+)\/pagar$/.exec(pLoc.url())![1]!;
  await pLoc.getByAltText('QR Code Pix para pagamento').waitFor({ timeout: 15_000 });
  const prazoTexto = await pLoc.getByTestId('prazo-pagamento').textContent();
  assert('QR do Pix na tela e o prazo para pagar contando', /fica segura para você até \d{2}:\d{2}/.test(prazoTexto ?? ''), prazoTexto ?? '');
  await foto_(pLoc, '03-locatario-pix');
  const [cob] = await sql<{ provider_payment_id: string; amount_cents: number }[]>`
    SELECT provider_payment_id, amount_cents FROM payments WHERE booking_id=${reservaId}`;
  const w = await webhook('PAYMENT_RECEIVED', { id: cob!.provider_payment_id, value: cob!.amount_cents / 100, billingType: 'PIX' });
  expect('webhook do Pix (rota HTTP real) aceito', w.status, 200);
  await pLoc.getByRole('heading', { name: 'Pagamento confirmado' }).waitFor({ timeout: 20_000 });
  ok('a tela de pagamento confirma sozinha quando o banco confirma');
  await foto_(pLoc, '04-locatario-confirmado');

  // =========================================================================
  secao('4. Tempo restante: em Meus aluguéis — não na tela principal');
  // =========================================================================
  await pLoc.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await pLoc.waitForLoadState('networkidle');
  expect('tela principal: nenhuma contagem regressiva', await pLoc.locator('[role="timer"]').count(), 0);
  await pLoc.goto(`${baseUrl}/reservas`, { waitUntil: 'domcontentloaded' });
  const contagem = pLoc.getByTestId('contagem-aluguel');
  await contagem.waitFor({ timeout: 15_000 });
  const textoContagem = (await contagem.textContent()) ?? '';
  assert('Meus aluguéis: "Tempo restante" do aluguel em uso', /Tempo restante: 1 h 5\d min/.test(textoContagem), textoContagem);
  assert('com opção de renovar', (await pLoc.getByRole('button', { name: 'Renovar aluguel' }).count()) === 1);
  // O total da renovação é o que será cobrado: R$ 20/h × 2 h + 3% de taxa de serviço.
  assert('renovar mostra o total que será cobrado, com a taxa de serviço',
    /Total: R\$\s?41,20 \(aluguel R\$\s?40,00 \+ taxa de serviço R\$\s?1,20\)/.test(textoContagem), textoContagem.slice(-120));
  await foto_(pLoc, '05-meus-alugueis-em-uso');

  // =========================================================================
  secao('5. Cobrança automática recusada: aviso ao abrir, ponto no menu, "!" só no aluguel com problema');
  // =========================================================================
  // Aluguel mensal no cartão, já ativo, de outro anúncio da mesma proprietária.
  const [mensal] = await sql<{ id: string; slug: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, street, number, district, city, state, postal_code,
      available_from, size_m2, draft_step, location, approx_location)
    VALUES (${dono.id}, ${`${tag}-box`}, 'deposito', 'Box seco para guardar móveis',
      'Box fechado, seco e ventilado, com acesso das 7h às 22h todos os dias.',
      'Rua Teste', '20', 'Centro', 'Palmas', 'TO', '77000000', CURRENT_DATE, 12, 8,
      ST_SetSRID(ST_MakePoint(${PONTO.lng + 0.01}, ${PONTO.lat}), 4326), ST_SetSRID(ST_MakePoint(${PONTO.lng + 0.01}, ${PONTO.lat}), 4326))
    RETURNING id, slug`;
  espacos.push(mensal!.id);
  for (const n of [0, 1, 2]) {
    const caminho = `${dono.id}/${mensal!.id}/foto-${n}.jpg`;
    testbed.objects.set(caminho, { bytes: await foto(`Box ${n + 1}`, '#6b705c'), contentType: 'image/jpeg' });
    await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${mensal!.id}, ${caminho}, ${n})`;
  }
  const [g] = await sql<{ id: string }[]>`
    INSERT INTO space_unit_groups (space_id, name, allows_continuous, monthly_price_cents) VALUES (${mensal!.id}, 'Padrão', true, 30000) RETURNING id`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO space_units (space_id, group_id, label, position) VALUES (${mensal!.id}, ${g!.id}, 'Box 1', 1) RETURNING id`;
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${mensal!.id}`;
  const v = computeBookingAmounts(30000, { renterFeeBps: 300, ownerFeeBps: 300 });
  const [bm] = await sql<{ id: string }[]>`
    INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, kind, group_id, unit_id, start_date,
      monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents, total_charged_cents, owner_payout_cents,
      requested_at, responded_at, activated_at)
    VALUES (${`MP-${tag.slice(-6).toUpperCase()}`}, ${mensal!.id}, ${loc.id}, ${dono.id}, 'active', 'continuous', ${g!.id}, ${u!.id},
      CURRENT_DATE - 30, ${v.monthlyRentCents}, ${v.renterFeeBps}, ${v.ownerFeeBps}, ${v.renterFeeCents}, ${v.ownerFeeCents},
      ${v.totalChargedCents}, ${v.ownerPayoutCents}, now() - interval '32 days', now() - interval '31 days', now() - interval '30 days')
    RETURNING id`;
  const sub = `sub_${tag}`;
  await sql`INSERT INTO subscriptions (booking_id, provider, provider_subscription_id, method, status, amount_cents, billing_day, next_due_date)
            VALUES (${bm!.id}, 'asaas', ${sub}, 'credit_card', 'active', ${v.totalChargedCents}, 1, CURRENT_DATE)`;
  testbed.asaasSubscriptions.set(sub, { id: sub, status: 'ACTIVE', nextDueDate: '2026-10-01', value: v.totalChargedCents / 100, customer: 'cus_x' });
  const pay2 = `pay_${tag}_2`;
  testbed.asaasPayments.set(pay2, {
    id: pay2, status: 'PENDING', value: v.totalChargedCents / 100, netValue: null, invoiceUrl: `http://127.0.0.1/fake-invoice/${pay2}`,
    dueDate: '2026-10-01', refundedCents: 0, subscription: sub, billingType: 'CREDIT_CARD',
  });
  await webhook('PAYMENT_CREATED', { id: pay2, subscription: sub, value: v.totalChargedCents / 100, dueDate: new Date().toISOString().slice(0, 10) });
  const recusa = await webhook('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', { id: pay2, subscription: sub });
  const [estado] = await sql<{ s: string }[]>`SELECT status::text AS s FROM bookings WHERE id=${bm!.id}`;
  expect('recusa do cartão chega pelo webhook e abre o pagamento pendente', [recusa.status, estado?.s], [200, 'past_due']);

  // "Abrir o app": uma sessão nova do navegador.
  const pApp = await novaAba(loc);
  await pApp.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  const aviso = pApp.locator('[data-testid="aviso-pagamento-pendente"][open]');
  await aviso.waitFor({ timeout: 15_000 });
  const textoAviso = (await aviso.textContent()) ?? '';
  assert('ao abrir o app: tela "Pagamento pendente" primeiro, com o texto pedido',
    textoAviso.includes('Não conseguimos concluir a cobrança automática do seu aluguel. Regularize o pagamento para continuar utilizando este espaço.'), textoAviso.slice(0, 200));
  assert('com o tempo restante e os botões "Pagar agora" e "Cancelar aluguel"',
    /Tempo restante: \d+ min/.test(textoAviso) && textoAviso.includes('Pagar agora') && textoAviso.includes('Cancelar aluguel'), textoAviso.slice(0, 300));
  await foto_(pApp, '06-aviso-ao-abrir');
  expect('ponto no menu "Meus aluguéis" (sem "!")', await pApp.locator('a[aria-label="Meus aluguéis, pagamento pendente"]:visible').count(), 1);
  await aviso.getByRole('button', { name: 'Fechar' }).click();
  expect('o X fecha o aviso', await pApp.locator('[data-testid="aviso-pagamento-pendente"][open]').count(), 0);
  await pApp.reload({ waitUntil: 'domcontentloaded' });
  await pApp.waitForLoadState('networkidle');
  expect('fechado, não volta na mesma sessão', await pApp.locator('[data-testid="aviso-pagamento-pendente"][open]').count(), 0);
  expect('mas o ponto continua até resolver', await pApp.locator('a[aria-label="Meus aluguéis, pagamento pendente"]:visible').count(), 1);

  await pApp.goto(`${baseUrl}/reservas`, { waitUntil: 'domcontentloaded' });
  await pApp.getByTestId('aluguel-com-problema').waitFor({ timeout: 15_000 });
  expect('"!" só no aluguel que teve o problema', [
    await pApp.locator('[data-testid="aluguel-com-problema"] svg[aria-label="Pagamento pendente"]').count(),
    await pApp.locator('[data-testid="aluguel"] svg[aria-label="Pagamento pendente"]').count(),
    await pApp.getByTestId('aluguel').count() >= 1,
  ], [1, 0, true]);
  await foto_(pApp, '07-meus-alugueis-pendente');

  await pApp.getByRole('link', { name: 'Resolver pagamento' }).first().click();
  await pApp.waitForURL(/\/pendente$/, { timeout: 20_000 });
  const textoPendente = (await pApp.locator('main').textContent()) ?? '';
  assert('tela "Pagamento pendente" com o texto, o prazo e os dois caminhos',
    textoPendente.includes('Não conseguimos concluir a cobrança automática do seu aluguel. Regularize o pagamento para continuar utilizando este espaço.')
      && /Tempo restante/.test(textoPendente) && textoPendente.includes('Pagar agora') && textoPendente.includes('Cancelar aluguel'),
    textoPendente.slice(0, 300));
  await foto_(pApp, '08-tela-pagamento-pendente');
  await pApp.getByRole('button', { name: 'Pagar agora' }).click();
  await pApp.getByTestId('formas-de-pagamento').waitFor({ timeout: 10_000 });
  await pApp.getByRole('button', { name: /Pix/ }).click();
  await pApp.getByAltText('QR Code Pix para pagamento').waitFor({ timeout: 20_000 });
  const [cobPend] = await sql<{ n: number; m: string }[]>`
    SELECT count(*)::int AS n, max(method::text) AS m FROM payments WHERE booking_id=${bm!.id} AND status IN ('pending','overdue')`;
  expect('"Pagar agora" com Pix: QR da MESMA cobrança (nenhuma cobrança nova)', [cobPend?.n, cobPend?.m, testbed.asaasPayments.get(pay2)?.billingType], [1, 'pix', 'PIX']);
  await foto_(pApp, '09-pendente-pix');

  const pApp2 = await novaAba(loc);
  await pApp2.goto(`${baseUrl}/espacos`, { waitUntil: 'domcontentloaded' });
  await pApp2.locator('[data-testid="aviso-pagamento-pendente"][open]').waitFor({ timeout: 15_000 });
  ok('abrindo o app de novo (nova sessão), o aviso aparece de novo enquanto não resolver');

  await webhook('PAYMENT_RECEIVED', { id: pay2, value: v.totalChargedCents / 100, billingType: 'PIX' });
  await pApp.goto(`${baseUrl}/reservas`, { waitUntil: 'domcontentloaded' });
  await pApp.waitForLoadState('networkidle');
  expect('pago: o "!" e o ponto somem', [
    await pApp.getByTestId('aluguel-com-problema').count(),
    await pApp.locator('a[aria-label="Meus aluguéis, pagamento pendente"]:visible').count(),
  ], [0, 0]);
  const pApp3 = await novaAba(loc);
  await pApp3.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await pApp3.waitForLoadState('networkidle');
  expect('e o aviso não aparece mais ao abrir o app', await pApp3.locator('[data-testid="aviso-pagamento-pendente"][open]').count(), 0);
  await foto_(pApp, '10-meus-alugueis-resolvido');

  // =========================================================================
  secao('6. Proprietária vê as reservas com a unidade e o horário');
  // =========================================================================
  await pDono.goto(`${baseUrl}/meus-espacos/solicitacoes?filtro=andamento`, { waitUntil: 'domcontentloaded' });
  const textoDono = (await pDono.locator('main').textContent()) ?? '';
  assert('"Em andamento" lista o aluguel por tempo (vaga e horário) e o mensal',
    /Vaga \d/.test(textoDono) && textoDono.includes('Em uso') && textoDono.includes('Box seco para guardar móveis'), textoDono.slice(0, 300));
  await foto_(pDono, '11-dono-solicitacoes');
}

async function limpar() {
  if (espacos.length === 0) return;
  try {
    await sql`UPDATE bookings SET status='ended', ended_at=now(), end_reason='cancelled_by_owner'
              WHERE space_id IN ${sql(espacos)} AND status IN ('active','past_due')`;
    await sql`UPDATE bookings SET status='cancelled', cancelled_at=now(), end_reason='cancelled_by_owner', hold_expires_at=NULL
              WHERE space_id IN ${sql(espacos)} AND status IN ('requested','approved','awaiting_payment')`;
    await sql`UPDATE spaces SET status='archived' WHERE id IN ${sql(espacos)}`;
  } catch (err) {
    console.error('limpeza parcial falhou:', err instanceof Error ? err.message : err);
  }
}

main()
  .catch((err) => {
    failed++;
    console.error('\x1b[31mERRO\x1b[0m', err);
  })
  .finally(async () => {
    await limpar();
    await browser?.close().catch(() => {});
    nextProc?.kill('SIGTERM');
    await testbed?.close();
    await sql.end();
    console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
    if (falhas.length) console.log(`Falhas: ${falhas.join(' | ')}`);
    if (telas) console.log(`Capturas de tela em ${telas}`);
    process.exit(failed > 0 ? 1 : 0);
  });

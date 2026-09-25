/**
 * Verificacao do sistema inteligente de notificacoes (Fase 18) contra
 * Postgres real.
 *
 * Cobre: governanca anti-spam (limiar + cooldown, sem tabela nova — a propria
 * `notifications` e o log), alerta de queda de preco e de disponibilidade em
 * favoritos, pontuacao de compatibilidade + fan-out na publicacao, e os dois
 * jobs de cron (lembrete de vencimento, resumo do proprietario). Testa tanto
 * as funcoes isoladas (limiares exatos, cooldown, idempotencia) quanto as
 * Server Actions de verdade (`saveStepAction`, `toggleSpaceStatusAction`,
 * `publishSpaceAction`) para provar que o fio esta ligado, nao so a logica —
 * mesmo padrao de verify-messaging.ts/verify-promotions.ts.
 *
 *   pnpm tsx scripts/verify-notifications.ts
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
import { computeBookingAmounts } from '../src/lib/money';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 3, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

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

// ---------------------------------------------------------------------------

const tag = `notif-${Date.now()}`;
const cidade = tag; // cidade exclusiva desta execucao — nunca colide com residuo de outro script/rodada.
const PONTO_ISOLADO = { lat: -21.5, lng: -43.2 }; // longe de CENTRO_COLATINA de proposito (ver verify-promotions.ts).

function uuid() { return crypto.randomUUID(); }

// Secao 1 (governanca generica — usuario proprio, pra nao contaminar as contagens da secao 2)
const governorTestId = uuid();

// Secao 2/3 (alertas diretos em espaco existente)
const dono1Id = uuid();
const fav1Id = uuid();
const fav2Id = uuid();
const naoFavoritouId = uuid();

// Secao 4 (fan-out de compatibilidade, chamada direta)
const outroDonoId = uuid();
const compatDonoId = uuid();
const compatHighId = uuid();
const compatLowId = uuid();

// Secao 5/6/7 (Server Actions de verdade, isoladas do resto)
const dono3Id = uuid();
const fav5Id = uuid();
const dono6PrecoId = uuid();
const fav6Id = uuid();
const dono7StatusId = uuid();
const fav7Id = uuid();

// Secao 8 (cron: vencimento)
const dono5Id = uuid();
const renter7dId = uuid();
const renter1dId = uuid();
const renter3dId = uuid();
const renterPastDueId = uuid();

// Secao 9 (cron: resumo do proprietario)
const dono9Id = uuid();
const digestFav1Id = uuid();
const digestFav2Id = uuid();
const digestFav3Id = uuid();
const digestRenterId = uuid();

const todosUsuarios = [
  governorTestId,
  dono1Id, fav1Id, fav2Id, naoFavoritouId,
  outroDonoId, compatDonoId, compatHighId, compatLowId,
  dono3Id, fav5Id, dono6PrecoId, fav6Id, dono7StatusId, fav7Id,
  dono5Id, renter7dId, renter1dId, renter3dId, renterPastDueId,
  dono9Id, digestFav1Id, digestFav2Id, digestFav3Id, digestRenterId,
];

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string) {
  identidadeAtual = { id, role, fullName };
}

let seq = 0;
/** Espaço publicado, direto por SQL (mesmo padrão de verify-messaging.ts). */
async function criarPublicado(
  ownerId: string, sufixo: string, opts?: { cidade?: string; tipo?: string; precoCents?: number },
): Promise<string> {
  seq++;
  const slug = `${tag}-${sufixo}-${seq}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, price_monthly_cents, size_m2, draft_step, location, approx_location)
    VALUES (${ownerId}, ${slug}, ${opts?.tipo ?? 'garagem'}, ${`Espaço de teste ${slug}`},
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      'Centro', ${opts?.cidade ?? cidade}, 'ES', CURRENT_DATE, ${opts?.precoCents ?? 30000}, 20,
      8, ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326),
      ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326))
    RETURNING id`;
  const id = row!.id;
  await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES
    (${id}, ${`${ownerId}/${id}/f0.jpg`}, 0), (${id}, ${`${ownerId}/${id}/f1.jpg`}, 1), (${id}, ${`${ownerId}/${id}/f2.jpg`}, 2)`;
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return id;
}

/** Espaço em rascunho MINIMO — só pra servir de FK em bookings (Fase 18.4), sem passar pelas regras de publicação. */
async function criarRascunhoMinimo(ownerId: string, sufixo: string, titulo: string): Promise<string> {
  seq++;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, price_monthly_cents, draft_step)
    VALUES (${ownerId}, ${`${tag}-${sufixo}-${seq}`}, 'garagem', ${titulo}, 30000, 1)
    RETURNING id`;
  return row!.id;
}

async function favoritar(userId: string, spaceId: string, precoCentsAtFavorite: number | null = null) {
  await sql`INSERT INTO favorites (user_id, space_id, price_cents_at_favorite) VALUES (${userId}, ${spaceId}, ${precoCentsAtFavorite})`;
}

async function contarNotificacoes(userId: string, type: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE user_id=${userId} AND type=${type}`;
  return n;
}

async function seed() {
  const linhas = todosUsuarios.map((id) => ({ id, email: `${id}@exemplo.invalid` }));
  await sql`INSERT INTO auth.users ${sql(linhas, 'id', 'email')}`;
  for (const id of [dono1Id, outroDonoId, compatDonoId, dono3Id, dono6PrecoId, dono7StatusId, dono5Id, dono9Id]) {
    await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${id.slice(0, 8)}`} WHERE id=${id}`;
  }
  ok('semente base criada', `${todosUsuarios.length} perfis`);
}

async function main() {
  await seed();

  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: 'teste@exemplo.invalid',
          fullName: identidadeAtual.fullName, avatarPath: null, status: 'active',
          statusReason: null, acceptedTermsAt: new Date(),
        };
      },
      getCurrentUser: async () => null,
    },
  } as never;

  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;

  const { alertFavoritersOfPriceDrop, alertFavoritersOfAvailabilityChange, alertCompatibleFavoritersOfNewSpace } =
    await import('../src/lib/notifications/space-alerts');
  const { computeCompatibilityScore, COMPATIBILITY_THRESHOLD } = await import('../src/lib/notifications/compatibility');
  const { sendGovernedNotification } = await import('../src/lib/notifications/governor');
  const { runRentDueReminders, runOwnerActivityDigests } = await import('../src/lib/notifications/cron');
  const { saveStepAction, toggleSpaceStatusAction, publishSpaceAction } = await import('../src/lib/spaces/actions');

  async function chamarComRedirect<T>(fn: () => Promise<T>): Promise<{ redirecionou: boolean; resultado?: T }> {
    try {
      const resultado = await fn();
      return { redirecionou: false, resultado };
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      return { redirecionou: true };
    }
  }

  // =========================================================================
  secao('1. Governanca: sendGovernedNotification (limiar + cooldown, sem tabela nova)');
  // =========================================================================

  const enviou1 = await sendGovernedNotification({
    userId: governorTestId, type: 'favorite_price_drop', title: 'Teste', body: 'Corpo', linkPath: '/x',
    data: { spaceId: 'x' }, cooldownHours: 24, scopeKey: 'escopo-a',
  });
  assert('primeira notificacao passa (sem cooldown ativo)', enviou1);

  const enviou2 = await sendGovernedNotification({
    userId: governorTestId, type: 'favorite_price_drop', title: 'Teste 2', body: 'Corpo 2', linkPath: '/x',
    data: { spaceId: 'x' }, cooldownHours: 24, scopeKey: 'escopo-a',
  });
  assert('segunda notificacao (mesmo escopo, dentro da janela) e silenciada', !enviou2);

  const enviou3 = await sendGovernedNotification({
    userId: governorTestId, type: 'favorite_price_drop', title: 'Teste 3', body: 'Corpo 3', linkPath: '/x',
    data: { spaceId: 'y' }, cooldownHours: 24, scopeKey: 'escopo-b',
  });
  assert('mesmo tipo/pessoa, ESCOPO diferente, passa (cooldown e por escopo)', enviou3);

  const enviou4 = await sendGovernedNotification({
    userId: governorTestId, type: 'favorite_unavailable', title: 'Teste 4', body: 'Corpo 4', linkPath: '/x',
    data: { spaceId: 'x' }, cooldownHours: 24, scopeKey: 'escopo-a',
  });
  assert('mesmo escopo, TIPO diferente, passa (cooldown e por tipo tambem)', enviou4);

  expect('exatamente 3 notificacoes gravadas nesta secao (a 4a foi silenciada)',
    await contarNotificacoes(governorTestId, 'favorite_price_drop') + await contarNotificacoes(governorTestId, 'favorite_unavailable'), 3);

  // =========================================================================
  secao('2. Alerta de queda de preço em favoritos (chamada direta)');
  // =========================================================================

  const espaco1Id = await criarPublicado(dono1Id, 'preco', { precoCents: 30000 });
  await favoritar(fav1Id, espaco1Id);
  await favoritar(fav2Id, espaco1Id);

  await alertFavoritersOfPriceDrop({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 30000, 29500);
  expect('queda de 1,67% (abaixo do limiar de 5%) NAO notifica', await contarNotificacoes(fav1Id, 'favorite_price_drop'), 0);

  await alertFavoritersOfPriceDrop({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 30000, 28000);
  expect('queda de 6,67% notifica os 2 favoritos', await contarNotificacoes(fav1Id, 'favorite_price_drop')
    + await contarNotificacoes(fav2Id, 'favorite_price_drop'), 2);
  expect('quem NAO favoritou nao recebe nada', await contarNotificacoes(naoFavoritouId, 'favorite_price_drop'), 0);

  const [notifPreco] = await sql<{ title: string; body: string; link_path: string }[]>`
    SELECT title, body, link_path FROM notifications WHERE user_id=${fav1Id} AND type='favorite_price_drop' LIMIT 1`;
  assert('corpo menciona os dois valores', notifPreco!.body.includes('R$') && notifPreco!.body.includes('mês'), notifPreco!.body);
  expect('link aponta pro espaço', notifPreco!.link_path, '/espacos/espaco-1');

  await alertFavoritersOfPriceDrop({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 28000, 26000);
  expect('nova queda real, mas dentro do cooldown de 7 dias, fica em silêncio',
    await contarNotificacoes(fav1Id, 'favorite_price_drop'), 1);

  await alertFavoritersOfPriceDrop({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 26000, 27000);
  expect('AUMENTO de preço nunca notifica (decisão de escopo da Fase 18.2)',
    await contarNotificacoes(fav1Id, 'favorite_price_drop'), 1);

  // =========================================================================
  secao('3. Alerta de disponibilidade em favoritos (chamada direta)');
  // =========================================================================

  await alertFavoritersOfAvailabilityChange({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 'unavailable');
  expect('pausar notifica os 2 favoritos', await contarNotificacoes(fav1Id, 'favorite_unavailable')
    + await contarNotificacoes(fav2Id, 'favorite_unavailable'), 2);

  await alertFavoritersOfAvailabilityChange({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 'unavailable');
  expect('repetir "indisponível" dentro de 24h fica em silêncio', await contarNotificacoes(fav1Id, 'favorite_unavailable'), 1);

  await alertFavoritersOfAvailabilityChange({ id: espaco1Id, title: 'Espaço 1', slug: 'espaco-1' }, 'available_again');
  expect('"disponível de novo" é tipo diferente — notifica mesmo com o outro em cooldown',
    await contarNotificacoes(fav1Id, 'favorite_available_again'), 1);

  // =========================================================================
  secao('4. Pontuação de compatibilidade (função pura)');
  // =========================================================================

  const padraoCentrado = { userId: 'x', minPriceCents: 20000, maxPriceCents: 30000, featureKeys: ['portao_eletronico', 'camera'] };
  expect('preço no centro da faixa + todas as features = 100',
    computeCompatibilityScore(padraoCentrado, { priceMonthlyCents: 25000, featureKeys: ['portao_eletronico', 'camera', 'extra'] }), 100);

  const scoreLonge = computeCompatibilityScore(padraoCentrado, { priceMonthlyCents: 200000, featureKeys: [] });
  expect('preço 8x acima da faixa + zero features = 0', scoreLonge, 0);

  const scoreParcial = computeCompatibilityScore(
    { userId: 'x', minPriceCents: 20000, maxPriceCents: 20000, featureKeys: ['a', 'b'] },
    { priceMonthlyCents: 20000, featureKeys: ['a'] },
  );
  assert('preço exato + metade das features fica abaixo de 100, acima de 0',
    scoreParcial > 0 && scoreParcial < 100, `${scoreParcial}`);

  expect('sem características nos favoritos não penaliza (score de features = 100 por ausência de dado)',
    computeCompatibilityScore({ userId: 'x', minPriceCents: 20000, maxPriceCents: 20000, featureKeys: [] },
      { priceMonthlyCents: 20000, featureKeys: [] }), 100);

  expect('limiar de compatibilidade é 80', COMPATIBILITY_THRESHOLD, 80);

  // =========================================================================
  secao('5. "Novo espaço compatível" — fan-out (chamada direta)');
  // =========================================================================

  const espacoRefAId = await criarPublicado(outroDonoId, 'ref-a', { precoCents: 25000 });
  const espacoRefBId = await criarPublicado(outroDonoId, 'ref-b', { precoCents: 26000 });
  await favoritar(compatHighId, espacoRefAId);
  await favoritar(compatHighId, espacoRefBId);

  const espacoRefBaratoId = await criarPublicado(outroDonoId, 'ref-barato', { precoCents: 5000 });
  await favoritar(compatLowId, espacoRefBaratoId);

  // O proprio dono da publicacao nova tambem favoritou algo parecido — nunca pode se autonotificar.
  await favoritar(compatDonoId, espacoRefAId);

  const novoEspaco = {
    id: uuid(), ownerId: compatDonoId, type: 'garagem', city: cidade,
    title: 'Vaga nova compatível', slug: 'vaga-nova-compativel',
    priceMonthlyCents: 25500, featureKeys: [] as string[],
  };
  await alertCompatibleFavoritersOfNewSpace(novoEspaco);

  expect('quem favoritou preço parecido é notificado', await contarNotificacoes(compatHighId, 'new_compatible_space'), 1);
  expect('quem favoritou preço muito diferente NAO é notificado', await contarNotificacoes(compatLowId, 'new_compatible_space'), 0);
  expect('o próprio dono nunca se autonotifica', await contarNotificacoes(compatDonoId, 'new_compatible_space'), 0);

  await alertCompatibleFavoritersOfNewSpace({ ...novoEspaco, id: uuid(), slug: 'vaga-nova-2' });
  expect('segunda publicação compatível dentro de 48h fica em silêncio (cooldown por pessoa)',
    await contarNotificacoes(compatHighId, 'new_compatible_space'), 1);

  // =========================================================================
  secao('6. Integração real: publishSpaceAction dispara "novo espaço compatível"');
  // =========================================================================

  const espacoRefCId = await criarPublicado(outroDonoId, 'ref-c', { precoCents: 40000 });
  await favoritar(fav5Id, espacoRefCId);

  const draft6Id = await criarRascunhoMinimo(dono3Id, 'draft6', 'Espaço rascunho para publicar de verdade');
  await sql`UPDATE spaces SET
    description='Descricao com mais de vinte caracteres para passar na regra do banco.',
    district='Centro', city=${cidade}, state='ES', street='Rua Teste', number='100',
    available_from=CURRENT_DATE, price_monthly_cents=41000, size_m2=20, draft_step=8,
    location=ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326),
    approx_location=ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326)
    WHERE id=${draft6Id}`;
  await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES
    (${draft6Id}, ${`x/${draft6Id}/f0.jpg`}, 0), (${draft6Id}, ${`x/${draft6Id}/f1.jpg`}, 1), (${draft6Id}, ${`x/${draft6Id}/f2.jpg`}, 2)`;

  entrarComo(dono3Id, 'owner', 'Dono 3');
  const fdPub = new FormData();
  fdPub.set('spaceId', draft6Id);
  const rPub = await chamarComRedirect(() => publishSpaceAction(undefined, fdPub));
  assert('publishSpaceAction redirecionou (publicou com sucesso)', rPub.redirecionou);

  expect('primeira publicação notifica quem tinha favorito compatível', await contarNotificacoes(fav5Id, 'new_compatible_space'), 1);

  const fdRepublica = new FormData();
  fdRepublica.set('spaceId', draft6Id);
  await chamarComRedirect(() => publishSpaceAction(undefined, fdRepublica));
  expect('publicar de novo (já publicado) NÃO dispara segunda notificação — só a 1ª publicação conta',
    await contarNotificacoes(fav5Id, 'new_compatible_space'), 1);

  // =========================================================================
  secao('7. Integração real: saveStepAction (preço) dispara alerta de queda');
  // =========================================================================

  const espaco6Id = await criarPublicado(dono6PrecoId, 'preco-real', { precoCents: 50000 });
  await favoritar(fav6Id, espaco6Id);

  entrarComo(dono6PrecoId, 'owner', 'Dono Preço');
  const fdPreco = new FormData();
  fdPreco.set('spaceId', espaco6Id);
  fdPreco.set('step', 'preco');
  fdPreco.set('price', '400,00'); // R$500,00 -> R$400,00 = -20%, bem acima do limiar
  fdPreco.set('availableFrom', new Date().toISOString().slice(0, 10));
  const rPreco = await saveStepAction(undefined, fdPreco);
  assert('saveStepAction(preco) foi aceito', rPreco.ok, JSON.stringify(rPreco));

  expect('queda real via action de verdade notifica o favorito', await contarNotificacoes(fav6Id, 'favorite_price_drop'), 1);

  // =========================================================================
  secao('8. Integração real: toggleSpaceStatusAction dispara alerta de disponibilidade');
  // =========================================================================

  const espaco7Id = await criarPublicado(dono7StatusId, 'status-real', { precoCents: 22000 });
  await favoritar(fav7Id, espaco7Id);

  entrarComo(dono7StatusId, 'owner', 'Dono Status');
  const fdToggle1 = new FormData();
  fdToggle1.set('spaceId', espaco7Id);
  const rToggle1 = await toggleSpaceStatusAction(undefined, fdToggle1);
  assert('pausar via action de verdade foi aceito', rToggle1.ok, JSON.stringify(rToggle1));
  expect('pausar notificou o favorito (unavailable)', await contarNotificacoes(fav7Id, 'favorite_unavailable'), 1);

  const fdToggle2 = new FormData();
  fdToggle2.set('spaceId', espaco7Id);
  const rToggle2 = await toggleSpaceStatusAction(undefined, fdToggle2);
  assert('retomar via action de verdade foi aceito', rToggle2.ok, JSON.stringify(rToggle2));
  expect('retomar notificou o favorito (available_again)', await contarNotificacoes(fav7Id, 'favorite_available_again'), 1);

  // =========================================================================
  secao('9. Cron: lembrete de vencimento (7 dias / 1 dia, idempotente)');
  // =========================================================================

  async function seedAssinatura(ownerId: string, renterId: string, sufixo: string, status: string, dueDateSql: ReturnType<typeof sql>) {
    const espacoId = await criarRascunhoMinimo(ownerId, `sub-${sufixo}`, `Espaço vencimento ${sufixo}`);
    const precoCents = 30000;
    const amounts = computeBookingAmounts(precoCents, { renterFeeBps: 300, ownerFeeBps: 300 });
    const [booking] = await sql<{ id: string }[]>`
      INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
        monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents,
        total_charged_cents, owner_payout_cents)
      VALUES (${`MP-${tag}-${sufixo}`}, ${espacoId}, ${renterId}, ${ownerId}, 'active', CURRENT_DATE - INTERVAL '30 days',
        ${amounts.monthlyRentCents}, ${amounts.renterFeeBps}, ${amounts.ownerFeeBps}, ${amounts.renterFeeCents},
        ${amounts.ownerFeeCents}, ${amounts.totalChargedCents}, ${amounts.ownerPayoutCents})
      RETURNING id`;
    const [subscription] = await sql<{ id: string }[]>`
      INSERT INTO subscriptions (booking_id, method, status, amount_cents, billing_day, next_due_date)
      VALUES (${booking!.id}, 'pix', ${status}, ${amounts.totalChargedCents}, 10, ${dueDateSql})
      RETURNING id`;
    return { bookingId: booking!.id, subscriptionId: subscription!.id };
  }

  await seedAssinatura(dono5Id, renter7dId, '7d', 'active', sql`(CURRENT_DATE + INTERVAL '7 days')::date`);
  await seedAssinatura(dono5Id, renter1dId, '1d', 'active', sql`(CURRENT_DATE + INTERVAL '1 day')::date`);
  await seedAssinatura(dono5Id, renter3dId, '3d', 'active', sql`(CURRENT_DATE + INTERVAL '3 days')::date`);
  await seedAssinatura(dono5Id, renterPastDueId, 'pastdue', 'past_due', sql`(CURRENT_DATE + INTERVAL '7 days')::date`);

  const resultado1 = await runRentDueReminders();
  assert('rodada 1 enviou pelo menos os 2 lembretes esperados', resultado1.sent >= 2, `sent=${resultado1.sent}`);

  const [notif7d] = await sql<{ title: string; body: string }[]>`
    SELECT title, body FROM notifications WHERE user_id=${renter7dId} AND type='payment_upcoming' LIMIT 1`;
  assert('renter de 7 dias recebeu o lembrete certo', Boolean(notif7d) && notif7d!.body.includes('7 dias'), JSON.stringify(notif7d));

  const [notif1d] = await sql<{ title: string; body: string }[]>`
    SELECT title, body FROM notifications WHERE user_id=${renter1dId} AND type='payment_upcoming' LIMIT 1`;
  assert('renter de 1 dia recebeu o lembrete certo', Boolean(notif1d) && notif1d!.body.includes('amanhã'), JSON.stringify(notif1d));

  expect('renter de 3 dias (fora dos marcos) não recebe nada', await contarNotificacoes(renter3dId, 'payment_upcoming'), 0);
  expect('assinatura past_due (não ativa) não recebe lembrete de vencimento', await contarNotificacoes(renterPastDueId, 'payment_upcoming'), 0);

  const resultado2 = await runRentDueReminders();
  expect('rodada 2 (mesmo dia) não reenvia — idempotente', resultado2.sent, 0);
  expect('ainda exatamente 1 lembrete pro renter de 7 dias', await contarNotificacoes(renter7dId, 'payment_upcoming'), 1);

  // =========================================================================
  secao('10. Cron: resumo de atividade do proprietário (agrupado, nunca vazio)');
  // =========================================================================

  const espacoDigestId = await criarPublicado(dono9Id, 'digest', { precoCents: 35000 });

  const semAtividade = await runOwnerActivityDigests();
  assert('rodada roda sem erro mesmo sem atividade nova', semAtividade.sent >= 0);
  expect('proprietário sem favoritos/conversas novas não recebe resumo', await contarNotificacoes(dono9Id, 'owner_activity_digest'), 0);

  await favoritar(digestFav1Id, espacoDigestId);
  await favoritar(digestFav2Id, espacoDigestId);
  await sql`INSERT INTO conversations (space_id, renter_id, owner_id, last_message_at)
    VALUES (${espacoDigestId}, ${digestRenterId}, ${dono9Id}, now())`;

  const comAtividade = await runOwnerActivityDigests();
  assert('rodada com atividade nova envia pelo menos 1 resumo', comAtividade.sent >= 1, `sent=${comAtividade.sent}`);
  expect('proprietário recebeu exatamente 1 resumo (agrupado, não 1 por evento)',
    await contarNotificacoes(dono9Id, 'owner_activity_digest'), 1);

  const [digestNotif] = await sql<{ body: string; data: { favorites: number; conversations: number } }[]>`
    SELECT body, data FROM notifications WHERE user_id=${dono9Id} AND type='owner_activity_digest' LIMIT 1`;
  expect('resumo contou os 2 favoritos novos', digestNotif!.data.favorites, 2);
  expect('resumo contou a 1 conversa nova', digestNotif!.data.conversations, 1);
  assert('corpo do resumo menciona favoritos e conversa', digestNotif!.body.includes('favorit') && digestNotif!.body.includes('conversa'), digestNotif!.body);

  await runOwnerActivityDigests();
  expect('rodada seguinte (janela mínima de 3 dias não passou) não duplica o resumo',
    await contarNotificacoes(dono9Id, 'owner_activity_digest'), 1);

  // Simula que o ultimo resumo foi ha mais de 3 dias, com atividade nova depois dele.
  await sql`UPDATE notifications SET created_at = now() - INTERVAL '4 days'
    WHERE user_id=${dono9Id} AND type='owner_activity_digest'`;
  await favoritar(digestFav3Id, espacoDigestId);
  const resumoAtrasado = await runOwnerActivityDigests();
  assert('depois da janela mínima, com atividade nova, envia o 2º resumo', resumoAtrasado.sent >= 1, `sent=${resumoAtrasado.sent}`);
  expect('agora são 2 resumos ao todo pro mesmo proprietário',
    await contarNotificacoes(dono9Id, 'owner_activity_digest'), 2);
}

async function limpar() {
  try {
    await sql`DELETE FROM notifications WHERE user_id = ANY(${todosUsuarios})`;
    await sql`DELETE FROM conversations WHERE owner_id = ANY(${todosUsuarios}) OR renter_id = ANY(${todosUsuarios})`;
    await sql`DELETE FROM favorites WHERE user_id = ANY(${todosUsuarios}) OR space_id IN (SELECT id FROM spaces WHERE owner_id = ANY(${todosUsuarios}))`;
    await sql`DELETE FROM subscriptions WHERE booking_id IN (
      SELECT id FROM bookings WHERE owner_id = ANY(${todosUsuarios}) OR renter_id = ANY(${todosUsuarios})
    )`;
    await sql`DELETE FROM bookings WHERE owner_id = ANY(${todosUsuarios}) OR renter_id = ANY(${todosUsuarios})`;
    await sql`DELETE FROM spaces WHERE owner_id = ANY(${todosUsuarios})`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id = ANY(${todosUsuarios})`;
      await tx`DELETE FROM auth.users WHERE id = ANY(${todosUsuarios})`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 300)}\x1b[0m`);
  }
  await sql.end({ timeout: 5 });
}

main()
  .then(async () => {
    await limpar();
    console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
    if (failed) console.log(`Falhas: ${falhas.join(' | ')}`);
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('\n\x1b[31mERRO\x1b[0m', err);
    await limpar();
    process.exit(1);
  });

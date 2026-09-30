/**
 * Verificação da Fase 23 (descoberta, disponibilidade, preço e desempenho)
 * contra Postgres real.
 *
 * Roda as Server Actions DE VERDADE (o código do app, sem cópia) e confere o
 * que ficou gravado no banco. Só a sessão é trocada por um dublê, o mesmo
 * padrão de scripts/verify-bookings.ts e scripts/verify-notifications.ts.
 *
 *   pnpm tsx scripts/verify-descoberta.ts
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

// ---------------------------------------------------------------------------

const tag = `desc-${Date.now()}`;
/** Cidade exclusiva desta execução — nunca colide com resíduo de outro script. */
const cidade = `Cidade ${tag}`;
const PONTO = { lat: -21.71, lng: -41.33 };

function uuid() { return crypto.randomUUID(); }

const donoId = uuid();
const locatarioId = uuid();
const outroId = uuid();
const favAId = uuid();
const favBId = uuid();
const esperaId = uuid();
const bloqueadoId = uuid();
const todos = [donoId, locatarioId, outroId, favAId, favBId, esperaId, bloqueadoId];

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidade: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'] = 'user', fullName = 'Pessoa Teste') {
  identidade = { id, role, fullName };
}

function diasAFrente(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
async function criarPublicado(opts?: { precoCents?: number; tipo?: string; bairro?: string; fotos?: number }): Promise<{ id: string; slug: string }> {
  seq++;
  const slug = `${tag}-${seq}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, price_monthly_cents, size_m2, draft_step, location, approx_location)
    VALUES (${donoId}, ${slug}, ${opts?.tipo ?? 'garagem'}, ${`Garagem de teste ${slug}`},
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      ${opts?.bairro ?? 'Centro'}, ${cidade}, 'ES', CURRENT_DATE, ${opts?.precoCents ?? 40000}, 20, 8,
      ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326),
      ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326))
    RETURNING id`;
  const id = row!.id;
  for (let n = 0; n < (opts?.fotos ?? 3); n++) {
    await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${id}, ${`${donoId}/${id}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return { id, slug };
}

async function statusDo(spaceId: string): Promise<string> {
  const [r] = await sql<{ status: string }[]>`SELECT status::text FROM spaces WHERE id=${spaceId}`;
  return r?.status ?? '(nao existe)';
}

async function contarNotificacoes(userId: string, type: string, spaceId?: string): Promise<number> {
  const [{ n }] = spaceId
    ? await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${userId} AND type=${type} AND data->>'spaceId' = ${spaceId}`
    : await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${userId} AND type=${type}`;
  return n;
}

async function seed() {
  await sql`INSERT INTO auth.users ${sql(todos.map((id) => ({ id, email: `${id}@exemplo.invalid` })), 'id', 'email')}`;
  await sql`UPDATE profiles SET role='owner', full_name='Dona Descoberta' WHERE id=${donoId}`;
  for (const id of todos.filter((i) => i !== donoId)) {
    await sql`UPDATE profiles SET full_name=${`Pessoa ${id.slice(0, 6)}`} WHERE id=${id}`;
  }
  ok('semente criada', `${todos.length} perfis`);
}

async function limpar() {
  await sql`DELETE FROM notifications WHERE user_id IN ${sql(todos)}`;
  await sql`DELETE FROM waitlist_entries WHERE user_id IN ${sql(todos)}`;
  await sql`DELETE FROM favorites WHERE user_id IN ${sql(todos)}`;
  await sql`DELETE FROM user_blocks WHERE blocker_id IN ${sql(todos)} OR blocked_id IN ${sql(todos)}`;
  await sql`DELETE FROM conversations WHERE renter_id IN ${sql(todos)} OR owner_id IN ${sql(todos)}`;
  await sql`DELETE FROM subscriptions WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id=${donoId})`;
  await sql`DELETE FROM bookings WHERE owner_id=${donoId}`;
  await sql`DELETE FROM space_availability_blocks WHERE space_id IN (SELECT id FROM spaces WHERE owner_id=${donoId})`;
  // Apagar o espaco leva o historico de preco em cascata (unica saida permitida).
  await sql`DELETE FROM spaces WHERE owner_id=${donoId}`;
  // audit_logs é append-only de verdade (trigger): só o teste, na própria
  // limpeza, desliga a trava por um instante — mesmo padrão de verify-bookings.ts.
  await sql.begin(async (tx) => {
    await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
    await tx`DELETE FROM public.audit_logs WHERE actor_id IN ${sql(todos)}`;
    await tx`DELETE FROM auth.users WHERE id IN ${sql(todos)}`;
    await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
  });
}

async function main() {
  await seed();

  // ---- dublês: sessão (DAL), cache do Next ----
  const nomePublico = async (id: string) =>
    id ? ((await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id=${id}`)[0]?.public_name ?? null) : null;
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidade.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidade.id, role: identidade.role, email: 'teste@exemplo.invalid',
          fullName: identidade.fullName, publicName: await nomePublico(identidade.id), avatarPath: null,
          status: 'active', statusReason: null, acceptedTermsAt: new Date(),
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

  const { requestBookingAction, respondToBookingRequestAction, cancelBookingAction, endBookingAction } =
    await import('../src/lib/bookings/actions');
  const { saveStepAction, toggleSpaceStatusAction, deleteSpaceAction } = await import('../src/lib/spaces/actions');
  const { listPublishedSpaces, getPublicSpaceBySlug } = await import('../src/lib/spaces/queries');
  const { getPublicPriceHistory, buildPriceHistory } = await import('../src/lib/spaces/price-history');
  const { toggleFavoriteAction, setPriceAlertAction } = await import('../src/lib/favorites/actions');
  const { runPriceDropCatchUp } = await import('../src/lib/notifications/space-alerts');
  const { joinWaitlistAction, leaveWaitlistAction } = await import('../src/lib/waitlist/actions');
  const { listUserWaitlist, countWaitingBySpace } = await import('../src/lib/waitlist/queries');
  const { runWaitlistSweep } = await import('../src/lib/waitlist/notify');
  const { createAvailabilityBlockAction, cancelAvailabilityBlockAction } = await import('../src/lib/calendar/actions');
  const { getPublicCalendarRanges, getOwnerCalendarData } = await import('../src/lib/calendar/queries');
  const { buildMonth, dayState } = await import('../src/lib/calendar/month');
  const { earliestOpenEndedStart } = await import('../src/lib/spaces/availability');

  async function comRedirect<T>(fn: () => Promise<T>): Promise<{ redirecionou: boolean; resultado?: T }> {
    try {
      return { redirecionou: false, resultado: await fn() };
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      return { redirecionou: true };
    }
  }

  async function solicitar(renterId: string, spaceId: string, startDate = diasAFrente(1)) {
    entrarComo(renterId);
    const fd = new FormData();
    fd.set('spaceId', spaceId);
    fd.set('startDate', startDate);
    const r = await comRedirect(() => requestBookingAction(undefined, fd));
    const [linha] = await sql<{ id: string }[]>`
      SELECT id FROM bookings WHERE space_id=${spaceId} AND renter_id=${renterId} AND status='requested'
      ORDER BY requested_at DESC LIMIT 1`;
    return { redirecionou: r.redirecionou, resultado: r.resultado, bookingId: linha?.id ?? null };
  }

  async function responder(bookingId: string, decision: 'accept' | 'reject') {
    entrarComo(donoId, 'owner', 'Dona Descoberta');
    const fd = new FormData();
    fd.set('bookingId', bookingId);
    fd.set('decision', decision);
    return respondToBookingRequestAction(undefined, fd);
  }

  async function mudarPreco(spaceId: string, reais: string) {
    entrarComo(donoId, 'owner', 'Dona Descoberta');
    const fd = new FormData();
    fd.set('spaceId', spaceId);
    fd.set('step', 'preco');
    fd.set('price', reais);
    fd.set('availableFrom', new Date().toISOString().slice(0, 10));
    return saveStepAction(undefined, fd);
  }

  // =========================================================================
  secao('1. Ocupação real: aceite marca "alugado", cancelamento devolve ao ar');
  // =========================================================================

  const e1 = await criarPublicado();
  const s1 = await solicitar(locatarioId, e1.id);
  assert('solicitação criada pelo fluxo real', s1.redirecionou && Boolean(s1.bookingId));
  const aceite = await responder(s1.bookingId!, 'accept');
  assert('proprietário aceita', aceite.ok, JSON.stringify(aceite));
  expect('espaço vira "rented" no aceite (trigger no banco)', await statusDo(e1.id), 'rented');

  const naBusca = await listPublishedSpaces({ cityFilter: cidade, limit: 60 });
  assert('espaço alugado some da busca', !naBusca.some((s) => s.id === e1.id));
  const pagina = await getPublicSpaceBySlug(e1.slug);
  assert('mas a página pública continua abrindo (link compartilhado não quebra)', pagina?.status === 'rented');

  const s1b = await solicitar(outroId, e1.id);
  assert(
    'outra pessoa NÃO consegue solicitar espaço alugado',
    !s1b.redirecionou && s1b.resultado != null && !(s1b.resultado as { ok: boolean }).ok,
    JSON.stringify(s1b.resultado),
  );

  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdCancel = new FormData();
  fdCancel.set('bookingId', s1.bookingId!);
  const cancel = await cancelBookingAction(undefined, fdCancel);
  assert('proprietário cancela a reserva aceita', cancel.ok, JSON.stringify(cancel));
  expect('espaço volta a "published" quando a reserva deixa de ocupar', await statusDo(e1.id), 'published');

  // Encerramento de aluguel ativo devolve ao ar.
  const s2 = await solicitar(locatarioId, e1.id);
  await responder(s2.bookingId!, 'accept');
  await sql`UPDATE bookings SET status='active', activated_at=now() WHERE id=${s2.bookingId}`;
  expect('ativo continua "rented"', await statusDo(e1.id), 'rented');
  entrarComo(locatarioId);
  const fdEnd = new FormData();
  fdEnd.set('bookingId', s2.bookingId!);
  const fim = await endBookingAction(undefined, fdEnd);
  assert('locatário encerra o aluguel', fim.ok, JSON.stringify(fim));
  expect('encerrado: espaço volta a "published"', await statusDo(e1.id), 'published');

  // Retomar anúncio pausado com reserva vigente não o põe "published".
  const e2 = await criarPublicado();
  const s3 = await solicitar(locatarioId, e2.id);
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdPausa = new FormData();
  fdPausa.set('spaceId', e2.id);
  await toggleSpaceStatusAction(undefined, fdPausa);
  expect('pausado', await statusDo(e2.id), 'paused');
  const aceitePausado = await responder(s3.bookingId!, 'accept');
  assert('aceite com o anúncio pausado', aceitePausado.ok);
  expect('pausado continua pausado (quem pausou decidiu tirar do ar)', await statusDo(e2.id), 'paused');
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const retomar = await toggleSpaceStatusAction(undefined, fdPausa);
  expect('retomar com reserva vigente volta como "rented", nunca "published"', await statusDo(e2.id), 'rented');
  assert('e a mensagem diz o que aconteceu', /alugado/.test(retomar.message ?? ''), retomar.message);

  // Foto: alugado também não fica abaixo do mínimo.
  let fotoRecusada = false;
  try {
    await sql`DELETE FROM space_images WHERE space_id=${e2.id} AND position=0`;
  } catch {
    fotoRecusada = true;
  }
  assert('apagar foto de anúncio alugado abaixo do mínimo é recusado pelo banco', fotoRecusada);

  // Não dá para voltar ao ar (mínimo de fotos subiu): encerra mesmo assim e pausa.
  await sql`UPDATE platform_settings SET value='5'::jsonb WHERE key='space.min_photos_to_publish'`;
  try {
    await sql`UPDATE bookings SET status='cancelled', cancelled_at=now() WHERE id=${s3.bookingId}`;
    expect('reserva termina mesmo sem poder voltar ao ar, e o anúncio fica pausado', await statusDo(e2.id), 'paused');
  } finally {
    await sql`UPDATE platform_settings SET value='3'::jsonb WHERE key='space.min_photos_to_publish'`;
  }

  // =========================================================================
  secao('2. Histórico de preço: gravado pelo banco, imutável, só depois de publicar');
  // =========================================================================

  const e3 = await criarPublicado({ precoCents: 40000 });
  const m1 = await mudarPreco(e3.id, '380,00');
  assert('proprietário muda o preço pela etapa real', m1.ok, JSON.stringify(m1));
  const hist1 = await sql<{ old_price_cents: number; new_price_cents: number; changed_by: string | null; space_status: string }[]>`
    SELECT old_price_cents, new_price_cents, changed_by, space_status::text FROM space_price_history WHERE space_id=${e3.id}`;
  expect('uma linha de histórico, com antes e depois', hist1.map((h) => [h.old_price_cents, h.new_price_cents]), [[40000, 38000]]);
  expect('registra quem mudou (o dono, lido da sessão no servidor)', hist1[0]?.changed_by, donoId);
  expect('e o status do anúncio no momento', hist1[0]?.space_status, 'published');

  await mudarPreco(e3.id, '380,00');
  const [{ n: semMudanca }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM space_price_history WHERE space_id=${e3.id}`;
  expect('salvar o MESMO preço não cria linha', semMudanca, 1);

  let updateRecusado = false;
  try {
    await sql`UPDATE space_price_history SET new_price_cents = 1 WHERE space_id=${e3.id}`;
  } catch {
    updateRecusado = true;
  }
  assert('UPDATE no histórico é recusado (imutável)', updateRecusado);
  let deleteRecusado = false;
  try {
    await sql`DELETE FROM space_price_history WHERE space_id=${e3.id}`;
  } catch {
    deleteRecusado = true;
  }
  assert('DELETE no histórico é recusado (imutável)', deleteRecusado);

  // Rascunho: preço provisório e mudanças antes de publicar NÃO entram.
  const [rascunho] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, price_monthly_cents, draft_step)
    VALUES (${donoId}, ${`${tag}-rascunho`}, 'garagem', '', 1, 2) RETURNING id`;
  await mudarPreco(rascunho!.id, '250,00');
  const [{ n: noRascunho }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM space_price_history WHERE space_id=${rascunho!.id}`;
  expect('rascunho não gera histórico (nada de histórico artificial)', noRascunho, 0);

  // Leitura pública.
  const hist = await getPublicPriceHistory(e3.id, new Date());
  expect('histórico público: publicação + 1 mudança', hist?.points.map((p) => [p.priceCents, p.deltaCents, p.isPublication]), [
    [40000, null, true], [38000, -2000, false],
  ]);
  const semHist = await getPublicPriceHistory((await criarPublicado()).id, new Date());
  expect('anúncio que nunca mudou de preço não tem histórico (nada é exibido)', semHist, null);

  // Regras puras de exibição.
  const puro = buildPriceHistory('2026-09-15', [
    { day: '2026-09-22', oldPriceCents: 40000, newPriceCents: 39000 },
    { day: '2026-09-22', oldPriceCents: 39000, newPriceCents: 38000 },
    { day: '2026-09-28', oldPriceCents: 38000, newPriceCents: 35000 },
  ]);
  expect('várias mudanças no mesmo dia viram uma (o preço com que o dia terminou)',
    puro?.points.map((p) => [p.date, p.priceCents]), [['2026-09-15', 40000], ['2026-09-22', 38000], ['2026-09-28', 35000]]);
  const idaEVolta = buildPriceHistory('2026-09-15', [
    { day: '2026-09-20', oldPriceCents: 40000, newPriceCents: 39000 },
    { day: '2026-09-20', oldPriceCents: 39000, newPriceCents: 40000 },
  ]);
  expect('mudou e voltou no mesmo dia: não há histórico a mostrar', idaEVolta, null);

  // Navegador não lê o histórico direto (privado do servidor).
  let navegadorLeu = true;
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claim.sub', ${donoId}, true)`;
      await tx`SELECT count(*) FROM space_price_history`;
    });
  } catch {
    navegadorLeu = false;
  }
  assert('pela API do navegador, nem o dono lê space_price_history direto', !navegadorLeu);

  // Excluir anúncio sem reserva leva o histórico junto (cascata), sem travar a exclusão.
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdDel = new FormData();
  fdDel.set('spaceId', e3.id);
  const del = await deleteSpaceAction(undefined, fdDel);
  assert('anúncio com histórico pode ser excluído (cascata é a única saída permitida)', del.ok, JSON.stringify(del));
  const [{ n: orfaos }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM space_price_history WHERE space_id=${e3.id}`;
  expect('e o histórico foi junto', orfaos, 0);

  // =========================================================================
  secao('3. Aviso de queda de preço: só quem ativou, abaixo do menor já avisado, 1x/24h');
  // =========================================================================

  const e4 = await criarPublicado({ precoCents: 40000 });
  entrarComo(favAId);
  const fdFavA = new FormData();
  fdFavA.set('spaceId', e4.id);
  await toggleFavoriteAction(fdFavA);
  entrarComo(favBId);
  const fdFavB = new FormData();
  fdFavB.set('spaceId', e4.id);
  await toggleFavoriteAction(fdFavB);
  const [favA] = await sql<{ price_alert: boolean; price_alert_baseline_cents: number }[]>`
    SELECT price_alert, price_alert_baseline_cents FROM favorites WHERE user_id=${favAId} AND space_id=${e4.id}`;
  expect('favoritar liga o aviso e guarda o preço de agora como referência', [favA?.price_alert, favA?.price_alert_baseline_cents], [true, 40000]);

  entrarComo(favBId);
  const fdOff = new FormData();
  fdOff.set('spaceId', e4.id);
  fdOff.set('enabled', '0');
  const off = await setPriceAlertAction(fdOff);
  assert('B desliga "Me avise quando o preço baixar"', off.ok && off.enabled === false, JSON.stringify(off));

  entrarComo(outroId);
  const fdAlheio = new FormData();
  fdAlheio.set('spaceId', e4.id);
  fdAlheio.set('enabled', '0');
  const alheio = await setPriceAlertAction(fdAlheio);
  assert('quem não favoritou não mexe no aviso de ninguém', !alheio.ok);

  await mudarPreco(e4.id, '390,00');
  expect('400 → 390: A (aviso ligado) recebe 1 aviso', await contarNotificacoes(favAId, 'favorite_price_drop'), 1);
  expect('B (aviso desligado) não recebe nada', await contarNotificacoes(favBId, 'favorite_price_drop'), 0);
  const [aviso1] = await sql<{ body: string; data: Record<string, number> }[]>`
    SELECT body, data FROM notifications WHERE user_id=${favAId} AND type='favorite_price_drop'`;
  assert('o aviso mostra preço anterior, atual e a diferença', /400,00/.test(aviso1!.body) && /390,00/.test(aviso1!.body) && /10,00 a menos/.test(aviso1!.body), aviso1!.body);
  expect('e os números vão estruturados em data', [aviso1!.data.oldPriceCents, aviso1!.data.newPriceCents, aviso1!.data.diffCents], [40000, 39000, 1000]);

  await mudarPreco(e4.id, '395,00');
  await mudarPreco(e4.id, '385,00');
  expect('390 → 395 → 385 na mesma janela: nenhum aviso a mais (sem rajada)', await contarNotificacoes(favAId, 'favorite_price_drop'), 1);

  await sql`UPDATE favorites SET price_alert_notified_at = now() - interval '25 hours' WHERE user_id=${favAId} AND space_id=${e4.id}`;
  const catchUp = await runPriceDropCatchUp();
  expect('passada a janela, o cron avisa a queda que ficou para depois', await contarNotificacoes(favAId, 'favorite_price_drop'), 2);
  assert('cron contou o envio', catchUp.sent >= 1, JSON.stringify(catchUp));
  const [aviso2] = await sql<{ body: string }[]>`
    SELECT body FROM notifications WHERE user_id=${favAId} AND type='favorite_price_drop' ORDER BY created_at DESC LIMIT 1`;
  assert('segundo aviso é "de 390 para 385" (a partir do menor já avisado)', /390,00/.test(aviso2!.body) && /385,00/.test(aviso2!.body), aviso2!.body);

  await runPriceDropCatchUp();
  expect('rodar o cron de novo não repete o aviso', await contarNotificacoes(favAId, 'favorite_price_drop'), 2);

  await sql`UPDATE favorites SET price_alert_notified_at = now() - interval '25 hours' WHERE user_id=${favAId} AND space_id=${e4.id}`;
  await mudarPreco(e4.id, '384,00');
  expect('queda menor que 1% (385 → 384) não gera aviso', await contarNotificacoes(favAId, 'favorite_price_drop'), 2);
  await mudarPreco(e4.id, '420,00');
  expect('aumento nunca gera aviso', await contarNotificacoes(favAId, 'favorite_price_drop'), 2);

  // Pausado: a queda espera o anúncio voltar.
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdP4 = new FormData();
  fdP4.set('spaceId', e4.id);
  await toggleSpaceStatusAction(undefined, fdP4);
  await mudarPreco(e4.id, '300,00');
  expect('queda com o anúncio pausado: nada ainda', await contarNotificacoes(favAId, 'favorite_price_drop'), 2);
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  await toggleSpaceStatusAction(undefined, fdP4);
  await runPriceDropCatchUp();
  expect('voltou ao ar: o cron avisa a queda', await contarNotificacoes(favAId, 'favorite_price_drop'), 3);

  // Religar parte do preço de agora.
  entrarComo(favBId);
  const fdOn = new FormData();
  fdOn.set('spaceId', e4.id);
  fdOn.set('enabled', '1');
  await setPriceAlertAction(fdOn);
  const [favB] = await sql<{ price_alert_baseline_cents: number }[]>`
    SELECT price_alert_baseline_cents FROM favorites WHERE user_id=${favBId} AND space_id=${e4.id}`;
  expect('religar o aviso parte do preço atual (nada de aviso atrasado)', favB?.price_alert_baseline_cents, 30000);
  await runPriceDropCatchUp();
  expect('B continua sem aviso retroativo', await contarNotificacoes(favBId, 'favorite_price_drop'), 0);

  // Caminho do navegador: preço de referência inventado é recalculado pelo banco.
  const e5 = await criarPublicado({ precoCents: 50000 });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    await tx`SELECT set_config('request.jwt.claim.sub', ${outroId}, true)`;
    await tx`INSERT INTO favorites (user_id, space_id, price_cents_at_favorite, price_alert_baseline_cents)
             VALUES (${outroId}, ${e5.id}, 1, 99999999)`;
  });
  const [forjado] = await sql<{ price_cents_at_favorite: number; price_alert_baseline_cents: number }[]>`
    SELECT price_cents_at_favorite, price_alert_baseline_cents FROM favorites WHERE user_id=${outroId} AND space_id=${e5.id}`;
  expect('INSERT forjado pelo navegador: preços vêm do anúncio, não do que foi enviado',
    [forjado?.price_cents_at_favorite, forjado?.price_alert_baseline_cents], [50000, 50000]);
  let navegadorAlterou = true;
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claim.sub', ${outroId}, true)`;
      await tx`UPDATE favorites SET price_alert_baseline_cents = 99999999 WHERE user_id=${outroId}`;
    });
  } catch {
    navegadorAlterou = false;
  }
  assert('e o navegador não consegue alterar a referência depois', !navegadorAlterou);

  // =========================================================================
  secao('4. Lista de espera: entrar, sair, sem duplicar, aviso sem reserva automática');
  // =========================================================================

  const e6 = await criarPublicado();
  entrarComo(esperaId);
  const fdJ = new FormData();
  fdJ.set('spaceId', e6.id);
  const cedo = await joinWaitlistAction(undefined, fdJ);
  assert('espaço disponível: não há fila (pode solicitar já)', !cedo.ok, cedo.message);

  const s6 = await solicitar(locatarioId, e6.id);
  await responder(s6.bookingId!, 'accept');
  expect('alugado', await statusDo(e6.id), 'rented');

  entrarComo(esperaId);
  const j1 = await joinWaitlistAction(undefined, fdJ);
  assert('entra na lista de espera do espaço alugado', j1.ok, j1.message);
  const j2 = await joinWaitlistAction(undefined, fdJ);
  assert('segunda tentativa não duplica', j2.ok && /já está/.test(j2.message ?? ''), j2.message);
  const [{ n: linhasEspera }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM waitlist_entries WHERE user_id=${esperaId} AND space_id=${e6.id}`;
  expect('uma linha só', linhasEspera, 1);

  const duplicadaNoBanco = await sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${esperaId}, ${e6.id})`
    .then(() => false).catch(() => true);
  assert('o banco também recusa a duplicata (índice único parcial)', duplicadaNoBanco);

  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdDono = new FormData();
  fdDono.set('spaceId', e6.id);
  const donoEntra = await joinWaitlistAction(undefined, fdDono);
  assert('o dono não entra na lista do próprio espaço', !donoEntra.ok, donoEntra.message);

  await sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${donoId}, ${bloqueadoId})`;
  entrarComo(bloqueadoId);
  const fdBloq = new FormData();
  fdBloq.set('spaceId', e6.id);
  const bloqEntra = await joinWaitlistAction(undefined, fdBloq);
  assert('quem tem bloqueio com o dono não entra', !bloqEntra.ok, bloqEntra.message);

  entrarComo(esperaId);
  const sai = await leaveWaitlistAction(undefined, fdJ);
  assert('sai da lista', sai.ok, sai.message);
  const volta = await joinWaitlistAction(undefined, fdJ);
  assert('e pode entrar de novo', volta.ok, volta.message);
  const estados = await sql<{ status: string }[]>`SELECT status::text FROM waitlist_entries WHERE user_id=${esperaId} AND space_id=${e6.id} ORDER BY joined_at`;
  expect('a saída fica registrada (não apaga história)', estados.map((e) => e.status), ['left', 'waiting']);

  // Favoritou e está na lista: um aviso só. Só favoritou: aviso de favorito.
  entrarComo(esperaId);
  const fdFavE = new FormData();
  fdFavE.set('spaceId', e6.id);
  await toggleFavoriteAction(fdFavE);
  entrarComo(favAId);
  const fdFavA6 = new FormData();
  fdFavA6.set('spaceId', e6.id);
  await toggleFavoriteAction(fdFavA6);

  const contagem = await countWaitingBySpace([e6.id]);
  expect('o dono vê só a contagem de quem espera', contagem.get(e6.id), 1);

  const [{ n: reservasAntes }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM bookings WHERE space_id=${e6.id}`;
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const fdC6 = new FormData();
  fdC6.set('bookingId', s6.bookingId!);
  await cancelBookingAction(undefined, fdC6);
  expect('reserva cancelada: espaço disponível de novo', await statusDo(e6.id), 'published');
  expect('quem esperava recebe o aviso da lista de espera', await contarNotificacoes(esperaId, 'waitlist_available'), 1);
  expect('e NÃO recebe também o aviso de favorito (mesmo fato, um aviso)', await contarNotificacoes(esperaId, 'favorite_available_again', e6.id), 0);
  expect('quem só favoritou recebe o aviso de favorito', await contarNotificacoes(favAId, 'favorite_available_again', e6.id), 1);
  const [{ n: reservasDepois }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM bookings WHERE space_id=${e6.id}`;
  expect('nenhuma reserva é criada sozinha para quem esperava', reservasDepois, reservasAntes);
  const [entrada] = await sql<{ status: string; notified_at: Date | null }[]>`
    SELECT status::text, notified_at FROM waitlist_entries WHERE user_id=${esperaId} AND space_id=${e6.id} AND status <> 'left'`;
  assert('a entrada fica "notified", com a data do aviso', entrada?.status === 'notified' && entrada.notified_at != null);

  await runWaitlistSweep();
  expect('o cron não repete o aviso', await contarNotificacoes(esperaId, 'waitlist_available'), 1);

  const minhas = await listUserWaitlist(esperaId);
  assert('a pessoa vê o aviso na lista dela', minhas.some((m) => m.spaceId === e6.id && m.status === 'notified'));

  // Rede de segurança: espera "presa" num espaço que já está livre.
  const e7 = await criarPublicado();
  await sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${outroId}, ${e7.id})`;
  const varrida = await runWaitlistSweep();
  assert('o cron avisa quem ficou esperando um espaço que já está livre', varrida.notified >= 1, JSON.stringify(varrida));
  expect('aviso entregue', await contarNotificacoes(outroId, 'waitlist_available'), 1);

  // Anúncio arquivado: a espera fecha.
  const e8 = await criarPublicado();
  await sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${outroId}, ${e8.id})`;
  await sql`UPDATE spaces SET status='archived', deleted_at=now() WHERE id=${e8.id}`;
  await runWaitlistSweep();
  const [fechada] = await sql<{ status: string }[]>`SELECT status::text FROM waitlist_entries WHERE user_id=${outroId} AND space_id=${e8.id}`;
  expect('anúncio arquivado: a espera fecha ("closed"), não fica aguardando para sempre', fechada?.status, 'closed');

  let navegadorLeuEspera = true;
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('request.jwt.claim.sub', ${esperaId}, true)`;
      await tx`SELECT count(*) FROM waitlist_entries`;
    });
  } catch {
    navegadorLeuEspera = false;
  }
  assert('pela API do navegador ninguém lê a lista de espera (nem a própria)', !navegadorLeuEspera);

  // =========================================================================
  secao('5. Calendário: bloqueios, conflito com reserva e concorrência');
  // =========================================================================

  async function bloquear(spaceId: string, de: string, ate: string, reason = 'manutencao', note?: string) {
    const fd = new FormData();
    fd.set('spaceId', spaceId);
    fd.set('startsOn', de);
    fd.set('endsOn', ate);
    fd.set('reason', reason);
    if (note) fd.set('note', note);
    return createAvailabilityBlockAction(undefined, fd);
  }

  const e9 = await criarPublicado();
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const b1 = await bloquear(e9.id, diasAFrente(10), diasAFrente(14), 'uso_proprio', 'reforma do portão');
  assert('proprietário bloqueia datas', b1.ok, JSON.stringify(b1));
  const b2 = await bloquear(e9.id, diasAFrente(13), diasAFrente(20));
  assert('bloqueio sobreposto é recusado (trigger no banco)', !b2.ok && /já existe/i.test(b2.message ?? ''), b2.message);
  const b3 = await bloquear(e9.id, diasAFrente(-2), diasAFrente(1));
  assert('bloqueio começando no passado é recusado', !b3.ok, JSON.stringify(b3));
  const b4 = await bloquear(e9.id, diasAFrente(5), diasAFrente(3));
  assert('fim antes do início é recusado', !b4.ok, JSON.stringify(b4));
  const b5 = await bloquear(e9.id, diasAFrente(30), diasAFrente(30 + 400));
  assert('bloqueio de mais de um ano é recusado', !b5.ok, JSON.stringify(b5));

  entrarComo(outroId);
  const bAlheio = await bloquear(e9.id, diasAFrente(40), diasAFrente(41));
  assert('outra pessoa não bloqueia datas de espaço alheio', !bAlheio.ok && /não encontrado/i.test(bAlheio.message ?? ''), bAlheio.message);

  const publico = await getPublicCalendarRanges(e9.id);
  expect('público vê o período bloqueado, e só o período (sem motivo nem anotação)',
    publico.blocked.map((b) => Object.keys(b).sort()), [['endsOn', 'startsOn']]);
  assert('a anotação privada não aparece na leitura pública', !JSON.stringify(publico).includes('portão'));
  const doDono = await getOwnerCalendarData(e9.id, donoId);
  assert('o dono vê motivo e anotação', doDono?.blocks[0]?.reason === 'uso_proprio' && doDono.blocks[0].note === 'reforma do portão');
  expect('o calendário do dono não abre para outra pessoa', await getOwnerCalendarData(e9.id, outroId), null);

  // Solicitação: aluguel sem data para terminar não pode começar antes de um bloqueio.
  const sAntes = await solicitar(outroId, e9.id, diasAFrente(2));
  assert('pedir para começar ANTES do bloqueio é recusado (o aluguel atravessaria o bloqueio)',
    !sAntes.redirecionou && /indisponível/i.test((sAntes.resultado as { message?: string })?.message ?? ''),
    JSON.stringify(sAntes.resultado));
  const sDentro = await solicitar(outroId, e9.id, diasAFrente(12));
  assert('pedir para começar DENTRO do bloqueio é recusado', !sDentro.redirecionou);
  const sDepois = await solicitar(outroId, e9.id, diasAFrente(15));
  assert('pedir para começar no dia seguinte ao fim do bloqueio passa', sDepois.redirecionou && Boolean(sDepois.bookingId));

  // Pedido feito antes do bloqueio existir: o aceite é que esbarra.
  const e10 = await criarPublicado();
  const sCedo = await solicitar(outroId, e10.id, diasAFrente(2));
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const bDepois = await bloquear(e10.id, diasAFrente(20), diasAFrente(22));
  assert('bloquear com só uma solicitação pendente é permitido (pedido não ocupa)', bDepois.ok, bDepois.message);
  const aceiteBloqueado = await responder(sCedo.bookingId!, 'accept');
  assert('aceitar uma reserva que atravessaria o bloqueio é recusado (trigger)', !aceiteBloqueado.ok && /bloque/i.test(aceiteBloqueado.message ?? ''), aceiteBloqueado.message);
  expect('e o espaço continua disponível', await statusDo(e10.id), 'published');
  const [{ id: bloqueioE10 }] = await sql<{ id: string }[]>`SELECT id FROM space_availability_blocks WHERE space_id=${e10.id} AND cancelled_at IS NULL`;
  entrarComo(outroId);
  const fdCancelAlheio = new FormData();
  fdCancelAlheio.set('blockId', bloqueioE10!);
  const cancelAlheio = await cancelAvailabilityBlockAction(undefined, fdCancelAlheio);
  assert('outra pessoa não desfaz o bloqueio', !cancelAlheio.ok, cancelAlheio.message);
  entrarComo(donoId, 'owner', 'Dona Descoberta');
  const desfaz = await cancelAvailabilityBlockAction(undefined, fdCancelAlheio);
  assert('o dono desfaz o bloqueio', desfaz.ok, desfaz.message);
  const [{ n: bloqueiosAtivos }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM space_availability_blocks WHERE space_id=${e10.id} AND cancelled_at IS NULL`;
  const [{ n: bloqueiosTotal }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM space_availability_blocks WHERE space_id=${e10.id}`;
  expect('desfeito continua registrado (com data de cancelamento)', [bloqueiosAtivos, bloqueiosTotal], [0, 1]);
  const aceiteLiberado = await responder(sCedo.bookingId!, 'accept');
  assert('sem o bloqueio, o aceite passa', aceiteLiberado.ok, aceiteLiberado.message);
  const bSobreReserva = await bloquear(e10.id, diasAFrente(30), diasAFrente(31));
  assert('bloquear por cima de reserva vigente é recusado', !bSobreReserva.ok && /reserva vigente/i.test(bSobreReserva.message ?? ''), bSobreReserva.message);

  // Concorrência: bloqueio e aceite do MESMO espaço ao mesmo tempo — só um vence.
  let exatamenteUm = 0;
  const rodadas = 6;
  for (let i = 0; i < rodadas; i++) {
    const eC = await criarPublicado();
    const sC = await solicitar(locatarioId, eC.id, diasAFrente(1));
    entrarComo(donoId, 'owner', 'Dona Descoberta');
    const [rAceite, rBloqueio] = await Promise.all([
      responder(sC.bookingId!, 'accept'),
      bloquear(eC.id, diasAFrente(5), diasAFrente(6)),
    ]);
    const [{ n: ocupando }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM bookings WHERE space_id=${eC.id} AND status IN ('approved','awaiting_payment','active','past_due')`;
    const [{ n: bloqueando }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM space_availability_blocks WHERE space_id=${eC.id} AND cancelled_at IS NULL`;
    if ((rAceite.ok ? 1 : 0) + (rBloqueio.ok ? 1 : 0) === 1 && ocupando + bloqueando === 1) exatamenteUm++;
  }
  expect(`aceite × bloqueio simultâneos: exatamente um vence em todas as ${rodadas} rodadas`, exatamenteUm, rodadas);

  // Regras puras do calendário.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const entradaCal = {
    today: hojeISO,
    availableFrom: diasAFrente(3),
    occupied: [],
    blocked: [{ startsOn: diasAFrente(10), endsOn: diasAFrente(12) }],
  };
  expect('dia antes de "disponível a partir de" = antes_disponivel', dayState(diasAFrente(1), entradaCal).state, 'antes_disponivel');
  expect('dia bloqueado = bloqueado', dayState(diasAFrente(11), entradaCal).state, 'bloqueado');
  expect('dia livre = disponivel', dayState(diasAFrente(20), entradaCal).state, 'disponivel');
  expect('ontem = passado', dayState(diasAFrente(-1), entradaCal).state, 'passado');
  expect('reserva sem fim ocupa para sempre',
    dayState(diasAFrente(400), { ...entradaCal, occupied: [{ startsOn: diasAFrente(5), endsOn: null }] }).state, 'ocupado');
  const mesTeste = buildMonth(2026, 11, { ...entradaCal, today: '2026-11-01', availableFrom: null, blocked: [] });
  expect('novembro/2026 começa num domingo e tem 30 dias', [mesTeste.weeks[0][0].date, mesTeste.weeks.flat().filter((d) => d.inMonth).length], ['2026-11-01', 30]);
  expect('primeiro início possível pula o último bloqueio',
    earliestOpenEndedStart({ today: '2026-10-01', availableFrom: '2026-10-05', blocks: [{ startsOn: '2026-10-10', endsOn: '2026-10-12' }] }),
    '2026-10-13');

  // =========================================================================
  await limpar();
  console.log(`\n\x1b[1mResultado:\x1b[0m ${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passaram, ${failed} falharam\x1b[0m`);
  if (failed > 0) {
    console.log(falhas.map((f) => `  - ${f}`).join('\n'));
  }
  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try { await limpar(); } catch (e) { console.error('limpeza falhou:', e); }
  await sql.end();
  process.exit(1);
});

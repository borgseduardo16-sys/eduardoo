/**
 * Verificacao da camada de CONFIANCA (Fase 21) contra Postgres real e o
 * dublê local (Storage do Supabase + Twilio Verify).
 *
 * Cobre, chamando as Server Actions e consultas DE VERDADE (so a sessao e
 * simulada, como nos outros verify-*.ts):
 *   1. Fluxo completo da §52 (conta → verificacao → anuncio → solicitacao →
 *      aceite → reserva ativa → encerramento → avaliacao → media → historico)
 *   2. Regras de avaliacao e tentativas de manipulacao (§10, §13, §53)
 *   3. Reputacao: media, contagem, distribuicao e arredondamento (§12)
 *   4. Perfil publico e privacidade (§2, §35)
 *   5. Edicao do proprio perfil + foto sem GPS (§34)
 *   6. Verificacoes: e-mail, telefone (SMS) e identidade so estrutura (§5-7)
 *   7. Denuncias: avaliacao, usuario, anuncio e reserva (§14, §24, §25)
 *   8. Notificacoes: preferencias, idempotencia, lidas/nao lidas (§17-21, §50)
 *   9. Pagina da reserva: so as partes, endereco so com reserva confirmada (§48)
 *  10. Bloqueio preserva reserva em andamento (§26)
 *  11. RLS: o que os papeis do navegador (anon/authenticated) alcancam (§53)
 *
 *   pnpm tsx scripts/verify-confianca.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import sharp from 'sharp';
import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { computeBookingAmounts } from '../src/lib/money';
import { startTestbed, type Testbed } from './testbed/server';

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
async function recusa(name: string, fn: () => Promise<unknown>, fragmento: string) {
  try {
    await fn();
    bad(name, 'o banco ACEITOU algo que deveria recusar');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(fragmento.toLowerCase())) ok(name, `recusado: ${fragmento}`);
    else bad(name, `recusou por outro motivo: ${msg.slice(0, 180)}`);
  }
}

// ---------------------------------------------------------------------------

const tag = `conf-${Date.now()}`;
function uuid() { return crypto.randomUUID(); }
/** Celular brasileiro unico por execucao: +55 27 9XXXXXXXX. */
function celular(): string {
  return `+55279${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

// Fluxo completo (§52)
const anaId = uuid(); // proprietaria
const brunoId = uuid(); // locatario
// Regras de avaliacao / reputacao / denuncias
const donoId = uuid();
const locId = uuid();
const loc2Id = uuid();
const loc3Id = uuid();
const terceiroId = uuid();
const suspensoId = uuid();
// Verificacoes, perfil, notificacoes
const telAId = uuid();
const telBId = uuid();
const telCId = uuid();
const avatarId = uuid();
const prefId = uuid();
const outroPrefId = uuid();
const respId = uuid();

const todos = [
  anaId, brunoId, donoId, locId, loc2Id, loc3Id, terceiroId, suspensoId,
  telAId, telBId, telCId, avatarId, prefId, outroPrefId, respId,
];

type Papel = 'user' | 'owner' | 'admin';
let identidade: { id: string; role: Papel; fullName: string } = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Papel, fullName: string) {
  identidade = { id, role, fullName };
}
async function sessao() {
  // Como no DAL real: o nome público vem do perfil gravado no banco (inclui
  // o nome de exibição, quando a pessoa definiu um).
  const [perfil] = identidade.id
    ? await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id=${identidade.id}`
    : [];
  return {
    id: identidade.id,
    role: identidade.role,
    email: `${identidade.id}@exemplo.invalid`,
    fullName: identidade.fullName,
    publicName: perfil?.public_name ?? null,
    avatarPath: null,
    status: 'active' as const,
    statusReason: null,
    acceptedTermsAt: new Date(),
  };
}

let testbed: Testbed;
let fees = { renterFeeBps: 300, ownerFeeBps: 300 };
let seq = 0;

async function criarPublicado(ownerId: string, sufixo: string, precoCents = 30000): Promise<{ id: string; slug: string }> {
  seq++;
  const slug = `${tag}-${sufixo}-${seq}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, street, number, district, city, state,
      postal_code, available_from, price_monthly_cents, size_m2, draft_step, location, approx_location)
    VALUES (${ownerId}, ${slug}, 'garagem', ${`Garagem de teste ${slug}`},
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      'Rua das Palmeiras', '1234', 'Centro', ${tag}, 'ES', '29700000', CURRENT_DATE, ${precoCents}, 20, 8,
      ST_SetSRID(ST_MakePoint(-43.2, -21.5), 4326), ST_SetSRID(ST_MakePoint(-43.2, -21.5), 4326))
    RETURNING id`;
  const id = row!.id;
  await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES
    (${id}, ${`${ownerId}/${id}/f0.jpg`}, 0), (${id}, ${`${ownerId}/${id}/f1.jpg`}, 1), (${id}, ${`${ownerId}/${id}/f2.jpg`}, 2)`;
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return { id, slug };
}

/** Reserva direto no banco, no status pedido (para cenarios que nao sao o fluxo principal). */
async function criarReserva(spaceId: string, ownerId: string, renterId: string, status: string): Promise<string> {
  seq++;
  const a = computeBookingAmounts(30000, fees);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
      monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents,
      total_charged_cents, owner_payout_cents, ended_at)
    VALUES (${`MP-${tag}-${seq}`}, ${spaceId}, ${renterId}, ${ownerId}, ${status}, CURRENT_DATE - 60,
      ${a.monthlyRentCents}, ${a.renterFeeBps}, ${a.ownerFeeBps}, ${a.renterFeeCents}, ${a.ownerFeeCents},
      ${a.totalChargedCents}, ${a.ownerPayoutCents}, ${status === 'ended' ? sql`now()` : null})
    RETURNING id`;
  return row!.id;
}

async function contar(query: Promise<{ n: number }[]>): Promise<number> {
  const [r] = await query;
  return r?.n ?? 0;
}

/** Actions que terminam em redirect() lancam NEXT_REDIRECT — devolve o destino. */
async function comRedirect(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw err;
    return digest.split(';')[2] ?? '';
  }
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** Selfie como sai do celular: com GPS e modelo do aparelho no EXIF. */
async function selfieComGps(): Promise<Buffer> {
  const base = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 90, g: 120, b: 160 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
  return sharp(base)
    .withMetadata({
      exif: {
        IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '19/1 32/1 1896/100', GPSLongitudeRef: 'W', GPSLongitude: '40/1 37/1 4620/100' },
      },
    })
    .toBuffer();
}

async function seed() {
  await sql`INSERT INTO auth.users ${sql(todos.map((id) => ({ id, email: `${id}@exemplo.invalid` })), 'id', 'email')}`;
  const nomes: Record<string, [string, Papel]> = {
    [anaId]: ['Ana Proprietaria Lima', 'owner'],
    [brunoId]: ['Bruno Locatario Costa', 'user'],
    [donoId]: ['Daniel Dono Rocha', 'owner'],
    [locId]: ['Lucas Locatario Alves', 'user'],
    [loc2Id]: ['Livia Locataria Melo', 'user'],
    [loc3Id]: ['Luan Locatario Dias', 'user'],
    [terceiroId]: ['Tiago Terceiro Nunes', 'user'],
    [suspensoId]: ['Sergio Suspenso Paz', 'owner'],
    [telAId]: ['Tereza Telefone Um', 'user'],
    [telBId]: ['Tomas Telefone Dois', 'user'],
    [telCId]: ['Tania Telefone Tres', 'user'],
    [avatarId]: ['Alice Avatar Reis', 'user'],
    [prefId]: ['Paula Preferencia Luz', 'user'],
    [outroPrefId]: ['Pedro Outro Mota', 'user'],
    [respId]: ['Rita Resposta Prado', 'owner'],
  };
  for (const [id, [nome, papel]] of Object.entries(nomes)) {
    await sql`UPDATE profiles SET full_name=${nome}, role=${papel} WHERE id=${id}`;
  }
  await sql`UPDATE profiles SET status='suspended', status_reason='teste' WHERE id=${suspensoId}`;
  const [feesRow] = await sql<{ r: number; o: number }[]>`
    SELECT (SELECT (value #>> '{}')::int FROM platform_settings WHERE key='fees.renter_fee_bps') AS r,
           (SELECT (value #>> '{}')::int FROM platform_settings WHERE key='fees.owner_fee_bps') AS o`;
  fees = { renterFeeBps: Number(feesRow!.r ?? 300), ownerFeeBps: Number(feesRow!.o ?? 300) };
  ok('semente criada', `${todos.length} contas`);
}

async function main() {
  secao('0. Ambiente');
  testbed = await startTestbed();
  ok('dublê local no ar (Storage + Twilio Verify)', testbed.url);

  // Aponta o app para o dublê ANTES de importar qualquer modulo que leia serverEnv.
  process.env.NEXT_PUBLIC_SUPABASE_URL = testbed.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SERVICE_SID;
  process.env.TWILIO_VERIFY_BASE_URL = testbed.url;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; // push fora do escopo aqui (verify-notifications cobre)

  await seed();

  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class AccountBlockedError extends Error {}
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidade.id) throw new UnauthorizedError('Voce precisa entrar para continuar.');
        return sessao();
      },
      requireUser: async () => sessao(),
      getCurrentUser: async () => (identidade.id ? sessao() : null),
      requireAdminOrThrow: async () => { throw new ForbiddenError(); },
      UnauthorizedError, ForbiddenError, AccountBlockedError,
    },
  } as never;
  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;
  const headersPath = req.resolve('next/headers');
  req.cache[headersPath] = {
    id: headersPath, filename: headersPath, loaded: true,
    exports: { headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'verify-confianca' }) },
  } as never;

  const { requestBookingAction, respondToBookingRequestAction, endBookingAction } = await import('../src/lib/bookings/actions');
  const { createReviewAction } = await import('../src/lib/reviews/actions');
  const { createReportAction, blockUserAction } = await import('../src/lib/safety/actions');
  const { updateProfileAction, uploadAvatarAction, removeAvatarAction } = await import('../src/lib/profiles/actions');
  const { startPhoneVerificationAction, checkPhoneVerificationAction, cancelPhoneVerificationAction } =
    await import('../src/lib/verification/actions');
  const { getVerificationOverview } = await import('../src/lib/verification/queries');
  const {
    updateNotificationPreferencesAction, markNotificationReadAction, markAllNotificationsReadAction, openNotificationAction,
  } = await import('../src/lib/notifications/actions');
  const {
    countUnreadNotifications, listUnreadNotifications, listReadNotifications, getNotificationPreferences,
  } = await import('../src/lib/notifications/queries');
  const { insertNotification } = await import('../src/lib/notifications/dispatch');
  const { db } = await import('../src/db/client');
  const { runPromotionExpiringReminders } = await import('../src/lib/notifications/cron');
  const { getPublicProfile } = await import('../src/lib/profiles/queries');
  const { getReputation, getRatingSummaries } = await import('../src/lib/reviews/reputation');
  const { listReviewsForSpace, listReviewsReceived } = await import('../src/lib/reviews/queries');
  const { formatRating } = await import('../src/lib/reviews/format');
  const { getPublicSpaceBySlug, listPublishedSpaces } = await import('../src/lib/spaces/queries');
  const { getBookingForParticipant, getBookingAddressForRenter } = await import('../src/lib/bookings/queries');
  const { buildTrustSignals, shouldEmphasizeVisit } = await import('../src/lib/safety/trust');
  const { hasBlocked } = await import('../src/lib/safety/queries');

  // =========================================================================
  secao('1. Fluxo completo (§52): da conta nova à avaliação refletida na média');
  // =========================================================================

  // 1-2. Ana cria a conta e confirma o e-mail pelo Auth (o que o GoTrue faz ao abrir o link).
  const [anaAntes] = await sql<{ email_verified_at: Date | null }[]>`SELECT email_verified_at FROM profiles WHERE id=${anaId}`;
  expect('1. conta nova nasce com e-mail NAO verificado', anaAntes!.email_verified_at, null);
  await sql`UPDATE auth.users SET email_confirmed_at = now() WHERE id=${anaId}`;
  const [anaDepois] = await sql<{ email_verified_at: Date | null }[]>`SELECT email_verified_at FROM profiles WHERE id=${anaId}`;
  assert('2. confirmar o e-mail no Auth marca "e-mail verificado" no perfil (trigger)', anaDepois!.email_verified_at !== null);

  // 2b. Telefone: servico de SMS configurado apontando para o dublê do Twilio.
  process.env.TWILIO_ACCOUNT_SID = testbed.twilio.accountSid;
  process.env.TWILIO_AUTH_TOKEN = testbed.twilio.authToken;
  process.env.TWILIO_VERIFY_SERVICE_SID = testbed.twilio.serviceSid;
  const telAna = celular();
  entrarComo(anaId, 'owner', 'Ana Proprietaria Lima');
  const rTelAna = await startPhoneVerificationAction(undefined, fd({ phone: telAna }));
  assert('2. Ana pede o codigo por SMS', rTelAna.ok && rTelAna.step === 'code', JSON.stringify(rTelAna));
  const codigoAna = testbed.twilioSmsSent.filter((m) => m.to === telAna).at(-1)?.code ?? '';
  const rCodAna = await checkPhoneVerificationAction(undefined, fd({ code: codigoAna }));
  assert('2. Ana confirma o codigo e o telefone fica verificado', rCodAna.ok && rCodAna.step === 'done', JSON.stringify(rCodAna));

  // 3-4. Ana cria e publica um espaco.
  const espacoAna = await criarPublicado(anaId, 'ana', 30000);
  ok('3-4. Ana publicou um espaço', espacoAna.slug);

  // 5. Bruno encontra o espaco na busca.
  const busca = await listPublishedSpaces({ cityFilter: tag, limit: 60 });
  assert('5. Bruno encontra o espaço na busca', busca.some((s) => s.id === espacoAna.id));

  // 6. Bruno abre o anuncio: dono so com dado publico.
  const anuncio = await getPublicSpaceBySlug(espacoAna.slug);
  assert('6. anúncio aberto, com o proprietário', anuncio?.owner?.id === anaId);
  const donoJson = JSON.stringify(anuncio?.owner ?? {});
  assert('6. o anúncio não carrega nome completo, telefone ou e-mail do proprietário',
    !donoJson.includes('Proprietaria Lima') && !donoJson.includes(telAna) && !donoJson.includes('@exemplo'), donoJson);
  assert('6. o anúncio não carrega rua/número (endereço exato)', !JSON.stringify(anuncio).includes('Rua das Palmeiras'));

  // 7-8. Perfil do proprietario e sinais reais.
  const perfilAna = await getPublicProfile(anaId);
  expect('7. perfil público mostra o nome público (primeiro nome)', perfilAna?.publicName, 'Ana');
  const sinaisAna = buildTrustSignals({
    createdAt: perfilAna!.createdAt, emailVerified: perfilAna!.emailVerified, phoneVerified: perfilAna!.phoneVerified,
    identityVerified: perfilAna!.identityVerified, completedBookings: perfilAna!.completedBookingsCount,
    rating: (await getReputation(anaId)).asOwner,
  });
  expect('8. sinais reais: e-mail e telefone verificados, sem nota inventada',
    sinaisAna.map((s) => s.key).join(','), 'email,phone,member_since');

  // 9. Bruno solicita.
  entrarComo(brunoId, 'user', 'Bruno Locatario Costa');
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const destino = await comRedirect(() =>
    requestBookingAction(undefined, fd({ spaceId: espacoAna.id, startDate: amanha, renterMessage: 'Para guardar a moto.' })),
  );
  const [reservaFluxo] = await sql<{ id: string; status: string }[]>`
    SELECT id, status::text FROM bookings WHERE space_id=${espacoAna.id} AND renter_id=${brunoId} ORDER BY requested_at DESC LIMIT 1`;
  expect('9. solicitação criada ("requested")', reservaFluxo?.status, 'requested');
  expect('9. depois de solicitar, vai para a página da reserva (confirmação)', destino, `/reservas/${reservaFluxo!.id}?enviada=1`);
  const reservaId = reservaFluxo!.id;

  // 10. Ana recebe a notificacao, com o nome PUBLICO de Bruno.
  const [notifSolic] = await sql<{ body: string; link_path: string }[]>`
    SELECT body, link_path FROM notifications WHERE user_id=${anaId} AND type='booking_requested' ORDER BY created_at DESC LIMIT 1`;
  assert('10. Ana é notificada da solicitação', Boolean(notifSolic));
  assert('10. a notificação usa o nome público, não o completo', notifSolic?.body.startsWith('Bruno quer alugar') && !notifSolic.body.includes('Costa'), notifSolic?.body);

  // 11-12. Ana aceita; Bruno e notificado com link para a reserva.
  entrarComo(anaId, 'owner', 'Ana Proprietaria Lima');
  const rAceite = await respondToBookingRequestAction(undefined, fd({ bookingId: reservaId, decision: 'accept' }));
  assert('11. Ana aceita a solicitação', rAceite.ok, JSON.stringify(rAceite));
  const [notifAceite] = await sql<{ link_path: string }[]>`
    SELECT link_path FROM notifications WHERE user_id=${brunoId} AND type='booking_approved' ORDER BY created_at DESC LIMIT 1`;
  expect('12. Bruno é notificado e o toque leva à página da reserva', notifAceite?.link_path, `/reservas/${reservaId}`);

  // Endereco exato ainda NAO (aceita, mas sem pagamento confirmado).
  expect('12. reserva aceita, ainda sem pagamento: endereço exato NÃO liberado',
    await getBookingAddressForRenter(reservaId, brunoId), null);

  // 13-14. Pagamento. O processamento real (Asaas) e testado contra o dublê em
  // verify-payments.ts; aqui a transicao e feita no banco para seguir o fluxo.
  await sql`UPDATE bookings SET status='active', activated_at=now() WHERE id=${reservaId}`;
  ok('13-14. reserva ativa', 'pagamento: coberto em verify-payments (dublê do Asaas); com Asaas real = BLOQUEADO POR SERVIÇO EXTERNO');
  const endereco = await getBookingAddressForRenter(reservaId, brunoId);
  expect('14. com a reserva confirmada, o locatário vê o endereço exato', endereco?.street, 'Rua das Palmeiras');
  expect('14. o proprietário não passa pela regra do locatário (consulta é só do locatário)',
    await getBookingAddressForRenter(reservaId, anaId), null);

  // 15-16. Ana encerra; Bruno recebe o aviso com a avaliacao disponivel.
  const rFim = await endBookingAction(undefined, fd({ bookingId: reservaId }));
  assert('15. reserva concluída (encerrada)', rFim.ok, JSON.stringify(rFim));
  const [avisoBruno] = await sql<{ body: string; link_path: string }[]>`
    SELECT body, link_path FROM notifications WHERE user_id=${brunoId} AND dedupe_key=${`booking_ended:${reservaId}`}`;
  assert('16. Bruno é avisado do fim e de que já pode avaliar', avisoBruno?.body.includes('avaliação já está disponível') ?? false, avisoBruno?.body);
  expect('16. quem encerrou (Ana) recebe "Avaliação disponível"',
    await contar(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id=${anaId} AND type='review_available'`), 1);

  // 17-18. Bruno avalia; Ana e notificada.
  entrarComo(brunoId, 'user', 'Bruno Locatario Costa');
  const rAval = await createReviewAction(undefined, fd({ bookingId: reservaId, kind: 'renter_to_space', rating: '5', comment: 'Garagem limpa e fácil de acessar.' }));
  assert('17. Bruno avalia a locação', rAval.ok, JSON.stringify(rAval));
  const [notifAval] = await sql<{ link_path: string }[]>`
    SELECT link_path FROM notifications WHERE user_id=${anaId} AND type='review_received' ORDER BY created_at DESC LIMIT 1`;
  expect('18. Ana é notificada e o toque leva às avaliações do perfil dela',
    notifAval?.link_path, `/perfil/${anaId}?papel=proprietario#avaliacoes`);

  // 19-20. Aparece no anuncio e no perfil; media atualizada.
  const noAnuncio = await listReviewsForSpace(espacoAna.id);
  assert('19. avaliação aparece no anúncio', noAnuncio.rows.some((r) => r.comment === 'Garagem limpa e fácil de acessar.'));
  const noPerfil = await listReviewsReceived(anaId, 'renter_to_space');
  expect('19. avaliação aparece no perfil da Ana (como proprietária)', noPerfil.rows.length, 1);
  const [espAtual] = await sql<{ rating_avg: string; rating_count: number }[]>`SELECT rating_avg::text, rating_count FROM spaces WHERE id=${espacoAna.id}`;
  expect('20. média do anúncio atualizada', [formatRating(espAtual!.rating_avg), espAtual!.rating_count], ['5,0', 1]);
  const repAna = await getReputation(anaId);
  expect('20. reputação da Ana atualizada', [repAna.asOwner.average, repAna.asOwner.count], ['5.0', 1]);

  // 21-22. Historico consistente.
  const [contAna] = await sql<{ completed_bookings_count: number }[]>`SELECT completed_bookings_count FROM profiles WHERE id=${anaId}`;
  expect('21. locação concluída conta no histórico da Ana', contAna!.completed_bookings_count, 1);
  const vistaAna = await getBookingForParticipant(reservaId, anaId);
  expect('21. Ana vê a reserva encerrada no histórico', [vistaAna?.status, vistaAna?.viewerRole], ['ended', 'owner']);
  assert('22. contagem da reputação = contagem do anúncio = linhas listadas',
    repAna.asOwner.count === espAtual!.rating_count && noPerfil.rows.length === repAna.asOwner.count);

  // =========================================================================
  secao('2. Avaliações: regras no backend e tentativas de manipulação (§10, §13, §53)');
  // =========================================================================

  const espacoDono = await criarPublicado(donoId, 'dono');
  const resEncerrada = await criarReserva(espacoDono.id, donoId, locId, 'ended');
  const resAtiva = await criarReserva((await criarPublicado(donoId, 'dono-ativa')).id, donoId, loc2Id, 'active');

  entrarComo(terceiroId, 'user', 'Tiago Terceiro Nunes');
  const rTerc = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'renter_to_space', rating: '1' }));
  assert('quem NÃO participou da reserva não avalia', !rTerc.ok, rTerc.message);

  entrarComo(loc2Id, 'user', 'Livia Locataria Melo');
  const rAntes = await createReviewAction(undefined, fd({ bookingId: resAtiva, kind: 'renter_to_space', rating: '5' }));
  assert('não dá para avaliar antes da locação terminar', !rAntes.ok, rAntes.message);

  entrarComo(locId, 'user', 'Lucas Locatario Alves');
  const rInexist = await createReviewAction(undefined, fd({ bookingId: uuid(), kind: 'renter_to_space', rating: '5' }));
  assert('reserva inexistente: recusada', !rInexist.ok, rInexist.message);

  for (const nota of ['0', '6', '4.5', 'abc', '']) {
    const r = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'renter_to_space', rating: nota }));
    assert(`nota manipulada "${nota}" é recusada`, !r.ok, r.message);
  }

  const rTroca = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'owner_to_renter', rating: '1' }));
  assert('locatário não consegue se passar pelo proprietário (avaliar a si mesmo)', !rTroca.ok, rTroca.message);

  const rContato = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'renter_to_space', rating: '4', comment: 'Me chama: joao.silva@gmail.com' }));
  assert('comentário com e-mail/telefone é recusado (avaliação é pública)', !rContato.ok, rContato.message);

  // Campos extras forjados no formulario sao ignorados: autor e avaliado saem da sessao e da reserva.
  const forjado = fd({ bookingId: resEncerrada, kind: 'renter_to_space', rating: '4', comment: 'Bom espaço.' });
  forjado.set('authorId', terceiroId);
  forjado.set('reviewedUserId', terceiroId);
  const rOk = await createReviewAction(undefined, forjado);
  assert('avaliação legítima do locatário é aceita', rOk.ok, JSON.stringify(rOk));
  const [gravada] = await sql<{ id: string; author_id: string; reviewed_user_id: string }[]>`
    SELECT id, author_id, reviewed_user_id FROM reviews WHERE booking_id=${resEncerrada} AND kind='renter_to_space'`;
  expect('autor e avaliado vêm da sessão e da reserva, nunca do formulário',
    [gravada?.author_id, gravada?.reviewed_user_id], [locId, donoId]);

  const rDup = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'renter_to_space', rating: '5' }));
  assert('avaliação duplicada é recusada', !rDup.ok, rDup.message);

  entrarComo(donoId, 'owner', 'Daniel Dono Rocha');
  const rDono = await createReviewAction(undefined, fd({ bookingId: resEncerrada, kind: 'owner_to_renter', rating: '5', comment: 'Locatário cuidadoso.' }));
  assert('avaliação bilateral: o proprietário avalia o locatário na mesma reserva', rDono.ok, JSON.stringify(rDono));

  // Travas do banco (o que a aplicacao nao alcanca continua travado).
  await recusa('banco: avaliação com "avaliado" diferente da outra parte é recusada', () => sql`
    INSERT INTO reviews (booking_id, kind, author_id, space_id, reviewed_user_id, rating)
    VALUES (${resEncerrada}, 'renter_to_space', ${locId}, ${espacoDono.id}, ${terceiroId}, 5)`, 'outra parte da reserva');
  await recusa('banco: nota de avaliação publicada não pode ser alterada', () => sql`
    UPDATE reviews SET rating = 1 WHERE id=${gravada!.id}`, 'nao pode ser alterada');
  await recusa('banco: avaliação não pode ser apagada (inflar média apagando)', () => sql`
    DELETE FROM reviews WHERE id=${gravada!.id}`, 'nao pode ser apagada');
  await sql`UPDATE reviews SET hidden_at = now(), hidden_reason = 'teste de moderacao' WHERE id=${gravada!.id}`;
  const [esc] = await sql<{ rating_count: number }[]>`SELECT rating_count FROM spaces WHERE id=${espacoDono.id}`;
  expect('moderação pode OCULTAR (e a média do anúncio deixa de contar a oculta)', esc!.rating_count, 0);
  await sql`UPDATE reviews SET hidden_at = NULL, hidden_reason = NULL WHERE id=${gravada!.id}`;

  // =========================================================================
  secao('3. Reputação: média, contagem, distribuição e arredondamento (§12)');
  // =========================================================================

  const espRep = await criarPublicado(donoId, 'rep');
  const notas = [5, 5, 4];
  const locatariosRep = [loc2Id, loc3Id, terceiroId];
  for (let i = 0; i < notas.length; i++) {
    const b = await criarReserva(espRep.id, donoId, locatariosRep[i]!, 'ended');
    await sql`INSERT INTO reviews (booking_id, kind, author_id, space_id, rating) VALUES (${b}, 'renter_to_space', ${locatariosRep[i]!}, ${espRep.id}, ${notas[i]!})`;
  }
  const [espR] = await sql<{ rating_avg: string; rating_count: number }[]>`SELECT rating_avg::text, rating_count FROM spaces WHERE id=${espRep.id}`;
  expect('14/3 = 4,6666… vira 4,7 (uma casa, metade para cima, arredondado uma vez no banco)', formatRating(espR!.rating_avg), '4,7');
  const repDono = await getReputation(donoId);
  // dono: 4 (Lucas) + 5,5,4 = 18/4 = 4,5 como proprietario
  expect('reputação do dono como proprietário (4 avaliações)', [repDono.asOwner.count, repDono.asOwner.average], [4, '4.5']);
  expect('distribuição das notas (1★…5★)', repDono.asOwner.distribution, [0, 0, 0, 2, 2]);
  const repLoc = await getReputation(locId);
  expect('reputação do locatário (avaliado pelo dono)', [repLoc.asRenter.count, repLoc.asRenter.average], [1, '5.0']);
  const lote = await getRatingSummaries([donoId, locId, terceiroId], 'renter_to_space');
  expect('resumo em lote (uma consulta) bate com o individual', lote.get(donoId)?.count, 4);
  expect('formatRating: 4.65 → 4,7 / 4.35 → 4,4 / 4.649 → 4,6 / 5.00 → 5,0',
    [formatRating('4.65'), formatRating('4.35'), formatRating('4.649'), formatRating('5.00')], ['4,7', '4,4', '4,6', '5,0']);
  expect('sem avaliação não existe nota ("0,0 ★")', [formatRating(null), (await getReputation(avatarId)).overall.average], [null, null]);

  // =========================================================================
  secao('4. Perfil público e privacidade (§2, §35)');
  // =========================================================================

  const cpfTeste = String(Date.now()).slice(-11).padStart(11, '7');
  await sql`UPDATE profiles SET phone = '+5527999990123', cpf_cnpj = ${cpfTeste} WHERE id=${donoId}`;
  const pub = await getPublicProfile(donoId);
  expect('campos do perfil público (nada além disto sai da consulta)', Object.keys(pub ?? {}).sort(), [
    'activeSpacesCount', 'avatarPath', 'bio', 'completedBookingsCount', 'createdAt', 'emailVerified',
    'id', 'identityVerified', 'isPremium', 'phoneVerified', 'publicName',
  ]);
  const pubJson = JSON.stringify(pub);
  assert('perfil público sem telefone, CPF, e-mail ou nome completo',
    !pubJson.includes('999990123') && !pubJson.includes(cpfTeste) && !pubJson.includes('@') && !pubJson.includes('Rocha'), pubJson);
  expect('espaços ativos contados do banco', pub?.activeSpacesCount, 3);
  expect('sem plano ativo, nenhum indicador Premium', pub?.isPremium, false);
  await sql`INSERT INTO premium_memberships (user_id, status, source) VALUES (${donoId}, 'active', 'admin_grant')`;
  expect('Premium só aparece quando o plano está ativo no banco', (await getPublicProfile(donoId))?.isPremium, true);
  await sql`UPDATE premium_memberships SET status='cancelled', cancelled_at=now() WHERE user_id=${donoId}`;
  expect('Premium encerrado some do perfil', (await getPublicProfile(donoId))?.isPremium, false);
  const sinaisDono = buildTrustSignals({ createdAt: new Date(), emailVerified: false, phoneVerified: false, completedBookings: 4 });
  assert('Premium nunca entra nos sinais de confiança', !sinaisDono.some((x) => /premium/i.test(x.label)));
  expect('conta suspensa não tem perfil público', await getPublicProfile(suspensoId), null);
  expect('id inválido não quebra (404 limpo)', await getPublicProfile('nao-e-uuid'), null);
  const listaPublica = JSON.stringify(await listReviewsForSpace(espacoDono.id));
  assert('lista de avaliações usa o nome público de quem avaliou', listaPublica.includes('"publicName":"Lucas"') && !listaPublica.includes('Alves'));

  // =========================================================================
  secao('5. Edição do próprio perfil e foto sem GPS (§34)');
  // =========================================================================

  entrarComo(avatarId, 'user', 'Alice Avatar Reis');
  const rPerfil = await updateProfileAction(undefined, fd({ displayName: 'Alice R.', bio: 'Guardo bicicletas e caixas de mudança.' }));
  assert('salva nome de exibição e apresentação', rPerfil.ok, JSON.stringify(rPerfil));
  expect('nome público passa a ser o de exibição', (await getPublicProfile(avatarId))?.publicName, 'Alice R.');
  const rNomeReservado = await updateProfileAction(undefined, fd({ displayName: 'Suporte MyPlace', bio: '' }));
  assert('nome que imita a plataforma é recusado', !rNomeReservado.ok, rNomeReservado.fieldErrors?.displayName);
  const rBioContato = await updateProfileAction(undefined, fd({ displayName: 'Alice', bio: 'Me chama no (27) 99876-5432 ou alice@gmail.com' }));
  assert('bio com telefone/e-mail é recusada', !rBioContato.ok, rBioContato.fieldErrors?.bio);
  const rBioLonga = await updateProfileAction(undefined, fd({ displayName: 'Alice', bio: 'x'.repeat(501) }));
  assert('bio acima de 500 caracteres é recusada', !rBioLonga.ok);
  const forjaPerfil = fd({ displayName: 'Alice R.', bio: 'Guardo bicicletas.' });
  forjaPerfil.set('phoneVerifiedAt', new Date().toISOString());
  forjaPerfil.set('completedBookingsCount', '99');
  forjaPerfil.set('role', 'admin');
  await updateProfileAction(undefined, forjaPerfil);
  const [alice] = await sql<{ phone_verified_at: Date | null; completed_bookings_count: number; role: string }[]>`
    SELECT phone_verified_at, completed_bookings_count, role::text FROM profiles WHERE id=${avatarId}`;
  expect('campos forjados (selo, contador, papel) são ignorados', [alice!.phone_verified_at, alice!.completed_bookings_count, alice!.role], [null, 0, 'user']);

  const foto1 = new File([new Uint8Array(await selfieComGps())], 'selfie.jpg', { type: 'image/jpeg' });
  const up1 = await uploadAvatarAction(undefined, fd({}), ).catch((e) => ({ ok: false, message: String(e) }));
  assert('envio sem arquivo é recusado com mensagem', !up1.ok);
  const fdFoto = new FormData();
  fdFoto.set('file', foto1);
  const up2 = await uploadAvatarAction(undefined, fdFoto);
  assert('foto de perfil enviada', up2.ok, JSON.stringify(up2));
  const [comFoto] = await sql<{ avatar_path: string | null }[]>`SELECT avatar_path FROM profiles WHERE id=${avatarId}`;
  const caminho1 = comFoto!.avatar_path ?? '';
  assert('foto guardada na pasta da própria pessoa (<id>/avatar/…)', caminho1.startsWith(`${avatarId}/avatar/`), caminho1);
  const guardada = testbed.objects.get(caminho1);
  const bytes = guardada ? Buffer.from(guardada.bytes) : Buffer.alloc(0);
  const texto = bytes.toString('latin1');
  assert('a foto guardada NÃO tem GPS nem modelo do aparelho', bytes.length > 0 && !texto.includes('GPS') && !texto.includes('iPhone') && !texto.includes('Exif'));
  const meta = await sharp(bytes).metadata();
  expect('foto recortada em quadrado de 512 px', [meta.width, meta.height], [512, 512]);
  const fdFoto2 = new FormData();
  fdFoto2.set('file', new File([new Uint8Array(await selfieComGps())], 'nova.jpg', { type: 'image/jpeg' }));
  await uploadAvatarAction(undefined, fdFoto2);
  assert('trocar a foto apaga a anterior do armazenamento', !testbed.objects.has(caminho1));
  const rRem = await removeAvatarAction();
  const [semFoto] = await sql<{ avatar_path: string | null }[]>`SELECT avatar_path FROM profiles WHERE id=${avatarId}`;
  assert('remover a foto volta ao estado "sem foto"', rRem.ok && semFoto!.avatar_path === null);
  await recusa('banco: avatar não pode apontar para a pasta de outra pessoa', () => sql`
    UPDATE profiles SET avatar_path = ${`${donoId}/avatar/x.jpg`} WHERE id=${avatarId}`, 'profiles_avatar_path_own_folder');

  // =========================================================================
  secao('6. Verificações: e-mail, telefone por SMS (dublê do Twilio) e identidade (§5-7)');
  // =========================================================================

  // Sem credencial: nada de fingir.
  const salvo = { sid: process.env.TWILIO_ACCOUNT_SID, tok: process.env.TWILIO_AUTH_TOKEN, svc: process.env.TWILIO_VERIFY_SERVICE_SID };
  delete process.env.TWILIO_ACCOUNT_SID;
  entrarComo(telAId, 'user', 'Tereza Telefone Um');
  const semServico = await startPhoneVerificationAction(undefined, fd({ phone: celular() }));
  assert('sem serviço de SMS configurado: recusa com aviso claro', !semServico.ok && semServico.unavailable === true, semServico.message);
  expect('...e nada foi gravado nem enviado',
    await contar(sql`SELECT count(*)::int AS n FROM phone_verifications WHERE user_id=${telAId}`), 0);
  process.env.TWILIO_ACCOUNT_SID = salvo.sid;
  process.env.TWILIO_AUTH_TOKEN = salvo.tok;
  process.env.TWILIO_VERIFY_SERVICE_SID = salvo.svc;

  const invalido = await startPhoneVerificationAction(undefined, fd({ phone: '12345' }));
  assert('número inválido é recusado antes de chamar o provedor', !invalido.ok, invalido.message);

  const fixo = '+5527999990000';
  testbed.twilioLandlines.add(fixo);
  const rFixo = await startPhoneVerificationAction(undefined, fd({ phone: '(27) 99999-0000' }));
  assert('número fixo (erro 60205 do provedor) vira mensagem clara', !rFixo.ok && (rFixo.message ?? '').includes('fixo'), rFixo.message);

  const telTereza = celular();
  const rIni = await startPhoneVerificationAction(undefined, fd({ phone: telTereza.replace('+55', '') }));
  assert('pede o código (verificação pendente)', rIni.ok && rIni.step === 'code', JSON.stringify(rIni));
  const [pend] = await sql<{ phone: string; status: string }[]>`
    SELECT phone, status::text FROM phone_verifications WHERE user_id=${telAId} ORDER BY created_at DESC LIMIT 1`;
  expect('número guardado no servidor em E.164, status pendente', [pend?.phone, pend?.status], [telTereza, 'pending']);
  const ov = await getVerificationOverview(telAId);
  assert('estado "verificação pendente" visível para a pessoa', ov.phone.pending !== null && ov.phone.verifiedAt === null);

  const errado = await checkPhoneVerificationAction(undefined, fd({ code: '000000' }));
  assert('código errado: recusa e informa tentativas restantes', !errado.ok && (errado.message ?? '').includes('4 tentativas'), errado.message);

  const codigoTereza = testbed.twilioSmsSent.filter((m) => m.to === telTereza).at(-1)?.code ?? '';
  const conferir = fd({ code: codigoTereza });
  conferir.set('phone', '+5511999990000'); // número forjado na etapa 2 — deve ser ignorado
  const certo = await checkPhoneVerificationAction(undefined, conferir);
  assert('código certo: telefone verificado', certo.ok && certo.step === 'done', JSON.stringify(certo));
  const [tereza] = await sql<{ phone: string; phone_verified_at: Date | null }[]>`SELECT phone, phone_verified_at FROM profiles WHERE id=${telAId}`;
  expect('o número verificado é o do servidor, não o forjado no formulário', tereza!.phone, telTereza);
  assert('selo gravado só depois do "approved" do provedor', tereza!.phone_verified_at !== null);

  entrarComo(telBId, 'user', 'Tomas Telefone Dois');
  const rOutraConta = await startPhoneVerificationAction(undefined, fd({ phone: telTereza }));
  assert('número já verificado em outra conta: recusado', !rOutraConta.ok, rOutraConta.message);

  const telTomas = celular();
  await startPhoneVerificationAction(undefined, fd({ phone: telTomas }));
  await cancelPhoneVerificationAction();
  const [canc] = await sql<{ status: string }[]>`SELECT status::text FROM phone_verifications WHERE user_id=${telBId} ORDER BY created_at DESC LIMIT 1`;
  expect('"usar outro número" cancela o código em andamento', canc?.status, 'cancelled');

  entrarComo(telCId, 'user', 'Tania Telefone Tres');
  await startPhoneVerificationAction(undefined, fd({ phone: celular() }));
  let ultimo: { ok: boolean; message?: string } = { ok: true };
  for (let i = 0; i < 5; i++) ultimo = await checkPhoneVerificationAction(undefined, fd({ code: '111111' }));
  assert('5 códigos errados: tentativas esgotadas (verificação recusada)', !ultimo.ok && (ultimo.message ?? '').includes('esgotadas'), ultimo.message);
  const [falhou] = await sql<{ status: string }[]>`SELECT status::text FROM phone_verifications WHERE user_id=${telCId} ORDER BY created_at DESC LIMIT 1`;
  expect('estado "verificação recusada" gravado', falhou?.status, 'failed');

  await startPhoneVerificationAction(undefined, fd({ phone: celular() }));
  await sql`UPDATE phone_verifications SET expires_at = now() - interval '1 minute' WHERE user_id=${telCId} AND status='pending'`;
  const expirado = await checkPhoneVerificationAction(undefined, fd({ code: '123456' }));
  assert('código expirado é recusado', !expirado.ok && (expirado.message ?? '').includes('expirou'), expirado.message);

  await sql`UPDATE profiles SET phone = ${celular()} WHERE id=${telAId}`;
  const [trocou] = await sql<{ phone_verified_at: Date | null }[]>`SELECT phone_verified_at FROM profiles WHERE id=${telAId}`;
  expect('trocar o número por fora do fluxo derruba a verificação (trigger)', trocou!.phone_verified_at, null);

  await recusa('banco: pela API do navegador (JWT) ninguém se marca como verificado', () => sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claim.sub', ${telBId}, true)`;
    await tx`UPDATE profiles SET email_verified_at = now() WHERE id=${telBId}`;
  }), 'nao podem ser alterados por esta via');

  // Identidade: so estrutura.
  const comIdentidade = buildTrustSignals({
    createdAt: new Date(), emailVerified: true, phoneVerified: true, identityVerified: true, completedBookings: 3,
  });
  assert('"Identidade verificada" NÃO aparece sem provedor real, mesmo com o banco dizendo verified',
    !comIdentidade.some((s) => s.key === 'identity'));
  await recusa('banco: status "verified" sem documento conferido é recusado', () => sql`
    UPDATE profiles SET identity_verification_status = 'verified' WHERE id=${telBId}`, 'profiles_identity_status_matches');

  // =========================================================================
  secao('7. Denúncias: avaliação, usuário, anúncio e reserva (§14, §24, §25)');
  // =========================================================================

  const [avalDoLucas] = await sql<{ id: string }[]>`SELECT id FROM reviews WHERE booking_id=${resEncerrada} AND kind='renter_to_space'`;
  entrarComo(donoId, 'owner', 'Daniel Dono Rocha');
  const rDenAval = await createReportAction(undefined, fd({ targetType: 'review', targetId: avalDoLucas!.id, reason: 'informacao_falsa', details: 'Isso não aconteceu.' }));
  assert('denunciar avaliação (motivo "informação falsa")', rDenAval.ok, JSON.stringify(rDenAval));
  const [denAval] = await sql<{ evidence_snapshot: { comment?: string; rating?: number } | null; review_id: string }[]>`
    SELECT evidence_snapshot, review_id FROM reports WHERE reporter_id=${donoId} AND target_type='review'`;
  expect('evidência da avaliação copiada no momento da denúncia', denAval?.evidence_snapshot?.comment, 'Bom espaço.');
  const [aindaNoAr] = await sql<{ hidden_at: Date | null }[]>`SELECT hidden_at FROM reviews WHERE id=${avalDoLucas!.id}`;
  expect('a denúncia NÃO apaga nem oculta a avaliação sozinha', aindaNoAr!.hidden_at, null);

  entrarComo(locId, 'user', 'Lucas Locatario Alves');
  const rPropria = await createReportAction(undefined, fd({ targetType: 'review', targetId: avalDoLucas!.id, reason: 'spam' }));
  assert('ninguém denuncia a própria avaliação', !rPropria.ok, rPropria.message);
  const rMotivoErrado = await createReportAction(undefined, fd({ targetType: 'review', targetId: avalDoLucas!.id, reason: 'anuncio_falso' }));
  assert('motivo que não se aplica ao alvo é recusado', !rMotivoErrado.ok);

  entrarComo(terceiroId, 'user', 'Tiago Terceiro Nunes');
  const rUser = await createReportAction(undefined, fd({ targetType: 'user', targetId: donoId, reason: 'comportamento_suspeito', details: 'Pediu dados pessoais.' }));
  assert('denunciar usuário (comportamento suspeito)', rUser.ok, JSON.stringify(rUser));
  const rEsp = await createReportAction(undefined, fd({ targetType: 'space', targetId: espacoDono.id, reason: 'fotos_enganosas' }));
  assert('denunciar anúncio (fotos enganosas)', rEsp.ok, JSON.stringify(rEsp));
  const rSelf = await createReportAction(undefined, fd({ targetType: 'user', targetId: terceiroId, reason: 'outro', details: 'Denunciando a mim mesmo.' }));
  assert('ninguém denuncia a si mesmo', !rSelf.ok);
  const rReservaAlheia = await createReportAction(undefined, fd({ targetType: 'user', targetId: donoId, reason: 'fraude', bookingId: resEncerrada }));
  assert('denúncia pendurada na reserva de OUTRAS pessoas é recusada', !rReservaAlheia.ok, rReservaAlheia.message);

  entrarComo(donoId, 'owner', 'Daniel Dono Rocha');
  const rDano = await createReportAction(undefined, fd({ targetType: 'user', targetId: locId, reason: 'dano_ao_espaco', details: 'Portão amassado.', bookingId: resEncerrada }));
  assert('proprietário relata dano ligado à reserva dele', rDano.ok, JSON.stringify(rDano));
  const [danoLigado] = await sql<{ booking_id: string | null }[]>`
    SELECT booking_id FROM reports WHERE reporter_id=${donoId} AND reason='dano_ao_espaco'`;
  expect('a denúncia de dano fica ligada à reserva (base da decisão da caução)', danoLigado?.booking_id, resEncerrada);

  // Histórico longo não mascara denúncia confirmada (regra da Fase 11, antes
  // exposta como "Conta em revisão"): a partir do limite de revisão, a visita
  // ganha destaque no anúncio — sem que o motivo apareça em lugar nenhum.
  const antesDaRevisao = await getPublicSpaceBySlug(espacoDono.slug);
  expect('abaixo do limite de revisão, nada muda no anúncio', antesDaRevisao?.owner?.underReview, false);
  const procedentes = await sql<{ id: string }[]>`
    INSERT INTO reports (target_type, target_user_id, space_id, reporter_id, reason, status, upheld, resolved_at) VALUES
      ('user', ${donoId}, NULL, ${locId}, 'assedio', 'resolved', true, now()),
      ('user', ${donoId}, NULL, ${terceiroId}, 'ameaca', 'resolved', true, now()),
      ('space', NULL, ${espacoDono.id}, ${locId}, 'anuncio_falso', 'resolved', true, now())
    RETURNING id`;
  const emRevisao = await getPublicSpaceBySlug(espacoDono.slug);
  expect('3 denúncias procedentes: o anúncio sabe que o dono está em revisão (só no servidor)', emRevisao?.owner?.underReview, true);
  const repDonoEmRevisao = await getReputation(donoId);
  assert('...e a visita ganha destaque mesmo com histórico e avaliações',
    shouldEmphasizeVisit({
      createdAt: emRevisao!.owner!.createdAt, emailVerified: emRevisao!.owner!.emailVerified,
      phoneVerified: emRevisao!.owner!.phoneVerified, completedBookings: emRevisao!.owner!.completedBookingsCount,
      rating: repDonoEmRevisao.asOwner, underReview: emRevisao!.owner!.underReview,
    }) && (emRevisao!.owner!.completedBookingsCount > 0 || repDonoEmRevisao.asOwner.count > 0));
  const perfilEmRevisao = JSON.stringify(await getPublicProfile(donoId));
  assert('o perfil público não traz revisão nem contagem de denúncias',
    !/underReview|upheld|denúnc|revis/i.test(perfilEmRevisao), perfilEmRevisao);
  // Desfaz (a trigger recalcula ao mudar `upheld`; apagar sozinho não recalcularia).
  await sql`UPDATE reports SET upheld = false WHERE id IN ${sql(procedentes.map((r) => r.id))}`;
  await sql`DELETE FROM reports WHERE id IN ${sql(procedentes.map((r) => r.id))}`;
  expect('decisão revertida: o destaque sai junto', (await getPublicSpaceBySlug(espacoDono.slug))?.owner?.underReview, false);

  // =========================================================================
  secao('8. Notificações: preferências, idempotência, lidas e não lidas (§17-21, §50)');
  // =========================================================================

  entrarComo(prefId, 'user', 'Paula Preferencia Luz');
  const prefs = fd({ 'avaliacoes:in_app': 'on' }); // mensagens desligada; avaliações só na central
  prefs.set('reservas:in_app', 'off'); // tentativa de desligar essencial: ignorada
  const rPref = await updateNotificationPreferencesAction(undefined, prefs);
  assert('preferências salvas', rPref.ok);
  const lidas = await getNotificationPreferences(prefId);
  const porCat = Object.fromEntries(lidas.map((p) => [p.category, [p.inApp, p.push]]));
  expect('essenciais continuam ligadas; mensagens desligada; avaliações sem push',
    [porCat.reservas, porCat.pagamentos, porCat.conta, porCat.mensagens, porCat.avaliacoes], [[true, true], [true, true], [true, true], [false, false], [true, false]]);
  await recusa('banco: categoria essencial não pode ser desligada nem por INSERT direto', () => sql`
    INSERT INTO notification_preferences (user_id, category, in_app, push) VALUES (${prefId}, 'pagamentos', false, false)
    ON CONFLICT (user_id, category) DO UPDATE SET in_app = false, push = false`, 'notification_preferences_essential_locked');

  const jobMsg = await insertNotification(db, { userId: prefId, type: 'new_message', title: 'Nova mensagem', linkPath: '/mensagens' });
  expect('categoria desligada: a notificação não é gravada nem vai por push',
    [jobMsg, await contar(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id=${prefId} AND type='new_message'`)], [null, 0]);
  const jobAval = await insertNotification(db, { userId: prefId, type: 'review_received', title: 'Avaliação', linkPath: '/perfil' });
  expect('push desligado: grava na central, sem push',
    [jobAval, await contar(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id=${prefId} AND type='review_received'`)], [null, 1]);
  const jobEssencial = await insertNotification(db, { userId: prefId, type: 'booking_approved', title: 'Aceita', linkPath: '/reservas/x' });
  assert('essencial sempre entrega (central + push)', jobEssencial !== null);

  const chave = `teste:${tag}`;
  await insertNotification(db, { userId: prefId, type: 'account_notice', title: 'Aviso', linkPath: '/x', dedupeKey: chave });
  const segunda = await insertNotification(db, { userId: prefId, type: 'account_notice', title: 'Aviso', linkPath: '/x', dedupeKey: chave });
  expect('mesmo evento duas vezes: uma notificação só, sem segundo push',
    [segunda, await contar(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id=${prefId} AND dedupe_key=${chave}`)], [null, 1]);

  const espPromo = await criarPublicado(donoId, 'promo');
  await sql`INSERT INTO promotions (space_id, owner_id, type, status, source, started_at, expires_at)
    VALUES (${espPromo.id}, ${donoId}, 'destaque', 'active', 'purchase', now() - interval '6 days', now() + interval '12 hours')`;
  await runPromotionExpiringReminders();
  await runPromotionExpiringReminders();
  expect('Destaque terminando: um aviso só, mesmo com o job rodando duas vezes',
    await contar(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id=${donoId} AND type='promotion_expiring'`), 1);

  // Lidas / nao lidas / contador / isolamento.
  const naoLidasAntes = await countUnreadNotifications(prefId);
  const [umaDaPaula] = await sql<{ id: string }[]>`SELECT id FROM notifications WHERE user_id=${prefId} AND read_at IS NULL LIMIT 1`;
  entrarComo(outroPrefId, 'user', 'Pedro Outro Mota');
  await markNotificationReadAction(fd({ notificationId: umaDaPaula!.id }));
  expect('ninguém marca como lida a notificação de outra pessoa', await countUnreadNotifications(prefId), naoLidasAntes);
  const deOutro = await listUnreadNotifications(outroPrefId);
  assert('a central de uma pessoa não lista notificações de outra', !deOutro.some((n) => n.id === umaDaPaula!.id));
  entrarComo(prefId, 'user', 'Paula Preferencia Luz');
  await markNotificationReadAction(fd({ notificationId: umaDaPaula!.id }));
  expect('marcar uma como lida baixa o contador em 1', await countUnreadNotifications(prefId), naoLidasAntes - 1);
  const [paraAbrir] = await sql<{ id: string; link_path: string }[]>`
    SELECT id, link_path FROM notifications WHERE user_id=${prefId} AND read_at IS NULL AND link_path IS NOT NULL LIMIT 1`;
  const abriu = await comRedirect(() => openNotificationAction(fd({ notificationId: paraAbrir!.id })));
  expect('abrir a notificação leva ao destino dela', abriu, paraAbrir!.link_path);
  const [aberta] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id=${paraAbrir!.id}`;
  assert('...e a marca como lida', aberta!.read_at !== null);
  await markAllNotificationsReadAction();
  expect('"marcar todas como lidas" zera o contador', await countUnreadNotifications(prefId), 0);
  await sql`INSERT INTO notifications (user_id, type, title, read_at)
    SELECT ${prefId}, 'account_notice', 'Antiga ' || g, now() FROM generate_series(1, 25) g`;
  const p1 = await listReadNotifications(prefId, 1);
  const pUlt = await listReadNotifications(prefId, 2);
  assert('lidas paginadas: 20 por página, com "próximas"', p1.rows.length === 20 && p1.hasMore, `${p1.rows.length} ${p1.hasMore}`);
  assert('última página sem "próximas"', !pUlt.hasMore && pUlt.rows.length > 0, `${pUlt.rows.length} ${pUlt.hasMore}`);

  // =========================================================================
  secao('9. Página da reserva: só as partes; endereço só com reserva confirmada (§48)');
  // =========================================================================

  expect('terceiro abrindo o id da reserva de outros recebe nada (sem revelar que existe)',
    await getBookingForParticipant(resEncerrada, terceiroId), null);
  expect('locatário vê como locatário', (await getBookingForParticipant(resEncerrada, locId))?.viewerRole, 'renter');
  expect('proprietário vê como proprietário', (await getBookingForParticipant(resEncerrada, donoId))?.viewerRole, 'owner');
  const detalhe = JSON.stringify(await getBookingForParticipant(resEncerrada, locId));
  assert('a página da reserva não traz telefone, CPF nem nome completo da outra parte',
    !detalhe.includes('999990123') && !detalhe.includes(cpfTeste) && !detalhe.includes('Rocha'));
  expect('reserva encerrada: endereço exato já não é exibido', await getBookingAddressForRenter(resEncerrada, locId), null);
  expect('locatário com reserva ativa vê o endereço', (await getBookingAddressForRenter(resAtiva, loc2Id))?.number, '1234');

  // =========================================================================
  secao('10. Bloqueio preserva a reserva em andamento (§26)');
  // =========================================================================

  const [convAtiva] = await sql<{ id: string }[]>`
    INSERT INTO conversations (space_id, renter_id, owner_id)
    SELECT space_id, renter_id, owner_id FROM bookings WHERE id=${resAtiva} RETURNING id`;
  entrarComo(loc2Id, 'user', 'Livia Locataria Melo');
  const rBloq = await blockUserAction(undefined, fd({ blockedId: donoId }));
  assert('locatária bloqueia o proprietário', rBloq.ok, JSON.stringify(rBloq));
  assert('bloqueio registrado (direcional, para o botão "Desbloquear")', await hasBlocked(loc2Id, donoId));
  const [aindaAtiva] = await sql<{ status: string }[]>`SELECT status::text FROM bookings WHERE id=${resAtiva}`;
  expect('a reserva em andamento continua ativa (pagamentos seguem)', aindaAtiva!.status, 'active');
  const [convFechada] = await sql<{ closed_at: Date | null }[]>`SELECT closed_at FROM conversations WHERE id=${convAtiva!.id}`;
  assert('a conversa é encerrada, mas o histórico continua lá', convFechada!.closed_at !== null);
  await recusa('banco: nova reserva entre quem se bloqueou é recusada', () =>
    criarReserva(espRep.id, donoId, loc2Id, 'requested'), 'bloqueio');

  // =========================================================================
  secao('11. RLS: o que o navegador (anon/authenticated) alcança (§53)');
  // =========================================================================

  async function comoNavegador<T>(papel: 'anon' | 'authenticated', sub: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>) {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${papel}`);
      if (sub) await tx`SELECT set_config('request.jwt.claim.sub', ${sub}, true)`;
      return fn(tx);
    });
  }
  await recusa('logado não lê telefone de ninguém (nem o próprio) pela API', () =>
    comoNavegador('authenticated', locId, (tx) => tx`SELECT phone FROM profiles WHERE id=${donoId}`), 'permission denied');
  await recusa('logado não lê CPF', () =>
    comoNavegador('authenticated', locId, (tx) => tx`SELECT cpf_cnpj FROM profiles`), 'permission denied');
  const viewPub = await comoNavegador('authenticated', locId, (tx) => tx`SELECT * FROM public_profiles WHERE id=${donoId}`);
  expect('view pública: só colunas públicas', Object.keys(viewPub[0] ?? {}).sort(), [
    'avatar_path', 'bio', 'completed_bookings_count', 'created_at', 'email_verified', 'id', 'identity_verified', 'phone_verified', 'public_name',
  ]);
  await recusa('visitante (anon) não lê perfis pela API', () =>
    comoNavegador('anon', null, (tx) => tx`SELECT id FROM public_profiles LIMIT 1`), 'permission denied');
  await recusa('logado não se marca como verificado pela API', () =>
    comoNavegador('authenticated', locId, (tx) => tx`UPDATE profiles SET phone_verified_at = now() WHERE id=${locId}`), 'permission denied');
  await recusa('logado não cria avaliação direto pela API', () =>
    comoNavegador('authenticated', locId, (tx) => tx`INSERT INTO reviews (booking_id, kind, author_id, space_id, rating) VALUES (${resEncerrada}, 'renter_to_space', ${locId}, ${espacoDono.id}, 5)`), 'permission denied');
  await recusa('quem denunciou não lê a evidência copiada (dado de moderação)', () =>
    comoNavegador('authenticated', donoId, (tx) => tx`SELECT evidence_snapshot FROM reports`), 'permission denied');
  const minhas = await comoNavegador('authenticated', donoId, (tx) => tx`SELECT id, status::text FROM reports`);
  assert('...mas acompanha o status das próprias denúncias', minhas.length >= 2, `${minhas.length} denúncias`);
  const alheias = await comoNavegador('authenticated', outroPrefId, (tx) => tx`SELECT id FROM notifications WHERE user_id=${prefId}`);
  expect('logado não lê notificações de outra pessoa', alheias.length, 0);
  await recusa('logado não lê verificações de telefone', () =>
    comoNavegador('authenticated', telAId, (tx) => tx`SELECT * FROM phone_verifications`), 'permission denied');
  await recusa('logado não lê preferências pela API', () =>
    comoNavegador('authenticated', prefId, (tx) => tx`SELECT * FROM notification_preferences`), 'permission denied');

  // =========================================================================
  secao('12. Taxa e tempo de resposta do proprietário (§16, Fase 22)');
  // =========================================================================

  const { getOwnerResponseStats } = await import('../src/lib/bookings/response-stats');
  const { responseTimeBucket, responseRatePercent, MIN_DECIDED_FOR_RATE } = await import('../src/lib/bookings/response-format');

  // Regras puras: faixas e arredondamento.
  expect('até 1 hora, limite incluso', responseTimeBucket(3600), 'hour');
  expect('1 h e 1 s já é "poucas horas"', responseTimeBucket(3601), 'few_hours');
  expect('6 horas ainda é "poucas horas"', responseTimeBucket(6 * 3600), 'few_hours');
  expect('24 horas é "até 1 dia"', responseTimeBucket(24 * 3600), 'day');
  expect('mais de 1 dia vira "alguns dias"', responseTimeBucket(24 * 3600 + 1), 'days');
  expect('199 de 200 é 99% — nunca "100%" com pedido sem resposta',
    responseRatePercent({ decided: 200, answered: 199, medianSeconds: 60 }), 99);
  expect('abaixo do mínimo não existe taxa (nada é mostrado)',
    responseRatePercent({ decided: MIN_DECIDED_FOR_RATE - 1, answered: MIN_DECIDED_FOR_RATE - 1, medianSeconds: 60 }), null);

  // Banco: proprietária nova, sem nenhum pedido.
  const espacoResp = await criarPublicado(respId, 'resp');
  const semPedidos = await getOwnerResponseStats(respId);
  expect('sem solicitações: nada a mostrar', [semPedidos.decided, responseRatePercent(semPedidos)], [0, null]);
  assert('...e nenhum sinal de resposta aparece no perfil',
    !buildTrustSignals({ createdAt: new Date(), emailVerified: false, phoneVerified: false, completedBookings: 0, responseStats: semPedidos })
      .some((x) => x.group === 'activity'));

  // Pedidos com horários controlados — um para cada regra do que conta.
  async function pedidoResp(renterId: string, status: string, pedidoHaHoras: number, respostaEmMin: number | null, canceladoPor?: string) {
    seq++;
    const a = computeBookingAmounts(30000, fees);
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
        monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents,
        total_charged_cents, owner_payout_cents, requested_at, responded_at, cancelled_by, cancelled_at, ended_at)
      VALUES (${`MP-${tag}-${seq}`}, ${espacoResp.id}, ${renterId}, ${respId}, ${status}, CURRENT_DATE + 30,
        ${a.monthlyRentCents}, ${a.renterFeeBps}, ${a.ownerFeeBps}, ${a.renterFeeCents}, ${a.ownerFeeCents},
        ${a.totalChargedCents}, ${a.ownerPayoutCents},
        now() - make_interval(hours => ${pedidoHaHoras}::int),
        ${respostaEmMin == null ? null : sql`now() - make_interval(hours => ${pedidoHaHoras}::int) + make_interval(mins => ${respostaEmMin}::int)`},
        ${canceladoPor ?? null}, ${canceladoPor ? sql`now()` : null}, ${status === 'ended' ? sql`now()` : null})
      RETURNING id`;
    return row!.id;
  }
  await pedidoResp(loc2Id, 'rejected', 50, 30);            // respondido em 30 min
  await pedidoResp(loc3Id, 'ended', 400, 120);             // aceito em 2 h (a locação já acabou)
  await pedidoResp(brunoId, 'rejected', 300, 180);         // recusa automática ("outro interessado"), 3 h
  await pedidoResp(terceiroId, 'expired', 200, null);      // venceu sem resposta
  await pedidoResp(locId, 'requested', 8 * 24, null);      // fora do prazo, ainda não marcado "expired"
  const recente = await pedidoResp(anaId, 'requested', 1, null); // dentro do prazo: ainda não conta
  await pedidoResp(telAId, 'cancelled', 30, null, telAId); // quem pediu desistiu antes da resposta: não conta
  await pedidoResp(telBId, 'rejected', 400 * 24, 10);      // fora da janela de 12 meses: não conta

  const apurado = await getOwnerResponseStats(respId);
  expect('conta 3 respondidas e 2 sem resposta (recente, cancelado e antigo ficam de fora)',
    [apurado.answered, apurado.decided], [3, 5]);
  expect('taxa: 3 de 5 = 60%', responseRatePercent(apurado), 60);
  expect('mediana de 30 min, 2 h e 3 h = 2 h', apurado.medianSeconds, 7200);
  expect('só agregados saem da consulta (nenhum pedido, nome ou data)', Object.keys(apurado).sort(), ['answered', 'decided', 'medianSeconds']);

  const sinaisResp = buildTrustSignals({
    createdAt: new Date(), emailVerified: false, phoneVerified: false, completedBookings: 1, responseStats: apurado,
  }).filter((x) => x.group === 'activity');
  expect('sinais na tela', sinaisResp.map((x) => x.label), ['Responde 60% das solicitações', 'Costuma responder em poucas horas']);
  assert('a explicação traz as contagens reais', sinaisResp[0]!.explanation.includes('respondeu 3 de 5 solicitações'), sinaisResp[0]!.explanation);

  // Pelo caminho real: a proprietária recusa o pedido recente na tela.
  entrarComo(respId, 'owner', 'Rita Resposta Prado');
  const rRecusa = await respondToBookingRequestAction(undefined, fd({ bookingId: recente, decision: 'reject' }));
  assert('recusar pela ação registra a hora da resposta', rRecusa.ok, JSON.stringify(rRecusa));
  const depoisDaAcao = await getOwnerResponseStats(respId);
  expect('...e ela passa a contar: 4 de 6 = 66%', [depoisDaAcao.answered, depoisDaAcao.decided, responseRatePercent(depoisDaAcao)], [4, 6, 66]);

  // Quem só aluga não ganha "taxa de resposta" (nunca recebeu solicitação).
  const deQuemAluga = await getOwnerResponseStats(loc2Id);
  expect('locatário não tem indicador de resposta', responseRatePercent(deQuemAluga), null);
}

async function limpar() {
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL myplace.allow_review_delete = 'on'`;
      await tx`DELETE FROM reports WHERE reporter_id IN ${sql(todos)} OR target_user_id IN ${sql(todos)}`;
      await tx`DELETE FROM reviews WHERE author_id IN ${sql(todos)} OR reviewed_user_id IN ${sql(todos)}`;
    });
    await sql`DELETE FROM user_blocks WHERE blocker_id IN ${sql(todos)} OR blocked_id IN ${sql(todos)}`;
    await sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE owner_id IN ${sql(todos)} OR renter_id IN ${sql(todos)})`;
    await sql`DELETE FROM conversations WHERE owner_id IN ${sql(todos)} OR renter_id IN ${sql(todos)}`;
    await sql`DELETE FROM promotions WHERE owner_id IN ${sql(todos)}`;
    await sql`DELETE FROM premium_memberships WHERE user_id IN ${sql(todos)}`;
    await sql`DELETE FROM bookings WHERE owner_id IN ${sql(todos)} OR renter_id IN ${sql(todos)}`;
    await sql`DELETE FROM spaces WHERE owner_id IN ${sql(todos)}`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN ${sql(todos)} OR entity_id IN ${sql(todos)}`;
      await tx`DELETE FROM auth.users WHERE id IN ${sql(todos)}`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 300)}\x1b[0m`);
  }
}

main()
  .catch((err) => {
    bad('erro inesperado', err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
  })
  .finally(async () => {
    await limpar();
    await testbed?.close();
    await sql.end({ timeout: 5 });
    console.log(`\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m${failed ? `, \x1b[31m${failed} falharam\x1b[0m` : ''}`);
    if (failed) {
      console.log(falhas.map((f) => `  - ${f}`).join('\n'));
      process.exit(1);
    }
  });

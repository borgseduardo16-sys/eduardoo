/**
 * Verificacao do chat real entre locatario e proprietario (Fase 6).
 *
 * Testa as Server Actions DE VERDADE (src/lib/messaging/actions.ts), contra
 * Postgres real — mesmo padrao ja usado em verify-bookings.ts e
 * verify-payments.ts: so a sessao e trocada por um dublê.
 *
 *   pnpm tsx scripts/verify-messaging.ts
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
import { startTestbed, type Testbed } from './testbed/server';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 2, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

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

const tag = `msg-${Date.now()}`;
const donoId = crypto.randomUUID(); // dono do espaco A
const locatarioId = crypto.randomUUID(); // interessado no espaco A
const terceiroId = crypto.randomUUID(); // nao participa de nada
const donoBId = crypto.randomUUID(); // dono do espaco B, usado no teste de bloqueio

let espacoAId = '';
let espacoBId = '';
let testbed: Testbed;

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string) {
  identidadeAtual = { id, role, fullName };
}

/**
 * Espaco JA publicado, criado direto por SQL. Precisa das 3 fotos ANTES de
 * marcar `status='published'` porque isso e travado por trigger de verdade
 * (`guard_publish_requires_photos`, dispara em INSERT tambem) — nao da pra
 * contornar inserindo ja como publicado (mesmo padrao de verify-bookings.ts).
 */
async function criarPublicado(ownerId: string, slug: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces
      (owner_id, slug, type, title, description, district, city, state,
       available_from, price_monthly_cents, size_m2, draft_step,
       location, approx_location)
    VALUES
      (${ownerId}, ${slug}, 'garagem', ${`Garagem ${slug}`},
       'Descricao com mais de vinte caracteres para passar na regra do banco.',
       'Centro', 'Colatina', 'ES', CURRENT_DATE, 20000, 18, 8,
       ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326),
       ST_SetSRID(ST_MakePoint(-40.6280, -19.5401), 4326))
    RETURNING id`;
  const id = row!.id;
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${id}, ${`${ownerId}/${id}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return id;
}

async function seed() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    (${locatarioId}, ${`${tag}-locatario@exemplo.invalid`}),
    (${terceiroId}, ${`${tag}-terceiro@exemplo.invalid`}),
    (${donoBId}, ${`${tag}-donob@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${tag}`} WHERE id=${donoId}`;
  await sql`UPDATE profiles SET full_name=${'Locatario Interessado'} WHERE id=${locatarioId}`;
  await sql`UPDATE profiles SET full_name=${'Terceiro Alheio'} WHERE id=${terceiroId}`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono B ${tag}`} WHERE id=${donoBId}`;

  espacoAId = await criarPublicado(donoId, `${tag}-a`);
  espacoBId = await criarPublicado(donoBId, `${tag}-b`);

  ok('semente criada', 'dono + locatario + terceiro + dono B + 2 espacos publicados');
}

async function main() {
  testbed = await startTestbed();
  ok('testbed no ar', testbed.url);

  await seed();

  process.env.RESEND_API_BASE_URL = testbed.url;
  process.env.RESEND_API_KEY = testbed.resendApiKey;
  process.env.EMAIL_FROM = 'MyPlace <nao-responda@teste.invalid>';

  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id,
          role: identidadeAtual.role,
          email: 'teste@exemplo.invalid',
          fullName: identidadeAtual.fullName,
          avatarPath: null,
          status: 'active',
          statusReason: null,
          acceptedTermsAt: new Date(),
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

  // blockUserAction (safety/actions.ts) le o IP via next/headers, que so
  // funciona dentro de uma requisicao real do Next. Aqui devolvemos um
  // cabecalho vazio — o IP so vai pro audit_logs, nao afeta nenhuma asserçao.
  const headersPath = req.resolve('next/headers');
  req.cache[headersPath] = {
    id: headersPath, filename: headersPath, loaded: true,
    exports: { headers: async () => new Headers() },
  } as never;

  const {
    startConversationAction,
    sendMessageAction,
    markConversationReadAction,
  } = await import('../src/lib/messaging/actions');
  const {
    listConversations,
    getConversationForUser,
    listMessages,
    countUnreadConversations,
  } = await import('../src/lib/messaging/queries');
  const { blockUserAction } = await import('../src/lib/safety/actions');
  const { respondToBookingRequestAction, cancelBookingAction } = await import('../src/lib/bookings/actions');

  /**
   * `startConversationAction` redireciona no caminho de sucesso (mesmo padrao
   * de `requestBookingAction`, ja tratado em verify-bookings.ts). Como o
   * redirect nao carrega o id criado, buscamos a conversa mais recente desse
   * par (espaco, locatario) — o mesmo dado que a pagina real consultaria.
   */
  async function chamarStartConversation(
    spaceId: string,
    renterId: string,
    fd: FormData,
  ): Promise<{ ok: boolean; message?: string; conversationId?: string }> {
    try {
      const r = await startConversationAction(undefined, fd);
      return { ok: r?.ok ?? false, message: r?.message };
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM conversations WHERE space_id=${spaceId} AND renter_id=${renterId} LIMIT 1`;
      return { ok: true, conversationId: row?.id };
    }
  }

  // =========================================================================
  secao('1. Iniciar conversa');
  // =========================================================================

  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const fd1 = new FormData();
  fd1.set('spaceId', espacoAId);
  const r1 = await chamarStartConversation(espacoAId, locatarioId, fd1);
  assert('conversa criada com sucesso', r1.ok, JSON.stringify(r1));

  const [conv1] = await sql<{ renter_id: string; owner_id: string; closed_at: Date | null }[]>`
    SELECT renter_id, owner_id, closed_at FROM conversations WHERE id=${r1.conversationId!}`;
  expect('renterId gravado certo', conv1!.renter_id, locatarioId);
  expect('ownerId veio do dono do espaco (nao do form)', conv1!.owner_id, donoId);
  assert('conversa nasce aberta', conv1!.closed_at === null);

  // --- reabrir a mesma conversa nao duplica ---
  const fd1b = new FormData();
  fd1b.set('spaceId', espacoAId);
  const r1b = await chamarStartConversation(espacoAId, locatarioId, fd1b);
  expect('reabrir devolve a MESMA conversa (nao cria outra)', r1b.conversationId, r1.conversationId);
  const [{ n: totalConvsMesmoPar }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM conversations WHERE space_id=${espacoAId} AND renter_id=${locatarioId}`;
  expect('so existe UMA conversa para este par (espaco, locatario)', totalConvsMesmoPar, 1);

  // --- dono nao pode conversar sobre o proprio espaco ---
  entrarComo(donoId, 'owner', 'Dono');
  const fdSelf = new FormData();
  fdSelf.set('spaceId', espacoAId);
  const rSelf = await chamarStartConversation(espacoAId, donoId, fdSelf);
  assert('dono NAO consegue iniciar conversa sobre o proprio espaco', !rSelf.ok, rSelf.message ?? '');

  // --- espaco inexistente ---
  entrarComo(terceiroId, 'user', 'Terceiro Alheio');
  const fdInexistente = new FormData();
  fdInexistente.set('spaceId', crypto.randomUUID());
  const rInexistente = await chamarStartConversation(crypto.randomUUID(), terceiroId, fdInexistente);
  assert('espaco inexistente e recusado', !rInexistente.ok, rInexistente.message ?? '');

  // =========================================================================
  secao('2. Autorizacao para ver/participar da conversa');
  // =========================================================================

  const conversaVistaPeloDono = await getConversationForUser(r1.conversationId!, donoId);
  assert('o dono enxerga a conversa (e parte dela)', conversaVistaPeloDono !== null);
  const conversaVistaPeloLocatario = await getConversationForUser(r1.conversationId!, locatarioId);
  assert('o locatario enxerga a conversa (e parte dela)', conversaVistaPeloLocatario !== null);
  const conversaVistaPeloTerceiro = await getConversationForUser(r1.conversationId!, terceiroId);
  assert('quem NAO participa nao enxerga a conversa', conversaVistaPeloTerceiro === null);

  const conversaInexistente = await getConversationForUser(crypto.randomUUID(), locatarioId);
  assert('conversa inexistente devolve null', conversaInexistente === null);

  // =========================================================================
  secao('3. Enviar mensagem');
  // =========================================================================

  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const fdMsg1 = new FormData();
  fdMsg1.set('conversationId', r1.conversationId!);
  fdMsg1.set('body', 'Oi! O espaço ainda está disponível?');
  const rMsg1 = await sendMessageAction(undefined, fdMsg1);
  assert('locatario envia a primeira mensagem', rMsg1.ok, JSON.stringify(rMsg1));

  const mensagensAposR1 = await listMessages(r1.conversationId!);
  expect('uma mensagem gravada', mensagensAposR1.length, 1);
  expect('corpo da mensagem bate', mensagensAposR1[0]!.body, 'Oi! O espaço ainda está disponível?');
  expect('remetente e o locatario', mensagensAposR1[0]!.senderId, locatarioId);
  assert('mensagem sem dado de contato nao foi sinalizada', mensagensAposR1[0]!.flaggedAt === null);

  const [convApos1] = await sql<{ last_message_at: Date | null }[]>`
    SELECT last_message_at FROM conversations WHERE id=${r1.conversationId!}`;
  assert('lastMessageAt foi atualizado', convApos1!.last_message_at !== null);

  const [notifDono] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE user_id=${donoId} AND type='new_message'`;
  expect('dono recebeu notificacao de nova mensagem', notifDono!.n, 1);

  // --- responder ---
  entrarComo(donoId, 'owner', 'Dono');
  const fdMsg2 = new FormData();
  fdMsg2.set('conversationId', r1.conversationId!);
  fdMsg2.set('body', 'Está sim! Pode ser a partir de quando?');
  const rMsg2 = await sendMessageAction(undefined, fdMsg2);
  assert('dono responde', rMsg2.ok, JSON.stringify(rMsg2));

  const mensagensAposR2 = await listMessages(r1.conversationId!);
  expect('duas mensagens gravadas, em ordem', mensagensAposR2.map((m) => m.senderId), [locatarioId, donoId]);

  // --- quem nao participa nao consegue mandar mensagem ---
  entrarComo(terceiroId, 'user', 'Terceiro Alheio');
  const fdMsgIndevida = new FormData();
  fdMsgIndevida.set('conversationId', r1.conversationId!);
  fdMsgIndevida.set('body', 'Deixa eu entrar nessa conversa.');
  const rMsgIndevida = await sendMessageAction(undefined, fdMsgIndevida);
  assert('quem NAO participa nao consegue mandar mensagem', !rMsgIndevida.ok, rMsgIndevida.message ?? '');
  const [{ n: naoEntrouMsg }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM messages WHERE conversation_id=${r1.conversationId!} AND sender_id=${terceiroId}`;
  expect('nenhuma mensagem do terceiro foi gravada', naoEntrouMsg, 0);

  // --- validacao: corpo vazio / so espaco ---
  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const fdVazia = new FormData();
  fdVazia.set('conversationId', r1.conversationId!);
  fdVazia.set('body', '   ');
  const rVazia = await sendMessageAction(undefined, fdVazia);
  assert('mensagem vazia (so espacos) e recusada', !rVazia.ok, rVazia.message ?? '');

  // --- validacao: corpo longo demais ---
  const fdLonga = new FormData();
  fdLonga.set('conversationId', r1.conversationId!);
  fdLonga.set('body', 'a'.repeat(4001));
  const rLonga = await sendMessageAction(undefined, fdLonga);
  assert('mensagem acima de 4000 caracteres e recusada', !rLonga.ok, rLonga.message ?? '');

  // =========================================================================
  secao('4. Deteccao de dados de contato (sinaliza, nao bloqueia)');
  // =========================================================================

  const fdContato = new FormData();
  fdContato.set('conversationId', r1.conversationId!);
  fdContato.set('body', 'Me chama no zap: (27) 99988-7766 que a gente combina melhor.');
  const rContato = await sendMessageAction(undefined, fdContato);
  assert('mensagem com telefone e ENVIADA (nao bloqueada)', rContato.ok, JSON.stringify(rContato));

  const mensagensAposContato = await listMessages(r1.conversationId!);
  const ultimaContato = mensagensAposContato[mensagensAposContato.length - 1]!;
  assert('mensagem com telefone foi sinalizada (flaggedAt preenchido)', ultimaContato.flaggedAt !== null);

  const [flagReasonRow] = await sql<{ flag_reason: string | null }[]>`
    SELECT flag_reason FROM messages WHERE id=${ultimaContato.id}`;
  assert('flagReason menciona telefone', (flagReasonRow!.flag_reason ?? '').includes('telefone'),
    flagReasonRow!.flag_reason ?? '');

  const fdPix = new FormData();
  fdPix.set('conversationId', r1.conversationId!);
  fdPix.set('body', 'Me manda um pix de sinal que eu já guardo a vaga pra você.');
  const rPix = await sendMessageAction(undefined, fdPix);
  assert('mensagem pedindo pix adiantado tambem e ENVIADA', rPix.ok, JSON.stringify(rPix));
  const mensagensAposPix = await listMessages(r1.conversationId!);
  const ultimaPix = mensagensAposPix[mensagensAposPix.length - 1]!;
  assert('mensagem de pix adiantado foi sinalizada', ultimaPix.flaggedAt !== null);

  // =========================================================================
  secao('5. Nao lidas e marcar como lida');
  // =========================================================================

  const naoLidasDono = await countUnreadConversations(donoId);
  assert('dono tem mensagens nao lidas (as do locatario)', naoLidasDono >= 1, `${naoLidasDono}`);

  await markConversationReadAction(r1.conversationId!);
  // markConversationReadAction usa requireUserOrThrow -> le identidadeAtual, que
  // neste ponto ainda e locatarioId (ultima chamada de entrarComo desta secao
  // foi no passo 4). Confirma antes de seguir.
  expect('identidade atual usada para marcar leitura e o locatario', identidadeAtual.id, locatarioId);

  const naoLidasLocatarioAposMarcar = await countUnreadConversations(locatarioId);
  expect('locatario ficou com zero nao lidas apos marcar', naoLidasLocatarioAposMarcar, 0);

  entrarComo(donoId, 'owner', 'Dono');
  await markConversationReadAction(r1.conversationId!);
  const naoLidasDonoAposMarcar = await countUnreadConversations(donoId);
  expect('dono ficou com zero nao lidas apos marcar', naoLidasDonoAposMarcar, 0);

  // =========================================================================
  secao('6. Inbox (listConversations)');
  // =========================================================================

  const inboxLocatario = await listConversations(locatarioId);
  const itemInbox = inboxLocatario.find((c) => c.id === r1.conversationId);
  assert('conversa aparece na inbox do locatario', Boolean(itemInbox));
  expect('inbox mostra o nome do dono (outra parte)', itemInbox?.outraParteNome, 'Dono ' + tag);
  assert('inbox mostra a ultima mensagem', Boolean(itemInbox?.ultimaMensagem));

  const inboxDono = await listConversations(donoId);
  const itemInboxDono = inboxDono.find((c) => c.id === r1.conversationId);
  assert('conversa aparece na inbox do dono', Boolean(itemInboxDono));
  expect('inbox do dono mostra o nome do locatario (outra parte)', itemInboxDono?.outraParteNome, 'Locatario Interessado');

  const inboxTerceiro = await listConversations(terceiroId);
  assert('conversa NAO aparece na inbox de quem nao participa', !inboxTerceiro.some((c) => c.id === r1.conversationId));

  // =========================================================================
  secao('7. Bloqueio encerra a conversa e impede novo contato');
  // =========================================================================

  // Cria uma segunda conversa (espaco B, entre locatario e dono B) pra testar
  // o bloqueio sem interferir na conversa principal acima.
  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const fdConvB = new FormData();
  fdConvB.set('spaceId', espacoBId);
  const rConvB = await chamarStartConversation(espacoBId, locatarioId, fdConvB);
  assert('segunda conversa criada (espaco B, dono B)', rConvB.ok, JSON.stringify(rConvB));

  // locatario bloqueia dono B
  const fdBlock = new FormData();
  fdBlock.set('blockedId', donoBId);
  const rBlock = await blockUserAction(undefined, fdBlock);
  assert('bloqueio criado com sucesso', rBlock.ok, JSON.stringify(rBlock));

  const [convBAposBloqueio] = await sql<{ closed_at: Date | null }[]>`
    SELECT closed_at FROM conversations WHERE id=${rConvB.conversationId!}`;
  assert('a conversa com o bloqueado foi encerrada automaticamente (trigger)', convBAposBloqueio!.closed_at !== null);

  // enviar mensagem na conversa encerrada e recusado
  const fdMsgEncerrada = new FormData();
  fdMsgEncerrada.set('conversationId', rConvB.conversationId!);
  fdMsgEncerrada.set('body', 'Ainda da pra alugar?');
  const rMsgEncerrada = await sendMessageAction(undefined, fdMsgEncerrada);
  assert('nao da pra mandar mensagem numa conversa encerrada', !rMsgEncerrada.ok, rMsgEncerrada.message ?? '');

  // iniciar uma NOVA conversa com quem bloqueou tambem e recusado
  const espacoB2Id = await criarPublicado(donoBId, `${tag}-b2`);
  const fdNovaComBloqueado = new FormData();
  fdNovaComBloqueado.set('spaceId', espacoB2Id);
  const rNovaComBloqueado = await chamarStartConversation(espacoB2Id, locatarioId, fdNovaComBloqueado);
  assert('nao da pra iniciar NOVA conversa com quem esta bloqueado', !rNovaComBloqueado.ok, rNovaComBloqueado.message ?? '');
  const [{ n: convaNaoNasceu }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM conversations WHERE space_id=${espacoB2Id}`;
  expect('nenhuma conversa foi criada para o espaco novo', convaNaoNasceu, 0);

  // a conversa principal (espaco A), sem bloqueio, continua funcionando normalmente
  entrarComo(donoId, 'owner', 'Dono');
  const fdMsgAindaFunciona = new FormData();
  fdMsgAindaFunciona.set('conversationId', r1.conversationId!);
  fdMsgAindaFunciona.set('body', 'Combinado, pode vir amanhã de manhã.');
  const rMsgAindaFunciona = await sendMessageAction(undefined, fdMsgAindaFunciona);
  assert('conversas nao envolvidas no bloqueio continuam funcionando', rMsgAindaFunciona.ok, JSON.stringify(rMsgAindaFunciona));

  // =========================================================================
  secao('8. Notificacao por e-mail de mensagem nova (Resend, contra o testbed)');
  // =========================================================================

  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const emailsAntes8 = testbed.emailsSent.length;
  const fdMsgEmail = new FormData();
  fdMsgEmail.set('conversationId', r1.conversationId!);
  fdMsgEmail.set('body', 'Mensagem de teste pro e-mail.');
  const rMsgEmail = await sendMessageAction(undefined, fdMsgEmail);
  assert('mensagem enviada com Resend configurado', rMsgEmail.ok, JSON.stringify(rMsgEmail));

  expect('um e-mail novo foi "enviado" (capturado pelo testbed)', testbed.emailsSent.length, emailsAntes8 + 1);
  const emailRecebido = testbed.emailsSent[testbed.emailsSent.length - 1]!;
  expect('e-mail foi para o dono (destinatario certo)', emailRecebido.to, [`${tag}-dono@exemplo.invalid`]);
  assert('assunto menciona quem mandou e o espaco',
    emailRecebido.subject.includes('Locatario Interessado') && emailRecebido.subject.includes(`Garagem ${tag}-a`),
    emailRecebido.subject);
  assert('corpo do e-mail contem o link direto pra conversa',
    emailRecebido.html.includes(`/mensagens/${r1.conversationId}`), emailRecebido.html);

  // --- sem RESEND_API_KEY configurada: o chat continua funcionando, so nao envia e-mail ---
  const chaveOriginal = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const emailsAntesSemChave = testbed.emailsSent.length;
  const fdMsgSemChave = new FormData();
  fdMsgSemChave.set('conversationId', r1.conversationId!);
  fdMsgSemChave.set('body', 'Mensagem sem credencial de e-mail configurada.');
  const rMsgSemChave = await sendMessageAction(undefined, fdMsgSemChave);
  assert('mensagem enviada MESMO sem Resend configurado — o chat nao depende do e-mail',
    rMsgSemChave.ok, JSON.stringify(rMsgSemChave));
  expect('nenhum e-mail foi enviado sem a credencial (e nao quebrou a action)',
    testbed.emailsSent.length, emailsAntesSemChave);
  process.env.RESEND_API_KEY = chaveOriginal;

  // =========================================================================
  secao('9. Mensagens de sistema disparadas pela reserva (aceite/cancelamento)');
  // =========================================================================

  async function seedBookingRequested(espacoId: string, sufixo: string) {
    const precoCents = 20000;
    const amounts = computeBookingAmounts(precoCents, { renterFeeBps: 300, ownerFeeBps: 300 });
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO bookings
        (reference, space_id, renter_id, owner_id, status, start_date,
         monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
         owner_fee_cents, total_charged_cents, owner_payout_cents)
      VALUES
        (${`MP-${tag}-${sufixo}`}, ${espacoId}, ${locatarioId}, ${donoId},
         'requested', CURRENT_DATE,
         ${amounts.monthlyRentCents}, ${amounts.renterFeeBps}, ${amounts.ownerFeeBps},
         ${amounts.renterFeeCents}, ${amounts.ownerFeeCents}, ${amounts.totalChargedCents},
         ${amounts.ownerPayoutCents})
      RETURNING id`;
    return row!.id;
  }

  // --- aceite: nenhuma conversa existia -> a action CRIA uma e posta o aviso ---
  const espacoSistemaId = await criarPublicado(donoId, `${tag}-sistema`);
  const bookingSistemaId = await seedBookingRequested(espacoSistemaId, 'sis');

  const [{ n: conversaAntesDoAceite }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM conversations WHERE space_id=${espacoSistemaId} AND renter_id=${locatarioId}`;
  expect('nenhuma conversa existia antes do aceite', conversaAntesDoAceite, 0);

  entrarComo(donoId, 'owner', 'Dono');
  const emailsAntesAceite = testbed.emailsSent.length;
  const fdAceitarSistema = new FormData();
  fdAceitarSistema.set('bookingId', bookingSistemaId);
  fdAceitarSistema.set('decision', 'accept');
  const rAceitarSistema = await respondToBookingRequestAction(undefined, fdAceitarSistema);
  assert('dono aceita a reserva de teste', rAceitarSistema.ok, JSON.stringify(rAceitarSistema));

  const [conversaCriadaPeloAceite] = await sql<{ id: string }[]>`
    SELECT id FROM conversations WHERE space_id=${espacoSistemaId} AND renter_id=${locatarioId} LIMIT 1`;
  assert('o aceite CRIOU a conversa (nenhuma existia antes)', Boolean(conversaCriadaPeloAceite));
  const conversaSistemaId = conversaCriadaPeloAceite!.id;

  const mensagensSistemaAposAceite = await listMessages(conversaSistemaId);
  expect('uma mensagem de sistema apareceu na conversa', mensagensSistemaAposAceite.length, 1);
  const msgAceite = mensagensSistemaAposAceite[0]!;
  assert('mensagem esta marcada como isSystem', msgAceite.isSystem);
  expect('remetente da mensagem de sistema e quem agiu (o dono)', msgAceite.senderId, donoId);
  assert('corpo menciona que a reserva foi aceita', msgAceite.body.includes('aceita'), msgAceite.body);

  expect('e-mail da mensagem de sistema foi enviado a quem NAO agiu (o locatario)',
    testbed.emailsSent.length, emailsAntesAceite + 1);
  const emailAceite = testbed.emailsSent[testbed.emailsSent.length - 1]!;
  expect('e-mail foi para o locatario', emailAceite.to, [`${tag}-locatario@exemplo.invalid`]);

  // --- cancelamento: a conversa JA existe -> reusa, nao cria outra ---
  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const emailsAntesCancelar = testbed.emailsSent.length;
  const fdCancelarSistema = new FormData();
  fdCancelarSistema.set('bookingId', bookingSistemaId);
  fdCancelarSistema.set('reason', 'Mudei de ideia.');
  const rCancelarSistema = await cancelBookingAction(undefined, fdCancelarSistema);
  assert('locatario cancela a reserva ja aceita', rCancelarSistema.ok, JSON.stringify(rCancelarSistema));

  const mensagensSistemaAposCancelar = await listMessages(conversaSistemaId);
  expect('duas mensagens de sistema agora (aceite + cancelamento)', mensagensSistemaAposCancelar.length, 2);
  const msgCancelar = mensagensSistemaAposCancelar[1]!;
  assert('segunda mensagem tambem e de sistema', msgCancelar.isSystem);
  expect('remetente da mensagem de cancelamento e quem cancelou (o locatario)', msgCancelar.senderId, locatarioId);
  assert('corpo menciona cancelamento e quem cancelou',
    msgCancelar.body.includes('cancelada') && msgCancelar.body.includes('Locatario Interessado'), msgCancelar.body);

  const [{ n: aindaUmaConversaSo }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM conversations WHERE space_id=${espacoSistemaId} AND renter_id=${locatarioId}`;
  expect('cancelamento NAO criou uma segunda conversa (reusou a existente)', aindaUmaConversaSo, 1);

  expect('e-mail do cancelamento foi para quem NAO agiu (o dono)', testbed.emailsSent.length, emailsAntesCancelar + 1);
  const emailCancelar = testbed.emailsSent[testbed.emailsSent.length - 1]!;
  expect('e-mail foi para o dono', emailCancelar.to, [`${tag}-dono@exemplo.invalid`]);

  // --- cancelamento SEM conversa previa -> nao cria uma so pra avisar ---
  const espacoSemConversaId = await criarPublicado(donoId, `${tag}-sem-conversa`);
  const bookingSemConversaId = await seedBookingRequested(espacoSemConversaId, 'semc');

  entrarComo(locatarioId, 'user', 'Locatario Interessado');
  const fdCancelarSemConversa = new FormData();
  fdCancelarSemConversa.set('bookingId', bookingSemConversaId);
  const rCancelarSemConversa = await cancelBookingAction(undefined, fdCancelarSemConversa);
  assert('locatario cancela solicitacao pendente (sem conversa nenhuma)',
    rCancelarSemConversa.ok, JSON.stringify(rCancelarSemConversa));

  const [{ n: nenhumaConversaCriada }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM conversations WHERE space_id=${espacoSemConversaId}`;
  expect('cancelar sem conversa previa NAO cria uma nova (so aceite cria)', nenhumaConversaCriada, 0);
}

async function limpar() {
  try {
    await sql`DELETE FROM messages WHERE conversation_id IN (
      SELECT id FROM conversations WHERE owner_id IN (${donoId},${donoBId})
      OR renter_id IN (${locatarioId},${terceiroId})
    )`;
    await sql`DELETE FROM conversations WHERE owner_id IN (${donoId},${donoBId})
      OR renter_id IN (${locatarioId},${terceiroId})`;
    await sql`DELETE FROM user_blocks WHERE blocker_id IN (${locatarioId},${terceiroId})
      OR blocked_id IN (${donoId},${donoBId})`;
    // bookings.space_id/renter_id/owner_id sao ON DELETE RESTRICT — saem
    // antes de spaces/profiles (mesmo motivo de verify-bookings.ts).
    await sql`DELETE FROM bookings WHERE renter_id IN (${donoId},${locatarioId},${terceiroId},${donoBId})
      OR owner_id IN (${donoId},${locatarioId},${terceiroId},${donoBId})`;
    await sql`DELETE FROM spaces WHERE owner_id IN (${donoId},${donoBId})`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN (${donoId},${locatarioId},${terceiroId},${donoBId})`;
      await tx`DELETE FROM public.notifications WHERE user_id IN (${donoId},${locatarioId},${terceiroId},${donoBId})`;
      await tx`DELETE FROM auth.users WHERE id IN (${donoId},${locatarioId},${terceiroId},${donoBId})`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 200)}\x1b[0m`);
  }
  await testbed?.close();
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

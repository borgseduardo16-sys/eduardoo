/**
 * Verificação do ÁUDIO (chat e instruções de acesso): formato lido pelo
 * conteúdo, limites, quem pode enviar, quem pode ouvir, e o caminho do áudio
 * das instruções do aceite até o locatário pagante. Roda as Server Actions e
 * as rotas DE VERDADE contra Postgres real; o Storage é o dublê local
 * (scripts/testbed/server.ts), que fala o mesmo contrato HTTP do Supabase.
 *
 *   pnpm tsx scripts/verify-audio.ts
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
import { addDaysToDate, brDate } from '../src/lib/time';
import { startTestbed, type Testbed } from './testbed/server';
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

// Sem Asaas neste teste.
delete process.env.ASAAS_API_KEY;
delete process.env.ASAAS_ENV;
delete process.env.ASAAS_WEBHOOK_TOKEN;

// ---------------------------------------------------------------------------
// Arquivos de áudio de mentira, com os PRIMEIROS BYTES de verdade de cada formato.
// ---------------------------------------------------------------------------
function arquivo(cabecalho: number[], tamanho = 4000): Uint8Array {
  const b = new Uint8Array(tamanho);
  b.set(cabecalho, 0);
  return b;
}
const WEBM = () => arquivo([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f]);
const OGG = () => arquivo([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0, 0, 0, 0, 0]);
const M4A = () => arquivo([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
const MP3_ID3 = () => arquivo([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21, 0, 0]);
const MP3_FRAME = () => arquivo([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = () => arquivo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = () => arquivo([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PDF = () => arquivo([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0, 0, 0]);
const EXE = () => arquivo([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);

const tag = `au-${Date.now()}`;
const donoId = crypto.randomUUID();
const locId = crypto.randomUUID();
const loc2Id = crypto.randomUUID();
const estranhoId = crypto.randomUUID();

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string } | null;
let identidadeAtual: Identidade = null;
const entrarComo = (id: string, role: 'user' | 'owner' = 'user') => { identidadeAtual = { id, role, fullName: id }; };
const sairDaConta = () => { identidadeAtual = null; };

let testbed: Testbed;
const hoje = () => brDate(new Date());
const emDias = (n: number) => addDaysToDate(hoje(), n);

async function main() {
  testbed = await startTestbed();
  process.env.NEXT_PUBLIC_SUPABASE_URL = testbed.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-de-teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste';

  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}), (${locId}, ${`${tag}-loc@exemplo.invalid`}),
    (${loc2Id}, ${`${tag}-loc2@exemplo.invalid`}), (${estranhoId}, ${`${tag}-estranho@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name='Dono Audio' WHERE id=${donoId}`;
  await sql`UPDATE profiles SET full_name='Locatario Audio' WHERE id=${locId}`;
  await sql`UPDATE profiles SET full_name='Locatario Dois' WHERE id=${loc2Id}`;
  await sql`UPDATE profiles SET full_name='Estranho' WHERE id=${estranhoId}`;

  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  const montarUsuario = async () => {
    const [p] = await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id=${identidadeAtual!.id}`;
    return {
      id: identidadeAtual!.id, role: identidadeAtual!.role, email: 'teste@exemplo.invalid',
      fullName: identidadeAtual!.fullName, publicName: p?.public_name ?? null,
      avatarPath: null, status: 'active', statusReason: null, acceptedTermsAt: new Date(),
    };
  };
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual) throw new Error('Voce precisa entrar para continuar.');
        return montarUsuario();
      },
      getCurrentUser: async () => (identidadeAtual ? montarUsuario() : null),
    },
  } as never;
  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;

  const fmt = await import('../src/lib/messaging/audio-format');
  const { sendAudioMessageAction, uploadAccessAudioAction } = await import('../src/lib/messaging/audio-actions');
  const { audioPathOfMessageForUser, listConversations, listMessages } = await import('../src/lib/messaging/queries');
  const { isPathInConversation } = await import('../src/lib/messaging/audio');
  const { requestBookingAction, respondToBookingRequestAction } = await import('../src/lib/bookings/actions');
  const { accessAudioPathForUser, getBookingForParticipant } = await import('../src/lib/bookings/queries');
  const { postAccessInstructions } = await import('../src/lib/messaging/system');
  const rotaMensagem = await import('../src/app/api/mensagens/[id]/audio/route');
  const rotaReserva = await import('../src/app/api/reservas/[id]/audio/route');
  const { NextRequest } = await import('next/server');

  // =========================================================================
  secao('1. Formato lido pelo CONTEÚDO, nunca pelo nome ou pelo tipo informado');
  // =========================================================================

  expect('WebM (Chrome, Firefox, Android)', fmt.sniffAudioType(WEBM())?.mime, 'audio/webm');
  expect('Ogg', fmt.sniffAudioType(OGG())?.mime, 'audio/ogg');
  expect('MP4/M4A (Safari)', fmt.sniffAudioType(M4A())?.mime, 'audio/mp4');
  expect('MP3 com marca ID3', fmt.sniffAudioType(MP3_ID3())?.mime, 'audio/mpeg');
  expect('MP3 por sincronismo de quadro', fmt.sniffAudioType(MP3_FRAME())?.mime, 'audio/mpeg');
  expect('PNG NÃO é áudio', fmt.sniffAudioType(PNG()), null);
  expect('JPEG NÃO é áudio (o chat não aceita imagem)', fmt.sniffAudioType(JPEG()), null);
  expect('PDF NÃO é áudio', fmt.sniffAudioType(PDF()), null);
  expect('executável NÃO é áudio', fmt.sniffAudioType(EXE()), null);
  expect('arquivo vazio/curto NÃO é áudio', fmt.sniffAudioType(new Uint8Array(5)), null);
  const tenta = (b: Uint8Array, ms: number) => { try { fmt.validateAudioBytes(b, ms); return 'aceito'; } catch (e) { return (e as Error).message; } };
  expect('1 segundo é o mínimo', tenta(WEBM(), 999).includes('curto'), true);
  expect('3 minutos é o máximo', tenta(WEBM(), 180_001).includes('3 minutos'), true);
  expect('exatamente 3 minutos passa', tenta(WEBM(), 180_000), 'aceito');
  expect('duração quebrada (NaN) é recusada', tenta(WEBM(), Number.NaN).includes('inválida'), true);
  expect('arquivo acima de 3 MB é recusado', tenta(arquivo([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0], 3 * 1024 * 1024 + 1), 5000).includes('grande'), true);
  expect('duração em texto vira "1:05"', fmt.formatAudioDuration(65_000), '1:05');

  // =========================================================================
  secao('2. Áudio no chat: quem envia, o que é guardado, quem recebe');
  // =========================================================================

  const espaco = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-a`, precoCents: 30000, quantidade: 1 });
  const [conv] = await sql<{ id: string }[]>`
    INSERT INTO conversations (space_id, renter_id, owner_id) VALUES (${espaco}, ${locId}, ${donoId}) RETURNING id`;
  const convId = conv!.id;

  function formAudio(conversationId: string, bytes: Uint8Array, mime: string, ms: number) {
    const fd = new FormData();
    fd.set('conversationId', conversationId);
    fd.set('durationMs', String(ms));
    fd.set('audio', new File([new Uint8Array(bytes)], 'audio', { type: mime }));
    return fd;
  }

  entrarComo(locId);
  const env1 = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 7000));
  assert('o locatário envia um áudio', env1.ok === true, JSON.stringify(env1));
  const [m1] = await sql<{ id: string; kind: string; audio_path: string; audio_duration_ms: number; audio_mime: string; body: string }[]>`
    SELECT id, kind::text AS kind, audio_path, audio_duration_ms, audio_mime, body FROM messages WHERE conversation_id=${convId} ORDER BY created_at DESC LIMIT 1`;
  expect('mensagem gravada como áudio, sem texto', [m1!.kind, m1!.body, m1!.audio_duration_ms, m1!.audio_mime], ['audio', '', 7000, 'audio/webm']);
  assert('o arquivo está na pasta da conversa', isPathInConversation(m1!.audio_path, convId) && m1!.audio_path.endsWith('.webm'), m1!.audio_path);
  assert('o arquivo chegou ao bucket privado chat-audio', testbed.audioObjects.has(m1!.audio_path));
  expect('o tipo gravado no bucket vem do que o servidor validou', testbed.audioObjects.get(m1!.audio_path)?.contentType, 'audio/webm');
  const [nm] = await sql<{ n: number; corpo: string }[]>`SELECT count(*)::int AS n, max(body) AS corpo FROM notifications WHERE user_id=${donoId} AND type='new_message' AND data->>'conversationId'=${convId}`;
  expect('o proprietário foi avisado ("mensagem de áudio")', [nm!.n, nm!.corpo], [1, 'Enviou uma mensagem de áudio.']);
  const caixa = await listConversations(donoId);
  expect('na caixa de entrada aparece "Mensagem de áudio", não um texto vazio', caixa.find((c) => c.id === convId)?.ultimaMensagem, 'Mensagem de áudio');
  const lista = await listMessages(convId);
  expect('a conversa traz o tipo e a duração para o player', [lista.at(-1)?.kind, lista.at(-1)?.audioDurationMs], ['audio', 7000]);

  // O que NÃO passa.
  const disfarcado = await sendAudioMessageAction(formAudio(convId, PNG(), 'audio/webm', 5000));
  assert('uma IMAGEM disfarçada de áudio (tipo "audio/webm", bytes de PNG) é recusada', !disfarcado.ok, disfarcado.message ?? '');
  const jpeg = await sendAudioMessageAction(formAudio(convId, JPEG(), 'image/jpeg', 5000));
  assert('imagem de verdade é recusada: o chat não aceita imagem', !jpeg.ok, jpeg.message ?? '');
  const longo = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 200_000));
  assert('áudio acima de 3 minutos é recusado', !longo.ok, longo.message ?? '');
  const grande = await sendAudioMessageAction(formAudio(convId, arquivo([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0], 3 * 1024 * 1024 + 10), 'audio/webm', 5000));
  assert('arquivo grande demais é recusado antes de guardar', !grande.ok, grande.message ?? '');
  const total = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM messages WHERE conversation_id=${convId} AND kind='audio'`;
  expect('nada do que foi recusado virou mensagem', total[0]!.n, 1);
  expect('nem arquivo no bucket', testbed.audioObjects.size, 1);

  entrarComo(estranhoId);
  const alheio = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 5000));
  assert('quem NÃO participa da conversa não envia áudio nela', !alheio.ok, alheio.message ?? '');
  sairDaConta();
  const semConta = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 5000)).catch((e: Error) => ({ ok: false, message: e.message }));
  assert('sem sessão não envia nada', !semConta.ok);

  await sql`UPDATE conversations SET closed_at = now() WHERE id=${convId}`;
  entrarComo(locId);
  const fechada = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 5000));
  assert('conversa encerrada não recebe áudio', !fechada.ok, fechada.message ?? '');
  await sql`UPDATE conversations SET closed_at = NULL WHERE id=${convId}`;

  await sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${donoId}, ${locId})`;
  const bloqueado = await sendAudioMessageAction(formAudio(convId, WEBM(), 'audio/webm', 5000));
  assert('quem foi bloqueado não consegue mandar áudio', !bloqueado.ok, bloqueado.message ?? '');
  await sql`DELETE FROM user_blocks WHERE blocker_id=${donoId} AND blocked_id=${locId}`;

  // =========================================================================
  secao('3. Ouvir: só participante, pelo servidor, com Range, sem expor o armazenamento');
  // =========================================================================

  expect('participante recebe o caminho do áudio', await audioPathOfMessageForUser(m1!.id, donoId), m1!.audio_path);
  expect('quem não participa não recebe nada', await audioPathOfMessageForUser(m1!.id, estranhoId), null);
  expect('id que não é de mensagem de áudio não vale', await audioPathOfMessageForUser(crypto.randomUUID(), donoId), null);
  expect('id malformado não chega ao banco', await audioPathOfMessageForUser("1'; DROP TABLE messages;--", donoId), null);

  const pedir = (id: string, range?: string) =>
    rotaMensagem.GET(new NextRequest(`http://localhost/api/mensagens/${id}/audio`, { headers: range ? { range } : {} }), { params: Promise.resolve({ id }) });

  entrarComo(donoId, 'owner');
  const tocar = await pedir(m1!.id);
  const corpoOuvido = new Uint8Array(await tocar.arrayBuffer());
  expect('o participante ouve (200, tipo de áudio, mesmo conteúdo)', [tocar.status, tocar.headers.get('content-type'), corpoOuvido.length], [200, 'audio/webm', WEBM().length]);
  expect('a resposta não fica em cache e não revela o armazenamento', [tocar.headers.get('cache-control'), tocar.headers.get('x-content-type-options'), tocar.headers.get('location')], ['private, no-store', 'nosniff', null]);
  const pedaco = await pedir(m1!.id, 'bytes=0-99');
  expect('"Range" funciona (206 com o trecho pedido)', [pedaco.status, pedaco.headers.get('content-range')?.startsWith('bytes 0-99/'), (await pedaco.arrayBuffer()).byteLength], [206, true, 100]);
  entrarComo(estranhoId);
  expect('quem não participa recebe 404', (await pedir(m1!.id)).status, 404);
  sairDaConta();
  expect('sem sessão: 401', (await pedir(m1!.id)).status, 401);
  entrarComo(donoId, 'owner');
  await sql`UPDATE messages SET hidden_at = now() WHERE id=${m1!.id}`;
  expect('mensagem escondida pela moderação não toca mais', (await pedir(m1!.id)).status, 404);
  await sql`UPDATE messages SET hidden_at = NULL WHERE id=${m1!.id}`;

  // =========================================================================
  secao('4. Instruções de acesso em ÁUDIO: do aceite ao locatário que pagou');
  // =========================================================================

  const espaco2 = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-b`, precoCents: 25000, quantidade: 2 });
  entrarComo(loc2Id);
  const fdPedido = new FormData();
  fdPedido.set('spaceId', espaco2); fdPedido.set('startDate', emDias(1));
  let bookingId = '';
  try { await requestBookingAction(undefined, fdPedido); } catch (e) { if (!String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw e; }
  bookingId = (await sql<{ id: string }[]>`SELECT id FROM bookings WHERE space_id=${espaco2} AND renter_id=${loc2Id}`)[0]!.id;

  function formAcesso(bytes: Uint8Array, ms: number, anterior?: string) {
    const fd = new FormData();
    fd.set('bookingId', bookingId); fd.set('durationMs', String(ms));
    fd.set('audio', new File([new Uint8Array(bytes)], 'audio', { type: 'audio/webm' }));
    if (anterior) fd.set('previousPath', anterior);
    return fd;
  }

  entrarComo(estranhoId);
  const naoDono = await uploadAccessAudioAction(formAcesso(WEBM(), 8000));
  assert('só o proprietário do pedido grava as instruções', !naoDono.ok, naoDono.ok ? '' : naoDono.message);
  entrarComo(loc2Id);
  const locatarioGrava = await uploadAccessAudioAction(formAcesso(WEBM(), 8000));
  assert('o locatário também não', !locatarioGrava.ok);

  entrarComo(donoId, 'owner');
  const imagemComoAcesso = await uploadAccessAudioAction(formAcesso(PNG(), 8000));
  assert('imagem não vale como áudio de instruções', !imagemComoAcesso.ok);
  const up1 = await uploadAccessAudioAction(formAcesso(WEBM(), 8000));
  assert('o proprietário envia o áudio das instruções', up1.ok === true, JSON.stringify(up1));
  const caminho1 = up1.ok ? up1.path : '';
  const [convB] = await sql<{ id: string }[]>`SELECT id FROM conversations WHERE space_id=${espaco2} AND renter_id=${loc2Id}`;
  assert('o áudio foi para a pasta da conversa deste pedido', isPathInConversation(caminho1, convB!.id) && testbed.audioObjects.has(caminho1), caminho1);

  const up2 = await uploadAccessAudioAction(formAcesso(WEBM(), 9000, caminho1));
  assert('regravar substitui o áudio', up2.ok === true && up2.path !== caminho1);
  expect('o áudio anterior sumiu do bucket (não fica lixo)', testbed.audioObjects.has(caminho1), false);
  const caminho2 = up2.ok ? up2.path : '';

  // Aceitar com o áudio de OUTRA conversa não vale.
  const aceitar = async (extra: Record<string, string>) => {
    const fd = new FormData(); fd.set('bookingId', bookingId); fd.set('decision', 'accept');
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return respondToBookingRequestAction(undefined, fd);
  };
  const doutra = await aceitar({ accessAudioPath: m1!.audio_path, accessAudioDurationMs: '7000' });
  assert('áudio de outra conversa NÃO é aceito nas instruções', !doutra.ok, doutra.message ?? '');
  const inventado = await aceitar({ accessAudioPath: `${convB!.id}/${crypto.randomUUID()}.webm`, accessAudioDurationMs: '7000' });
  assert('caminho que não existe no bucket NÃO é aceito', !inventado.ok, inventado.message ?? '');
  const traversal = await aceitar({ accessAudioPath: `${convB!.id}/../${convId}/x.webm`, accessAudioDurationMs: '7000' });
  assert('caminho com ".." NÃO é aceito', !traversal.ok, traversal.message ?? '');
  const semDuracao = await aceitar({ accessAudioPath: caminho2 });
  assert('sem duração o áudio não é aceito', !semDuracao.ok, semDuracao.message ?? '');

  const aceito = await aceitar({ accessAudioPath: caminho2, accessAudioDurationMs: '9000' });
  assert('aceitar SÓ com o áudio (sem texto) funciona', aceito.ok === true, JSON.stringify(aceito));
  const [rb] = await sql<{ status: string; texto: string | null; path: string | null; ms: number | null; mime: string | null }[]>`
    SELECT status::text AS status, access_instructions AS texto, access_audio_path AS path, access_audio_duration_ms AS ms, access_audio_mime AS mime FROM bookings WHERE id=${bookingId}`;
  expect('instruções gravadas: só áudio, com duração e tipo', [rb!.status, rb!.texto, rb!.path === caminho2, rb!.ms, rb!.mime], ['approved', null, true, 9000, 'audio/webm']);

  // Quem pode ouvir o áudio das instruções.
  const ouvirReserva = (id: string) => rotaReserva.GET(new NextRequest(`http://localhost/api/reservas/${id}/audio`), { params: Promise.resolve({ id }) });
  entrarComo(donoId, 'owner');
  expect('o proprietário ouve o que gravou', (await ouvirReserva(bookingId)).status, 200);
  entrarComo(loc2Id);
  expect('o locatário NÃO ouve antes de pagar (404)', (await ouvirReserva(bookingId)).status, 404);
  expect('nem pelo helper de consulta', await accessAudioPathForUser(bookingId, loc2Id), null);
  const antes = await getBookingForParticipant(bookingId, loc2Id);
  expect('a tela da locação diz que há instruções, sem entregar o áudio', [antes?.accessProvided, antes?.hasAccessAudio], [true, false]);
  entrarComo(estranhoId);
  expect('quem não participa recebe 404', (await ouvirReserva(bookingId)).status, 404);

  await sql`UPDATE bookings SET status='active', activated_at=now() WHERE id=${bookingId}`;
  entrarComo(loc2Id);
  const apos = await ouvirReserva(bookingId);
  expect('depois de paga, o locatário ouve o áudio das instruções', [apos.status, apos.headers.get('content-type')], [200, 'audio/webm']);
  const depois = await getBookingForParticipant(bookingId, loc2Id);
  expect('e a tela traz o player (duração do banco)', [depois?.hasAccessAudio, depois?.accessAudioDurationMs], [true, 9000]);

  // O que o pagamento confirmado faz no chat.
  await postAccessInstructions({
    spaceId: espaco2, renterId: loc2Id, ownerId: donoId, spaceTitle: 'Espaço',
    text: null, audio: { path: caminho2, durationMs: 9000, mime: 'audio/webm' },
  });
  const noChat = await sql<{ kind: string; is_system: boolean; sender_id: string }[]>`
    SELECT m.kind::text AS kind, m.is_system, m.sender_id FROM messages m WHERE m.conversation_id=${convB!.id} ORDER BY m.created_at`;
  expect('pagamento confirmado: aviso do sistema + mensagem de áudio do proprietário no chat',
    noChat.filter((m) => m.kind === 'audio' && m.sender_id === donoId).length === 1 && noChat.some((m) => m.is_system), true);
  const [msgInstr] = await sql<{ id: string }[]>`SELECT id FROM messages WHERE conversation_id=${convB!.id} AND kind='audio'`;
  entrarComo(loc2Id);
  expect('e o locatário ouve esse áudio pelo chat', (await pedir(msgInstr!.id)).status, 200);

  console.log(`\n${passed} verificações passaram, ${failed} falharam.`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(` - ${f}`);
  }
}

/** Apaga TUDO o que o teste criou — anúncio publicado que sobra aparece nas buscas dos outros testes. */
async function limpar() {
  const pessoas = [donoId, locId, loc2Id, estranhoId];
  try {
    await sql`DELETE FROM messages WHERE conversation_id IN (
      SELECT id FROM conversations WHERE owner_id = ${donoId} OR renter_id IN ${sql(pessoas)})`;
    await sql`DELETE FROM conversations WHERE owner_id = ${donoId} OR renter_id IN ${sql(pessoas)}`;
    await sql`DELETE FROM user_blocks WHERE blocker_id IN ${sql(pessoas)} OR blocked_id IN ${sql(pessoas)}`;
    await sql`DELETE FROM booking_end_requests WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId})`;
    await sql`DELETE FROM payouts WHERE payment_id IN (SELECT id FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId}))`;
    await sql`DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId})`;
    await sql`DELETE FROM subscriptions WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId})`;
    await sql`DELETE FROM booking_deposits WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId})`;
    await sql`DELETE FROM reviews WHERE booking_id IN (SELECT id FROM bookings WHERE owner_id = ${donoId})`;
    await sql`DELETE FROM bookings WHERE owner_id = ${donoId} OR renter_id IN ${sql(pessoas)}`;
    await sql`DELETE FROM spaces WHERE owner_id = ${donoId}`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN ${sql(pessoas)}`;
      await tx`DELETE FROM public.notifications WHERE user_id IN ${sql(pessoas)}`;
      await tx`DELETE FROM auth.users WHERE id IN ${sql(pessoas)}`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 300)}\x1b[0m`);
  }
  await testbed?.close().catch(() => {});
}

main()
  .catch((err) => {
    console.error('\nErro inesperado:', err);
    failed++;
  })
  .finally(async () => {
    await limpar();
    await sql.end({ timeout: 2 }).catch(() => {});
    process.exit(failed > 0 ? 1 : 0);
  });

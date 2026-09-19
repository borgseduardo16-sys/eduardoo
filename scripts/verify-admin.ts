/**
 * Verificacao do painel administrativo (Fase 11).
 *
 * Testa as Server Actions e queries DE VERDADE (src/lib/admin), contra
 * Postgres real — mesmo padrao de verify-messaging.ts e verify-payments.ts:
 * so a sessao (`src/lib/auth/dal.ts`) e trocada por um dublê.
 *
 * Cobre: fila de moderacao (ordem por gravidade, joins com os 3 tipos de
 * alvo), resolver denuncia (procedente/improcedente, nao resolve duas
 * vezes), suspensao automatica por reincidencia via a ACAO de verdade (nao
 * so o trigger cru, ja coberto em verify-schema.ts), e gestao manual de
 * status de conta.
 *
 *   pnpm tsx scripts/verify-admin.ts
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

const tag = `admin-${Date.now()}`;
const adminId = crypto.randomUUID();
const targetId = crypto.randomUUID(); // acumula denuncias procedentes ate suspender
const targetLivreId = crypto.randomUUID(); // suspenso/reativado manualmente, sem denuncia
const reporterIds = Array.from({ length: 5 }, () => crypto.randomUUID());

let espacoId = '';
let conversaId = '';
let mensagemId = '';

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string) {
  identidadeAtual = { id, role, fullName };
}

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
    (${adminId}, ${`${tag}-admin@exemplo.invalid`}),
    (${targetId}, ${`${tag}-alvo@exemplo.invalid`}),
    (${targetLivreId}, ${`${tag}-alvolivre@exemplo.invalid`}),
    ${sql(reporterIds.map((id, i) => [id, `${tag}-reporter${i}@exemplo.invalid`]))}`;
  await sql`UPDATE profiles SET role='admin', full_name=${'Moderador'} WHERE id=${adminId}`;
  await sql`UPDATE profiles SET role='owner', full_name=${'Alvo Recorrente'} WHERE id=${targetId}`;
  await sql`UPDATE profiles SET full_name=${'Alvo Isolado'} WHERE id=${targetLivreId}`;
  for (const [i, id] of reporterIds.entries()) {
    await sql`UPDATE profiles SET full_name=${`Denunciante ${i}`} WHERE id=${id}`;
  }

  espacoId = await criarPublicado(targetId, `${tag}-espaco`);

  const [conv] = await sql<{ id: string }[]>`
    INSERT INTO conversations (space_id, renter_id, owner_id)
    VALUES (${espacoId}, ${reporterIds[0]}, ${targetId}) RETURNING id`;
  conversaId = conv!.id;
  const [msg] = await sql<{ id: string }[]>`
    INSERT INTO messages (conversation_id, sender_id, body)
    VALUES (${conversaId}, ${targetId}, 'Manda o pix que eu confirmo por fora, sai mais barato.')
    RETURNING id`;
  mensagemId = msg!.id;

  ok('semente criada', 'admin + alvo + alvo livre + 5 denunciantes + espaco + mensagem');
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
      requireAdminOrThrow: async () => {
        if (identidadeAtual.role !== 'admin') throw new Error('Acesso restrito ao administrador.');
        return {
          id: identidadeAtual.id,
          role: identidadeAtual.role,
          email: 'admin@exemplo.invalid',
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

  const headersPath = req.resolve('next/headers');
  req.cache[headersPath] = {
    id: headersPath, filename: headersPath, loaded: true,
    exports: { headers: async () => new Headers() },
  } as never;

  const { createReportAction } = await import('../src/lib/safety/actions');
  const { resolveReportAction, updateAccountStatusAction } = await import('../src/lib/admin/actions');
  const { listModerationQueue, getModerationQueueCount, searchAccounts, getAccountById } = await import(
    '../src/lib/admin/queries'
  );

  // =========================================================================
  secao('1. Fila de moderacao: 3 denuncias abertas, ordenadas por gravidade');
  // =========================================================================

  entrarComo(reporterIds[0], 'user', 'Denunciante 0');

  const fdUser = new FormData();
  fdUser.set('targetType', 'user');
  fdUser.set('targetId', targetId);
  fdUser.set('reason', 'assedio'); // severidade critical
  const rUser = await createReportAction(undefined, fdUser);
  assert('denuncia contra usuario criada', rUser.ok, JSON.stringify(rUser));

  const fdSpace = new FormData();
  fdSpace.set('targetType', 'space');
  fdSpace.set('targetId', espacoId);
  fdSpace.set('reason', 'anuncio_falso'); // severidade high
  const rSpace = await createReportAction(undefined, fdSpace);
  assert('denuncia contra anuncio criada', rSpace.ok, JSON.stringify(rSpace));

  const fdMsg = new FormData();
  fdMsg.set('targetType', 'message');
  fdMsg.set('targetId', mensagemId);
  fdMsg.set('reason', 'conteudo_inadequado'); // severidade normal
  const rMsg = await createReportAction(undefined, fdMsg);
  assert('denuncia contra mensagem criada', rMsg.ok, JSON.stringify(rMsg));

  let fila = await listModerationQueue();
  expect('fila com as 3 denuncias', fila.length, 3);
  expect('ordem: critica (usuario) primeiro', fila[0]?.targetType, 'user');
  expect('depois alta (anuncio)', fila[1]?.targetType, 'space');
  expect('depois normal (mensagem) por ultimo', fila[2]?.targetType, 'message');

  const itemUsuario = fila.find((f) => f.targetType === 'user')!;
  expect('nome do alvo resolvido', itemUsuario.targetUserName, 'Alvo Recorrente');
  const itemEspaco = fila.find((f) => f.targetType === 'space')!;
  expect('titulo do anuncio resolvido', itemEspaco.spaceTitle, `Garagem ${tag}-espaco`);
  const itemMensagem = fila.find((f) => f.targetType === 'message')!;
  assert('corpo da mensagem denunciada aparece', itemMensagem.messageBody?.includes('pix') ?? false);
  expect('remetente da mensagem resolvido', itemMensagem.messageSenderName, 'Alvo Recorrente');

  expect('contagem da fila bate com o tamanho da lista', await getModerationQueueCount(), 3);

  // =========================================================================
  secao('2. So administrador resolve denuncia');
  // =========================================================================

  entrarComo(reporterIds[0], 'user', 'Denunciante 0');
  let bloqueado = false;
  try {
    await resolveReportAction(undefined, (() => {
      const fd = new FormData();
      fd.set('reportId', itemUsuario.id);
      fd.set('decision', 'upheld');
      return fd;
    })());
  } catch {
    bloqueado = true;
  }
  assert('usuario comum nao consegue resolver denuncia', bloqueado);

  // =========================================================================
  secao('3. Resolver como procedente/improcedente');
  // =========================================================================

  entrarComo(adminId, 'admin', 'Moderador');

  const fdResolveUser = new FormData();
  fdResolveUser.set('reportId', itemUsuario.id);
  fdResolveUser.set('decision', 'upheld');
  fdResolveUser.set('resolutionNote', 'Confirmado por print da conversa.');
  const rResolveUser = await resolveReportAction(undefined, fdResolveUser);
  assert('admin resolve denuncia de usuario como procedente', rResolveUser.ok, JSON.stringify(rResolveUser));

  const [linhaResolvida] = await sql<{ status: string; upheld: boolean; resolved_by: string; resolution_note: string }[]>`
    SELECT status, upheld, resolved_by, resolution_note FROM reports WHERE id = ${itemUsuario.id}`;
  expect('status vira resolved', linhaResolvida.status, 'resolved');
  expect('upheld gravado', linhaResolvida.upheld, true);
  expect('resolvedBy e o admin', linhaResolvida.resolved_by, adminId);

  const rResolveDeNovo = await resolveReportAction(undefined, fdResolveUser);
  assert('resolver a mesma denuncia de novo e recusado', !rResolveDeNovo.ok, rResolveDeNovo.message ?? '');

  const fdResolveSpace = new FormData();
  fdResolveSpace.set('reportId', itemEspaco.id);
  fdResolveSpace.set('decision', 'dismissed');
  const rResolveSpace = await resolveReportAction(undefined, fdResolveSpace);
  assert('admin resolve denuncia de anuncio como improcedente', rResolveSpace.ok, JSON.stringify(rResolveSpace));
  const [linhaEspaco] = await sql<{ status: string; upheld: boolean | null }[]>`
    SELECT status, upheld FROM reports WHERE id = ${itemEspaco.id}`;
  expect('status vira dismissed', linhaEspaco.status, 'dismissed');
  expect('upheld = false', linhaEspaco.upheld, false);

  fila = await listModerationQueue();
  expect('fila cai para 1 (so a mensagem, ainda aberta)', fila.length, 1);
  expect('sobrou a denuncia de mensagem', fila[0]?.id, itemMensagem.id);
  expect('sobrou o alvo do tipo mensagem', fila[0]?.targetType, 'message');

  const [{ upheld_report_count: contadorAposUma }] = await sql<{ upheld_report_count: number }[]>`
    SELECT upheld_report_count FROM profiles WHERE id = ${targetId}`;
  expect('contador de reincidencia do alvo = 1', contadorAposUma, 1);
  const [{ status: statusAposUma }] = await sql<{ status: string }[]>`
    SELECT status FROM profiles WHERE id = ${targetId}`;
  expect('conta ainda ativa (1 de 5)', statusAposUma, 'active');

  // =========================================================================
  secao('4. Suspensao automatica ao atingir a reincidencia, via a ACAO de verdade');
  // =========================================================================

  for (let i = 1; i < reporterIds.length; i++) {
    entrarComo(reporterIds[i], 'user', `Denunciante ${i}`);
    const fd = new FormData();
    fd.set('targetType', 'user');
    fd.set('targetId', targetId);
    fd.set('reason', 'fraude');
    const rCreate = await createReportAction(undefined, fd);
    assert(`denunciante ${i} registra nova denuncia`, rCreate.ok, JSON.stringify(rCreate));

    const [novaFila] = await sql<{ id: string }[]>`
      SELECT id FROM reports WHERE target_user_id = ${targetId} AND status = 'open'
      ORDER BY created_at DESC LIMIT 1`;

    entrarComo(adminId, 'admin', 'Moderador');
    const fdResolve = new FormData();
    fdResolve.set('reportId', novaFila.id);
    fdResolve.set('decision', 'upheld');
    const rResolve = await resolveReportAction(undefined, fdResolve);
    assert(`admin confirma denuncia ${i + 1}/5 como procedente`, rResolve.ok, JSON.stringify(rResolve));
  }

  const [contaFinal] = await sql<{ upheld_report_count: number; status: string; status_reason: string | null }[]>`
    SELECT upheld_report_count, status, status_reason FROM profiles WHERE id = ${targetId}`;
  expect('contador chegou a 5', contaFinal.upheld_report_count, 5);
  expect('conta suspensa automaticamente pela acao real', contaFinal.status, 'suspended');
  assert('motivo da suspensao registrado', (contaFinal.status_reason ?? '').includes('5'), contaFinal.status_reason ?? '');

  // =========================================================================
  secao('5. Gestao manual de status de conta');
  // =========================================================================

  entrarComo(reporterIds[0], 'user', 'Denunciante 0');
  let bloqueadoStatus = false;
  try {
    await updateAccountStatusAction(undefined, (() => {
      const fd = new FormData();
      fd.set('userId', targetId);
      fd.set('status', 'active');
      return fd;
    })());
  } catch {
    bloqueadoStatus = true;
  }
  assert('usuario comum nao consegue alterar status de conta', bloqueadoStatus);

  entrarComo(adminId, 'admin', 'Moderador');

  const fdSemMotivo = new FormData();
  fdSemMotivo.set('userId', targetLivreId);
  fdSemMotivo.set('status', 'suspended');
  const rSemMotivo = await updateAccountStatusAction(undefined, fdSemMotivo);
  assert('suspender sem motivo e recusado', !rSemMotivo.ok, JSON.stringify(rSemMotivo));
  assert('erro aponta o campo motivo', Boolean(rSemMotivo.fieldErrors?.statusReason), JSON.stringify(rSemMotivo.fieldErrors));

  const fdSuspenderLivre = new FormData();
  fdSuspenderLivre.set('userId', targetLivreId);
  fdSuspenderLivre.set('status', 'suspended');
  fdSuspenderLivre.set('statusReason', 'Incidente grave relatado por fora do fluxo de denuncia.');
  const rSuspenderLivre = await updateAccountStatusAction(undefined, fdSuspenderLivre);
  assert('admin suspende conta manualmente, sem denuncia previa', rSuspenderLivre.ok, JSON.stringify(rSuspenderLivre));
  const [statusLivre] = await sql<{ status: string; status_reason: string | null }[]>`
    SELECT status, status_reason FROM profiles WHERE id = ${targetLivreId}`;
  expect('status gravado', statusLivre.status, 'suspended');
  assert('motivo gravado', Boolean(statusLivre.status_reason));

  const fdReativarTarget = new FormData();
  fdReativarTarget.set('userId', targetId);
  fdReativarTarget.set('status', 'active');
  const rReativar = await updateAccountStatusAction(undefined, fdReativarTarget);
  assert('admin reativa conta suspensa automaticamente (suspensao nunca reverte sozinha)', rReativar.ok, JSON.stringify(rReativar));
  const [statusReativado] = await sql<{ status: string; status_reason: string | null }[]>`
    SELECT status, status_reason FROM profiles WHERE id = ${targetId}`;
  expect('status volta a active', statusReativado.status, 'active');
  expect('motivo limpo ao reativar', statusReativado.status_reason, null);

  const fdSelf = new FormData();
  fdSelf.set('userId', adminId);
  fdSelf.set('status', 'suspended');
  fdSelf.set('statusReason', 'teste');
  const rSelf = await updateAccountStatusAction(undefined, fdSelf);
  assert('admin nao consegue alterar a propria conta', !rSelf.ok, JSON.stringify(rSelf));

  // =========================================================================
  secao('6. Busca de contas');
  // =========================================================================

  const busca = await searchAccounts('Alvo');
  assert('busca por nome encontra as duas contas "Alvo..."', busca.some((c) => c.id === targetId) && busca.some((c) => c.id === targetLivreId));

  const buscaVazia = await searchAccounts('');
  expect('busca vazia nao devolve nada (evita listar a base toda)', buscaVazia.length, 0);

  const conta = await getAccountById(targetId);
  expect('getAccountById encontra a conta', conta?.id, targetId);
  const contaInexistente = await getAccountById(crypto.randomUUID());
  expect('getAccountById devolve null para id inexistente', contaInexistente, null);
}

async function limpar() {
  try {
    await sql`DELETE FROM messages WHERE conversation_id = ${conversaId}`;
    await sql`DELETE FROM conversations WHERE id = ${conversaId}`;
    await sql`DELETE FROM spaces WHERE owner_id = ${targetId}`;
    const todosIds = [adminId, targetId, targetLivreId, ...reporterIds];
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN ${sql(todosIds)}`;
      await tx`DELETE FROM public.notifications WHERE user_id IN ${sql(todosIds)}`;
      await tx`DELETE FROM auth.users WHERE id IN ${sql(todosIds)}`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
  } catch (err) {
    console.log(`  \x1b[2mlimpeza: ${String(err).slice(0, 200)}\x1b[0m`);
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

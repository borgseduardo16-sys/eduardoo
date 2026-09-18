/**
 * Verificacao do fluxo real de solicitacao -> reserva (Parte 4, sem pagamento).
 *
 * Testa as Server Actions DE VERDADE (src/lib/bookings/actions.ts), contra
 * Postgres real — nao uma copia, nao um mock do banco. So a sessao e trocada
 * por um dublê, exatamente como scripts/verify-integracoes.ts ja faz.
 *
 *   pnpm tsx scripts/verify-bookings.ts
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

const tag = `bk-${Date.now()}`;
const donoId = crypto.randomUUID();
const outroId = crypto.randomUUID(); // primeiro interessado
const terceiroId = crypto.randomUUID(); // segundo interessado, mesmo espaco

let espacoId = '';
let espacoConcorrenciaId = '';
let precoEspacoCents = 0;

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string) {
  identidadeAtual = { id, role, fullName };
}

function amanha(dias = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Espaco JA publicado, criado direto por SQL. Precisa das 3 fotos antes de
 * marcar `status='published'` porque isso e travado por trigger de verdade
 * (`guard_publish_requires_photos`) — nao da pra contornar, e nem deveria.
 */
async function criarPublicado(slug: string, precoCents: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces
      (owner_id, slug, type, title, description, district, city, state,
       available_from, price_monthly_cents, size_m2, draft_step,
       location, approx_location)
    VALUES
      (${donoId}, ${slug}, 'garagem', ${`Garagem ${slug}`},
       'Descricao com mais de vinte caracteres para passar na regra do banco.',
       'Centro', 'Colatina', 'ES', CURRENT_DATE, ${precoCents}, 18, 8,
       ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326),
       ST_SetSRID(ST_MakePoint(-40.6280, -19.5401), 4326))
    RETURNING id`;
  const id = row!.id;
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${id}, ${`${donoId}/${id}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return id;
}

async function seed() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    (${outroId}, ${`${tag}-outro@exemplo.invalid`}),
    (${terceiroId}, ${`${tag}-terceiro@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${tag}`} WHERE id=${donoId}`;
  await sql`UPDATE profiles SET full_name=${'Interessado Um'} WHERE id=${outroId}`;
  await sql`UPDATE profiles SET full_name=${'Interessado Dois'} WHERE id=${terceiroId}`;

  espacoId = await criarPublicado(`${tag}-a`, 20000); // R$ 200,00
  espacoConcorrenciaId = await criarPublicado(`${tag}-b`, 15000); // R$ 150,00
  precoEspacoCents = 20000;

  ok('semente criada', 'dono + 2 interessados + 2 espacos publicados');
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
      getCurrentUser: async () => null,
    },
  } as never;

  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;

  const { requestBookingAction, respondToBookingRequestAction, cancelBookingAction } =
    await import('../src/lib/bookings/actions');

  /**
   * `requestBookingAction` redireciona (`redirect()`) no caminho de sucesso —
   * o mesmo padrao ja usado em `publishSpaceAction` (spaces/actions.ts) e ja
   * tratado assim em scripts/verify-integracoes.ts. `redirect()` funciona
   * lancando uma excecao especial (NEXT_REDIRECT); dentro do Next o
   * framework a captura, aqui capturamos nos. Como o redirect nao carrega o
   * id criado, buscamos a solicitacao mais recente desse locatario para
   * esse espaco — e exatamente o mesmo dado que a pagina real consultaria.
   */
  async function chamarRequestBooking(renterId: string, spaceId: string, fd: FormData) {
    try {
      return await requestBookingAction(undefined, fd);
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM bookings WHERE space_id=${spaceId} AND renter_id=${renterId}
        ORDER BY requested_at DESC LIMIT 1`;
      return { ok: true, bookingId: row?.id };
    }
  }

  const [{ renter_fee_bps: renterFeeBpsRaw }] = await sql<{ renter_fee_bps: number }[]>`
    SELECT (value #>> '{}')::int AS renter_fee_bps FROM platform_settings WHERE key='fees.renter_fee_bps'`;
  const [{ owner_fee_bps: ownerFeeBpsRaw }] = await sql<{ owner_fee_bps: number }[]>`
    SELECT (value #>> '{}')::int AS owner_fee_bps FROM platform_settings WHERE key='fees.owner_fee_bps'`;
  const fees = { renterFeeBps: Number(renterFeeBpsRaw), ownerFeeBps: Number(ownerFeeBpsRaw) };
  ok('taxas vigentes lidas do banco', `${fees.renterFeeBps} / ${fees.ownerFeeBps} bps`);

  // =========================================================================
  secao('1. Solicitar aluguel');
  // =========================================================================

  entrarComo(outroId, 'user', 'Interessado Um');
  const fd1 = new FormData();
  fd1.set('spaceId', espacoId);
  fd1.set('startDate', amanha());
  fd1.set('renterMessage', 'Quero alugar para guardar uma moto.');
  const r1 = await chamarRequestBooking(outroId, espacoId, fd1);
  assert('solicitacao criada com sucesso', r1.ok, JSON.stringify(r1));

  const esperado = computeBookingAmounts(precoEspacoCents, fees);
  const [linha1] = await sql<{
    status: string; monthly_rent_cents: number; renter_fee_cents: number; owner_fee_cents: number;
    total_charged_cents: number; owner_payout_cents: number; renter_message: string;
  }[]>`SELECT status, monthly_rent_cents, renter_fee_cents, owner_fee_cents, total_charged_cents,
              owner_payout_cents, renter_message
       FROM bookings WHERE id=${r1.bookingId!}`;
  expect('status inicial e "requested"', linha1!.status, 'requested');
  expect('aluguel gravado bate com o preco do espaco', linha1!.monthly_rent_cents, precoEspacoCents);
  expect('taxa do locatario calculada certa', linha1!.renter_fee_cents, esperado.renterFeeCents);
  expect('taxa do proprietario calculada certa', linha1!.owner_fee_cents, esperado.ownerFeeCents);
  expect('total cobrado = aluguel + taxa do locatario', linha1!.total_charged_cents, esperado.totalChargedCents);
  expect('repasse = aluguel - taxa do proprietario', linha1!.owner_payout_cents, esperado.ownerPayoutCents);
  expect('mensagem do locatario foi gravada', linha1!.renter_message, 'Quero alugar para guardar uma moto.');

  const [notifDono] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE user_id=${donoId} AND type='booking_requested'`;
  expect('proprietario recebeu notificacao da solicitacao', notifDono!.n, 1);

  const [auditoria1] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=${r1.bookingId!} AND action='booking.requested'`;
  expect('solicitacao ficou registrada em audit_logs', auditoria1!.n, 1);

  // --- dono nao pode solicitar o proprio espaco ---
  entrarComo(donoId, 'owner', 'Dono');
  const fdSelf = new FormData();
  fdSelf.set('spaceId', espacoId);
  fdSelf.set('startDate', amanha());
  const rSelf = await chamarRequestBooking(donoId, espacoId, fdSelf);
  assert('dono NAO consegue solicitar o proprio espaco', !rSelf.ok, rSelf.message ?? '');

  // --- duplicata do mesmo interessado e recusada ---
  entrarComo(outroId, 'user', 'Interessado Um');
  const fdDup = new FormData();
  fdDup.set('spaceId', espacoId);
  fdDup.set('startDate', amanha());
  const rDup = await chamarRequestBooking(outroId, espacoId, fdDup);
  assert('o mesmo interessado NAO pode duplicar a solicitacao pendente', !rDup.ok, rDup.message ?? '');

  // --- segundo interessado, MESMO espaco ---
  entrarComo(terceiroId, 'user', 'Interessado Dois');
  const fd2 = new FormData();
  fd2.set('spaceId', espacoId);
  fd2.set('startDate', amanha(3));
  const r2 = await chamarRequestBooking(terceiroId, espacoId, fd2);
  assert('segundo interessado tambem consegue solicitar o mesmo espaco', r2.ok, JSON.stringify(r2));

  // =========================================================================
  secao('2. Autorizacao ao responder');
  // =========================================================================

  entrarComo(terceiroId, 'user', 'Interessado Dois');
  const fdRespIndevido = new FormData();
  fdRespIndevido.set('bookingId', r1.bookingId!);
  fdRespIndevido.set('decision', 'accept');
  const rRespIndevido = await respondToBookingRequestAction(undefined, fdRespIndevido);
  assert('quem NAO e dono do espaco nao consegue responder a solicitacao', !rRespIndevido.ok, rRespIndevido.message ?? '');

  // =========================================================================
  secao('3. Aceitar: congela valores, ocupa o espaco, recusa os outros interessados');
  // =========================================================================

  entrarComo(donoId, 'owner', 'Dono');
  const fdAccept = new FormData();
  fdAccept.set('bookingId', r1.bookingId!);
  fdAccept.set('decision', 'accept');
  const rAccept = await respondToBookingRequestAction(undefined, fdAccept);
  assert('dono aceita a primeira solicitacao', rAccept.ok, JSON.stringify(rAccept));

  const [aprovada] = await sql<{ status: string; responded_at: Date | null }[]>`
    SELECT status, responded_at FROM bookings WHERE id=${r1.bookingId!}`;
  expect('reserva aceita fica "approved"', aprovada!.status, 'approved');
  assert('respondedAt foi preenchido', aprovada!.responded_at !== null);

  const [outraRecusada] = await sql<{ status: string; owner_response: string | null }[]>`
    SELECT status, owner_response FROM bookings WHERE id=${r2.bookingId!}`;
  expect('a segunda solicitacao do MESMO espaco foi recusada automaticamente', outraRecusada!.status, 'rejected');
  assert('o motivo da recusa automatica fica registrado', (outraRecusada!.owner_response ?? '').includes('Outro interessado'),
    outraRecusada!.owner_response ?? '');

  const [notifAceite] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE user_id=${outroId} AND type='booking_approved'`;
  expect('locatario aceito recebeu notificacao', notifAceite!.n, 1);
  const [notifRecusaAuto] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE user_id=${terceiroId} AND type='booking_rejected'`;
  expect('locatario preterido recebeu notificacao de recusa', notifRecusaAuto!.n, 1);

  // --- responder de novo a mesma solicitacao (ja respondida) e recusado ---
  const rAcceptDeNovo = await respondToBookingRequestAction(undefined, fdAccept);
  assert('nao da pra responder de novo uma solicitacao ja respondida', !rAcceptDeNovo.ok, rAcceptDeNovo.message ?? '');

  const fdAcceptOutra = new FormData();
  fdAcceptOutra.set('bookingId', r2.bookingId!);
  fdAcceptOutra.set('decision', 'accept');
  const rAcceptOutra = await respondToBookingRequestAction(undefined, fdAcceptOutra);
  assert('nao da pra aceitar uma solicitacao que ja foi auto-recusada', !rAcceptOutra.ok, rAcceptOutra.message ?? '');

  // =========================================================================
  secao('4. Recusar');
  // =========================================================================

  entrarComo(outroId, 'user', 'Interessado Um');
  const fd3 = new FormData();
  fd3.set('spaceId', espacoConcorrenciaId);
  fd3.set('startDate', amanha());
  const r3 = await chamarRequestBooking(outroId, espacoConcorrenciaId, fd3);
  assert('solicitacao para o segundo espaco criada', r3.ok);

  entrarComo(donoId, 'owner', 'Dono');
  const fdReject = new FormData();
  fdReject.set('bookingId', r3.bookingId!);
  fdReject.set('decision', 'reject');
  fdReject.set('ownerResponse', 'Já combinei com outra pessoa por fora.');
  const rReject = await respondToBookingRequestAction(undefined, fdReject);
  assert('dono recusa a solicitacao', rReject.ok, JSON.stringify(rReject));

  const [recusada] = await sql<{ status: string; owner_response: string | null }[]>`
    SELECT status, owner_response FROM bookings WHERE id=${r3.bookingId!}`;
  expect('status vira "rejected"', recusada!.status, 'rejected');
  expect('motivo do proprietario foi gravado', recusada!.owner_response, 'Já combinei com outra pessoa por fora.');

  // =========================================================================
  secao('5. Concorrencia real: duas aprovacoes pro mesmo espaco ao mesmo tempo');
  // =========================================================================

  const espacoRaceId = await criarPublicado(`${tag}-race`, 18000);

  entrarComo(outroId, 'user', 'Interessado Um');
  const fdR1 = new FormData(); fdR1.set('spaceId', espacoRaceId); fdR1.set('startDate', amanha());
  const rR1 = await chamarRequestBooking(outroId, espacoRaceId, fdR1);

  entrarComo(terceiroId, 'user', 'Interessado Dois');
  const fdR2 = new FormData(); fdR2.set('spaceId', espacoRaceId); fdR2.set('startDate', amanha());
  const rR2 = await chamarRequestBooking(terceiroId, espacoRaceId, fdR2);

  assert('as duas solicitacoes concorrentes foram criadas', rR1.ok && rR2.ok);

  entrarComo(donoId, 'owner', 'Dono');
  const fdAcc1 = new FormData(); fdAcc1.set('bookingId', rR1.bookingId!); fdAcc1.set('decision', 'accept');
  const fdAcc2 = new FormData(); fdAcc2.set('bookingId', rR2.bookingId!); fdAcc2.set('decision', 'accept');

  // As DUAS chamadas disparam praticamente juntas — e a unica forma de testar
  // a trava de concorrencia de verdade, em vez de confiar que "funciona
  // porque nunca aconteceu ao mesmo tempo no teste".
  const [respostaA, respostaB] = await Promise.all([
    respondToBookingRequestAction(undefined, fdAcc1),
    respondToBookingRequestAction(undefined, fdAcc2),
  ]);
  const sucessos = [respostaA, respostaB].filter((r) => r.ok).length;
  expect('so UMA das duas aprovacoes simultaneas venceu', sucessos, 1);

  const [aprovadasNoBanco] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM bookings
    WHERE space_id=${espacoRaceId} AND status IN ('approved','awaiting_payment','active','past_due')`;
  expect('o banco tem exatamente UMA reserva ocupando o espaco', aprovadasNoBanco!.n, 1);

  // =========================================================================
  secao('6. Cancelar');
  // =========================================================================

  entrarComo(outroId, 'user', 'Interessado Um');
  const fdCancelPendente = new FormData();
  fdCancelPendente.set('bookingId', r3.bookingId!); // ja foi rejeitada acima — nao pode mais cancelar
  const rCancelJaRecusada = await cancelBookingAction(undefined, fdCancelPendente);
  assert('nao da pra cancelar uma solicitacao que ja foi recusada', !rCancelJaRecusada.ok, rCancelJaRecusada.message ?? '');

  const fd4 = new FormData();
  fd4.set('spaceId', espacoConcorrenciaId);
  fd4.set('startDate', amanha(5));
  const r4 = await chamarRequestBooking(outroId, espacoConcorrenciaId, fd4);
  assert('nova solicitacao para testar cancelamento', r4.ok);

  const fdCancel4 = new FormData();
  fdCancel4.set('bookingId', r4.bookingId!);
  fdCancel4.set('reason', 'Mudei de ideia.');
  const rCancel4 = await cancelBookingAction(undefined, fdCancel4);
  assert('locatario cancela a propria solicitacao pendente', rCancel4.ok, JSON.stringify(rCancel4));
  const [cancelada4] = await sql<{ status: string; cancelled_by: string }[]>`
    SELECT status, cancelled_by FROM bookings WHERE id=${r4.bookingId!}`;
  expect('status vira "cancelled"', cancelada4!.status, 'cancelled');
  expect('cancelledBy e o locatario', cancelada4!.cancelled_by, outroId);

  // dono NAO pode cancelar uma 'requested' (so recusar) — usamos rR1 ou rR2, o que perdeu a corrida
  const perdedora = respostaA.ok ? rR2 : rR1;
  entrarComo(donoId, 'owner', 'Dono');
  const fdCancelIndevido = new FormData();
  fdCancelIndevido.set('bookingId', perdedora.bookingId!);
  // a perdedora continua 'requested' (nao virou approved nem foi auto-rejeitada,
  // porque so tinha UMA outra solicitacao pendente pro mesmo espaco, e essa
  // era ELA MESMA disputando a corrida, nao uma terceira sobrando)
  const rCancelIndevido = await cancelBookingAction(undefined, fdCancelIndevido);
  assert('dono NAO cancela uma solicitacao ainda pendente (so recusa)', !rCancelIndevido.ok, rCancelIndevido.message ?? '');

  // dono cancela uma 'approved'
  const vencedoraId = respostaA.ok ? rR1.bookingId! : rR2.bookingId!;
  const fdCancelApproved = new FormData();
  fdCancelApproved.set('bookingId', vencedoraId);
  fdCancelApproved.set('reason', 'Espaço precisou ser retirado do mercado.');
  const rCancelApproved = await cancelBookingAction(undefined, fdCancelApproved);
  assert('dono cancela uma reserva ja aprovada', rCancelApproved.ok, JSON.stringify(rCancelApproved));

  // =========================================================================
  secao('7. Expiracao de solicitacao parada');
  // =========================================================================

  const expirarTesteId = await criarPublicado(`${tag}-expira`, 12000);

  entrarComo(terceiroId, 'user', 'Interessado Dois');
  const fdExpira = new FormData();
  fdExpira.set('spaceId', expirarTesteId);
  fdExpira.set('startDate', amanha());
  const rExpira = await chamarRequestBooking(terceiroId, expirarTesteId, fdExpira);
  assert('solicitacao criada para o teste de expiracao', rExpira.ok);

  // Empurra a data da solicitacao pra 8 dias atras — alem do prazo de 7 dias.
  await sql`UPDATE bookings SET requested_at = now() - interval '8 days' WHERE id=${rExpira.bookingId!}`;

  const { expireStaleBookingRequests } = await import('../src/lib/bookings/queries');
  const quantasExpiraram = await expireStaleBookingRequests();
  assert('a varredura encontrou a solicitacao vencida', quantasExpiraram >= 1, `${quantasExpiraram} expirada(s)`);

  const [statusExpirado] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${rExpira.bookingId!}`;
  expect('status virou "expired" de verdade no banco', statusExpirado!.status, 'expired');

  const fdAceitarExpirada = new FormData();
  fdAceitarExpirada.set('bookingId', rExpira.bookingId!);
  fdAceitarExpirada.set('decision', 'accept');
  entrarComo(donoId, 'owner', 'Dono');
  const rAceitarExpirada = await respondToBookingRequestAction(undefined, fdAceitarExpirada);
  assert('uma solicitacao expirada nao pode mais ser aceita', !rAceitarExpirada.ok, rAceitarExpirada.message ?? '');
}

async function limpar() {
  try {
    await sql`DELETE FROM bookings WHERE renter_id IN (${donoId},${outroId},${terceiroId}) OR owner_id IN (${donoId},${outroId},${terceiroId})`;
    await sql`DELETE FROM spaces WHERE owner_id = ${donoId}`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id IN (${donoId},${outroId},${terceiroId})`;
      await tx`DELETE FROM public.notifications WHERE user_id IN (${donoId},${outroId},${terceiroId})`;
      await tx`DELETE FROM auth.users WHERE id IN (${donoId},${outroId},${terceiroId})`;
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

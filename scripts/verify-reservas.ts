/**
 * Verificação do fluxo de LOCAÇÃO MENSAL por QUANTIDADE, de ponta a ponta no
 * backend: pedido → aceite com instruções de acesso → vaga ocupada → prazos →
 * encerramento. Roda as Server Actions DE VERDADE (src/lib/bookings/actions.ts)
 * contra Postgres real. Só a sessão é trocada por um dublê.
 *
 *   pnpm tsx scripts/verify-reservas.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

// Sem credencial do Asaas: a fila de efeitos no gateway (outbox) só marca e espera, em vez de
// tentar falar com um serviço que este teste não sobe (o gateway é testado em verify-payments).
delete process.env.ASAAS_API_KEY;
delete process.env.ASAAS_ENV;
delete process.env.ASAAS_WEBHOOK_TOKEN;

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { computeBookingAmounts } from '../src/lib/money';
import { addDaysToDate, brDate } from '../src/lib/time';
import { criarAnuncio, ocupadas, vagas } from './lib/fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 6, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

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

const tag = `rs-${Date.now()}`;
const donoId = crypto.randomUUID();
const renters = Array.from({ length: 5 }, () => crypto.randomUUID());
const [r1, r2, r3, r4, r5] = renters as [string, string, string, string, string];

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '' };
function entrarComo(id: string, role: Identidade['role'] = 'user') {
  identidadeAtual = { id, role, fullName: id === donoId ? 'Dono' : 'Locatario' };
}

const hoje = () => brDate(new Date());
const emDias = (n: number) => addDaysToDate(hoje(), n);

const INSTRUCOES = 'Portao azul ao lado da padaria. A vaga fica atras da pilastra da esquerda.';

async function main() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    ${sql(renters.map((id, i) => [id, `${tag}-r${i + 1}@exemplo.invalid`]))}`;
  await sql`UPDATE profiles SET role='owner', full_name=${`Dono ${tag}`} WHERE id=${donoId}`;
  for (const [i, id] of renters.entries()) {
    await sql`UPDATE profiles SET full_name=${`Locatario ${i + 1}`} WHERE id=${id}`;
  }

  const nomePublico = async (id: string) =>
    id ? ((await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id=${id}`)[0]?.public_name ?? null) : null;
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: 'teste@exemplo.invalid',
          fullName: identidadeAtual.fullName, publicName: await nomePublico(identidadeAtual.id),
          avatarPath: null, status: 'active', statusReason: null, acceptedTermsAt: new Date(),
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

  const {
    requestBookingAction, respondToBookingRequestAction, cancelBookingAction,
    endBookingAction, requestRentalEndAction, withdrawRentalEndRequestAction,
  } = await import('../src/lib/bookings/actions');
  const { getBookingForParticipant, getBookingAddressForRenter, listRenterBookings, listOwnerBookingRequests } =
    await import('../src/lib/bookings/queries');
  const { runBookingMaintenance, sendBookingNotices, sweepExpiredBookings } = await import('../src/lib/bookings/maintenance');

  /** `requestBookingAction` redireciona no sucesso (NEXT_REDIRECT): captura e devolve o id criado. */
  async function pedir(renterId: string, spaceId: string, startDate: string, mensagem?: string) {
    entrarComo(renterId);
    const fd = new FormData();
    fd.set('spaceId', spaceId);
    fd.set('startDate', startDate);
    if (mensagem) fd.set('renterMessage', mensagem);
    try {
      return await requestBookingAction(undefined, fd);
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM bookings WHERE space_id=${spaceId} AND renter_id=${renterId}
        ORDER BY requested_at DESC LIMIT 1`;
      return { ok: true, bookingId: row?.id, message: undefined as string | undefined };
    }
  }
  async function responder(bookingId: string, decision: 'accept' | 'reject', extra: Record<string, string> = {}) {
    entrarComo(donoId, 'owner');
    const fd = new FormData();
    fd.set('bookingId', bookingId);
    fd.set('decision', decision);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return respondToBookingRequestAction(undefined, fd);
  }
  async function status(bookingId: string) {
    const [r] = await sql<{ status: string; end_reason: string | null }[]>`
      SELECT status::text AS status, end_reason::text AS end_reason FROM bookings WHERE id=${bookingId}`;
    return r!;
  }
  /** Leva uma locação aceita até "ativa", como o webhook do pagamento faria. */
  async function ativar(bookingId: string) {
    await sql`UPDATE bookings SET status='active', activated_at=now() WHERE id=${bookingId}`;
  }

  const [{ renter_fee_bps: rfb }] = await sql<{ renter_fee_bps: number }[]>`
    SELECT (value #>> '{}')::int AS renter_fee_bps FROM platform_settings WHERE key='fees.renter_fee_bps'`;
  const [{ owner_fee_bps: ofb }] = await sql<{ owner_fee_bps: number }[]>`
    SELECT (value #>> '{}')::int AS owner_fee_bps FROM platform_settings WHERE key='fees.owner_fee_bps'`;
  const fees = { renterFeeBps: Number(rfb), ownerFeeBps: Number(ofb) };

  // =========================================================================
  secao('1. Solicitar: nada é cobrado, nada consome vaga, prazo de 24 h');
  // =========================================================================

  // Garagem com 2 unidades a R$ 300/mês.
  const espaco = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-a`, precoCents: 30000, quantidade: 2 });
  expect('anúncio nasce com 2 vagas livres', await vagas(sql, espaco), { livres: 2, oferecidas: 2, status: 'published' });

  const p1 = await pedir(r1, espaco, emDias(1), 'Quero guardar o carro.');
  assert('locatário 1 consegue pedir', p1.ok === true, JSON.stringify(p1));
  const b1 = p1.bookingId!;

  const esperado = computeBookingAmounts(30000, fees);
  const [l1] = await sql<{
    status: string; monthly_rent_cents: number; total_charged_cents: number; owner_payout_cents: number;
    horas: string; renter_message: string; start_date: string;
  }[]>`SELECT status::text AS status, monthly_rent_cents, total_charged_cents, owner_payout_cents,
              round(extract(epoch FROM (response_deadline_at - requested_at)) / 3600)::text AS horas,
              renter_message, start_date::text AS start_date
         FROM bookings WHERE id=${b1}`;
  expect('status inicial = requested', l1!.status, 'requested');
  expect('o prazo de resposta do proprietário é de 24 horas (gravado pelo banco)', l1!.horas, '24');
  expect('valor mensal = preço do anúncio (R$ 300,00)', l1!.monthly_rent_cents, 30000);
  expect('total = aluguel + taxa do locatário', l1!.total_charged_cents, esperado.totalChargedCents);
  expect('repasse = aluguel − taxa do proprietário (R$ 291,00 com 3%)', l1!.owner_payout_cents, esperado.ownerPayoutCents);
  expect('data de início escolhida foi gravada', l1!.start_date, emDias(1));
  expect('pedir NÃO consome vaga', await vagas(sql, espaco), { livres: 2, oferecidas: 2, status: 'published' });
  const [pgs] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM payments WHERE booking_id=${b1}`;
  expect('nenhuma cobrança foi criada no pedido', pgs!.n, 0);
  const [nd] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${donoId} AND type='booking_requested'`;
  expect('proprietário foi avisado do pedido novo', nd!.n, 1);

  // Regras do pedido.
  entrarComo(donoId, 'owner');
  const fdS = new FormData(); fdS.set('spaceId', espaco); fdS.set('startDate', emDias(1));
  const rSelf = await requestBookingAction(undefined, fdS);
  assert('dono NÃO pede o próprio espaço', !rSelf.ok, rSelf.message ?? '');
  const dup = await pedir(r1, espaco, emDias(2));
  assert('o mesmo locatário NÃO duplica o pedido pendente', !dup.ok, dup.message ?? '');
  const passado = await pedir(r2, espaco, emDias(-1));
  assert('data de início no passado é recusada', !passado.ok, passado.message ?? '');
  const longe = await pedir(r2, espaco, emDias(200));
  assert('data de início além do limite de antecedência é recusada', !longe.ok, longe.message ?? '');

  // Bloqueio do calendário: fecha dias para INICIAR locação.
  await sql`INSERT INTO space_availability_blocks (space_id, starts_on, ends_on, reason, created_by)
    VALUES (${espaco}, ${emDias(10)}, ${emDias(12)}, 'manutencao', ${donoId})`;
  const noBloqueio = await pedir(r2, espaco, emDias(11));
  assert('início dentro de um bloqueio do calendário é recusado', !noBloqueio.ok, noBloqueio.message ?? '');
  const antesDoBloqueio = await pedir(r2, espaco, emDias(9));
  assert('início ANTES de um bloqueio futuro é permitido (o bloqueio só fecha o dia de entrada)', antesDoBloqueio.ok === true, JSON.stringify(antesDoBloqueio));
  const b2 = antesDoBloqueio.bookingId!;

  // =========================================================================
  secao('2. Aceitar: instruções de acesso obrigatórias, vaga ocupada, prazo de pagamento');
  // =========================================================================

  entrarComo(r3);
  const fdI = new FormData(); fdI.set('bookingId', b1); fdI.set('decision', 'accept');
  const indevido = await respondToBookingRequestAction(undefined, fdI);
  assert('quem não é o dono do anúncio NÃO responde ao pedido', !indevido.ok, indevido.message ?? '');

  const semInstrucao = await responder(b1, 'accept');
  assert('aceitar SEM instruções de acesso é recusado', !semInstrucao.ok && /instru|texto|áudio|audio|como o locat/i.test(semInstrucao.message ?? ''), semInstrucao.message ?? '');
  const curta = await responder(b1, 'accept', { accessInstructions: 'portao' });
  assert('instruções curtas demais (menos de 10 caracteres) são recusadas', !curta.ok, curta.message ?? '');
  expect('o pedido continua pendente depois das recusas', (await status(b1)).status, 'requested');

  const aceita = await responder(b1, 'accept', { accessInstructions: INSTRUCOES, ownerResponse: 'Pode vir amanhã.' });
  assert('aceitar com instruções funciona', aceita.ok === true, JSON.stringify(aceita));
  expect('status = approved', (await status(b1)).status, 'approved');
  expect('aceitar ocupa 1 vaga: 1 de 2 livre', await vagas(sql, espaco), { livres: 1, oferecidas: 2, status: 'published' });
  const [ac] = await sql<{ horas: string; instr_em: Date | null; texto: string | null }[]>`
    SELECT round(extract(epoch FROM (first_payment_deadline_at - now())) / 3600)::text AS horas,
           access_instructions_at AS instr_em, access_instructions AS texto
      FROM bookings WHERE id=${b1}`;
  expect('o prazo para PAGAR é de 24 horas a partir do aceite (banco)', ac!.horas, '24');
  assert('as instruções foram gravadas com data', ac!.instr_em != null && ac!.texto === INSTRUCOES);
  const [nr] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${r1} AND type='booking_approved'`;
  expect('locatário foi avisado do aceite', nr!.n, 1);
  const [msg] = await sql<{ n: number; corpo: string | null }[]>`
    SELECT count(*)::int AS n, max(m.body) AS corpo FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
     WHERE c.space_id=${espaco} AND c.renter_id=${r1} AND m.is_system`;
  assert('o aceite abriu a conversa com uma mensagem do sistema', msg!.n >= 1);
  assert('as instruções NÃO vão para o chat antes do pagamento', !(msg!.corpo ?? '').includes('pilastra'), msg!.corpo ?? '');

  // Privacidade: instruções e endereço exato só depois de pago.
  const verRenter = await getBookingForParticipant(b1, r1);
  expect('locatário NÃO vê as instruções antes de pagar', [verRenter?.accessInstructions, verRenter?.accessProvided], [null, true]);
  const verDono = await getBookingForParticipant(b1, donoId);
  expect('o proprietário vê o que escreveu', verDono?.accessInstructions, INSTRUCOES);
  expect('endereço exato fechado antes do pagamento', await getBookingAddressForRenter(b1, r1), null);
  const estranho = await getBookingForParticipant(b1, r5);
  expect('quem não participa da locação não lê nada dela', estranho, null);

  await ativar(b1);
  const verRenter2 = await getBookingForParticipant(b1, r1);
  expect('depois de paga (ativa), o locatário vê as instruções', verRenter2?.accessInstructions, INSTRUCOES);
  const end = await getBookingAddressForRenter(b1, r1);
  assert('depois de paga, o endereço exato e as coordenadas ficam disponíveis (Traçar rota)', end?.street === 'Rua Exata' && end?.lat != null && end?.lng != null, JSON.stringify(end));

  // =========================================================================
  secao('3. Última vaga: lotou → demais pedidos recusados; sem vaga, ninguém pede');
  // =========================================================================

  const p3 = await pedir(r3, espaco, emDias(1));
  const p4 = await pedir(r4, espaco, emDias(1));
  assert('há 3 pedidos pendentes (r2, r3, r4) disputando 1 vaga', p3.ok === true && p4.ok === true);
  const aceitaB2 = await responder(b2, 'accept', { accessInstructions: INSTRUCOES });
  assert('aceitar o pedido que preenche a última vaga funciona', aceitaB2.ok === true, JSON.stringify(aceitaB2));
  expect('anúncio lotado passa a "rented" com 0 vagas', await vagas(sql, espaco), { livres: 0, oferecidas: 2, status: 'rented' });
  expect('os outros pedidos pendentes foram recusados',
    [(await status(p3.bookingId!)).status, (await status(p4.bookingId!)).status], ['rejected', 'rejected']);
  const [np] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${r3} AND type='booking_rejected'`;
  expect('quem perdeu a vez foi avisado', np!.n, 1);
  const lotado = await pedir(r5, espaco, emDias(1));
  assert('com o anúncio lotado, novo pedido é recusado', !lotado.ok && /vaga/i.test(lotado.message ?? ''), lotado.message ?? '');
  expect('contagem real = 2 ocupadas', await ocupadas(sql, espaco), 2);

  // =========================================================================
  secao('4. Concorrência: três aceites ao mesmo tempo para a ÚLTIMA vaga');
  // =========================================================================

  const disputa = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-disputa`, precoCents: 25000, quantidade: 1 });
  const ps = [r1, r2, r3].map((r) => pedir(r, disputa, emDias(1)));
  const pedidos = (await Promise.all(ps)).map((p) => p.bookingId!);
  assert('três pedidos pendentes para 1 vaga', pedidos.every(Boolean));
  const resultados = await Promise.all(pedidos.map((id) => responder(id, 'accept', { accessInstructions: INSTRUCOES })));
  const aprovados = (await Promise.all(pedidos.map((id) => status(id)))).filter((s) => s.status === 'approved').length;
  expect('EXATAMENTE um aceite passa', aprovados, 1);
  expect('os outros dois recebem recusa amigável (ou já foram recusados)', resultados.filter((r) => !r.ok).length, 2);
  expect('nunca passa de 1 locação ocupando a vaga única', await ocupadas(sql, disputa), 1);
  expect('o banco fecha o anúncio', await vagas(sql, disputa), { livres: 0, oferecidas: 1, status: 'rented' });

  // Direto no banco (sem a aplicação): duas transações aprovando ao mesmo tempo.
  const disputa2 = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-disputa2`, precoCents: 25000, quantidade: 1 });
  const bruto: string[] = [];
  for (const r of [r1, r2]) {
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date, monthly_rent_cents,
        renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents, total_charged_cents, owner_payout_cents)
      VALUES (${`MP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`}, ${disputa2}, ${r}, ${donoId}, 'requested', ${emDias(1)},
        25000, 300, 300, 750, 750, 25750, 24250)
      RETURNING id`;
    bruto.push(b!.id);
  }
  const tentativas = await Promise.allSettled(bruto.map((id) => sql.begin(async (tx) => {
    await tx`SELECT pg_sleep(0.05)`;
    await tx`UPDATE bookings SET status='approved', access_instructions=${INSTRUCOES} WHERE id=${id}`;
  })));
  expect('duas transações aprovando a mesma última vaga: uma passa e uma falha',
    tentativas.map((t) => t.status).sort(), ['fulfilled', 'rejected']);
  const falhou = tentativas.find((t) => t.status === 'rejected') as PromiseRejectedResult | undefined;
  expect('quem falha recebe o erro `bookings_capacity` do banco',
    (falhou?.reason as { constraint_name?: string })?.constraint_name, 'bookings_capacity');
  expect('o banco manteve 1 ocupada', await ocupadas(sql, disputa2), 1);

  // =========================================================================
  secao('5. Prazos: pedido sem resposta, aceite sem pagamento, janela de 2 horas');
  // =========================================================================

  const prazos = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-prazos`, precoCents: 20000, quantidade: 1 });

  // 5a. Pedido vencido: não dá para aceitar, expira.
  const pv = (await pedir(r1, prazos, emDias(1))).bookingId!;
  await sql`UPDATE bookings SET response_deadline_at = now() - interval '1 minute' WHERE id=${pv}`;
  const tardio = await responder(pv, 'accept', { accessInstructions: INSTRUCOES });
  assert('depois das 24 h o proprietário não consegue mais aceitar', !tardio.ok && /prazo|expir/i.test(tardio.message ?? ''), tardio.message ?? '');
  expect('o pedido vencido expirou, com o motivo registrado', await status(pv), { status: 'expired', end_reason: 'request_not_answered' });
  expect('pedido expirado não ocupou vaga', await ocupadas(sql, prazos), 0);
  await sendBookingNotices();
  const [ne] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE type='booking_expired' AND data->>'bookingId'=${pv}`;
  expect('os dois lados foram avisados da expiração', ne!.n, 2);

  // 5b. Pedido perto de vencer: lembrete ao proprietário (uma vez só).
  const pp = (await pedir(r2, prazos, emDias(1))).bookingId!;
  await sql`UPDATE bookings SET response_deadline_at = now() + interval '2 hours' WHERE id=${pp}`;
  await sendBookingNotices();
  await sendBookingNotices();
  const [lem] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE type='booking_request_expiring' AND data->>'bookingId'=${pp}`;
  expect('lembrete "perto de expirar" sai uma vez só', lem!.n, 1);

  // 5c. Aceite que não foi pago em 24 h: expira, a vaga volta, a cobrança aberta é marcada para exclusão.
  const okAceite = await responder(pp, 'accept', { accessInstructions: INSTRUCOES });
  assert('aceite normal', okAceite.ok === true, JSON.stringify(okAceite));
  expect('vaga única ocupada pelo aceite', await vagas(sql, prazos), { livres: 0, oferecidas: 1, status: 'rented' });
  const [sub] = await sql<{ id: string }[]>`
    INSERT INTO subscriptions (booking_id, provider_subscription_id, status, method, amount_cents, billing_day, next_due_date)
    VALUES (${pp}, ${`sub_${tag}`}, 'pending_authorization', 'pix', 20600, 5, CURRENT_DATE) RETURNING id`;
  await sql`INSERT INTO payments (booking_id, subscription_id, provider_payment_id, status, method, amount_cents, due_date)
    VALUES (${pp}, ${sub!.id}, ${`pay_${tag}`}, 'pending', 'pix', 20600, CURRENT_DATE)`;
  await sql`UPDATE bookings SET status='awaiting_payment' WHERE id=${pp}`;
  await sql`UPDATE bookings SET first_payment_deadline_at = now() - interval '1 minute' WHERE id=${pp}`;
  const antes = await sweepExpiredBookings();
  assert('a varredura encerrou o que venceu', antes >= 1, `encerradas: ${antes}`);
  expect('aceite sem pagamento em 24 h = expirado', await status(pp), { status: 'expired', end_reason: 'payment_not_received' });
  expect('a vaga voltou e o anúncio voltou ao ar', await vagas(sql, prazos), { livres: 1, oferecidas: 1, status: 'published' });
  const [marcas] = await sql<{ sub: string; del: Date | null }[]>`
    SELECT (SELECT status::text FROM subscriptions WHERE id=${sub!.id}) AS sub,
           (SELECT delete_requested_at FROM payments WHERE provider_payment_id=${`pay_${tag}`}) AS del`;
  assert('recorrência cancelada e cobrança em aberto marcada para exclusão no gateway', marcas!.sub === 'cancelled' && marcas!.del != null, JSON.stringify(marcas));

  // 5d. Janela de 2 h do pagamento pendente.
  const pj = (await pedir(r3, prazos, emDias(1))).bookingId!;
  await responder(pj, 'accept', { accessInstructions: INSTRUCOES });
  await ativar(pj);
  await sql`UPDATE bookings SET status='past_due', payment_issue_started_at = now(),
              payment_issue_deadline_at = now() + interval '120 minutes' WHERE id=${pj}`;
  expect('janela de 120 minutos aceita; a vaga segue ocupada', [(await status(pj)).status, await ocupadas(sql, prazos)], ['past_due', 1]);
  const janela100 = await sql`UPDATE bookings SET payment_issue_started_at = now(),
              payment_issue_deadline_at = now() + interval '100 minutes' WHERE id=${pj}`.then(() => 'aceitou', (e) => (e as { constraint_name?: string }).constraint_name);
  expect('o banco recusa uma janela que não seja EXATAMENTE de 2 horas', janela100, 'bookings_payment_window');
  await sweepExpiredBookings();
  expect('dentro da janela, nada é encerrado', (await status(pj)).status, 'past_due');
  await sql`UPDATE bookings SET payment_issue_started_at = now() - interval '121 minutes',
              payment_issue_deadline_at = now() - interval '1 minute' WHERE id=${pj}`;
  await sweepExpiredBookings();
  expect('passou das 2 horas sem pagar: locação encerrada por falta de pagamento', await status(pj), { status: 'ended', end_reason: 'payment_not_received' });
  expect('a vaga voltou', await vagas(sql, prazos), { livres: 1, oferecidas: 1, status: 'published' });

  // =========================================================================
  secao('6. Encerramento: o locatário encerra na hora; o proprietário PEDE com data');
  // =========================================================================

  const enc = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-enc`, precoCents: 18000, quantidade: 2 });
  const e1 = (await pedir(r1, enc, emDias(1))).bookingId!;
  const e2 = (await pedir(r2, enc, emDias(1))).bookingId!;
  await responder(e1, 'accept', { accessInstructions: INSTRUCOES });
  await responder(e2, 'accept', { accessInstructions: INSTRUCOES });
  expect('2 de 2 vagas ocupadas', await vagas(sql, enc), { livres: 0, oferecidas: 2, status: 'rented' });

  // O proprietário não encerra por endBookingAction; só pede.
  entrarComo(donoId, 'owner');
  const fdE = new FormData(); fdE.set('bookingId', e1);
  await ativar(e1); await ativar(e2);
  const donoEncerra = await endBookingAction(undefined, fdE);
  assert('o proprietário NÃO encerra na hora (só pede o encerramento)', !donoEncerra.ok, donoEncerra.message ?? '');

  async function pedirEncerramento(id: string, data: string, motivo?: string) {
    entrarComo(donoId, 'owner');
    const fd = new FormData(); fd.set('bookingId', id); fd.set('endDate', data);
    if (motivo) fd.set('reason', motivo);
    return requestRentalEndAction(undefined, fd);
  }
  const pe = await pedirEncerramento(e1, emDias(20), 'Vou usar o espaço.');
  assert('pedido de encerramento com data registrado', pe.ok === true, JSON.stringify(pe));
  const det = await getBookingForParticipant(e1, r1);
  expect('o locatário vê o pedido (data e motivo)', [det?.pendingEndDate, det?.pendingEndReason], [emDias(20), 'Vou usar o espaço.']);
  const [ne2] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${r1} AND type='rental_end_requested'`;
  expect('o locatário foi avisado', ne2!.n, 1);
  const pe2 = await pedirEncerramento(e1, emDias(25));
  assert('só pode haver UM pedido pendente por locação', !pe2.ok, pe2.message ?? '');
  expect('a locação segue ativa até a data', (await status(e1)).status, 'active');
  const naoDono = await (async () => { entrarComo(r1); const fd = new FormData(); fd.set('bookingId', e1); fd.set('endDate', emDias(30)); return requestRentalEndAction(undefined, fd); })();
  assert('o locatário NÃO pede encerramento como se fosse o proprietário', !naoDono.ok, naoDono.message ?? '');
  const passadoEnd = await pedirEncerramento(e2, emDias(-2));
  assert('data de encerramento no passado é recusada', !passadoEnd.ok, passadoEnd.message ?? '');

  // Retirar o pedido.
  entrarComo(donoId, 'owner');
  const fdW = new FormData(); fdW.set('bookingId', e1);
  const ret = await withdrawRentalEndRequestAction(undefined, fdW);
  assert('o proprietário retira o pedido', ret.ok === true, JSON.stringify(ret));
  const [hist] = await sql<{ st: string }[]>`SELECT status::text AS st FROM booking_end_requests WHERE booking_id=${e1}`;
  expect('o pedido retirado fica no histórico', hist!.st, 'withdrawn');

  // Novo pedido, agora para HOJE: a manutenção encerra, devolve a vaga e cancela a recorrência.
  const [subE] = await sql<{ id: string }[]>`
    INSERT INTO subscriptions (booking_id, provider_subscription_id, status, method, amount_cents, billing_day, next_due_date)
    VALUES (${e1}, ${`sub_enc_${tag}`}, 'active', 'credit_card', 18540, 5, CURRENT_DATE + 20) RETURNING id`;
  const pe3 = await pedirEncerramento(e1, hoje());
  assert('pedido para hoje (sem aviso mínimo configurado)', pe3.ok === true, JSON.stringify(pe3));
  const resumo = await runBookingMaintenance();
  assert('a manutenção encerrou a locação pedida', resumo.released >= 1, JSON.stringify(resumo));
  expect('locação encerrada a pedido do proprietário', await status(e1), { status: 'ended', end_reason: 'owner_end_request' });
  expect('a vaga voltou (1 de 2 livre) e o anúncio voltou ao ar', await vagas(sql, enc), { livres: 1, oferecidas: 2, status: 'published' });
  const [subRes] = await sql<{ st: string }[]>`SELECT status::text AS st FROM subscriptions WHERE id=${subE!.id}`;
  expect('a cobrança automática foi cancelada', subRes!.st, 'cancelled');
  const [cumprido] = await sql<{ st: string }[]>`SELECT status::text AS st FROM booking_end_requests WHERE booking_id=${e1} AND requested_end_date=${hoje()}`;
  expect('o pedido foi marcado como cumprido', cumprido!.st, 'completed');
  const [av] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE type='review_available' AND data->>'bookingId'=${e1}`;
  expect('os dois lados já podem avaliar (aviso enviado)', av!.n, 2);

  // O locatário encerra na hora.
  entrarComo(r2);
  const fdR = new FormData(); fdR.set('bookingId', e2); fdR.set('reason', 'Mudei de cidade.');
  const rEnd = await endBookingAction(undefined, fdR);
  assert('o locatário encerra a própria locação na hora', rEnd.ok === true, JSON.stringify(rEnd));
  expect('encerrada por quem alugava', await status(e2), { status: 'ended', end_reason: 'cancelled_by_renter' });
  expect('as duas vagas estão livres de novo', await vagas(sql, enc), { livres: 2, oferecidas: 2, status: 'published' });

  // =========================================================================
  secao('7. Cancelar antes de pagar, recusar, preço congelado no aceite');
  // =========================================================================

  const canc = await criarAnuncio(sql, { ownerId: donoId, slug: `${tag}-canc`, precoCents: 40000, quantidade: 1 });
  const c1 = (await pedir(r1, canc, emDias(1))).bookingId!;
  entrarComo(r1);
  const fdC = new FormData(); fdC.set('bookingId', c1);
  const cancela = await cancelBookingAction(undefined, fdC);
  assert('o locatário cancela um pedido pendente', cancela.ok === true, JSON.stringify(cancela));
  expect('cancelado', (await status(c1)).status, 'cancelled');

  const c2 = (await pedir(r2, canc, emDias(1))).bookingId!;
  const recusa = await responder(c2, 'reject', { ownerResponse: 'Não vai dar.' });
  assert('o proprietário recusa', recusa.ok === true, JSON.stringify(recusa));
  expect('recusado', (await status(c2)).status, 'rejected');
  expect('recusar não mexe nas vagas', await vagas(sql, canc), { livres: 1, oferecidas: 1, status: 'published' });

  // O preço vale o vigente NO ACEITE e fica congelado.
  const c3 = (await pedir(r3, canc, emDias(1))).bookingId!;
  await sql`UPDATE spaces SET price_monthly_cents = 45000 WHERE id=${canc}`;
  await responder(c3, 'accept', { accessInstructions: INSTRUCOES });
  const [cong] = await sql<{ monthly_rent_cents: number; total: number }[]>`
    SELECT monthly_rent_cents, total_charged_cents AS total FROM bookings WHERE id=${c3}`;
  expect('o aceite congela o preço vigente (R$ 450,00)', cong!.monthly_rent_cents, 45000);
  expect('total do aceite = conta do servidor', cong!.total, computeBookingAmounts(45000, fees).totalChargedCents);
  await sql`UPDATE spaces SET price_monthly_cents = 50000 WHERE id=${canc}`;
  const [cong2] = await sql<{ monthly_rent_cents: number }[]>`SELECT monthly_rent_cents FROM bookings WHERE id=${c3}`;
  expect('mudar o preço depois NÃO altera a locação já aceita', cong2!.monthly_rent_cents, 45000);
  // O banco confere o valor no aceite: um pedido novo, com vaga livre, aprovado com valor adulterado.
  const adulteravel = (await pedir(r4, enc, emDias(1))).bookingId!;
  const adulterar = await sql`UPDATE bookings SET status='approved', monthly_rent_cents=1, access_instructions=${INSTRUCOES}
    WHERE id=${adulteravel}`.then(() => 'passou', (e) => (e as { constraint_name?: string }).constraint_name);
  expect('o banco não aceita aprovar com valor diferente do preço do anúncio', adulterar, 'bookings_rent_matches_space');
  expect('e o pedido adulterado continua pendente', (await status(adulteravel)).status, 'requested');

  // =========================================================================
  secao('8. Listas e leituras');
  // =========================================================================

  const minhas = await listRenterBookings(r1);
  assert('"Meus aluguéis" lista as locações do locatário', minhas.length >= 4, `${minhas.length} locações`);
  const naLista = minhas.find((m) => m.id === b1);
  expect('a lista traz o status de pagamento e a vaga ocupada', [naLista?.status, naLista?.spaceTitle != null], ['active', true]);
  const doDono = await listOwnerBookingRequests(donoId);
  assert('o proprietário vê as solicitações dos anúncios dele', doDono.length >= 8, `${doDono.length}`);
  const outraConta = await listOwnerBookingRequests(r5);
  expect('quem não é proprietário não vê solicitação alheia', outraConta.length, 0);

  console.log(`\n${passed} verificações passaram, ${failed} falharam.`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(` - ${f}`);
  }
}

main()
  .catch((err) => {
    console.error('\nErro inesperado:', err);
    failed++;
  })
  .finally(async () => {
    await sql.end({ timeout: 2 }).catch(() => {});
    process.exit(failed > 0 ? 1 : 0);
  });

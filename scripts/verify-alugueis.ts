/**
 * Verificação da Parte 12 — unidades, aluguel por tempo, aluguel contínuo e
 * pagamento pendente — pelo código DE VERDADE do app (actions, webhook,
 * manutenção pelo relógio), contra Postgres real e o dublê HTTP do Asaas
 * (scripts/testbed/server.ts).
 *
 * O que já é regra do banco (CHECK, exclusão por unidade, gatilhos) é
 * provado em scripts/verify-schema.ts §16. Aqui o foco é o caminho que a
 * pessoa percorre: reservar, pagar, renovar, ser avisada, falhar a cobrança,
 * regularizar, ser encerrada — e o que acontece no gateway em cada passo.
 *
 * "Viajar no tempo": para ver um prazo vencer sem esperar, as datas de uma
 * reserva são deslocadas para o passado numa transação com o gatilho de
 * forma desligado (só o horário muda; o resto das regras continua valendo).
 *
 * O que isto NÃO prova: que o Asaas real se comporta como o dublê. A
 * sequência de eventos usada (Pix: CREATED → RECEIVED; cartão: CREATED →
 * CONFIRMED → RECEIVED; recusa: PAYMENT_CREDIT_CARD_CAPTURE_REFUSED) segue a
 * documentação pública do Asaas ("Eventos para cobranças").
 *
 *   pnpm tsx scripts/verify-alugueis.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { computeBookingAmounts, formatBRL } from '../src/lib/money';
import {
  checkTemporaryRequest,
  paymentWindowState,
  priceHeadline,
  temporaryDurationOptions,
  temporaryPhase,
  temporaryRentCents,
  type GroupRules,
  type RentalTimeUnit,
} from '../src/lib/rentals/pricing';
import { addDaysToDate, brDate, brInstant, brTime } from '../src/lib/rentals/time';
import { startTestbed, type Testbed } from './testbed/server';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida.');
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
  else bad(name, detalhe || 'condição falsa');
}
function secao(titulo: string) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

function gerarCpfValido(): string {
  const nove = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (digs: number[], pesos: number[]) => {
    const resto = digs.reduce((acc, d, i) => acc + d * pesos[i]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = dv(nove, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = dv([...nove, dv1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...nove, dv1, dv2].join('');
}

// ---------------------------------------------------------------------------
// Identidade: a action pergunta "quem é" ao DAL. Cada chamada roda com a sua
// (AsyncLocalStorage) — dá para duas pessoas reservarem AO MESMO TEMPO.
// ---------------------------------------------------------------------------

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string; email: string };
const sessao = new AsyncLocalStorage<Identidade>();
const como = <T>(quem: Identidade, fn: () => Promise<T>) => sessao.run(quem, fn);

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** `redirect()` lança NEXT_REDIRECT; o destino vai no `digest`. */
async function chamar<T>(fn: () => Promise<T>): Promise<{ redirect: string | null; result: T | null }> {
  try {
    return { redirect: null, result: await fn() };
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? '';
    if (!digest.startsWith('NEXT_REDIRECT')) throw err;
    return { redirect: digest.split(';')[2] ?? '', result: null };
  }
}
const idDaReserva = (destino: string | null) => /\/reservas\/([0-9a-f-]{36})\//.exec(destino ?? '')?.[1] ?? null;

const tag = `alg-${Date.now()}`;
const PONTO = { lat: -10.18, lng: -48.33 }; // longe de toda outra semente
const dono: Identidade = { id: crypto.randomUUID(), role: 'owner', fullName: 'Dona Parte Doze', email: `${tag}-dono@exemplo.invalid` };
const donoSemConta: Identidade = { id: crypto.randomUUID(), role: 'owner', fullName: 'Dono Sem Conta', email: `${tag}-dono2@exemplo.invalid` };
const locA: Identidade = { id: crypto.randomUUID(), role: 'user', fullName: 'Ana Locatária', email: `${tag}-a@exemplo.invalid` };
const locB: Identidade = { id: crypto.randomUUID(), role: 'user', fullName: 'Bruno Locatário', email: `${tag}-b@exemplo.invalid` };
const locC: Identidade = { id: crypto.randomUUID(), role: 'user', fullName: 'Carla Locatária', email: `${tag}-c@exemplo.invalid` };
const cpf = { [locA.id]: gerarCpfValido(), [locB.id]: gerarCpfValido(), [locC.id]: gerarCpfValido() };
const espacosCriados: string[] = [];

let testbed: Testbed;

// ---------------------------------------------------------------------------
// Anúncios com grupos e unidades (como a etapa "Como alugar" grava)
// ---------------------------------------------------------------------------

const REGRA_BASE: GroupRules = {
  allowsContinuous: false, allowsTemporary: false, monthlyPriceCents: null,
  tempPricingMode: null, tempUnit: null, tempPriceCents: null, tempMaxUnits: null,
  tempAllowFraction: false, tempPackages: null, renewalAllowed: true,
  hoursMode: 'always', opensAt: null, closesAt: null,
};
type GrupoSemente = { nome: string; regras: GroupRules; unidades: string[] };
type Anuncio = { id: string; grupos: { id: string; unidades: string[] }[] };

async function inserirGrupo(spaceId: string, g: GrupoSemente, posicao: number) {
  const r = g.regras;
  const [grupo] = await sql<{ id: string }[]>`
    INSERT INTO space_unit_groups (space_id, name, position, allows_continuous, allows_temporary, monthly_price_cents,
      temp_pricing_mode, temp_unit, temp_price_cents, temp_max_units, temp_allow_fraction, temp_packages,
      renewal_allowed, hours_mode, opens_at, closes_at)
    VALUES (${spaceId}, ${g.nome}, ${posicao}, ${r.allowsContinuous}, ${r.allowsTemporary}, ${r.monthlyPriceCents},
      ${r.tempPricingMode}::temporary_pricing_mode, ${r.tempUnit}::rental_time_unit, ${r.tempPriceCents}, ${r.tempMaxUnits},
      ${r.tempAllowFraction}, ${r.tempPackages ? sql.json(r.tempPackages) : null},
      ${r.renewalAllowed}, ${r.hoursMode}::operating_hours_mode, ${r.opensAt}::time, ${r.closesAt}::time)
    RETURNING id`;
  const unidades: string[] = [];
  for (const [i, rotulo] of g.unidades.entries()) {
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO space_units (space_id, group_id, label, position)
      VALUES (${spaceId}, ${grupo!.id}, ${rotulo}, ${i + 1}) RETURNING id`;
    unidades.push(u!.id);
  }
  return { id: grupo!.id, unidades };
}

async function criarAnuncio(owner: Identidade, tipo: string, titulo: string, grupos: GrupoSemente[], publicar = true): Promise<Anuncio> {
  const slug = `${tag}-${espacosCriados.length + 1}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, size_m2, draft_step, location, approx_location)
    VALUES (${owner.id}, ${slug}, ${tipo}::space_type, ${titulo},
      'Descrição com mais de vinte caracteres para passar na regra do banco.',
      'Centro', 'Cidade de teste da Parte 12', 'TO', CURRENT_DATE, 40, 8,
      ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326),
      ST_SetSRID(ST_MakePoint(${PONTO.lng}, ${PONTO.lat}), 4326))
    RETURNING id`;
  const id = row!.id;
  espacosCriados.push(id);
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${id}, ${`${owner.id}/${id}/f${n}.jpg`}, ${n})`;
  }
  const criados = [];
  for (const [i, g] of grupos.entries()) criados.push(await inserirGrupo(id, g, i));
  if (publicar) await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return { id, grupos: criados };
}

/** Desloca TODOS os horários da reserva `minutos` para trás (gatilho de forma desligado só nesta transação). */
async function voltarNoTempo(bookingId: string, minutos: number) {
  await sql.begin(async (tx) => {
    await tx`ALTER TABLE bookings DISABLE TRIGGER bookings_derive_rental_shape`;
    await tx`
      UPDATE bookings SET
        starts_at = starts_at - make_interval(mins => ${minutos}),
        ends_at = ends_at - make_interval(mins => ${minutos}),
        occupied_until = occupied_until - make_interval(mins => ${minutos}),
        hold_expires_at = hold_expires_at - make_interval(mins => ${minutos}),
        payment_issue_started_at = payment_issue_started_at - make_interval(mins => ${minutos}),
        payment_issue_deadline_at = payment_issue_deadline_at - make_interval(mins => ${minutos})
      WHERE id = ${bookingId}`;
    await tx`ALTER TABLE bookings ENABLE TRIGGER bookings_derive_rental_shape`;
  });
}

async function reserva(id: string) {
  const [r] = await sql<{
    status: string; kind: string; unit_id: string | null; group_id: string | null; starts_at: Date | null; ends_at: Date | null;
    occupied_until: Date | null; hold_expires_at: Date | null; monthly_rent_cents: number; total_charged_cents: number;
    owner_payout_cents: number; end_reason: string | null; renewed_from_id: string | null; reference: string;
    payment_issue_started_at: Date | null; payment_issue_deadline_at: Date | null; activated_at: Date | null;
  }[]>`SELECT status::text, kind::text, unit_id, group_id, starts_at, ends_at, occupied_until, hold_expires_at,
         monthly_rent_cents, total_charged_cents, owner_payout_cents, end_reason::text, renewed_from_id, reference,
         payment_issue_started_at, payment_issue_deadline_at, activated_at
       FROM bookings WHERE id = ${id}`;
  return r!;
}

async function cobrancaDa(bookingId: string) {
  const [p] = await sql<{
    id: string; provider_payment_id: string; status: string; method: string; amount_cents: number;
    pix_payload: string | null; pix_qr_image: string | null; delete_requested_at: Date | null;
    provider_deleted_at: Date | null; refund_requested_at: Date | null; subscription_id: string | null;
  }[]>`SELECT id, provider_payment_id, status::text, method::text, amount_cents, pix_payload, pix_qr_image,
         delete_requested_at, provider_deleted_at, refund_requested_at, subscription_id
       FROM payments WHERE booking_id = ${bookingId} ORDER BY created_at DESC LIMIT 1`;
  return p ?? null;
}

const contarNotificacoes = async (userId: string, title: string) =>
  (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE user_id=${userId} AND title=${title}`)[0]!.n;

const chamadasAoGateway = (metodo: string, trecho: string) =>
  testbed.log.filter((l) => l.method === metodo && l.url.includes(trecho)).length;

// ---------------------------------------------------------------------------

async function main() {
  secao('0. Ambiente');
  testbed = await startTestbed();
  process.env.ASAAS_API_BASE_URL = `${testbed.url}/v3`;
  process.env.ASAAS_API_KEY = testbed.asaasApiKey;
  process.env.ASAAS_ENV = 'sandbox';
  process.env.ASAAS_WEBHOOK_TOKEN = `token-${tag}`;
  ok('dublê do Asaas no ar', testbed.url);

  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        const quem = sessao.getStore();
        if (!quem) throw new Error('Você precisa entrar para continuar.');
        return { ...quem, publicName: null, avatarPath: null, status: 'active', statusReason: null, acceptedTermsAt: new Date() };
      },
      getCurrentUser: async () => null,
    },
  } as never;
  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { revalidatePath: () => {}, revalidateTag: () => {} } } as never;
  const headersPath = req.resolve('next/headers');
  req.cache[headersPath] = { id: headersPath, filename: headersPath, loaded: true, exports: { headers: async () => new Headers() } } as never;

  const asaas = await import('../src/lib/payments/asaas');
  const { processAsaasWebhook: webhookReal } = await import('../src/lib/payments/webhook');
  const { reserveTemporaryAction, renewTemporaryAction, choosePaymentMethodAction } = await import('../src/lib/rentals/actions');
  const { requestBookingAction, respondToBookingRequestAction, endBookingAction, cancelBookingAction } = await import('../src/lib/bookings/actions');
  const { startCheckoutAction } = await import('../src/lib/payments/actions');
  const { processPaymentOutbox, sendRentalNotices, sweepExpiredRentals } = await import('../src/lib/rentals/maintenance');
  const { listRenterPaymentIssues, getSpaceUnitGroups } = await import('../src/lib/rentals/queries');
  const { listRenterBookings } = await import('../src/lib/bookings/queries');

  /*
   * Um evento do Asaas relata o estado que a cobrança JÁ tem lá. O dublê
   * passa a ter o mesmo estado — senão recusaria, como o Asaas real recusa,
   * estornar uma cobrança que para ele continua "pendente".
   */
  const ESTADO_NO_GATEWAY: Record<string, string> = {
    PAYMENT_CONFIRMED: 'CONFIRMED', PAYMENT_RECEIVED: 'RECEIVED', PAYMENT_OVERDUE: 'OVERDUE', PAYMENT_REFUNDED: 'REFUNDED',
  };
  const webhook: typeof webhookReal = async (evento) => {
    const e = evento as { event?: string; payment?: { id?: string } };
    const atual = e.payment?.id ? testbed.asaasPayments.get(e.payment.id) : undefined;
    const novo = e.event ? ESTADO_NO_GATEWAY[e.event] : undefined;
    if (atual && novo) testbed.asaasPayments.set(atual.id, { ...atual, status: novo });
    return webhookReal(evento);
  };

  // ---- sementes ----
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${dono.id}, ${dono.email}), (${donoSemConta.id}, ${donoSemConta.email}),
    (${locA.id}, ${locA.email}), (${locB.id}, ${locB.email}), (${locC.id}, ${locC.email})`;
  for (const p of [dono, donoSemConta, locA, locB, locC]) {
    await sql`UPDATE profiles SET role=${p.role}::user_role, full_name=${p.fullName} WHERE id=${p.id}`;
  }
  const subconta = await asaas.createSubaccount({
    name: dono.fullName, email: dono.email, cpfCnpj: gerarCpfValido(), mobilePhone: '27999990000', incomeValue: 5000,
    birthDate: '1990-01-01', address: 'Rua Teste', addressNumber: '1', province: 'Centro', postalCode: '29700000',
  });
  await sql`INSERT INTO owner_payout_accounts (owner_id, provider, provider_wallet_id, status, can_receive)
            VALUES (${dono.id}, 'asaas', ${subconta.walletId}, 'approved', true)`;

  const fees = await sql<{ r: number; o: number }[]>`
    SELECT (SELECT (value #>> '{}')::int FROM platform_settings WHERE key='fees.renter_fee_bps') AS r,
           (SELECT (value #>> '{}')::int FROM platform_settings WHERE key='fees.owner_fee_bps') AS o`;
  const taxas = { renterFeeBps: Number(fees[0]!.r ?? 300), ownerFeeBps: Number(fees[0]!.o ?? 300) };

  const porHora = (precoCents: number, max: number, extra: Partial<GroupRules> = {}): GroupRules => ({
    ...REGRA_BASE, allowsTemporary: true, tempPricingMode: 'per_period', tempUnit: 'hour',
    tempPriceCents: precoCents, tempMaxUnits: max, ...extra,
  });
  // A: estacionamento, 2 vagas por hora (R$ 20/h, até 5 h, renova)
  const A = await criarAnuncio(dono, 'estacionamento', 'Estacionamento Central da Parte 12', [
    { nome: 'Vagas por hora', regras: porHora(2000, 5), unidades: ['Vaga 1', 'Vaga 2'] },
  ]);
  // B: garagem com UMA vaga (concorrência)
  const B = await criarAnuncio(dono, 'garagem', 'Garagem de uma vaga da Parte 12', [
    { nome: 'Padrão', regras: porHora(2000, 5), unidades: ['Vaga 1'] },
  ]);
  // C: sala com horário de funcionamento 07:00–21:00, sem renovação
  const C = await criarAnuncio(dono, 'sala', 'Sala de reunião da Parte 12', [
    { nome: 'Padrão', regras: porHora(5000, 8, { hoursMode: 'daily', opensAt: '07:00', closesAt: '21:00', renewalAllowed: false }), unidades: ['Sala 1'] },
  ]);
  // D: depósito mensal R$ 300, 2 boxes
  const D = await criarAnuncio(dono, 'deposito', 'Box mensal da Parte 12', [
    { nome: 'Padrão', regras: { ...REGRA_BASE, allowsContinuous: true, monthlyPriceCents: 30000 }, unidades: ['Box 1', 'Box 2'] },
  ]);
  // F: dono sem conta de recebimento
  const F = await criarAnuncio(donoSemConta, 'garagem', 'Garagem de dono sem recebimento', [
    { nome: 'Padrão', regras: porHora(2000, 5), unidades: ['Vaga 1'] },
  ]);
  ok('sementes', 'dono com conta de recebimento no dublê, 3 locatários, 5 anúncios com grupos e unidades');

  // =========================================================================
  secao('1. Motor de preço: o servidor (TS) e o banco calculam o MESMO valor, em centavos');
  // =========================================================================
  {
    const regras: Record<string, GroupRules> = {
      dia_com_fracao: { ...REGRA_BASE, allowsTemporary: true, tempPricingMode: 'per_period', tempUnit: 'day', tempPriceCents: 8000, tempMaxUnits: 7, tempAllowFraction: true },
      semana_com_fracao: { ...REGRA_BASE, allowsTemporary: true, tempPricingMode: 'per_period', tempUnit: 'week', tempPriceCents: 35000, tempMaxUnits: 4, tempAllowFraction: true },
      pacotes: { ...REGRA_BASE, allowsTemporary: true, tempPricingMode: 'packages', tempUnit: 'hour', tempPackages: [{ units: 1, priceCents: 1500 }, { units: 3, priceCents: 4000 }, { units: 6, priceCents: 7000 }] },
      hora_centavos_quebrados: porHora(1234, 72),
    };
    const E = await criarAnuncio(dono, 'galpao', 'Rascunho só para comparar preços', Object.entries(regras).map(([nome, r], i) => ({ nome, regras: r, unidades: [`U${i + 1}`] })), false);
    const nomes = Object.keys(regras);
    const casos: [number, RentalTimeUnit][] = [];
    for (const unit of ['hour', 'day', 'week'] as RentalTimeUnit[]) for (const n of [0, 1, 2, 3, 5, 6, 7, 13, 23, 24, 25, 28, 29, 72, 73, 168, 169]) casos.push([n, unit]);
    let iguais = 0;
    const diferentes: string[] = [];
    for (const [i, nome] of nomes.entries()) {
      const grupoId = E.grupos[i]!.id;
      for (const [n, unit] of casos) {
        const ts = temporaryRentCents(regras[nome]!, n, unit);
        const [{ v }] = await sql<{ v: number | null }[]>`SELECT public.temporary_rent_cents(${grupoId}, ${n}, ${unit}::rental_time_unit) AS v`;
        if ((ts ?? null) === (v ?? null)) iguais++;
        else diferentes.push(`${nome} ${n} ${unit}: TS=${ts} SQL=${v}`);
      }
    }
    assert(`${iguais} combinações de grupo × duração: mesmo valor no TS e no banco (inclusive "não vale")`, diferentes.length === 0, diferentes.slice(0, 5).join(' | '));
    expect('fração de dia arredonda no centavo (R$ 80/dia → 5 h = R$ 16,67)', temporaryRentCents(regras.dia_com_fracao!, 5, 'hour'), 1667);
    expect('pacote: só as durações do pacote valem', [3, 4].map((n) => temporaryRentCents(regras.pacotes!, n, 'hour')), [4000, null]);
    expect('durações oferecidas respeitam o mínimo de R$ 35 por cobrança',
      temporaryDurationOptions(porHora(2000, 5), 3500).map((o) => [o.units, o.rentCents]), [[2, 4000], [3, 6000], [4, 8000], [5, 10000]]);
  }

  // =========================================================================
  secao('2. Regras e mensagens (as do pedido, ditas como a pessoa entende)');
  // =========================================================================
  {
    const agora = new Date();
    const ctx = { now: agora, minChargeCents: 3500, maxAdvanceDays: 30 };
    const amanha = addDaysToDate(brDate(agora), 1);
    const r1 = checkTemporaryRequest(porHora(2000, 5), { startsAt: agora, units: 6, unit: 'hour' }, ctx);
    expect('pedir 6 h num grupo de até 5 h', r1.ok ? null : r1.message, 'Máximo permitido: 5 horas.');
    const salaRegras = porHora(5000, 8, { hoursMode: 'daily', opensAt: '07:00', closesAt: '21:00' });
    const r2 = checkTemporaryRequest(salaRegras, { startsAt: brInstant(amanha, '20:00'), units: 2, unit: 'hour' }, ctx);
    expect('passar do horário de fechamento', r2.ok ? null : r2.message, 'O espaço fecha às 21:00.');
    const r3 = checkTemporaryRequest(salaRegras, { startsAt: brInstant(amanha, '06:00'), units: 2, unit: 'hour' }, ctx);
    expect('começar antes de abrir', r3.ok ? null : r3.message, 'O espaço abre às 07:00.');
    const r4 = checkTemporaryRequest(salaRegras, { startsAt: brInstant(amanha, '19:00'), units: 2, unit: 'hour' }, ctx);
    assert('terminar exatamente no fechamento (19:00 + 2 h = 21:00) vale', r4.ok);
    const r5 = checkTemporaryRequest(porHora(2000, 5), { startsAt: agora, units: 1, unit: 'hour' }, ctx);
    expect('abaixo do mínimo por cobrança', r5.ok ? null : r5.message, `O valor mínimo de um aluguel é ${formatBRL(3500)}. Escolha uma duração maior.`);
    const r6 = checkTemporaryRequest(porHora(2000, 5), { startsAt: new Date(agora.getTime() - 3_600_000), units: 2, unit: 'hour' }, ctx);
    expect('horário que já passou', r6.ok ? null : r6.message, 'Esse horário já passou. Escolha um horário a partir de agora.');
    const r7 = checkTemporaryRequest(porHora(2000, 5), { startsAt: new Date(agora.getTime() + 40 * 86_400_000), units: 2, unit: 'hour' }, ctx);
    expect('antecedência máxima', r7.ok ? null : r7.message, 'Dá para reservar com até 30 dias de antecedência.');
    const mensal = priceHeadline({ priceMonthlyCents: 30000, tempFromCents: null, tempFromUnits: null, tempFromUnit: null });
    assert('aluguel contínuo aparece por mês — nunca como total anual', mensal?.suffix === '/mês' && !JSON.stringify(mensal).includes('ano'), JSON.stringify(mensal));
  }

  // =========================================================================
  secao('3. Reserva por tempo pelo fluxo real: Pix na tela, split, preço só do servidor');
  // =========================================================================
  const grupoA = A.grupos[0]!.id;
  const chaveA1 = crypto.randomUUID();
  const r1 = await como(locA, () => chamar(() => reserveTemporaryAction(undefined, form({
    spaceId: A.id, groupId: grupoA, idempotencyKey: chaveA1, start: 'now', duration: '2:hour', cpfCnpj: cpf[locA.id]!,
    // Tentativa de mandar preço pelo navegador: ignorada.
    monthlyRentCents: '1', totalChargedCents: '1', price: '0,01',
  }))));
  const reservaA1 = idDaReserva(r1.redirect);
  assert('reservar 2 h "agora" leva para a tela de pagamento', Boolean(reservaA1) && /\/pagar$/.test(r1.redirect ?? ''), r1.redirect ?? JSON.stringify(r1.result));
  const valoresA1 = computeBookingAmounts(4000, taxas);
  {
    const b = await reserva(reservaA1!);
    expect('reserva aguardando pagamento, por tempo, numa vaga do grupo', [b.status, b.kind, A.grupos[0]!.unidades.includes(b.unit_id ?? '')], ['awaiting_payment', 'temporary', true]);
    expect('valor calculado no servidor (2 × R$ 20), não o que o navegador mandou', [b.monthly_rent_cents, b.total_charged_cents, b.owner_payout_cents],
      [valoresA1.monthlyRentCents, valoresA1.totalChargedCents, valoresA1.ownerPayoutCents]);
    expect('fim = início + 2 h; vaga guardada 7 min a mais para renovar',
      [b.ends_at!.getTime() - b.starts_at!.getTime(), b.occupied_until!.getTime() - b.ends_at!.getTime()], [7_200_000, 420_000]);
    const prazo = (b.hold_expires_at!.getTime() - Date.now()) / 60_000;
    assert('prazo para pagar: ~15 min pelo relógio do banco', prazo > 13.5 && prazo <= 15.5, `${prazo.toFixed(2)} min`);
    const p = await cobrancaDa(reservaA1!);
    const noGateway = testbed.asaasPayments.get(p?.provider_payment_id ?? '');
    expect('cobrança Pix real no gateway, com split para o proprietário', [noGateway?.billingType, noGateway?.value, noGateway?.split],
      ['PIX', valoresA1.totalChargedCents / 100, [{ walletId: subconta.walletId, fixedValue: valoresA1.ownerPayoutCents / 100 }]]);
    assert('QR Code e "copia e cola" vieram do gateway e estão na reserva', Boolean(p?.pix_payload && p.pix_qr_image));
  }
  {
    const antes = testbed.asaasPayments.size;
    const dup = await como(locA, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: A.id, groupId: grupoA, idempotencyKey: chaveA1, start: 'now', duration: '2:hour', cpfCnpj: cpf[locA.id]!,
    }))));
    expect('duplo clique (mesma chave): a MESMA reserva, nenhuma cobrança nova', [idDaReserva(dup.redirect), testbed.asaasPayments.size], [reservaA1, antes]);
  }
  {
    const tentar = async (quem: Identidade, campos: Record<string, string>) =>
      (await como(quem, () => chamar(() => reserveTemporaryAction(undefined, form({
        spaceId: A.id, groupId: grupoA, idempotencyKey: crypto.randomUUID(), start: 'now', duration: '2:hour', cpfCnpj: cpf[locB.id]!, ...campos,
      }))))).result?.message ?? 'redirecionou';
    expect('6 h pelo fluxo real', await tentar(locB, { duration: '6:hour' }), 'Máximo permitido: 5 horas.');
    expect('1 h (R$ 20) pelo fluxo real', await tentar(locB, { duration: '1:hour' }), `O valor mínimo de um aluguel é ${formatBRL(3500)}. Escolha uma duração maior.`);
    expect('dono não aluga o próprio anúncio', await tentar(dono, {}), 'Você não pode alugar o próprio espaço.');
    expect('grupo de outro anúncio é recusado', await tentar(locB, { groupId: B.grupos[0]!.id }), 'Esse grupo não existe mais neste anúncio. Recarregue a página.');
    const semConta = await como(locB, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: F.id, groupId: F.grupos[0]!.id, idempotencyKey: crypto.randomUUID(), start: 'now', duration: '2:hour', cpfCnpj: cpf[locB.id]!,
    }))));
    assert('proprietário sem recebimento configurado: nada é criado nem cobrado', /não configurou o recebimento/.test(semConta.result?.message ?? ''), semConta.result?.message);
    const amanha = addDaysToDate(brDate(new Date()), 1);
    const fecha = await como(locB, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: C.id, groupId: C.grupos[0]!.id, idempotencyKey: crypto.randomUUID(), start: 'agendado', date: amanha, time: '20:00', duration: '2:hour', cpfCnpj: cpf[locB.id]!,
    }))));
    expect('sala: 20:00 + 2 h passa do fechamento', fecha.result?.message, 'O espaço fecha às 21:00.');
  }
  {
    // CPF que já é de outra conta: mensagem clara, nada criado no gateway, vaga devolvida.
    const clientesAntes = testbed.asaasCustomers.size;
    const cobrancasAntes = testbed.asaasPayments.size;
    const r = await como(locC, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: A.id, groupId: grupoA, idempotencyKey: crypto.randomUUID(), start: 'now', duration: '2:hour', cpfCnpj: cpf[locA.id]!,
    }))));
    const [{ n: sobrou }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM bookings WHERE renter_id=${locC.id} AND space_id=${A.id}`;
    expect('CPF já cadastrado em outra conta: recusado com o motivo, sem cliente nem cobrança no gateway, sem reserva sobrando',
      [/outra conta/.test(r.result?.message ?? ''), testbed.asaasCustomers.size - clientesAntes, testbed.asaasPayments.size - cobrancasAntes, sobrou],
      [true, 0, 0, 0]);
  }

  // =========================================================================
  secao('4. Concorrência: duas pessoas, mesmo horário');
  // =========================================================================
  const amanha = addDaysToDate(brDate(new Date()), 1);
  const reservarAgendado = (quem: Identidade, anuncio: Anuncio, hora: string, duracao = '2:hour') =>
    como(quem, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: anuncio.id, groupId: anuncio.grupos[0]!.id, idempotencyKey: crypto.randomUUID(), start: 'agendado',
      date: amanha, time: hora, duration: duracao, cpfCnpj: cpf[quem.id]!,
    }))));
  {
    const antes = testbed.asaasPayments.size;
    const [x, y] = await Promise.all([reservarAgendado(locB, B, '10:00'), reservarAgendado(locC, B, '10:00')]);
    const ganhou = [x, y].filter((r) => r.redirect).length;
    const msgPerdeu = [x, y].find((r) => !r.redirect)?.result?.message ?? '';
    expect('uma vaga, dois pedidos simultâneos: exatamente um consegue', ganhou, 1);
    assert('quem perdeu recebe o motivo, sem cobrança', /vaga/.test(msgPerdeu) && testbed.asaasPayments.size === antes + 1, msgPerdeu);
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM bookings WHERE space_id=${B.id} AND status IN ('awaiting_payment','active')
        AND starts_at = ${brInstant(amanha, '10:00')}`;
    expect('no banco, uma só reserva viva naquele horário', n, 1);
    const colado = await reservarAgendado(locC, B, '12:00');
    assert('começar no minuto em que a outra termina não vale: 7 min guardados para renovar', !colado.redirect, colado.result?.message);
    const depois = await reservarAgendado(locC, B, '12:15');
    assert('depois da janela de renovação a vaga está livre', Boolean(depois.redirect), depois.result?.message);
  }
  {
    const [x, y] = await Promise.all([reservarAgendado(locB, A, '15:00'), reservarAgendado(locC, A, '15:00')]);
    const ids = [idDaReserva(x.redirect), idDaReserva(y.redirect)];
    const unidades = ids.every(Boolean) ? [(await reserva(ids[0]!)).unit_id, (await reserva(ids[1]!)).unit_id] : [];
    assert('duas vagas, dois pedidos simultâneos: os dois conseguem, em vagas diferentes', unidades.length === 2 && unidades[0] !== unidades[1], JSON.stringify(unidades));
    const terceiro = await reservarAgendado(locA, A, '15:00');
    assert('terceiro pedido no mesmo horário: nenhuma vaga livre', !terceiro.redirect && /Não há vaga livre/.test(terceiro.result?.message ?? ''), terceiro.result?.message);
    const grupos = await getSpaceUnitGroups(A.id);
    expect('contagem para a tela: 2 vagas (ocupadas agora = as que estão em uso agora)', grupos[0]?.totalUnits, 2);
  }

  // =========================================================================
  secao('5. Pagamento: Pix confirma; prazo vencido libera; pagamento atrasado reativa ou estorna');
  // =========================================================================
  {
    const p = await cobrancaDa(reservaA1!);
    const w = await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: valoresA1.totalChargedCents / 100, netValue: valoresA1.totalChargedCents / 100 - 0.99, billingType: 'PIX' } });
    const b = await reserva(reservaA1!);
    expect('Pix: só PAYMENT_RECEIVED (sem CONFIRMED) já ativa a reserva', [w.ok, b.status, b.hold_expires_at, Boolean(b.activated_at)], [true, 'active', null, true]);
    expect('cobrança marcada como recebida', (await cobrancaDa(reservaA1!))?.status, 'received');
    expect('proprietário avisado da nova reserva confirmada', await contarNotificacoes(dono.id, 'Nova reserva confirmada'), 1);
    const [{ n: repasses }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM payouts WHERE payment_id=${p!.id}`;
    expect('repasse ao proprietário registrado', repasses, 1);
  }
  let reservaExpira = '';
  {
    const r = await reservarAgendado(locB, A, '18:00');
    reservaExpira = idDaReserva(r.redirect)!;
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id=${reservaExpira}`;
    await sweepExpiredRentals();
    const b = await reserva(reservaExpira);
    expect('prazo para pagar vencido: reserva expira e libera a vaga', [b.status, b.end_reason], ['expired', 'hold_expired']);
    const p = await cobrancaDa(reservaExpira);
    assert('a cobrança fica marcada para sair do gateway', Boolean(p?.delete_requested_at));
    const fila = await processPaymentOutbox();
    const depois = await cobrancaDa(reservaExpira);
    assert('a fila exclui a cobrança no gateway (não pode mais ser paga)',
      fila.deleted >= 1 && Boolean(testbed.asaasPayments.get(p!.provider_payment_id)?.deleted) && depois?.status === 'cancelled', JSON.stringify(fila));
    await sendRentalNotices();
    await sendRentalNotices();
    expect('aviso "Reserva expirada" uma vez só', await contarNotificacoes(locB.id, 'Reserva expirada'), 1);
  }
  {
    const r = await reservarAgendado(locC, A, '20:00');
    const id = idDaReserva(r.redirect)!;
    const p = await cobrancaDa(id);
    const desistiu = await como(locC, () => cancelBookingAction(undefined, form({ bookingId: id })));
    const b = await reserva(id);
    const depois = await cobrancaDa(id);
    expect('"Desistir da reserva" antes de pagar: cancelada, vaga liberada', [desistiu.ok, b.status, b.end_reason], [true, 'cancelled', 'cancelled_by_renter']);
    expect('e a cobrança sai do gateway na hora', [Boolean(testbed.asaasPayments.get(p!.provider_payment_id)?.deleted), depois?.status], [true, 'cancelled']);
  }
  {
    const r = await reservarAgendado(locC, A, '19:00');
    const id = idDaReserva(r.redirect)!;
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id=${id}`;
    await sweepExpiredRentals();
    const p = await cobrancaDa(id);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    const b = await reserva(id);
    expect('pagou depois do prazo e a vaga seguia livre: reserva volta a valer', [b.status, b.end_reason], ['active', null]);
  }
  {
    const r = await reservarAgendado(locB, B, '18:00');
    const id = idDaReserva(r.redirect)!;
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id=${id}`;
    await sweepExpiredRentals();
    const outra = await reservarAgendado(locC, B, '18:00');
    assert('vaga liberada é reservada por outra pessoa', Boolean(outra.redirect), outra.result?.message);
    const p = await cobrancaDa(id);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    const b = await reserva(id);
    const depois = await cobrancaDa(id);
    expect('pagou tarde e a vaga já era de outra pessoa: continua expirada, estorno pedido', [b.status, Boolean(depois?.refund_requested_at)], ['expired', true]);
    const [{ n: repasses }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM payouts WHERE payment_id=${p!.id}`;
    expect('e nenhum repasse ao proprietário por esse pagamento', repasses, 0);
    const fila = await processPaymentOutbox();
    expect('a fila estorna no gateway, uma vez', [fila.refunded >= 1, chamadasAoGateway('POST', `/v3/payments/${p!.provider_payment_id}/refund`), (await cobrancaDa(id))?.status], [true, 1, 'refunded']);
    await processPaymentOutbox();
    expect('rodar a fila de novo não estorna de novo', chamadasAoGateway('POST', `/v3/payments/${p!.provider_payment_id}/refund`), 1);
    expect('quem pagou é avisado da devolução', await contarNotificacoes(locB.id, 'Seu pagamento será devolvido'), 1);
  }

  // =========================================================================
  secao('6. Renovação: mesma unidade, a partir do fim, uma só');
  // =========================================================================
  let renovacao = '';
  {
    const atual = await reserva(reservaA1!);
    const r = await como(locA, () => chamar(() => renewTemporaryAction(undefined, form({ bookingId: reservaA1!, idempotencyKey: crypto.randomUUID(), duration: '2:hour' }))));
    renovacao = idDaReserva(r.redirect) ?? '';
    const nova = renovacao ? await reserva(renovacao) : null;
    expect('renovar: nova reserva na MESMA vaga, começando no fim da atual', [nova?.renewed_from_id, nova?.unit_id, nova?.starts_at?.getTime(), nova?.status],
      [reservaA1, atual.unit_id, atual.ends_at!.getTime(), 'awaiting_payment']);
    const antiga = await reserva(reservaA1!);
    expect('a proteção pós-fim da atual encolhe para o fim exato (sem buraco, sem sobrepor)', antiga.occupied_until?.getTime(), atual.ends_at!.getTime());
    const segunda = await como(locA, () => chamar(() => renewTemporaryAction(undefined, form({ bookingId: reservaA1!, idempotencyKey: crypto.randomUUID(), duration: '3:hour' }))));
    assert('segunda renovação da mesma reserva é recusada', !segunda.redirect, segunda.result?.message);
    const deOutro = await como(locB, () => chamar(() => renewTemporaryAction(undefined, form({ bookingId: reservaA1!, idempotencyKey: crypto.randomUUID(), duration: '2:hour' }))));
    expect('ninguém renova a reserva de outra pessoa', deOutro.result?.message, 'Aluguel não encontrado.');
  }
  {
    const r = await como(locC, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: C.id, groupId: C.grupos[0]!.id, idempotencyKey: crypto.randomUUID(), start: 'agendado', date: amanha, time: '09:00', duration: '2:hour', cpfCnpj: cpf[locC.id]!,
    }))));
    const id = idDaReserva(r.redirect)!;
    const p = await cobrancaDa(id);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    const b = await reserva(id);
    expect('grupo sem renovação: nenhuma vaga guardada depois do fim', b.occupied_until?.getTime(), b.ends_at?.getTime());
    const ren = await como(locC, () => chamar(() => renewTemporaryAction(undefined, form({ bookingId: id, idempotencyKey: crypto.randomUUID(), duration: '2:hour' }))));
    expect('e a renovação é recusada com o motivo', ren.result?.message, 'Este espaço não aceita renovação.');
  }
  {
    // Termina, passa a janela de 7 min: a vaga é liberada e não dá mais para renovar.
    const r = await como(locB, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: B.id, groupId: B.grupos[0]!.id, idempotencyKey: crypto.randomUUID(), start: 'now', duration: '2:hour', cpfCnpj: cpf[locB.id]!,
    }))));
    const id = idDaReserva(r.redirect)!;
    const p = await cobrancaDa(id);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    await voltarNoTempo(id, 120 + 8);
    const ren = await como(locB, () => chamar(() => renewTemporaryAction(undefined, form({ bookingId: id, idempotencyKey: crypto.randomUUID(), duration: '2:hour' }))));
    expect('8 min depois do fim: renovação recusada', ren.result?.message, 'A janela de renovação terminou e a unidade foi liberada.');
    await sweepExpiredRentals();
    const b = await reserva(id);
    expect('e o banco encerra o aluguel como concluído', [b.status, b.end_reason], ['ended', 'completed']);
  }

  // =========================================================================
  secao('7. Relógio: aviso de 10 minutos, fases da tela, fim do horário');
  // =========================================================================
  {
    const r = await como(locC, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: A.id, groupId: grupoA, idempotencyKey: crypto.randomUUID(), start: 'now', duration: '2:hour', cpfCnpj: cpf[locC.id]!,
    }))));
    const id = idDaReserva(r.redirect)!;
    const p = await cobrancaDa(id);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    await voltarNoTempo(id, 115); // faltam ~5 min
    await sendRentalNotices();
    await sendRentalNotices();
    expect('"Seu aluguel termina em 10 minutos." uma vez só', await contarNotificacoes(locC.id, 'Seu aluguel termina em 10 minutos.'), 1);
    const b = await reserva(id);
    const agora = new Date();
    expect('fase na tela: em uso', temporaryPhase({ status: b.status, startsAt: b.starts_at!, endsAt: b.ends_at!, occupiedUntil: b.occupied_until! }, agora), 'in_use');
    expect('depois do fim, até 7 min: janela de renovação',
      temporaryPhase({ status: b.status, startsAt: b.starts_at!, endsAt: b.ends_at!, occupiedUntil: b.occupied_until! }, new Date(b.ends_at!.getTime() + 60_000)), 'renewal_window');
    // O aluguel renovado (seção 6) não recebe o aviso: já tem renovação viva.
    await voltarNoTempo(reservaA1!, 115);
    await sendRentalNotices();
    expect('quem já renovou não é avisado de que vai terminar', await contarNotificacoes(locA.id, 'Seu aluguel termina em 10 minutos.'), 0);
  }

  // =========================================================================
  secao('8. Aluguel contínuo: aceite escolhe a unidade, cartão automático, cancelar na hora');
  // =========================================================================
  const grupoD = D.grupos[0]!.id;
  const hoje = brDate(new Date());
  async function contratarMensal(quem: Identidade): Promise<string> {
    await como(quem, () => chamar(() => requestBookingAction(undefined, form({ spaceId: D.id, startDate: hoje, groupId: grupoD }))));
    const [{ id }] = await sql<{ id: string }[]>`SELECT id FROM bookings WHERE space_id=${D.id} AND renter_id=${quem.id} ORDER BY requested_at DESC LIMIT 1`;
    await como(dono, () => respondToBookingRequestAction(undefined, form({ bookingId: id, decision: 'accept' })));
    await como(quem, () => chamar(() => startCheckoutAction(undefined, form({ bookingId: id, cpfCnpj: cpf[quem.id]!, method: 'card' }))));
    return id;
  }
  const mensalA = await contratarMensal(locA);
  const valoresMensal = computeBookingAmounts(30000, taxas);
  let assinaturaA = '';
  {
    const b = await reserva(mensalA);
    expect('aceite reservou um box do grupo, valor do grupo', [b.status, D.grupos[0]!.unidades.includes(b.unit_id ?? ''), b.monthly_rent_cents], ['awaiting_payment', true, 30000]);
    const [s] = await sql<{ provider_subscription_id: string; method: string }[]>`SELECT provider_subscription_id, method::text FROM subscriptions WHERE booking_id=${mensalA}`;
    assinaturaA = s!.provider_subscription_id;
    expect('assinatura mensal no cartão criada no gateway', [s?.method, testbed.asaasSubscriptions.get(assinaturaA)?.status], ['credit_card', 'ACTIVE']);
    const p = await cobrancaDa(mensalA);
    testbed.asaasPayments.set(p!.provider_payment_id, { ...testbed.asaasPayments.get(p!.provider_payment_id)!, billingType: 'CREDIT_CARD' });
    await webhook({ event: 'PAYMENT_CONFIRMED', payment: { id: p!.provider_payment_id, value: valoresMensal.totalChargedCents / 100, billingType: 'CREDIT_CARD' } });
    expect('cartão confirmado: aluguel ativo', (await reserva(mensalA)).status, 'active');
    const lista = await listRenterBookings(locA.id);
    const linha = lista.find((l) => l.id === mensalA);
    expect('Meus aluguéis: R$ por mês, renovação automática no cartão', [linha?.kind, linha?.totalChargedCents, linha?.subscriptionStatus, linha?.subscriptionMethod],
      ['continuous', valoresMensal.totalChargedCents, 'active', 'credit_card']);
  }
  {
    const mensalB = await contratarMensal(locB);
    const p = await cobrancaDa(mensalB);
    await webhook({ event: 'PAYMENT_CONFIRMED', payment: { id: p!.provider_payment_id, value: valoresMensal.totalChargedCents / 100 } });
    const [s] = await sql<{ provider_subscription_id: string }[]>`SELECT provider_subscription_id FROM subscriptions WHERE booking_id=${mensalB}`;
    const unidade = (await reserva(mensalB)).unit_id;
    const r = await como(locB, () => endBookingAction(undefined, form({ bookingId: mensalB })));
    const b = await reserva(mensalB);
    const [sub] = await sql<{ status: string; provider_cancelled_at: Date | null }[]>`SELECT status::text, provider_cancelled_at FROM subscriptions WHERE booking_id=${mensalB}`;
    expect('"Cancelar aluguel": encerra na hora', [r.ok, b.status, b.end_reason], [true, 'ended', 'cancelled_by_renter']);
    expect('a cobrança automática para no gateway na mesma hora', [testbed.asaasSubscriptions.get(s!.provider_subscription_id)?.status, sub?.status, Boolean(sub?.provider_cancelled_at)], ['CANCELLED', 'cancelled', true]);
    const [{ n: livres }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM bookings WHERE unit_id=${unidade} AND status IN ('approved','awaiting_payment','active','past_due')`;
    expect('a unidade fica livre', livres, 0);
    const [{ n: historico }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=${mensalB}`;
    assert('o histórico registra o que aconteceu', historico >= 1, `${historico} registro(s)`);
  }

  // =========================================================================
  secao('9. Cobrança automática recusada: janela de 40 min + 1 h, "Pagar agora" na MESMA cobrança');
  // =========================================================================
  const mes2 = `pay_${tag}_m2`;
  {
    // O Asaas gera a mensalidade seguinte da assinatura (fica no dublê como no gateway).
    testbed.asaasPayments.set(mes2, {
      id: mes2, status: 'PENDING', value: valoresMensal.totalChargedCents / 100, netValue: null,
      invoiceUrl: `http://127.0.0.1/fake-invoice/${mes2}`, dueDate: hoje, refundedCents: 0, subscription: assinaturaA, billingType: 'CREDIT_CARD',
    });
    await webhook({ event: 'PAYMENT_CREATED', payment: { id: mes2, subscription: assinaturaA, value: valoresMensal.totalChargedCents / 100, dueDate: hoje, billingType: 'CREDIT_CARD' } });
    expect('sem a recusa, nada de indicador', (await listRenterPaymentIssues(locA.id)).length, 0);
    await webhook({ event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', payment: { id: mes2, subscription: assinaturaA } });
    const b = await reserva(mensalA);
    expect('recusa do cartão: NÃO cancela, abre o pagamento pendente', b.status, 'past_due');
    expect('prazo total = 40 min + 1 h', b.payment_issue_deadline_at!.getTime() - b.payment_issue_started_at!.getTime(), 100 * 60_000);
    const [aviso] = await sql<{ body: string; link_path: string }[]>`
      SELECT body, link_path FROM notifications WHERE user_id=${locA.id} AND type='payment_failed' ORDER BY created_at DESC LIMIT 1`;
    expect('aviso com o texto pedido e o caminho para resolver', [aviso?.body, aviso?.link_path],
      ['Não conseguimos concluir seu pagamento automático. Regularize o pagamento para continuar com seu aluguel.', `/reservas/${mensalA}/pendente`]);
    const pend = await listRenterPaymentIssues(locA.id);
    expect('indicador: só este aluguel aparece como pendente', pend.map((x) => x.bookingId), [mensalA]);
    const janela = paymentWindowState(b.payment_issue_started_at!, b.payment_issue_deadline_at!, new Date());
    expect('agora: primeira janela (40 min)', janela.phase, 'first');
  }
  {
    const antes = testbed.asaasPayments.size;
    const putsAntes = chamadasAoGateway('PUT', `/v3/payments/${mes2}`);
    const [x, y] = await Promise.all([
      como(locA, () => chamar(() => choosePaymentMethodAction(undefined, form({ bookingId: mensalA, method: 'pix' })))),
      como(locA, () => chamar(() => choosePaymentMethodAction(undefined, form({ bookingId: mensalA, method: 'pix' })))),
    ]);
    const p = await cobrancaDa(mensalA);
    expect('"Pagar agora" com Pix: a MESMA cobrança vira Pix (nenhuma cobrança nova)', [x.result?.ok, y.result?.ok, p?.provider_payment_id, p?.method, testbed.asaasPayments.size, testbed.asaasPayments.get(mes2)?.billingType],
      [true, true, mes2, 'pix', antes, 'PIX']);
    assert('QR da cobrança na tela', Boolean(p?.pix_payload));
    expect('toque duplo: a troca para Pix vai ao gateway UMA vez', chamadasAoGateway('PUT', `/v3/payments/${mes2}`) - putsAntes, 1);
    const outro = await como(locB, () => chamar(() => choosePaymentMethodAction(undefined, form({ bookingId: mensalA, method: 'pix' }))));
    expect('ninguém paga a cobrança de outra pessoa por aqui', outro.result?.message, 'Reserva não encontrada.');
  }
  {
    await voltarNoTempo(mensalA, 41);
    await sendRentalNotices();
    await sendRentalNotices();
    expect('passados 40 min: "último prazo", uma vez', await contarNotificacoes(locA.id, 'Último prazo para regularizar o pagamento'), 1);
    const b = await reserva(mensalA);
    expect('segunda janela (mais 1 h)', paymentWindowState(b.payment_issue_started_at!, b.payment_issue_deadline_at!, new Date()).phase, 'second');
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: mes2, value: valoresMensal.totalChargedCents / 100, billingType: 'PIX' } });
    const depois = await reserva(mensalA);
    expect('pagou por Pix: aluguel volta a ativo, prazo limpo', [depois.status, depois.payment_issue_started_at, depois.payment_issue_deadline_at], ['active', null, null]);
    expect('indicador some só agora, com o pagamento resolvido', (await listRenterPaymentIssues(locA.id)).length, 0);
    const [{ s }] = await sql<{ s: string }[]>`SELECT status::text AS s FROM subscriptions WHERE booking_id=${mensalA}`;
    expect('assinatura volta a ativa', s, 'active');
  }

  // =========================================================================
  secao('10. Sem pagamento no prazo: encerra, para a cobrança, libera a unidade');
  // =========================================================================
  const mes3 = `pay_${tag}_m3`;
  {
    testbed.asaasPayments.set(mes3, {
      id: mes3, status: 'PENDING', value: valoresMensal.totalChargedCents / 100, netValue: null,
      invoiceUrl: `http://127.0.0.1/fake-invoice/${mes3}`, dueDate: hoje, refundedCents: 0, subscription: assinaturaA, billingType: 'CREDIT_CARD',
    });
    await webhook({ event: 'PAYMENT_CREATED', payment: { id: mes3, subscription: assinaturaA, value: valoresMensal.totalChargedCents / 100, dueDate: hoje } });
    await webhook({ event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', payment: { id: mes3, subscription: assinaturaA } });
    expect('nova recusa abre nova janela', (await reserva(mensalA)).status, 'past_due');
    const unidade = (await reserva(mensalA)).unit_id;
    await voltarNoTempo(mensalA, 101);
    expect('prazo vencido conta como encerramento, não como pendência', (await listRenterPaymentIssues(locA.id)).length, 0);
    await sweepExpiredRentals();
    const b = await reserva(mensalA);
    expect('encerrado por falta de pagamento', [b.status, b.end_reason], ['ended', 'payment_not_received']);
    const [sub] = await sql<{ status: string; provider_cancelled_at: Date | null }[]>`SELECT status::text, provider_cancelled_at FROM subscriptions WHERE booking_id=${mensalA}`;
    expect('recorrência cancelada no banco, aguardando o gateway', [sub?.status, sub?.provider_cancelled_at], ['cancelled', null]);
    // O pagamento chega no meio do caminho (antes da fila cancelar no gateway).
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: mes3, value: valoresMensal.totalChargedCents / 100, billingType: 'PIX' } });
    expect('pagou depois do encerramento: aluguel não volta, estorno pedido', [(await reserva(mensalA)).status, Boolean((await sql<{ r: Date | null }[]>`SELECT refund_requested_at AS r FROM payments WHERE provider_payment_id=${mes3}`)[0]?.r)], ['ended', true]);
    const fila = await processPaymentOutbox();
    const [depois] = await sql<{ provider_cancelled_at: Date | null }[]>`SELECT provider_cancelled_at FROM subscriptions WHERE booking_id=${mensalA}`;
    expect('a fila cancela a recorrência no gateway e estorna o pagamento tardio',
      [testbed.asaasSubscriptions.get(assinaturaA)?.status, Boolean(depois?.provider_cancelled_at), chamadasAoGateway('POST', `/v3/payments/${mes3}/refund`), fila.failed],
      ['CANCELLED', true, 1, 0]);
    await sendRentalNotices();
    await sendRentalNotices();
    expect('locatário e proprietário avisados do encerramento, uma vez', [await contarNotificacoes(locA.id, 'Aluguel encerrado por falta de pagamento'), await contarNotificacoes(dono.id, 'Aluguel encerrado por falta de pagamento')], [1, 1]);
    const [{ n: ocupando }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM bookings WHERE unit_id=${unidade} AND status IN ('approved','awaiting_payment','active','past_due')`;
    expect('a unidade está livre para outra pessoa', ocupando, 0);
  }

  // =========================================================================
  secao('11. Fila do gateway: um executor por vez (nenhum estorno sai duas vezes)');
  // =========================================================================
  {
    const r = await reservarAgendado(locC, A, '06:00');
    const id = idDaReserva(r.redirect)!;
    const p = await cobrancaDa(id);
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id=${id}`;
    await sweepExpiredRentals();
    const tomou = await reservarAgendado(locB, A, '06:00');
    const tomou2 = await reservarAgendado(locA, A, '06:00');
    assert('as duas vagas daquele horário foram tomadas por outras pessoas', Boolean(tomou.redirect && tomou2.redirect));
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: p!.provider_payment_id, value: p!.amount_cents / 100 } });
    const resultados = await Promise.all([processPaymentOutbox(), processPaymentOutbox(), processPaymentOutbox()]);
    expect('três execuções simultâneas: o estorno vai ao gateway UMA vez', chamadasAoGateway('POST', `/v3/payments/${p!.provider_payment_id}/refund`), 1);
    assert('as outras encontram a fila ocupada e não fazem nada', resultados.filter((x) => x.busy).length >= 1, JSON.stringify(resultados));
  }

  // =========================================================================
  secao('12. Agendador por minuto: /api/cron/minuto exige o segredo');
  // =========================================================================
  {
    const { GET } = await import('../src/app/api/cron/minuto/route');
    const { NextRequest } = await import('next/server');
    const pedir = (auth?: string) => GET(new NextRequest('http://localhost/api/cron/minuto', { headers: auth ? { authorization: auth } : {} }));
    delete process.env.CRON_SECRET;
    expect('sem CRON_SECRET configurado: recusa explicitamente (503), não finge que rodou', (await pedir('Bearer x')).status, 503);
    process.env.CRON_SECRET = `segredo-${tag}`;
    expect('segredo errado: 401', (await pedir('Bearer errado')).status, 401);
    const certo = await pedir(`Bearer segredo-${tag}`);
    const corpo = (await certo.json()) as { ok: boolean; released: number };
    expect('segredo certo: roda a manutenção', [certo.status, corpo.ok, typeof corpo.released], [200, true, 'number']);
  }

  // =========================================================================
  secao('13. Horário de Brasília');
  // =========================================================================
  {
    expect('22:30 de Brasília = 01:30 UTC do dia seguinte', brInstant('2026-10-01', '22:30').toISOString(), '2026-10-02T01:30:00.000Z');
    expect('01:30 UTC ainda é "ontem" em Brasília', [brDate(new Date('2026-10-02T01:30:00Z')), brTime(new Date('2026-10-02T01:30:00Z'))], ['2026-10-01', '22:30']);
    const r = await como(locA, () => chamar(() => reserveTemporaryAction(undefined, form({
      spaceId: A.id, groupId: grupoA, idempotencyKey: crypto.randomUUID(), start: 'agendado', date: amanha, time: '23:00', duration: '2:hour', cpfCnpj: cpf[locA.id]!,
    }))));
    const id = idDaReserva(r.redirect);
    const [linha] = id ? await sql<{ start_date: string; end_date: string }[]>`SELECT start_date::text, end_date::text FROM bookings WHERE id=${id}` : [];
    expect('reserva 23:00–01:00 em Brasília: dias de início e fim pelo relógio de Brasília', [linha?.start_date, linha?.end_date], [amanha, addDaysToDate(amanha, 2)]);
  }
}

async function limpar() {
  // Tira os anúncios da vitrine (o histórico financeiro fica, como em produção).
  if (espacosCriados.length === 0) return;
  try {
    await sql`UPDATE bookings SET status='cancelled', cancelled_at=now(), end_reason='cancelled_by_owner', hold_expires_at=NULL
              WHERE space_id IN ${sql(espacosCriados)} AND status IN ('requested','approved','awaiting_payment')`;
    await sql`UPDATE bookings SET status='ended', ended_at=now(), end_reason='cancelled_by_owner'
              WHERE space_id IN ${sql(espacosCriados)} AND status IN ('active','past_due')`;
    await sql`UPDATE spaces SET status='archived' WHERE id IN ${sql(espacosCriados)}`;
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
    await testbed?.close();
    await sql.end();
    console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
    if (falhas.length) console.log(`Falhas: ${falhas.join(' | ')}`);
    process.exit(failed > 0 ? 1 : 0);
  });

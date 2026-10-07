/**
 * Verificacao do PREMIUM PAGO (Etapa 2, Fase A) contra Postgres real e o
 * dublê do Asaas.
 *
 * Chama as Server Actions e o processador de webhook de verdade — nao so o
 * schema. Prova que: Premium = pagamento CONFIRMADO; o ciclo e o periodo
 * efetivamente pago; os beneficios valem por ciclo e nao acumulam; cancelar
 * nao encerra na hora; estorno/contestacao tiram o direito; renovacao tarde
 * ou cedo cai no lugar certo; o alcance ampliado no mapa obedece aos limites.
 *
 *   pnpm tsx scripts/verify-premium.ts
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
import { startTestbed, type Testbed } from './testbed/server';
import { criarAnuncio, limparPremium, darPremium } from './lib/fixtures';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 8, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

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

const tag = `prem-${Date.now()}`;
const ids = {
  pix: crypto.randomUUID(), // assina por Pix e passa por todo o ciclo de vida
  cartao: crypto.randomUUID(), // assina no cartao
  corrida: crypto.randomUUID(), // duplo clique e confirmacoes simultaneas
  estorno: crypto.randomUUID(), // estorno e contestacao
  tardio: crypto.randomUUID(), // renovacao fora do prazo
  admin: crypto.randomUUID(), // concessao administrativa que depois paga
  menor: crypto.randomUUID(), // pagamento menor que o combinado
  abandono: crypto.randomUUID(), // assinatura nunca paga
  mapa: crypto.randomUUID(), // dono Premium do mapa
  mapaB: crypto.randomUUID(), // dono sem Premium
  mapaC: crypto.randomUUID(), // outro dono Premium
};
const todos = Object.values(ids);

function cpfValido(): string {
  const nove = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (d: number[], p: number[]) => {
    const r = d.reduce((a, x, i) => a + x * p[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(nove, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...nove, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...nove, d1, d2].join('');
}

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string; email: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '', email: '' };
function entrarComo(id: string, fullName: string, role: Identidade['role'] = 'owner') {
  identidadeAtual = { id, role, fullName, email: `${id}@exemplo.invalid` };
}

let testbed: Testbed | undefined;

/** Simula o tempo passando: anda os ciclos (e o resumo) para o passado. O gatilho de protecao so cede durante isto. */
async function envelhecer(userId: string, dias: number) {
  await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
  try {
    const ciclos = await sql<{ id: string }[]>`SELECT id FROM premium_cycles WHERE user_id = ${userId} ORDER BY number ASC`;
    for (const c of ciclos) {
      await sql`UPDATE premium_cycles SET
          starts_at = starts_at - make_interval(days => ${dias}),
          ends_at = ends_at - make_interval(days => ${dias}),
          ended_early_at = ended_early_at - make_interval(days => ${dias})
        WHERE id = ${c.id}`;
    }
  } finally {
    await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
  }
  await sql`UPDATE premium_memberships SET
      current_period_start = current_period_start - make_interval(days => ${dias}),
      current_period_end = current_period_end - make_interval(days => ${dias})
    WHERE user_id = ${userId} AND current_period_end IS NOT NULL`;
}

/** Como envelhecer, mas em horas (para a janela de continuidade de 24 h). */
async function envelhecerHoras(userId: string, horas: number) {
  await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
  try {
    const ciclos = await sql<{ id: string }[]>`SELECT id FROM premium_cycles WHERE user_id = ${userId} ORDER BY number ASC`;
    for (const c of ciclos) {
      await sql`UPDATE premium_cycles SET
          starts_at = starts_at - make_interval(hours => ${horas}),
          ends_at = ends_at - make_interval(hours => ${horas}),
          ended_early_at = ended_early_at - make_interval(hours => ${horas})
        WHERE id = ${c.id}`;
    }
  } finally {
    await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
  }
}

async function main() {
  secao('0. Semente');
  for (const [nome, id] of Object.entries(ids)) {
    await sql`INSERT INTO auth.users (id, email) VALUES (${id}, ${`${tag}-${nome}@exemplo.invalid`})`;
    await sql`UPDATE profiles SET role='owner', full_name=${`Premium ${nome}`} WHERE id=${id}`;
  }
  ok('contas de teste criadas', `${todos.length} contas`);

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
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: identidadeAtual.email,
          fullName: identidadeAtual.fullName, publicName: null, avatarPath: null, status: 'active',
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

  const { subscribePremiumAction, cancelPremiumAction, resumePremiumAction } = await import('../src/lib/premium/actions');
  const { activatePromotionAction } = await import('../src/lib/promotions/actions');
  const { getPremiumOverview, getBenefitUsage, isPremium, isPremiumFinancial } = await import('../src/lib/premium/queries');
  const { runPremiumMaintenance } = await import('../src/lib/premium/maintenance');
  const { premiumMonthlyPriceCents } = await import('../src/lib/premium/settings');
  const { processAsaasWebhook } = await import('../src/lib/payments/webhook');
  const { exploreSpaces } = await import('../src/lib/maps/explore');

  function fd(campos: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  }
  /** `redirect()` lanca NEXT_REDIRECT; o digest traz o destino. */
  async function comRedirect<T>(fnc: () => Promise<T>): Promise<{ redirecionou: true; destino: string } | { redirecionou: false; resultado: T }> {
    try {
      return { redirecionou: false, resultado: await fnc() };
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      return { redirecionou: true, destino: digest.split(';')[2] ?? '' };
    }
  }

  const evento = (event: string, p: {
    id: string; value?: number; netValue?: number; subscription?: string; billingType?: string; dueDate?: string;
  }) =>
    processAsaasWebhook({
      event,
      payment: {
        id: p.id, value: p.value ?? 119.9, netValue: p.netValue, subscription: p.subscription,
        billingType: p.billingType, dueDate: p.dueDate, invoiceUrl: `https://www.asaas.com/i/${p.id}`,
      },
    });

  const ciclos = (id: string) => sql<{
    id: string; number: number; source: string; starts_at: Date; ends_at: Date; ended_early_at: Date | null;
    financial_eligible: boolean; charge_id: string | null;
  }[]>`SELECT id, number, source::text AS source, starts_at, ends_at, ended_early_at, financial_eligible, charge_id
         FROM premium_cycles WHERE user_id = ${id} ORDER BY number ASC`;
  const membro = async (id: string) => (await sql<{
    status: string; source: string; cancel_at_period_end: boolean; provider_subscription_id: string | null;
    provider_cancelled_at: Date | null; plan_cents: number | null; billing_method: string | null; cancelled_at: Date | null;
  }[]>`SELECT status::text AS status, source::text AS source, cancel_at_period_end, provider_subscription_id,
              provider_cancelled_at, plan_cents, billing_method::text AS billing_method, cancelled_at
         FROM premium_memberships WHERE user_id = ${id}`)[0];
  const cobrancas = (id: string) => sql<{
    id: string; provider_payment_id: string; status: string; amount_cents: number; method: string | null;
    due_date: string; invoice_url: string | null; failure_reason: string | null; net_amount_cents: number | null;
    gateway_fee_cents: number | null; refunded_cents: number; provider_subscription_id: string | null;
  }[]>`SELECT id, provider_payment_id, status::text AS status, amount_cents, method::text AS method, due_date::text AS due_date,
              invoice_url, failure_reason, net_amount_cents, gateway_fee_cents, refunded_cents, provider_subscription_id
         FROM premium_charges WHERE user_id = ${id} ORDER BY created_at ASC`;
  const avisos = (id: string) => sql<{ title: string; dedupe_key: string | null }[]>`
    SELECT title, dedupe_key FROM notifications WHERE user_id = ${id} AND type = 'premium_changed' ORDER BY created_at ASC`;

  // =========================================================================
  secao('1. Preco e configuracao');
  // =========================================================================

  expect('o preco do Premium e R$ 119,90 (11990 centavos), lido do banco', await premiumMonthlyPriceCents(), 11990);

  // =========================================================================
  secao('2. Assinar por Pix — nada ativa antes do pagamento confirmado');
  // =========================================================================

  entrarComo(ids.pix, 'Premium pix');
  const semCpf = await subscribePremiumAction(undefined, fd({ method: 'pix' }));
  assert('sem CPF e sem cliente no gateway: pede o CPF (nada e criado no Asaas)', !semCpf.ok && semCpf.needsCpf === true, JSON.stringify(semCpf));
  expect('nenhuma assinatura nasceu no gateway', testbed.asaasSubscriptions.size, 0);
  const cpfInvalido = await subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: '123.456.789-00' }));
  assert('CPF invalido e recusado', !cpfInvalido.ok, JSON.stringify(cpfInvalido));
  const metodoInvalido = await subscribePremiumAction(undefined, fd({ method: 'boleto', cpfCnpj: cpfValido() }));
  assert('forma de pagamento desconhecida e recusada', !metodoInvalido.ok, JSON.stringify(metodoInvalido));

  const cpfPix = cpfValido();
  const assinou = await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfPix })));
  assert('assinar redireciona para a fatura do Asaas', assinou.redirecionou === true, JSON.stringify(assinou));

  const subs = [...testbed.asaasSubscriptions.values()];
  expect('uma assinatura criada no gateway', subs.length, 1);
  const subPix = subs[0]!;
  expect('valor mandado ao Asaas: R$ 119,90 (decidido pelo servidor)', subPix.value, 119.9);
  expect('forma de pagamento: Pix', subPix.billingType, 'PIX');
  expect('recorrencia mensal', subPix.cycle, 'MONTHLY');
  assert('SEM split: o dinheiro e da plataforma (nao e a recorrencia de uma locacao)', !subPix.split || subPix.split.length === 0);
  expect('referencia da assinatura aponta para a conta', subPix.externalReference, `premium:${ids.pix}`);

  const m1 = await membro(ids.pix);
  expect('a assinatura fica aguardando o pagamento', [m1?.status, m1?.source, m1?.plan_cents, m1?.billing_method], ['pending_payment', 'subscription', 11990, 'pix']);
  expect('a recorrencia do gateway fica registrada', m1?.provider_subscription_id, subPix.id);
  const [cob1] = await cobrancas(ids.pix);
  expect('a primeira cobranca fica pendente, com o valor combinado', [cob1?.status, cob1?.amount_cents, cob1?.method], ['pending', 11990, 'pix']);
  assert('o link da fatura foi gravado', Boolean(cob1?.invoice_url));
  assert('o redirecionamento vai para a fatura gravada', assinou.redirecionou && cob1?.invoice_url != null && assinou.destino.includes(cob1.invoice_url), JSON.stringify(assinou));
  expect('ainda NAO e Premium (Premium = pagamento confirmado)', await isPremium(ids.pix), false);
  const visaoPendente = await getPremiumOverview(ids.pix);
  expect('a tela mostra "aguardando pagamento" e a cobranca em aberto', [visaoPendente.state, visaoPendente.openCharge?.amountCents], ['pending_payment', 11990]);
  expect('nenhum ciclo existe', (await ciclos(ids.pix)).length, 0);

  const rBeneficioAntes = await activatePromotionAction(undefined, fd({ spaceId: crypto.randomUUID(), type: 'destaque' }));
  assert('sem pagamento confirmado nenhum beneficio funciona', !rBeneficioAntes.ok, rBeneficioAntes.message ?? '');

  const denovo = await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix' })));
  assert('clicar de novo reaproveita a mesma cobranca', denovo.redirecionou && cob1?.invoice_url != null && denovo.destino.includes(cob1.invoice_url), JSON.stringify(denovo));
  expect('nenhuma segunda assinatura foi criada', testbed.asaasSubscriptions.size, 1);

  // =========================================================================
  secao('3. Pagamento confirmado → ciclo 1 → Premium (Pix chega como RECEIVED)');
  // =========================================================================

  const pagamento1 = cob1!.provider_payment_id;
  const rReceived = await evento('PAYMENT_RECEIVED', { id: pagamento1, value: 119.9, netValue: 117.91, subscription: subPix.id, billingType: 'PIX' });
  assert('webhook do pagamento processado', rReceived.ok, JSON.stringify(rReceived));

  const c1 = await ciclos(ids.pix);
  expect('nasceu exatamente UM ciclo', c1.length, 1);
  expect('o ciclo e pago (assinatura), com direito financeiro e ligado a cobranca', [c1[0]?.source, c1[0]?.financial_eligible, c1[0]?.charge_id === cob1?.id], ['subscription', true, true]);
  expect('numero 1', c1[0]?.number, 1);
  const duracao = await sql<{ meses: number }[]>`
    SELECT (c.ends_at = c.starts_at + interval '1 month')::int AS meses FROM premium_cycles c WHERE id = ${c1[0]!.id}`;
  expect('o ciclo dura exatamente um mes', duracao[0]?.meses, 1);
  const [inicioProximo] = await sql<{ perto: boolean }[]>`SELECT abs(extract(epoch FROM (now() - ${c1[0]!.starts_at}::timestamptz))) < 60 AS perto`;
  assert('o primeiro ciclo comeca na confirmacao (relogio do banco)', inicioProximo?.perto === true);

  expect('agora e Premium', await isPremium(ids.pix), true);
  expect('com direito aos beneficios financeiros', await isPremiumFinancial(ids.pix), true);
  const m2 = await membro(ids.pix);
  expect('a assinatura passa a ativa', m2?.status, 'active');
  const [cobPaga] = await cobrancas(ids.pix);
  expect('a cobranca fica "recebida", com tarifa e liquido', [cobPaga?.status, cobPaga?.net_amount_cents, cobPaga?.gateway_fee_cents], ['received', 11791, 199]);

  const razao = await sql<{ type: string; amount_cents: number; user_id: string | null; booking_id: string | null }[]>`
    SELECT type::text AS type, amount_cents, user_id, booking_id FROM ledger_entries WHERE premium_charge_id = ${cob1!.id} ORDER BY amount_cents DESC`;
  expect('livro-razao: receita da plataforma (+R$ 119,90) e tarifa do gateway (−R$ 1,99), sem reserva e sem titular',
    razao.map((r) => [r.type, r.amount_cents, r.user_id, r.booking_id]), [['charge_captured', 11990, null, null], ['gateway_fee', -199, null, null]]);
  const av1 = await avisos(ids.pix);
  expect('a pessoa foi avisada: Premium ativado', av1.map((a) => a.title), ['Premium ativado']);

  const repetido = await evento('PAYMENT_RECEIVED', { id: pagamento1, value: 119.9, netValue: 117.91, subscription: subPix.id });
  assert('o mesmo evento reenviado nao quebra', repetido.ok, JSON.stringify(repetido));
  const confirmadoDepois = await evento('PAYMENT_CONFIRMED', { id: pagamento1, value: 119.9, subscription: subPix.id });
  assert('um CONFIRMED que chega depois do RECEIVED tambem nao quebra', confirmadoDepois.ok, JSON.stringify(confirmadoDepois));
  expect('continua UM ciclo so (idempotencia por evento e por cobranca)', (await ciclos(ids.pix)).length, 1);
  expect('e UM aviso so', (await avisos(ids.pix)).length, 1);
  expect('e UM par de lancamentos no razao', (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ledger_entries WHERE premium_charge_id = ${cob1!.id}`)[0]!.n, 2);

  const visaoAtiva = await getPremiumOverview(ids.pix);
  expect('a tela mostra Premium ativo que renova', [visaoAtiva.state, visaoAtiva.isActive, visaoAtiva.adminTest, visaoAtiva.cancelAtPeriodEnd], ['active', true, false, false]);

  // =========================================================================
  secao('4. Beneficios do ciclo — 2 Destaques e 1 Turbo, nao acumulam');
  // =========================================================================

  const espacos = [];
  for (const n of [1, 2, 3, 4, 5]) {
    espacos.push(await criarAnuncio(sql, { ownerId: ids.pix, slug: `${tag}-pix-${n}`, precoCents: 30000 }));
  }
  const uso0 = await getBenefitUsage(ids.pix);
  expect('saldo inicial do ciclo: 2 Destaques e 1 Turbo', [uso0.destaque.remaining, uso0.turbo.remaining], [2, 1]);
  const d1 = await activatePromotionAction(undefined, fd({ spaceId: espacos[0]!, type: 'destaque' }));
  const d2 = await activatePromotionAction(undefined, fd({ spaceId: espacos[1]!, type: 'destaque' }));
  assert('os 2 Destaques do ciclo funcionam', d1.ok && d2.ok, `${d1.message} / ${d2.message}`);
  const d3 = await activatePromotionAction(undefined, fd({ spaceId: espacos[2]!, type: 'destaque' }));
  assert('o 3º Destaque e recusado', !d3.ok, d3.message ?? '');
  assert('a mensagem explica que nao acumula e quando renova', /ciclo/i.test(d3.message ?? '') && /acumul/i.test(d3.message ?? ''), d3.message ?? '');
  const t1 = await activatePromotionAction(undefined, fd({ spaceId: espacos[2]!, type: 'turbo' }));
  assert('o 1 Turbo do ciclo funciona', t1.ok, t1.message ?? '');
  const t2 = await activatePromotionAction(undefined, fd({ spaceId: espacos[3]!, type: 'turbo' }));
  assert('o 2º Turbo e recusado', !t2.ok, t2.message ?? '');
  const uso1 = await getBenefitUsage(ids.pix);
  expect('o saldo zerou nos dois', [uso1.destaque.remaining, uso1.turbo.remaining, uso1.destaque.used, uso1.turbo.used], [0, 0, 2, 1]);
  const [ligadas] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM promotions WHERE owner_id = ${ids.pix} AND premium_cycle_id = ${c1[0]!.id} AND source = 'premium_benefit'`;
  expect('as 3 promocoes ficam ligadas ao ciclo que as financiou', ligadas?.n, 3);

  // =========================================================================
  secao('5. Renovacao — cobranca nova gerada pelo Asaas, paga ANTES do fim do ciclo');
  // =========================================================================

  const renov1 = `pay_renov1_${tag}`;
  await evento('PAYMENT_CREATED', { id: renov1, value: 119.9, subscription: subPix.id, billingType: 'PIX', dueDate: '2099-01-10' });
  const cobsRenov = await cobrancas(ids.pix);
  expect('a renovacao e registrada como cobranca pendente (valor do gateway, ligada a assinatura)',
    [cobsRenov.length, cobsRenov[1]?.status, cobsRenov[1]?.amount_cents, cobsRenov[1]?.provider_subscription_id], [2, 'pending', 11990, subPix.id]);
  expect('a renovacao nao cria ciclo ainda', (await ciclos(ids.pix)).length, 1);
  const avRenov = await avisos(ids.pix);
  assert('Pix: a pessoa e avisada de que ha uma renovacao para pagar', avRenov.some((a) => a.title === 'Renove seu Premium'), JSON.stringify(avRenov));
  const visaoRenov = await getPremiumOverview(ids.pix);
  expect('a tela mostra a renovacao em aberto (e segue Premium)', [visaoRenov.isActive, visaoRenov.openCharge?.dueDate], [true, '2099-01-10']);

  await evento('PAYMENT_RECEIVED', { id: renov1, value: 119.9, netValue: 117.91, subscription: subPix.id, billingType: 'PIX' });
  const c2 = await ciclos(ids.pix);
  expect('a renovacao paga gera o 2º ciclo', c2.length, 2);
  const [colado] = await sql<{ colado: boolean }[]>`SELECT (${c2[1]!.starts_at}::timestamptz = ${c2[0]!.ends_at}::timestamptz) AS colado`;
  assert('pagou ANTES do fim: o 2º ciclo comeca exatamente quando o 1º termina (sem buraco, sem perder dia pago)', colado?.colado === true);
  const uso2 = await getBenefitUsage(ids.pix);
  expect('o ciclo 1 continua valendo ate o fim — o saldo dele segue zerado', [uso2.cycle?.number, uso2.destaque.remaining], [1, 0]);

  await envelhecer(ids.pix, 31);
  const uso3 = await getBenefitUsage(ids.pix);
  expect('quando o ciclo 1 acaba, entra o 2º: Premium sem interrupcao', [uso3.premium, uso3.cycle?.number], [true, 2]);
  expect('os beneficios do ciclo novo comecam do ZERO (nao acumulam: sobraria 0 mesmo se tivesse sobrado)',
    [uso3.destaque.used, uso3.destaque.remaining, uso3.turbo.used, uso3.turbo.remaining], [0, 2, 0, 1]);
  const dNovo = await activatePromotionAction(undefined, fd({ spaceId: espacos[3]!, type: 'destaque' }));
  assert('um Destaque do ciclo novo funciona', dNovo.ok, dNovo.message ?? '');

  // =========================================================================
  secao('6. Cancelar nao encerra na hora — Premium ate o fim do periodo pago');
  // =========================================================================

  const antesCancelar = (await ciclos(ids.pix)).at(-1)!;
  const rCancela = await cancelPremiumAction();
  assert('cancelar a renovacao funciona', rCancela.ok, rCancela.message ?? '');
  assert('a mensagem diz ate quando segue Premium e que nao ha reembolso proporcional', /continua Premium/i.test(rCancela.message ?? '') && /reembolso/i.test(rCancela.message ?? ''), rCancela.message ?? '');
  const m3 = await membro(ids.pix);
  expect('a renovacao fica cancelada, mas o status continua ativo (nao encerrou na hora)', [m3?.cancel_at_period_end, m3?.status], [true, 'active']);
  expect('o Asaas confirmou o cancelamento da recorrencia (fica a marca de confirmacao)', m3?.provider_cancelled_at != null, true);
  expect('a assinatura foi cancelada no gateway', testbed.asaasSubscriptions.get(subPix.id)?.status, 'CANCELLED');
  expect('segue Premium', await isPremium(ids.pix), true);
  const ciclosAposCancelar = await ciclos(ids.pix);
  expect('o ciclo vigente NAO foi encurtado', ciclosAposCancelar.at(-1)?.ends_at.getTime(), antesCancelar.ends_at.getTime());
  const usoAposCancelar = await getBenefitUsage(ids.pix);
  assert('ainda usa os beneficios do ciclo ate o fim', usoAposCancelar.premium && usoAposCancelar.turbo.remaining === 1);
  const tCancel = await activatePromotionAction(undefined, fd({ spaceId: espacos[4]!, type: 'turbo' }));
  assert('de fato: um Turbo e ativado depois de cancelar a renovacao', tCancel.ok, tCancel.message ?? '');
  const visaoNaoRenova = await getPremiumOverview(ids.pix);
  expect('a tela mostra "Premium que nao renova"', [visaoNaoRenova.state, visaoNaoRenova.isActive], ['active_not_renewing', true]);
  const rCancelaDeNovo = await cancelPremiumAction();
  assert('cancelar de novo e recusado', !rCancelaDeNovo.ok, rCancelaDeNovo.message ?? '');
  expect('nenhuma cobranca nova e criada pela assinatura cancelada', (await ciclos(ids.pix)).length, 2);

  // ---- Reativar: nova recorrencia, que so cobra no fim do periodo ja pago.
  const subsAntes = testbed.asaasSubscriptions.size;
  const rReativa = await resumePremiumAction();
  assert('reativar a renovacao funciona', rReativa.ok, rReativa.message ?? '');
  expect('uma NOVA recorrencia foi criada no gateway', testbed.asaasSubscriptions.size, subsAntes + 1);
  const m4 = await membro(ids.pix);
  const subNova = testbed.asaasSubscriptions.get(m4!.provider_subscription_id!)!;
  const fimAtual = (await ciclos(ids.pix)).at(-1)!.ends_at;
  const [fimBr] = await sql<{ d: string }[]>`SELECT (${fimAtual}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`;
  expect('a nova recorrencia so comeca a cobrar no fim do periodo atual', subNova.nextDueDate, fimBr!.d);
  expect('o cancelamento agendado some', [m4?.cancel_at_period_end, m4?.provider_cancelled_at, m4?.status], [false, null, 'active']);
  assert('a recorrencia e outra, nao a cancelada', m4?.provider_subscription_id !== subPix.id);

  // ---- Cancelar de novo e deixar o periodo acabar: o Premium termina.
  await cancelPremiumAction();
  await envelhecer(ids.pix, 40);
  expect('depois do fim do periodo pago, NAO e mais Premium', await isPremium(ids.pix), false);
  const sweep = await runPremiumMaintenance();
  assert('a manutencao marcou a assinatura como encerrada', sweep.synced >= 1, JSON.stringify(sweep));
  const m5 = await membro(ids.pix);
  expect('cancelada por escolha da pessoa: status "cancelled" com o momento', [m5?.status, m5?.cancelled_at != null], ['cancelled', true]);
  const visaoFim = await getPremiumOverview(ids.pix);
  expect('a tela mostra "Premium terminou"', [visaoFim.state, visaoFim.isActive, visaoFim.lastEndedAt != null], ['ended', false, true]);
  const dDepois = await activatePromotionAction(undefined, fd({ spaceId: espacos[0]!, type: 'destaque' }));
  assert('sem Premium os beneficios nao funcionam', !dDepois.ok, dDepois.message ?? '');
  const avFim = await avisos(ids.pix);
  assert('a pessoa foi avisada de que o Premium terminou', avFim.some((a) => a.title === 'Seu Premium terminou'), JSON.stringify(avFim.map((a) => a.title)));
  await runPremiumMaintenance();
  expect('rodar a manutencao de novo NAO repete o aviso', (await avisos(ids.pix)).filter((a) => a.title === 'Seu Premium terminou').length, 1);

  // =========================================================================
  secao('7. Cartao — confirmado pelo gateway ativa; recusa nao ativa');
  // =========================================================================

  entrarComo(ids.cartao, 'Premium cartao');
  const cpfCartao = cpfValido();
  const aCartao = await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'card', cpfCnpj: cpfCartao })));
  assert('assinar no cartao redireciona para a fatura', aCartao.redirecionou);
  const subCartao = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.cartao}`)!;
  expect('forma de pagamento mandada ao Asaas: cartao', subCartao.billingType, 'CREDIT_CARD');
  const [cobCartao] = await cobrancas(ids.cartao);
  const recusa = await evento('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', { id: cobCartao!.provider_payment_id, subscription: subCartao.id, billingType: 'CREDIT_CARD' });
  assert('cartao recusado processado', recusa.ok, JSON.stringify(recusa));
  expect('cartao recusado NAO ativa o Premium', await isPremium(ids.cartao), false);
  const [cobRecusada] = await cobrancas(ids.cartao);
  expect('o motivo fica gravado na cobranca', cobRecusada?.failure_reason, 'Cartão recusado pela operadora.');
  assert('e a pessoa e avisada', (await avisos(ids.cartao)).some((a) => a.title === 'Pagamento do Premium recusado'));

  await evento('PAYMENT_CONFIRMED', { id: cobCartao!.provider_payment_id, value: 119.9, subscription: subCartao.id, billingType: 'CREDIT_CARD' });
  expect('cartao confirmado ativa o Premium (o dinheiro cai depois, mas o pagamento esta confirmado)', await isPremium(ids.cartao), true);
  const [cobCartaoOk] = await cobrancas(ids.cartao);
  expect('a cobranca fica "confirmada" e a forma e cartao', [cobCartaoOk?.status, cobCartaoOk?.method], ['confirmed', 'credit_card']);
  expect('sem lancamento de receita ainda (o dinheiro so fica disponivel no RECEIVED)',
    (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM ledger_entries WHERE premium_charge_id = ${cobCartaoOk!.id}`)[0]!.n, 0);
  await evento('PAYMENT_RECEIVED', { id: cobCartao!.provider_payment_id, value: 119.9, netValue: 115.82, subscription: subCartao.id, billingType: 'CREDIT_CARD' });
  expect('o RECEIVED (D+32) so completa tarifa e razao — nao cria outro ciclo', (await ciclos(ids.cartao)).length, 1);
  const [cobCartaoRec] = await cobrancas(ids.cartao);
  expect('tarifa do cartao registrada (2,99% + R$ 0,49 = R$ 4,08)', [cobCartaoRec?.status, cobCartaoRec?.gateway_fee_cents], ['received', 408]);

  // =========================================================================
  secao('8. Concorrencia — duplo clique e confirmacoes simultaneas');
  // =========================================================================

  entrarComo(ids.corrida, 'Premium corrida');
  const cpfCorrida = cpfValido();
  const antesCorrida = testbed.asaasSubscriptions.size;
  const [r1, r2] = await Promise.all([
    comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfCorrida }))),
    comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfCorrida }))),
  ]);
  const criadas = testbed.asaasSubscriptions.size - antesCorrida;
  expect('dois cliques ao mesmo tempo: UMA assinatura no gateway', criadas, 1);
  assert('o segundo clique nao quebra (espera ou reaproveita)', [r1, r2].every((r) => r.redirecionou || !('resultado' in r) || r.resultado !== undefined));
  const cobsCorrida = await cobrancas(ids.corrida);
  expect('e UMA cobranca nossa', cobsCorrida.length, 1);

  const subCorrida = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.corrida}`)!;
  const pagCorrida = cobsCorrida[0]!.provider_payment_id;
  const [e1, e2, e3] = await Promise.all([
    evento('PAYMENT_RECEIVED', { id: pagCorrida, value: 119.9, netValue: 117.91, subscription: subCorrida.id }),
    evento('PAYMENT_CONFIRMED', { id: pagCorrida, value: 119.9, subscription: subCorrida.id }),
    evento('PAYMENT_RECEIVED', { id: pagCorrida, value: 119.9, netValue: 117.91, subscription: subCorrida.id }),
  ]);
  assert('as tres entregas simultaneas respondem ok', e1.ok && e2.ok && e3.ok, JSON.stringify([e1, e2, e3]));
  expect('confirmacoes simultaneas da MESMA cobranca geram EXATAMENTE um ciclo', (await ciclos(ids.corrida)).length, 1);

  // =========================================================================
  secao('9. Estorno e contestacao — o dinheiro volta, o direito tambem');
  // =========================================================================

  entrarComo(ids.estorno, 'Premium estorno');
  await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfValido() })));
  const subEst = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.estorno}`)!;
  const [cobEst] = await cobrancas(ids.estorno);
  await evento('PAYMENT_RECEIVED', { id: cobEst!.provider_payment_id, value: 119.9, netValue: 117.91, subscription: subEst.id });
  assert('assinante de teste e Premium', await isPremium(ids.estorno));
  const espEst = await criarAnuncio(sql, { ownerId: ids.estorno, slug: `${tag}-estorno`, precoCents: 30000 });
  const dEst = await activatePromotionAction(undefined, fd({ spaceId: espEst, type: 'destaque' }));
  assert('usou um Destaque do ciclo', dEst.ok, dEst.message ?? '');

  await evento('PAYMENT_REFUNDED', { id: cobEst!.provider_payment_id, value: 119.9, subscription: subEst.id });
  expect('estornado: nao e mais Premium', await isPremium(ids.estorno), false);
  const [cEst] = await ciclos(ids.estorno);
  expect('o ciclo termina antes do fim, com o motivo', [cEst?.ended_early_at != null, (await sql<{ r: string }[]>`SELECT ended_early_reason AS r FROM premium_cycles WHERE id = ${cEst!.id}`)[0]?.r], [true, 'cobranca_estornada']);
  const [promoEst] = await sql<{ status: string }[]>`SELECT status::text AS status FROM promotions WHERE owner_id = ${ids.estorno}`;
  expect('a promocao que esse ciclo financiou foi cancelada', promoEst?.status, 'cancelled');
  const [cobEstornada] = await cobrancas(ids.estorno);
  expect('a cobranca fica estornada', [cobEstornada?.status, cobEstornada?.refunded_cents], ['refunded', 11990]);
  const razaoEst = await sql<{ type: string; amount_cents: number }[]>`
    SELECT type::text AS type, amount_cents FROM ledger_entries WHERE premium_charge_id = ${cobEst!.id} ORDER BY amount_cents ASC`;
  expect('livro-razao: a devolucao entra como lancamento de sinal contrario (−R$ 119,90), sem apagar o que entrou',
    razaoEst.map((r) => [r.type, r.amount_cents]), [['refund', -11990], ['gateway_fee', -199], ['charge_captured', 11990]]);
  expect('a soma do razao da cobranca e o que a plataforma realmente ficou (−R$ 1,99 de tarifa)', razaoEst.reduce((a, r) => a + r.amount_cents, 0), -199);
  const tardeEst = await evento('PAYMENT_RECEIVED', { id: cobEst!.provider_payment_id, value: 119.9, netValue: 117.91, subscription: subEst.id });
  assert('um aviso de pagamento que chega DEPOIS do estorno nao quebra', tardeEst.ok, JSON.stringify(tardeEst));
  expect('e nao reativa o Premium', await isPremium(ids.estorno), false);
  expect('nem cria ciclo novo', (await ciclos(ids.estorno)).length, 1);
  const dEst2 = await activatePromotionAction(undefined, fd({ spaceId: espEst, type: 'destaque' }));
  assert('sem Premium o beneficio nao funciona', !dEst2.ok, dEst2.message ?? '');
  assert('a pessoa e avisada do estorno', (await avisos(ids.estorno)).some((a) => a.title === 'Pagamento do Premium estornado'));

  // contestacao (chargeback) — mesma consequencia, com o proprio rotulo
  await sql`UPDATE premium_memberships SET status = 'expired' WHERE user_id = ${ids.estorno}`;
  const novaCob = `pay_cb_${tag}`;
  await evento('PAYMENT_CREATED', { id: novaCob, value: 119.9, subscription: subEst.id });
  await evento('PAYMENT_CONFIRMED', { id: novaCob, value: 119.9, subscription: subEst.id, billingType: 'CREDIT_CARD' });
  assert('uma nova cobranca paga reativa o Premium', await isPremium(ids.estorno));
  const cbr = await evento('PAYMENT_CHARGEBACK_REQUESTED', { id: novaCob, value: 119.9, subscription: subEst.id });
  assert('contestacao processada', cbr.ok, JSON.stringify(cbr));
  expect('contestado: nao e mais Premium', await isPremium(ids.estorno), false);
  const cobsEst = await cobrancas(ids.estorno);
  expect('a cobranca fica marcada como contestada', cobsEst.at(-1)?.status, 'chargeback');
  const [cbRazao] = await sql<{ type: string }[]>`SELECT type::text AS type FROM ledger_entries WHERE premium_charge_id = ${cobsEst.at(-1)!.id} ORDER BY created_at DESC LIMIT 1`;
  expect('so o Premium trata o evento de contestacao: o razao tem o lancamento "chargeback"', cbRazao?.type, 'chargeback');
  const ignorado = await processAsaasWebhook({ event: 'PAYMENT_CHARGEBACK_REQUESTED', payment: { id: 'pay_desconhecida_xyz', value: 10 } });
  assert('contestacao de cobranca que nao e do Premium e ignorada sem erro', ignorado.ok, JSON.stringify(ignorado));

  // =========================================================================
  secao('10. Atraso e fim sem renovacao — a assinatura expira, mas um pagamento atrasado ainda vale');
  // =========================================================================

  entrarComo(ids.tardio, 'Premium tardio');
  await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfValido() })));
  const subTar = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.tardio}`)!;
  const [cobTar] = await cobrancas(ids.tardio);
  await evento('PAYMENT_RECEIVED', { id: cobTar!.provider_payment_id, value: 119.9, netValue: 117.91, subscription: subTar.id });
  const renovTar = `pay_tar_${tag}`;
  await evento('PAYMENT_CREATED', { id: renovTar, value: 119.9, subscription: subTar.id, billingType: 'PIX', dueDate: '2099-02-10' });
  const venc = await evento('PAYMENT_OVERDUE', { id: renovTar, value: 119.9, subscription: subTar.id });
  assert('cobranca vencida processada', venc.ok, JSON.stringify(venc));
  const cobsTar = await cobrancas(ids.tardio);
  expect('a renovacao vencida fica "overdue"', cobsTar.at(-1)?.status, 'overdue');
  expect('vencida a renovacao, a pessoa AINDA e Premium (o periodo ja pago segue valendo)', await isPremium(ids.tardio), true);
  assert('e e avisada do atraso', (await avisos(ids.tardio)).some((a) => a.title === 'Renovação do Premium em atraso'));

  await envelhecer(ids.tardio, 33);
  expect('acabou o periodo pago sem renovacao: nao e mais Premium', await isPremium(ids.tardio), false);
  await runPremiumMaintenance();
  expect('a manutencao marca a assinatura como expirada', (await membro(ids.tardio))?.status, 'expired');
  expect('mas a recorrencia no gateway ainda NAO e cancelada na hora (pagamento atrasado ainda pode chegar)', (await membro(ids.tardio))?.provider_cancelled_at, null);

  // pagamento atrasado, FORA da janela de continuidade (24 h): o ciclo novo comeca na confirmacao.
  await evento('PAYMENT_RECEIVED', { id: renovTar, value: 119.9, netValue: 117.91, subscription: subTar.id });
  const cTar = await ciclos(ids.tardio);
  expect('o pagamento atrasado gera o 2º ciclo', cTar.length, 2);
  const [naoColado] = await sql<{ depois: boolean; perto: boolean }[]>`
    SELECT (${cTar[1]!.starts_at}::timestamptz > ${cTar[0]!.ends_at}::timestamptz + interval '1 day') AS depois,
           abs(extract(epoch FROM (now() - ${cTar[1]!.starts_at}::timestamptz))) < 60 AS perto`;
  assert('fora da janela: o ciclo novo comeca AGORA (nao paga por dias sem benefício, nao ganha dias de graca)', naoColado?.depois === true && naoColado?.perto === true);
  expect('de volta ao Premium', await isPremium(ids.tardio), true);
  expect('e a assinatura volta a "ativa"', (await membro(ids.tardio))?.status, 'active');

  // dentro da janela de continuidade: o ciclo continua colado no anterior.
  await envelhecer(ids.tardio, 31); // o 2º ciclo acaba
  const renovTar2 = `pay_tar2_${tag}`;
  await evento('PAYMENT_CREATED', { id: renovTar2, value: 119.9, subscription: subTar.id, billingType: 'CREDIT_CARD', dueDate: '2099-03-10' });
  await envelhecerHoras(ids.tardio, 2); // o ciclo acabou ha ~2 horas (alem de 31 dias): ainda dentro das 24 h
  await evento('PAYMENT_CONFIRMED', { id: renovTar2, value: 119.9, subscription: subTar.id, billingType: 'CREDIT_CARD' });
  const cTar3 = await ciclos(ids.tardio);
  expect('renovacao confirmada logo depois do fim: 3º ciclo', cTar3.length, 3);
  const [colado3] = await sql<{ colado: boolean }[]>`SELECT (${cTar3[2]!.starts_at}::timestamptz = ${cTar3[1]!.ends_at}::timestamptz) AS colado`;
  assert('dentro das 24 h de continuidade o ciclo comeca no fim do anterior (cartao cobrado algumas horas depois do vencimento nao abre buraco)', colado3?.colado === true);

  // =========================================================================
  secao('11. Valor menor que o combinado nao ativa');
  // =========================================================================

  entrarComo(ids.menor, 'Premium menor');
  await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfValido() })));
  const subMenor = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.menor}`)!;
  const [cobMenor] = await cobrancas(ids.menor);
  await sql`UPDATE premium_charges SET amount_cents = 100 WHERE id = ${cobMenor!.id}`; // alguem mexeu na cobranca no gateway
  await evento('PAYMENT_CONFIRMED', { id: cobMenor!.provider_payment_id, value: 1, subscription: subMenor.id });
  expect('pagou menos que o preco combinado: NAO vira Premium', await isPremium(ids.menor), false);
  expect('nenhum ciclo foi criado', (await ciclos(ids.menor)).length, 0);
  const [cobMenorDepois] = await cobrancas(ids.menor);
  assert('fica registrado para o suporte', /revis/i.test(cobMenorDepois?.failure_reason ?? ''), cobMenorDepois?.failure_reason ?? '');
  const [auditoriaMenor] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'premium.charge_amount_mismatch' AND entity_id = ${cobMenor!.id}`;
  expect('e na auditoria', auditoriaMenor?.n, 1);

  // =========================================================================
  secao('12. Concessao administrativa cede lugar ao pagamento');
  // =========================================================================

  await darPremium(sql, ids.admin, { dias: 20 });
  expect('com a concessao de teste e Premium, mas sem direito financeiro', [await isPremium(ids.admin), await isPremiumFinancial(ids.admin)], [true, false]);
  entrarComo(ids.admin, 'Premium admin');
  const aAdmin = await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfValido() })));
  assert('quem esta no modo teste pode assinar de verdade', aAdmin.redirecionou);
  const mAdmin = await membro(ids.admin);
  expect('continua ativo enquanto o pagamento nao chega, agora ligado a assinatura', [mAdmin?.status, mAdmin?.source, mAdmin?.plan_cents], ['active', 'subscription', 11990]);
  const subAdmin = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.admin}`)!;
  const [cobAdmin] = await cobrancas(ids.admin);
  await evento('PAYMENT_RECEIVED', { id: cobAdmin!.provider_payment_id, value: 119.9, netValue: 117.91, subscription: subAdmin.id });
  const cAdmin = await ciclos(ids.admin);
  expect('o pagamento cria o ciclo pago e encerra o ciclo de teste', [cAdmin.length, cAdmin[0]?.ended_early_at != null, cAdmin[1]?.source], [2, true, 'subscription']);
  expect('agora tem direito financeiro (e so agora)', await isPremiumFinancial(ids.admin), true);

  // =========================================================================
  secao('13. Assinatura nunca paga — a manutencao descarta e cancela no gateway');
  // =========================================================================

  entrarComo(ids.abandono, 'Premium abandono');
  await comRedirect(() => subscribePremiumAction(undefined, fd({ method: 'pix', cpfCnpj: cpfValido() })));
  const subAband = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference === `premium:${ids.abandono}`)!;
  await sql`UPDATE premium_memberships SET updated_at = now() - interval '5 days' WHERE user_id = ${ids.abandono}`;
  await runPremiumMaintenance();
  expect('parada ha mais de 3 dias, vira "expired"', (await membro(ids.abandono))?.status, 'expired');
  expect('a recorrencia ainda nao e cancelada (3 dias de espera)', testbed.asaasSubscriptions.get(subAband.id)?.status, 'ACTIVE');
  await sql`UPDATE premium_memberships SET updated_at = now() - interval '5 days' WHERE user_id = ${ids.abandono}`;
  const manut = await runPremiumMaintenance();
  assert('passada a espera, a manutencao cancela a recorrencia no gateway', manut.cancelledAtGateway >= 1, JSON.stringify(manut));
  expect('a assinatura esta cancelada no Asaas', testbed.asaasSubscriptions.get(subAband.id)?.status, 'CANCELLED');
  expect('e a confirmacao fica gravada', (await membro(ids.abandono))?.provider_cancelled_at != null, true);
  const manut2 = await runPremiumMaintenance();
  expect('de novo: nada a cancelar (idempotente)', manut2.cancelledAtGateway, 0);
  const visaoAband = await getPremiumOverview(ids.abandono);
  assert('a pessoa nunca foi Premium: a tela nao mostra Premium nem pagamento pendente', !visaoAband.isActive && visaoAband.state !== 'pending_payment', visaoAband.state);

  // =========================================================================
  secao('14. Mapa — alcance ampliado do Premium');
  // =========================================================================

  // Area isolada (Porto Alegre) — nenhum outro teste usa. 1 grau de latitude ~ 111,2 km.
  const C = { lat: -30.03, lng: -51.22 };
  // 1 grau de latitude ~ 111,2 km; 1 grau de longitude encolhe com o cosseno da latitude.
  const kmLat = (k: number) => k / 111.2;
  const kmLng = (k: number) => k / (111.2 * Math.cos((C.lat * Math.PI) / 180));
  const bbox = { west: C.lng - 0.4, south: C.lat - 0.4, east: C.lng + 0.4, north: C.lat + 0.4 };
  const consulta = (extra: Partial<Parameters<typeof exploreSpaces>[0]> = {}) =>
    exploreSpaces({
      bbox, zoom: 11, center: C, radiusMeters: 2000, priceMaxCents: null, categories: [], availableNow: false, ...extra,
    });

  await darPremium(sql, ids.mapa, { pago: true });
  await darPremium(sql, ids.mapaC, { dias: 10 }); // concessao de teste tambem e Premium (beneficio nao financeiro)
  const dentro = await criarAnuncio(sql, { ownerId: ids.mapaB, slug: `${tag}-m-dentro`, precoCents: 20000, lat: C.lat, lng: C.lng });
  const premium5 = await criarAnuncio(sql, { ownerId: ids.mapa, slug: `${tag}-m-p5`, precoCents: 20000, lat: C.lat + kmLat(5), lng: C.lng });
  const premium9 = await criarAnuncio(sql, { ownerId: ids.mapa, slug: `${tag}-m-p9`, precoCents: 20000, lat: C.lat, lng: C.lng + kmLng(9) });
  const premium14 = await criarAnuncio(sql, { ownerId: ids.mapa, slug: `${tag}-m-p14`, precoCents: 20000, lat: C.lat - kmLat(14), lng: C.lng });
  const normal5 = await criarAnuncio(sql, { ownerId: ids.mapaB, slug: `${tag}-m-n5`, precoCents: 20000, lat: C.lat - kmLat(5), lng: C.lng });
  const premiumLoja = await criarAnuncio(sql, { ownerId: ids.mapaC, slug: `${tag}-m-loja`, precoCents: 20000, tipo: 'loja', lat: C.lat, lng: C.lng - kmLng(6) });
  const destaque7 = await criarAnuncio(sql, { ownerId: ids.mapaB, slug: `${tag}-m-d7`, precoCents: 20000, lat: C.lat + kmLat(5), lng: C.lng + kmLng(5) });
  const turbo6 = await criarAnuncio(sql, { ownerId: ids.mapaB, slug: `${tag}-m-t6`, precoCents: 20000, lat: C.lat - kmLat(4), lng: C.lng - kmLng(4) });
  await sql`INSERT INTO promotions (space_id, owner_id, type, source, expires_at) VALUES (${destaque7}, ${ids.mapaB}, 'destaque', 'purchase', now() + interval '3 days')`;
  await sql`INSERT INTO promotions (space_id, owner_id, type, source, expires_at) VALUES (${turbo6}, ${ids.mapaB}, 'turbo', 'purchase', now() + interval '3 days')`;

  const r0 = await consulta();
  const idsPins = r0.pins.map((p) => p.id);
  assert('dentro do raio aparece o anuncio do dono comum', idsPins.includes(dentro));
  assert('o anuncio Premium a 5 km (fora do raio de 2 km, dentro de 2+10) aparece', idsPins.includes(premium5));
  assert('o anuncio Premium a 9 km tambem', idsPins.includes(premium9));
  assert('o anuncio Premium a 14 km (alem de 2+10 km) NAO aparece', !idsPins.includes(premium14));
  assert('o anuncio de quem NAO e Premium a 5 km NAO aparece (nao ha alcance ampliado para ele)', !idsPins.includes(normal5));
  assert('a concessao de teste tambem amplia o alcance (e beneficio nao financeiro)', idsPins.includes(premiumLoja));
  const premiumPins = r0.pins.filter((p) => [premium5, premium9, premiumLoja].includes(p.id));
  assert('os Premium aparecem como anuncios NORMAIS: sem rotulo de Destaque nem de Turbo', premiumPins.every((p) => p.promotion === null));
  assert('e marcados como fora do raio (a tela diz a verdade sobre a distancia)', premiumPins.every((p) => p.outside === true));
  expect('Turbo e Destaque seguem aparecendo fora do raio', [idsPins.includes(turbo6), idsPins.includes(destaque7)], [true, true]);
  const pos = (id: string) => idsPins.indexOf(id);
  assert('ordem fora do raio: Turbo, depois Destaque, depois os Premium', pos(turbo6) < pos(destaque7) && pos(destaque7) < Math.min(pos(premium5), pos(premium9), pos(premiumLoja)),
    `turbo=${pos(turbo6)} destaque=${pos(destaque7)} premium=${[pos(premium5), pos(premium9), pos(premiumLoja)]}`);
  expect('contagens: 2 pelo mecanismo de Destaque/Turbo e 3 pelo alcance ampliado', [r0.outsideShown, r0.reachShown], [2, 3]);

  // filtros valem para o alcance ampliado
  const soGaragem = await consulta({ categories: ['garagem'] });
  assert('o filtro de categoria vale para o alcance ampliado (a loja Premium some)', !soGaragem.pins.some((p) => p.id === premiumLoja) && soGaragem.pins.some((p) => p.id === premium5));
  const barato = await consulta({ priceMaxCents: 10000 });
  assert('o filtro de preco tambem (nada acima de R$ 100)', barato.pins.length === 0 || barato.pins.every((p) => (p.priceMonthlyCents ?? 0) <= 10000));
  await sql`UPDATE spaces SET quantity_offered = 1 WHERE id = ${premium5}`;
  const semRaio = await consulta({ radiusMeters: null });
  expect('sem raio ("qualquer distancia") nao existe "fora do raio": o alcance ampliado nao entra', [semRaio.reachShown, semRaio.pins.filter((p) => p.outside).length], [0, 0]);

  // teto de 5 individuais
  const extras: string[] = [];
  for (let i = 0; i < 6; i++) {
    extras.push(await criarAnuncio(sql, { ownerId: ids.mapa, slug: `${tag}-m-x${i}`, precoCents: 20000, lat: C.lat + kmLat(3 + i * 0.3), lng: C.lng + kmLng(2) }));
  }
  const rTeto = await consulta();
  expect('no maximo 5 anuncios Premium individuais fora do raio', rTeto.reachShown, 5);
  expect('mesmo com 9 candidatos, os de Destaque/Turbo continuam alem desse teto', [rTeto.pins.some((p) => p.id === turbo6), rTeto.pins.some((p) => p.id === destaque7)], [true, true]);
  const premiumFora = rTeto.pins.filter((p) => p.outside && p.promotion === null);
  assert('os mais proximos primeiro', premiumFora.length === 5, `${premiumFora.length} pins`);
  await sql`UPDATE platform_settings SET value = '2'::jsonb WHERE key = 'premium.map_max_outside_pins'`;
  const rTeto2 = await consulta();
  expect('o teto vem do banco (mudar para 2 e valer na proxima consulta)', rTeto2.reachShown, 2);
  await sql`UPDATE platform_settings SET value = '5'::jsonb WHERE key = 'premium.map_max_outside_pins'`;
  await sql`UPDATE platform_settings SET value = '6000'::jsonb WHERE key = 'premium.map_extra_radius_m'`;
  await sql`UPDATE platform_settings SET value = '20'::jsonb WHERE key = 'premium.map_max_outside_pins'`;
  const rRaio = await consulta();
  assert('o alcance extra tambem vem do banco (6 km: o de 9 km sai, o de 5 km fica)', rRaio.pins.some((p) => p.id === premium5) && !rRaio.pins.some((p) => p.id === premium9),
    JSON.stringify({ reach: rRaio.reachShown, tem5: rRaio.pins.some((p) => p.id === premium5), tem9: rRaio.pins.some((p) => p.id === premium9), n: rRaio.pins.length }));
  await sql`UPDATE platform_settings SET value = '10000'::jsonb WHERE key = 'premium.map_extra_radius_m'`;
  await sql`UPDATE platform_settings SET value = '5'::jsonb WHERE key = 'premium.map_max_outside_pins'`;

  // sem Premium vigente, o anuncio volta a ficar so no raio normal
  await sql`DELETE FROM promotions WHERE space_id IN (${destaque7}, ${turbo6})`;
  await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
  await sql`UPDATE premium_cycles SET ended_early_at = now() WHERE user_id = ${ids.mapa} AND ended_early_at IS NULL`;
  await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
  const rSem = await consulta();
  assert('acabou o Premium do dono: os anuncios dele saem do alcance ampliado', !rSem.pins.some((p) => [premium5, premium9, ...extras].includes(p.id)));
  assert('o anuncio do outro Premium (concessao de teste) segue', rSem.pins.some((p) => p.id === premiumLoja));
}

async function limparTudo() {
  try {
    await limparPremium(sql, todos);
    await sql`DELETE FROM notifications WHERE user_id = ANY(${todos})`;
    await sql`DELETE FROM spaces WHERE owner_id = ANY(${todos})`;
    await sql`DELETE FROM webhook_events WHERE provider_event_id LIKE ${'%_' + tag}`;
    await sql`DELETE FROM webhook_events WHERE (payload->'payment'->>'subscription') IN (SELECT provider_subscription_id FROM premium_memberships WHERE user_id = ANY(${todos}))`;
    await sql`UPDATE platform_settings SET value = '5'::jsonb WHERE key = 'premium.map_max_outside_pins'`;
    await sql`UPDATE platform_settings SET value = '10000'::jsonb WHERE key = 'premium.map_extra_radius_m'`;
    try {
      await sql`DELETE FROM renter_billing_profiles WHERE user_id = ANY(${todos})`;
      await sql`DELETE FROM profiles WHERE id = ANY(${todos})`;
      await sql`DELETE FROM auth.users WHERE id = ANY(${todos})`;
    } catch (err) {
      console.log(`  \x1b[2mperfil(is) de teste com lancamento em audit_logs — fica como residuo inerte (esperado): ${String(err).slice(0, 120)}\x1b[0m`);
    }
  } catch (err) {
    console.log(`  \x1b[33maviso na limpeza:\x1b[0m ${String(err).slice(0, 200)}`);
  }
}

main()
  .catch((err) => {
    failed++;
    falhas.push('erro fatal');
    console.error('\n\x1b[31mErro fatal:\x1b[0m', err);
  })
  .finally(async () => {
    await limparTudo();
    await testbed?.close();
    console.log(
      `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` + (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : ''),
    );
    if (falhas.length) console.log(`Falhas:\n - ${falhas.join('\n - ')}`);
    await sql.end();
    process.exit(failed > 0 ? 1 : 0);
  });

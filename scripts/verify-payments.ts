/**
 * Verificacao do cliente Asaas e do webhook (Parte 4 — pagamentos, Fase 7).
 *
 * SEM credencial real: o cliente HTTP (src/lib/payments/asaas.ts) e testado
 * contra o mesmo testbed local que ja serve Supabase/CEP/mapa/geocodificacao
 * (scripts/testbed/server.ts, agora tambem com rotas /v3/* no formato Asaas).
 * O webhook (src/lib/payments/webhook.ts) e testado contra Postgres real,
 * simulando entregas de evento como o Asaas mandaria — inclusive reentrega
 * duplicada, evento desconhecido e cobranca sem correspondencia.
 *
 * O que isto PROVA: que o cliente monta a requisicao certa (header, corpo,
 * split), que o webhook processa idempotentemente e transiciona o estado
 * certo no banco. O que isto NAO PROVA: que o Asaas de verdade se comporta
 * exatamente como o testbed — os nomes de campo usados aqui vieram de busca,
 * nao de leitura direta da documentacao (ver docs/PAGAMENTOS.md §4). Por
 * isso NENHUM destes testes usa credencial real, e nenhum deve, ate essa
 * lacuna ser fechada.
 *
 *   pnpm tsx scripts/verify-payments.ts
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

const tag = `pg-${Date.now()}`;
const donoId = crypto.randomUUID();
const renterId = crypto.randomUUID();
let testbed: Testbed;

async function seedPerfis() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    (${renterId}, ${`${tag}-renter@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner' WHERE id=${donoId}`;
}

/*
 * Este teste NAO passa pela action de solicitar/aceitar — grava a reserva
 * ja aprovada direto por SQL, entao o espaco nunca precisa estar 'published'
 * nem ter fotos (o trigger `guard_publish_requires_photos` so trava a
 * TRANSICAO para 'published', que nunca acontece aqui).
 *
 * Fica 'draft' de proposito, e NUNCA em coordenada usada por outro fixture
 * (Colatina/-19.5386,-40.6295, usada por scripts/verify-busca.ts): uma vez
 * que este espaco tenha uma cobranca com lancamento no razao (secao 3), ele
 * fica ancorado no banco para sempre (mesma razao do `limpar()` parcial
 * abaixo) — se ficasse 'published' e no mesmo ponto, contaminaria pra sempre
 * a contagem de resultados de busca de QUALQUER execucao futura de
 * verify-busca.ts. Ja aconteceu uma vez nesta sessao; corrigido arquivando
 * as sobras manualmente E tirando a causa raiz aqui.
 */
async function seedEspacoDeTeste(precoCents: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces
      (owner_id, slug, type, title, description, district, city, state,
       available_from, price_monthly_cents, size_m2, draft_step,
       location, approx_location)
    VALUES
      (${donoId}, ${`${tag}-espaco`}, 'garagem', 'Garagem para teste de pagamento (nao aparece em busca)',
       'Descricao com mais de vinte caracteres para passar na regra do banco.',
       'Bairro de teste', 'Municipio de teste', 'ES', CURRENT_DATE, ${precoCents}, 18, 8,
       ST_SetSRID(ST_MakePoint(-40.0001, -18.0001), 4326),
       ST_SetSRID(ST_MakePoint(-40.0001, -18.0001), 4326))
    RETURNING id`;
  return row!.id;
}

/** Reserva ja aceita, pronta para entrar no fluxo de cobranca. */
async function seedBookingAprovada(espacoId: string, precoCents: number) {
  const amounts = computeBookingAmounts(precoCents, { renterFeeBps: 300, ownerFeeBps: 300 });
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO bookings
      (reference, space_id, renter_id, owner_id, status, start_date,
       monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
       owner_fee_cents, total_charged_cents, owner_payout_cents)
    VALUES
      (${`MP-${tag}`}, ${espacoId}, ${renterId}, ${donoId}, 'awaiting_payment', CURRENT_DATE,
       ${amounts.monthlyRentCents}, ${amounts.renterFeeBps}, ${amounts.ownerFeeBps},
       ${amounts.renterFeeCents}, ${amounts.ownerFeeCents}, ${amounts.totalChargedCents},
       ${amounts.ownerPayoutCents})
    RETURNING id`;
  return { bookingId: row!.id, amounts };
}

async function seedContaDono(walletId: string) {
  await sql`INSERT INTO owner_payout_accounts (owner_id, provider, provider_wallet_id, status, can_receive)
    VALUES (${donoId}, 'asaas', ${walletId}, 'approved', true)`;
}

async function seedSubscriptionEPayment(bookingId: string, amountCents: number, providerPaymentId: string, providerSubscriptionId: string) {
  const [sub] = await sql<{ id: string }[]>`
    INSERT INTO subscriptions (booking_id, provider, provider_subscription_id, status, method, amount_cents, billing_day)
    VALUES (${bookingId}, 'asaas', ${providerSubscriptionId}, 'pending_authorization', 'pix', ${amountCents}, 10)
    RETURNING id`;
  const subscriptionId = sub!.id;
  await sql`INSERT INTO payments (booking_id, subscription_id, provider, provider_payment_id, status, method, amount_cents, due_date)
    VALUES (${bookingId}, ${subscriptionId}, 'asaas', ${providerPaymentId}, 'pending', 'pix', ${amountCents}, CURRENT_DATE)`;
  return subscriptionId;
}

/*
 * Limpeza PARCIAL, de proposito. `ledger_entries` e append-only de verdade
 * (trigger recusa ate DELETE — testado acima, secao 3): uma vez que uma
 * cobranca deste teste gera lancamento no razao, `payments`/`subscriptions`/
 * `bookings`/`spaces`/`auth.users` ficam ancorados por FK RESTRICT embaixo
 * dela, para sempre — exatamente como aconteceria em produção com uma
 * reserva que teve movimentação financeira real. Cada execução usa um `tag`
 * novo (Date.now()), então as sobras de uma execução nunca colidem com a
 * próxima; só acumulam como histórico inerte no Postgres local de teste.
 * O que É seguro (e continua) apagar: o que não tem lançamento no razão.
 */
async function limpar() {
  const tentativas: [string, () => Promise<unknown>][] = [
    ['webhook_events', () => sql`DELETE FROM webhook_events WHERE provider_event_id LIKE ${`%${tag}%`}`],
    ['owner_payout_accounts', () => sql`DELETE FROM owner_payout_accounts WHERE owner_id = ${donoId}`],
    ['renter_billing_profiles', () => sql`DELETE FROM renter_billing_profiles WHERE user_id = ${renterId}`],
  ];
  for (const [tabela, executar] of tentativas) {
    try {
      await executar();
    } catch (err) {
      console.error(`limpeza de ${tabela} falhou:`, err instanceof Error ? err.message : err);
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  secao('0. Ambiente');
  testbed = await startTestbed();
  ok('testbed no ar', testbed.url);

  await limpar();
  await seedPerfis();
  const precoCents = 20_000;
  const espacoId = await seedEspacoDeTeste(precoCents);
  ok('semente criada', 'dono + locatario + espaco de teste (rascunho, fora de busca)');

  process.env.ASAAS_API_BASE_URL = `${testbed.url}/v3`;
  process.env.ASAAS_API_KEY = testbed.asaasApiKey;
  process.env.ASAAS_ENV = 'sandbox';
  process.env.ASAAS_WEBHOOK_TOKEN = `token-${tag}`;

  const asaas = await import('../src/lib/payments/asaas');
  const { processAsaasWebhook } = await import('../src/lib/payments/webhook');

  // =========================================================================
  secao('1. Cliente Asaas contra o testbed — monta requisicao, le resposta');
  // =========================================================================

  const cliente = await asaas.createCustomer({
    name: 'Locatario de Teste', cpfCnpj: '52998224725', email: 'locatario@exemplo.invalid',
    externalReference: renterId,
  });
  assert('createCustomer devolveu um id', cliente.id.startsWith('cus_'), cliente.id);
  assert('testbed registrou o cliente', testbed.asaasCustomers.has(cliente.id));

  const chaveCorreta = process.env.ASAAS_API_KEY;
  process.env.ASAAS_API_KEY = 'chave-errada';
  try {
    await asaas.createCustomer({ name: 'X', cpfCnpj: '1', email: 'x@x.invalid', externalReference: 'x' });
    bad('access_token errado e recusado', 'nao lancou erro');
  } catch (err) {
    assert('access_token errado e recusado', err instanceof asaas.AsaasError && err.status === 401,
      err instanceof Error ? err.message : String(err));
  }
  process.env.ASAAS_API_KEY = chaveCorreta;

  const subconta = await asaas.createSubaccount({
    name: 'Proprietario de Teste', email: 'dono@exemplo.invalid', cpfCnpj: '11144477735',
    mobilePhone: '27999998888', incomeValue: 5000, birthDate: '1990-01-01',
    address: 'Rua Teste', addressNumber: '100', province: 'Centro', postalCode: '29700000',
  });
  assert('createSubaccount devolveu apiKey e walletId', Boolean(subconta.apiKey && subconta.walletId));
  await seedContaDono(subconta.walletId);
  ok('conta de repasse do dono gravada no banco', subconta.walletId);

  const split = asaas.splitForOwner(subconta.walletId, 19_400);
  expect('splitForOwner monta fixedValue em reais', split, [{ walletId: subconta.walletId, fixedValue: 194 }]);

  const assinatura = await asaas.createSubscription({
    customer: cliente.id, billingType: 'PIX', value: 206, nextDueDate: '2026-10-10',
    cycle: 'MONTHLY', split, externalReference: `MP-${tag}`,
  });
  assert('createSubscription devolveu id de assinatura', assinatura.id.startsWith('sub_'), assinatura.id);
  const primeiraCobranca = (assinatura as unknown as { firstPaymentId: string }).firstPaymentId;
  assert('assinatura ja gerou a primeira cobranca', primeiraCobranca.startsWith('pay_'), primeiraCobranca);

  try {
    await asaas.createSubscription({
      customer: 'cus_nao_existe', billingType: 'PIX', value: 100, nextDueDate: '2026-10-10',
      cycle: 'MONTHLY', externalReference: 'x',
    });
    bad('assinatura com cliente inexistente e recusada', 'nao lancou erro');
  } catch (err) {
    assert('assinatura com cliente inexistente e recusada', err instanceof asaas.AsaasError && err.status === 400,
      err instanceof Error ? err.message : String(err));
  }

  const cobranca = await asaas.getPayment(primeiraCobranca);
  expect('getPayment devolve o valor certo', cobranca.value, 206);

  const estornado = await asaas.refundPayment(primeiraCobranca);
  expect('refundPayment estorna o valor cheio', estornado.status, 'REFUNDED');

  await asaas.cancelSubscription(assinatura.id);
  const canceladaNoTestbed = testbed.asaasSubscriptions.get(assinatura.id);
  expect('cancelSubscription marca CANCELLED no gateway', canceladaNoTestbed?.status, 'CANCELLED');

  // =========================================================================
  secao('2. Webhook — PAYMENT_CONFIRMED ativa a reserva (nao PAYMENT_RECEIVED)');
  // =========================================================================

  const { bookingId, amounts } = await seedBookingAprovada(espacoId, precoCents);
  const providerPaymentId = `pay_${tag}_1`;
  const providerSubscriptionId = `sub_${tag}_1`;
  const subscriptionId = await seedSubscriptionEPayment(bookingId, amounts.totalChargedCents, providerPaymentId, providerSubscriptionId);
  ok('booking + subscription + payment de teste gravados', bookingId);

  const r1 = await processAsaasWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId, value: amounts.totalChargedCents / 100 } });
  expect('webhook aceitou PAYMENT_CONFIRMED', r1.ok, true);

  const [bookingAtiva] = await sql<{ status: string; activated_at: Date | null }[]>`
    SELECT status, activated_at FROM bookings WHERE id=${bookingId}`;
  expect('reserva virou "active" no PAYMENT_CONFIRMED', bookingAtiva!.status, 'active');
  assert('activated_at foi preenchido', bookingAtiva!.activated_at !== null);

  const [subAtiva] = await sql<{ status: string }[]>`SELECT status FROM subscriptions WHERE id=${subscriptionId}`;
  expect('assinatura virou "active"', subAtiva!.status, 'active');

  const [pagamentoConfirmado] = await sql<{ status: string }[]>`
    SELECT status FROM payments WHERE provider_payment_id=${providerPaymentId}`;
  expect('cobranca virou "confirmed"', pagamentoConfirmado!.status, 'confirmed');

  const [{ n: notifsAposConfirmado }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM notifications WHERE data->>'bookingId' = ${bookingId}`;
  expect('locatario e proprietario foram notificados', notifsAposConfirmado, '2');

  // --- reentrega do MESMO evento: idempotencia ---
  const r1dup = await processAsaasWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId, value: amounts.totalChargedCents / 100 } });
  assert('reentrega do mesmo evento nao e tratada como novo', r1dup.reason?.includes('idempot') ?? false, r1dup.reason);

  const [{ n: notifsDepoisDup }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM notifications WHERE data->>'bookingId' = ${bookingId}`;
  expect('reentrega NAO duplicou notificacao', notifsDepoisDup, '2');

  // =========================================================================
  secao('3. Webhook — PAYMENT_RECEIVED gera repasse e lancamentos no razao');
  // =========================================================================

  const valorLiquido = (amounts.totalChargedCents - 199) / 100; // simula tarifa Pix de R$1,99
  const r2 = await processAsaasWebhook({
    event: 'PAYMENT_RECEIVED',
    payment: { id: providerPaymentId, value: amounts.totalChargedCents / 100, netValue: valorLiquido },
  });
  expect('webhook aceitou PAYMENT_RECEIVED', r2.ok, true);

  const [pagamentoRecebido] = await sql<{
    status: string; gateway_fee_cents: number; net_amount_cents: number; platform_net_cents: number;
  }[]>`SELECT status, gateway_fee_cents, net_amount_cents, platform_net_cents FROM payments WHERE provider_payment_id=${providerPaymentId}`;
  expect('cobranca virou "received"', pagamentoRecebido!.status, 'received');
  expect('tarifa do gateway calculada certa', pagamentoRecebido!.gateway_fee_cents, 199);
  expect('valor liquido gravado certo', pagamentoRecebido!.net_amount_cents, amounts.totalChargedCents - 199);
  expect('receita liquida da plataforma bate com money.ts', pagamentoRecebido!.platform_net_cents,
    amounts.totalChargedCents - 199 - amounts.ownerPayoutCents);

  const [payout] = await sql<{ amount_cents: number; status: string; provider_wallet_id: string }[]>`
    SELECT amount_cents, status, provider_wallet_id FROM payouts
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId})`;
  expect('repasse criado com o valor certo', payout!.amount_cents, amounts.ownerPayoutCents);
  expect('repasse aponta pra carteira certa', payout!.provider_wallet_id, subconta.walletId);
  expect('repasse comeca "pending" (nao inventamos liquidacao)', payout!.status, 'pending');

  const [{ n: ledgerCount }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM ledger_entries
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId})`;
  expect('tres lancamentos no razao (captura, tarifa, repasse)', ledgerCount, '3');

  const [{ soma: somaPlataforma }] = await sql<{ soma: string }[]>`
    SELECT sum(amount_cents)::text AS soma FROM ledger_entries
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId})`;
  expect('razao da plataforma bate com platformNetCents', Number(somaPlataforma),
    amounts.totalChargedCents - 199 - amounts.ownerPayoutCents);

  const [linhaDoRazao] = await sql<{ id: string }[]>`
    SELECT id FROM ledger_entries
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId}) LIMIT 1`;
  try {
    await sql`DELETE FROM ledger_entries WHERE id = ${linhaDoRazao!.id}`;
    bad('livro-razao recusa DELETE de verdade (nao so por documentacao)', 'o DELETE foi aceito — o trigger nao esta bloqueando');
  } catch (err) {
    assert('livro-razao recusa DELETE de verdade (nao so por documentacao)',
      err instanceof Error && /append-only/i.test(err.message), err instanceof Error ? err.message : String(err));
  }

  // --- reentrega: nao duplica payout nem lancamento ---
  await processAsaasWebhook({
    event: 'PAYMENT_RECEIVED',
    payment: { id: providerPaymentId, value: amounts.totalChargedCents / 100, netValue: valorLiquido },
  });
  const [{ n: payoutCountDepois }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM payouts
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId})`;
  expect('reentrega NAO duplicou o repasse', payoutCountDepois, '1');
  const [{ n: ledgerCountDepois }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM ledger_entries
    WHERE payment_id = (SELECT id FROM payments WHERE provider_payment_id=${providerPaymentId})`;
  expect('reentrega NAO duplicou lancamentos no razao', ledgerCountDepois, '3');

  // =========================================================================
  secao('4. Webhook — atraso derruba pra past_due, pagamento seguinte recupera');
  // =========================================================================

  const providerPaymentId2 = `pay_${tag}_2`;
  await sql`INSERT INTO payments (booking_id, subscription_id, provider, provider_payment_id, status, method, amount_cents, due_date)
    VALUES (${bookingId}, ${subscriptionId}, 'asaas', ${providerPaymentId2}, 'pending', 'pix', ${amounts.totalChargedCents}, CURRENT_DATE)`;

  await processAsaasWebhook({ event: 'PAYMENT_OVERDUE', payment: { id: providerPaymentId2 } });
  const [bookingAtrasada] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${bookingId}`;
  expect('reserva vira "past_due" com cobranca vencida', bookingAtrasada!.status, 'past_due');
  const [subAtrasada] = await sql<{ status: string; failed_cycles: number }[]>`
    SELECT status, failed_cycles FROM subscriptions WHERE id=${subscriptionId}`;
  expect('assinatura vira "past_due"', subAtrasada!.status, 'past_due');
  expect('failed_cycles incrementou', subAtrasada!.failed_cycles, 1);

  await processAsaasWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId2, value: amounts.totalChargedCents / 100 } });
  const [bookingRecuperada] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${bookingId}`;
  expect('reserva volta a "active" ao pagar o atraso', bookingRecuperada!.status, 'active');
  const [subRecuperada] = await sql<{ failed_cycles: number }[]>`SELECT failed_cycles FROM subscriptions WHERE id=${subscriptionId}`;
  expect('failed_cycles zera ao recuperar', subRecuperada!.failed_cycles, 0);

  // =========================================================================
  secao('5. Webhook — casos que nao devem derrubar nem inventar estado');
  // =========================================================================

  const rDesconhecido = await processAsaasWebhook({ event: 'EVENTO_QUE_NAO_EXISTE', payment: { id: providerPaymentId } });
  expect('evento desconhecido nao e erro', rDesconhecido.ok, true);
  assert('evento desconhecido diz que nao foi tratado', rDesconhecido.reason?.includes('nao tratado') ?? false, rDesconhecido.reason);

  const rSemCorrespondencia = await processAsaasWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_nao_existe_no_banco' } });
  expect('cobranca sem correspondencia nao e erro', rSemCorrespondencia.ok, true);

  const rMalformado = await processAsaasWebhook({ event: 'PAYMENT_CONFIRMED' });
  expect('payload sem payment.id e recusado', rMalformado.ok, false);

  // =========================================================================
  secao('6. Rota HTTP — autenticacao do webhook (tentativa de adulteracao)');
  // =========================================================================

  const { POST } = await import('../src/app/api/webhooks/asaas/route');

  const [{ n: eventosAntes }] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM webhook_events WHERE provider_event_id LIKE ${`%${tag}%`}`;

  const semToken = await POST(new Request('http://localhost/api/webhooks/asaas', {
    method: 'POST', body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId } }),
  }) as never);
  expect('sem header de token: 401', semToken.status, 401);

  const tokenErrado = await POST(new Request('http://localhost/api/webhooks/asaas', {
    method: 'POST',
    headers: { 'asaas-access-token': 'token-forjado-por-um-atacante' },
    body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId } }),
  }) as never);
  expect('token forjado: 401', tokenErrado.status, 401);

  const [{ n: eventosDepoisDeAdulteracao }] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM webhook_events WHERE provider_event_id LIKE ${`%${tag}%`}`;
  expect('tentativas com token errado NAO gravaram nenhum evento', eventosDepoisDeAdulteracao, eventosAntes);

  const providerPaymentId3 = `pay_${tag}_3`;
  await sql`INSERT INTO payments (booking_id, subscription_id, provider, provider_payment_id, status, method, amount_cents, due_date)
    VALUES (${bookingId}, ${subscriptionId}, 'asaas', ${providerPaymentId3}, 'pending', 'pix', ${amounts.totalChargedCents}, CURRENT_DATE)`;
  const comTokenCerto = await POST(new Request('http://localhost/api/webhooks/asaas', {
    method: 'POST',
    headers: { 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN!, 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { id: providerPaymentId3, value: amounts.totalChargedCents / 100 } }),
  }) as never);
  expect('token certo: 200', comTokenCerto.status, 200);

  const [pagamento3] = await sql<{ status: string }[]>`SELECT status FROM payments WHERE provider_payment_id=${providerPaymentId3}`;
  expect('pela rota HTTP de verdade, a cobranca tambem foi confirmada', pagamento3!.status, 'confirmed');

  // ---------------------------------------------------------------------------

  await limpar();
  await testbed.close();
  await sql.end();

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
  if (failed > 0) {
    console.log(`\x1b[31mFalharam:\x1b[0m ${falhas.join(', ')}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  try { await limpar(); await testbed?.close(); await sql.end(); } catch { /* melhor esforco */ }
  process.exit(1);
});

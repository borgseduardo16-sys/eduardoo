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
import { prepararAnuncio } from './lib/fixtures';

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

/*
 * `profiles.cpf_cnpj` tem UNIQUE de verdade no banco — achado rodando este
 * script duas vezes seguidas (2a rodada bateu de frente com o CPF fixo que a
 * 1a rodada deixou gravado num perfil que nunca é apagado, pela mesma razão
 * do `limpar()` parcial: uma vez ancorado por reserva com lançamento no
 * razão, o perfil fica para sempre). Por isso o CPF de teste é gerado com
 * dígito verificador real, novo a cada execução — nunca um valor fixo.
 */
function gerarCpfValido(): string {
  const nove = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const calcularDv = (digs: number[], pesos: number[]) => {
    const soma = digs.reduce((acc, d, i) => acc + d * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calcularDv(nove, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = calcularDv([...nove, dv1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...nove, dv1, dv2].join('');
}

const tag = `pg-${Date.now()}`;
const cpfLocatario = gerarCpfValido();
const cpfProprietarioSemConta = gerarCpfValido();
const donoId = crypto.randomUUID();
const donoSemContaId = crypto.randomUUID();
const renterId = crypto.randomUUID();
const adminId = crypto.randomUUID();
let testbed: Testbed;

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string; email: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '', email: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string, email: string) {
  identidadeAtual = { id, role, fullName, email };
}

async function seedPerfis() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${donoId}, ${`${tag}-dono@exemplo.invalid`}),
    (${donoSemContaId}, ${`${tag}-dono-sem-conta@exemplo.invalid`}),
    (${renterId}, ${`${tag}-renter@exemplo.invalid`}),
    (${adminId}, ${`${tag}-admin@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner' WHERE id IN (${donoId}, ${donoSemContaId})`;
  await sql`UPDATE profiles SET role='admin', full_name='Moderador de Teste' WHERE id=${adminId}`;
  // Nome real gravado so pro locatario: e o unico checado (autor de avaliacao, secao 9).
  await sql`UPDATE profiles SET full_name='Locatario de Teste' WHERE id=${renterId}`;
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
async function seedEspacoDeTeste(precoCents: number, ownerId: string = donoId): Promise<string> {
  const slug = `${tag}-espaco-${crypto.randomUUID().slice(0, 8)}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces
      (owner_id, slug, type, title, description, district, city, state,
       available_from, price_monthly_cents, size_m2, draft_step,
       location, approx_location)
    VALUES
      (${ownerId}, ${slug}, 'garagem', 'Garagem para teste de pagamento (nao aparece em busca)',
       'Descricao com mais de vinte caracteres para passar na regra do banco.',
       'Bairro de teste', 'Municipio de teste', 'ES', CURRENT_DATE, ${precoCents}, 18, 8,
       ST_SetSRID(ST_MakePoint(-40.0001, -18.0001), 4326),
       ST_SetSRID(ST_MakePoint(-40.0001, -18.0001), 4326))
    RETURNING id`;
  return row!.id;
}

/** Reserva ja aceita, pronta para entrar no fluxo de cobranca. */
async function seedBookingAprovada(
  espacoId: string,
  precoCents: number,
  opts: { status?: string; ownerId?: string; sufixo?: string; depositCents?: number } = {},
) {
  const amounts = computeBookingAmounts(precoCents, { renterFeeBps: 300, ownerFeeBps: 300 });
  // Reserva que ocupa precisa de vaga livre no anúncio.
  await prepararAnuncio(sql, espacoId, 5);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO bookings
      (reference, space_id, renter_id, owner_id, status, start_date,
       monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
       owner_fee_cents, total_charged_cents, owner_payout_cents, deposit_cents)
    VALUES
      (${`MP-${tag}${opts.sufixo ?? ''}`}, ${espacoId}, ${renterId}, ${opts.ownerId ?? donoId},
       ${opts.status ?? 'awaiting_payment'}, CURRENT_DATE,
       ${amounts.monthlyRentCents}, ${amounts.renterFeeBps}, ${amounts.ownerFeeBps},
       ${amounts.renterFeeCents}, ${amounts.ownerFeeCents}, ${amounts.totalChargedCents},
       ${amounts.ownerPayoutCents}, ${opts.depositCents ?? 0})
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
    ['owner_payout_accounts', () => sql`DELETE FROM owner_payout_accounts WHERE owner_id IN (${donoId}, ${donoSemContaId})`],
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

  /*
   * As actions de onboarding/checkout (secao 7) passam por requireUserOrThrow
   * — mesmo dublê de sessao ja usado em verify-bookings.ts: identidade MUTAVEL
   * (nao um mock novo por usuario), porque a action e importada uma vez so e
   * teria a referencia velha se o mock fosse recriado a cada troca de usuario.
   */
  // Como no DAL real: o nome público vem do perfil gravado no banco (Fase 21).
  const nomePublico = async (id: string) =>
    id ? ((await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id=${id}`)[0]?.public_name ?? null) : null;
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: identidadeAtual.email,
          fullName: identidadeAtual.fullName, publicName: await nomePublico(identidadeAtual.id), avatarPath: null, status: 'active',
          statusReason: null, acceptedTermsAt: new Date(),
        };
      },
      /** Só a Seção 12 (resolveDepositAction/resolveReportAction) exige admin. */
      requireAdminOrThrow: async () => {
        if (identidadeAtual.role !== 'admin') throw new Error('Acesso restrito ao administrador.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: identidadeAtual.email,
          fullName: identidadeAtual.fullName, publicName: await nomePublico(identidadeAtual.id), avatarPath: null, status: 'active',
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

  /** Só a Seção 12 (`clientIp` em admin/actions.ts) chama `headers()`. */
  const headersPath = req.resolve('next/headers');
  req.cache[headersPath] = {
    id: headersPath, filename: headersPath, loaded: true,
    exports: { headers: async () => new Headers() },
  } as never;

  const asaas = await import('../src/lib/payments/asaas');
  const { processAsaasWebhook: processarWebhookReal } = await import('../src/lib/payments/webhook');
  /*
   * Um evento do Asaas relata o estado que a cobrança JÁ tem no gateway. O
   * dublê passa a ter o mesmo estado — senão ele recusaria, como o Asaas
   * real recusa, estornar uma cobrança que para ele continua "pendente".
   */
  const ESTADO_NO_GATEWAY: Record<string, string> = {
    PAYMENT_CONFIRMED: 'CONFIRMED', PAYMENT_RECEIVED: 'RECEIVED', PAYMENT_OVERDUE: 'OVERDUE', PAYMENT_REFUNDED: 'REFUNDED',
  };
  const processAsaasWebhook: typeof processarWebhookReal = async (evento) => {
    const e = evento as { event?: string; payment?: { id?: string } } | null;
    const id = e?.payment?.id;
    const novo = e?.event ? ESTADO_NO_GATEWAY[e.event] : undefined;
    const atual = id ? testbed.asaasPayments.get(id) : undefined;
    if (atual && novo) testbed.asaasPayments.set(id!, { ...atual, status: novo });
    return processarWebhookReal(evento);
  };
  const { createPayoutAccountAction, startCheckoutAction } = await import('../src/lib/payments/actions');
  const { endBookingAction } = await import('../src/lib/bookings/actions');
  const { createReviewAction } = await import('../src/lib/reviews/actions');
  const { listReviewsForSpace, listReviewedBookingIds } = await import('../src/lib/reviews/queries');

  /*
   * `redirect()` lanca NEXT_REDIRECT — capturamos aqui, como ja e feito em
   * verify-bookings.ts. Nao tentamos extrair a URL de destino do digest (e
   * formato interno do Next, nao contrato publico) — confirmamos o destino
   * consultando o banco depois, que e o dado que realmente importa.
   */
  async function chamarComRedirect<T>(fn: () => Promise<T>): Promise<{ redirecionou: true } | { redirecionou: false; resultado: T }> {
    try {
      const resultado = await fn();
      return { redirecionou: false, resultado };
    } catch (err) {
      const digest = (err as { digest?: string }).digest ?? '';
      if (!digest.startsWith('NEXT_REDIRECT')) throw err;
      return { redirecionou: true };
    }
  }

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

  // Como no Asaas: só cobrança paga é estornada (Parte 12 deixou o dublê fiel a isso).
  try {
    await asaas.refundPayment(primeiraCobranca);
    bad('estorno de cobranca ainda nao paga e recusado', 'nao lancou erro');
  } catch (err) {
    assert('estorno de cobranca ainda nao paga e recusado', err instanceof asaas.AsaasError && err.status === 400,
      err instanceof Error ? err.message : String(err));
  }
  testbed.asaasPayments.set(primeiraCobranca, { ...testbed.asaasPayments.get(primeiraCobranca)!, status: 'RECEIVED' });
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
  // Pagamento confirmado + locação iniciada (a data de início é hoje), para cada uma das duas partes.
  expect('locatario e proprietario foram notificados, um aviso por pessoa (pagamento confirmado ja diz que a locacao comecou)', notifsAposConfirmado, '2');

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
  secao('3b. Paineis (Fase 9/10) — repasse do dono e status de pagamento do locatario');
  // =========================================================================

  const { listOwnerPayouts, getOwnerPayoutSummary } = await import('../src/lib/payments/queries');
  const { listRenterBookings } = await import('../src/lib/bookings/queries');

  const [{ reference: referenciaDoBooking }] = await sql<{ reference: string }[]>`
    SELECT reference FROM bookings WHERE id=${bookingId}`;
  const repassesDono = await listOwnerPayouts(donoId);
  const repasseDesteBooking = repassesDono.find((r) => r.bookingReference === referenciaDoBooking);
  assert('listOwnerPayouts traz o repasse recem-criado', Boolean(repasseDesteBooking));
  expect('o repasse listado tem o valor certo', repasseDesteBooking?.amountCents, amounts.ownerPayoutCents);
  expect('o repasse listado esta "pending" (mesmo estado do banco)', repasseDesteBooking?.status, 'pending');

  const resumoDono = await getOwnerPayoutSummary(donoId);
  expect('resumo: nada "settled" ainda (nenhum evento confirma isso)', resumoDono.settledCents, 0);
  assert('resumo: o pendente inclui o repasse deste booking', resumoDono.pendingCents >= amounts.ownerPayoutCents,
    `pendente=${resumoDono.pendingCents}, esperado >= ${amounts.ownerPayoutCents}`);

  const reservasDoLocatario = await listRenterBookings(renterId);
  const reservaDesteBooking = reservasDoLocatario.find((r) => r.id === bookingId);
  assert('listRenterBookings encontra esta reserva', Boolean(reservaDesteBooking));
  expect('status da assinatura aparece pro locatario', reservaDesteBooking?.subscriptionStatus, 'active');
  expect('status da ultima cobranca aparece pro locatario', reservaDesteBooking?.lastPaymentStatus, 'received');
  expect('valor da ultima cobranca aparece pro locatario', reservaDesteBooking?.lastPaymentAmountCents, amounts.totalChargedCents);

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

  // =========================================================================
  secao('7. Onboarding do proprietário e checkout do locatário — de ponta a ponta');
  // =========================================================================

  const espacoSemContaId = await seedEspacoDeTeste(precoCents, donoSemContaId);
  const { bookingId: bookingSemConta } = await seedBookingAprovada(espacoSemContaId, precoCents, {
    status: 'approved', ownerId: donoSemContaId, sufixo: '-semconta',
  });

  function formData(campos: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  }

  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const checkoutSemContaDono = await startCheckoutAction(undefined, formData({
    bookingId: bookingSemConta, cpfCnpj: cpfLocatario, method: 'card',
  }));
  assert('checkout bloqueado quando o proprietario nao tem conta de recebimento',
    !checkoutSemContaDono.ok && (checkoutSemContaDono.message?.includes('não configurou') ?? false),
    checkoutSemContaDono.message);

  entrarComo(donoSemContaId, 'owner', 'Proprietario Sem Conta', `${tag}-dono-sem-conta@exemplo.invalid`);
  const criarContaR1 = await chamarComRedirect(() => createPayoutAccountAction(undefined, formData({
    fullName: 'Proprietario Sem Conta', cpfCnpj: cpfProprietarioSemConta, email: `${tag}-dono-sem-conta@exemplo.invalid`,
    mobilePhone: '27999998888', incomeValueReais: '5000', postalCode: '29700000',
    address: 'Rua Teste', addressNumber: '100', province: 'Centro',
  })));
  assert('criar conta de recebimento redireciona (sucesso)', criarContaR1.redirecionou);

  const [contaCriada] = await sql<{ can_receive: boolean; provider_wallet_id: string | null }[]>`
    SELECT can_receive, provider_wallet_id FROM owner_payout_accounts WHERE owner_id=${donoSemContaId}`;
  assert('conta de recebimento gravada com can_receive=true', contaCriada?.can_receive === true);
  assert('conta de recebimento tem walletId do gateway', Boolean(contaCriada?.provider_wallet_id));

  const criarContaDuplicada = await chamarComRedirect(() => createPayoutAccountAction(undefined, formData({
    fullName: 'X', cpfCnpj: '11144477735', email: 'x@x.invalid', mobilePhone: '27999998888',
    incomeValueReais: '5000', postalCode: '29700000', address: 'Rua', addressNumber: '1', province: 'Centro',
  })));
  assert('criar conta de novo e recusado (ja existe)',
    !criarContaDuplicada.redirecionou && !criarContaDuplicada.resultado.ok);

  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const checkoutOk = await chamarComRedirect(() => startCheckoutAction(undefined, formData({
    bookingId: bookingSemConta, cpfCnpj: cpfLocatario, method: 'card',
  })));
  assert('checkout com proprietario configurado redireciona pra fatura do Asaas', checkoutOk.redirecionou);

  const [bookingPosCheckout] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${bookingSemConta}`;
  expect('reserva vira "awaiting_payment" apos o checkout', bookingPosCheckout!.status, 'awaiting_payment');

  const [subscriptionCriada] = await sql<{ status: string; amount_cents: number }[]>`
    SELECT status, amount_cents FROM subscriptions WHERE booking_id=${bookingSemConta}`;
  expect('assinatura criada como "pending_authorization"', subscriptionCriada?.status, 'pending_authorization');

  const [paymentCriado] = await sql<{ status: string; invoice_url: string | null }[]>`
    SELECT status, invoice_url FROM payments WHERE booking_id=${bookingSemConta}`;
  expect('primeira cobranca criada como "pending"', paymentCriado?.status, 'pending');
  assert('cobranca tem link de fatura do Asaas', paymentCriado?.invoice_url?.includes('fake-invoice') ?? false,
    paymentCriado?.invoice_url ?? 'nenhum');

  const [billingProfile] = await sql<{ provider_customer_id: string }[]>`
    SELECT provider_customer_id FROM renter_billing_profiles WHERE user_id=${renterId}`;
  assert('cliente Asaas do locatario foi criado e gravado', Boolean(billingProfile?.provider_customer_id));

  const checkoutDeNovo = await startCheckoutAction(undefined, formData({ bookingId: bookingSemConta, cpfCnpj: cpfLocatario, method: 'card' }));
  assert('checkout de novo na mesma reserva (ja em awaiting_payment) e recusado',
    !checkoutDeNovo.ok && (checkoutDeNovo.message?.includes('aguardando pagamento') ?? false), checkoutDeNovo.message);

  const espacoOutro = await seedEspacoDeTeste(precoCents);
  const { bookingId: bookingDeOutraPessoa } = await seedBookingAprovada(espacoOutro, precoCents, {
    status: 'approved', sufixo: '-outrem',
  });
  entrarComo(donoSemContaId, 'user', 'Nao E O Locatario', `${tag}-dono-sem-conta@exemplo.invalid`);
  const checkoutDeOutraPessoa = await startCheckoutAction(undefined, formData({
    bookingId: bookingDeOutraPessoa, cpfCnpj: '11144477735', method: 'card',
  }));
  assert('quem nao e o locatario nao consegue pagar a reserva de outra pessoa',
    !checkoutDeOutraPessoa.ok && (checkoutDeOutraPessoa.message?.includes('não encontrada') ?? false),
    checkoutDeOutraPessoa.message);

  // =========================================================================
  secao('8. Encerrar aluguel ativo — para a cobrança de verdade no gateway');
  // =========================================================================

  const [{ provider_payment_id: pagamentoSemContaId }] = await sql<{ provider_payment_id: string }[]>`
    SELECT provider_payment_id FROM payments WHERE booking_id=${bookingSemConta}`;
  const rAtivacao = await processAsaasWebhook({
    event: 'PAYMENT_CONFIRMED', payment: { id: pagamentoSemContaId, value: precoCents / 100 },
  });
  assert('webhook ativa a reserva pra testar o encerramento', rAtivacao.ok, rAtivacao.reason ?? '');
  const [{ status: statusPosAtivacao }] = await sql<{ status: string }[]>`
    SELECT status FROM bookings WHERE id=${bookingSemConta}`;
  expect('reserva esta "active" antes do teste de encerrar', statusPosAtivacao, 'active');

  // --- quem nao e dono nem locatario nao encerra ---
  entrarComo(donoId, 'owner', 'Dono de Outro Espaco', `${tag}-dono@exemplo.invalid`);
  const rEncerraAlheio = await endBookingAction(undefined, formData({ bookingId: bookingSemConta }));
  assert('quem nao participa da reserva nao consegue encerra-la',
    !rEncerraAlheio.ok && (rEncerraAlheio.message?.includes('não encontrada') ?? false), rEncerraAlheio.message);

  // --- so locacao EM ANDAMENTO pode ser encerrada (ainda 'approved', nao 'active') — por quem aluga ---
  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const rEncerraAprovada = await endBookingAction(undefined, formData({ bookingId: bookingDeOutraPessoa }));
  assert('reserva so "approved" (nunca ativou) nao pode ser encerrada por aqui',
    !rEncerraAprovada.ok && (rEncerraAprovada.message?.includes('em andamento') ?? false), rEncerraAprovada.message);

  // --- o PROPRIETARIO nao encerra na hora: ele pede o encerramento com uma data ---
  entrarComo(donoSemContaId, 'owner', 'Proprietario Sem Conta', `${tag}-dono-sem-conta@exemplo.invalid`);
  const rDonoEncerra = await endBookingAction(undefined, formData({ bookingId: bookingSemConta }));
  assert('proprietario nao encerra na hora (so pede o encerramento com data)',
    !rDonoEncerra.ok && (rDonoEncerra.message?.includes('Quem encerra na hora') ?? false), rDonoEncerra.message);
  const [aindaAtiva] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${bookingSemConta}`;
  expect('e a locacao segue ativa depois da tentativa do proprietario', aindaAtiva!.status, 'active');

  // --- o locatario encerra a locacao ativa de verdade ---
  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const rEncerra = await endBookingAction(undefined, formData({ bookingId: bookingSemConta }));
  assert('locatario encerra a locacao ativa', rEncerra.ok, rEncerra.message);

  const [bookingEncerrada] = await sql<{ status: string; ended_at: Date | null }[]>`
    SELECT status, ended_at FROM bookings WHERE id=${bookingSemConta}`;
  expect('reserva virou "ended"', bookingEncerrada!.status, 'ended');
  assert('ended_at foi preenchido', bookingEncerrada!.ended_at !== null);

  const [assinaturaCancelada] = await sql<{ status: string; cancelled_at: Date | null }[]>`
    SELECT status, cancelled_at FROM subscriptions WHERE booking_id=${bookingSemConta}`;
  expect('assinatura foi cancelada junto (nao so a reserva)', assinaturaCancelada?.status, 'cancelled');
  assert('assinatura tem cancelled_at preenchido', assinaturaCancelada?.cancelled_at !== null);

  const [notifEncerramento] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM notifications WHERE data->>'bookingId' = ${bookingSemConta} AND title = 'Locação encerrada'`;
  expect('proprietario foi notificado do encerramento', notifEncerramento?.user_id, donoSemContaId);

  const [logEncerramento] = await sql<{ action: string }[]>`
    SELECT action FROM audit_logs WHERE entity_id=${bookingSemConta} AND action='booking.ended'`;
  assert('encerramento foi auditado', Boolean(logEncerramento));

  // --- nao da pra encerrar de novo o que ja esta encerrado ---
  const rEncerraDeNovo = await endBookingAction(undefined, formData({ bookingId: bookingSemConta }));
  assert('encerrar uma reserva ja encerrada e recusado', !rEncerraDeNovo.ok, rEncerraDeNovo.message);

  // =========================================================================
  secao('9. Avaliacoes — so depois de encerrado, so quem participou');
  // =========================================================================

  // --- ninguem avalia reserva que ainda nao terminou ---
  // `bookingDeOutraPessoa` pertence a donoId/renterId (ver secao 7) — precisa ser uma das duas pra passar da checagem de autorizacao.
  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const rAvaliaAntes = await createReviewAction(undefined, formData({
    bookingId: bookingDeOutraPessoa, kind: 'renter_to_space', rating: '5',
  }));
  assert('nao da pra avaliar reserva que nao terminou (ainda "approved")',
    !rAvaliaAntes.ok && (rAvaliaAntes.message?.includes('encerrado') ?? false), rAvaliaAntes.message);

  // --- dono nao avalia o proprio espaco (kind errado pra quem ele e) ---
  entrarComo(donoSemContaId, 'owner', 'Proprietario Sem Conta', `${tag}-dono-sem-conta@exemplo.invalid`);
  const rDonoAvaliaEspaco = await createReviewAction(undefined, formData({
    bookingId: bookingSemConta, kind: 'renter_to_space', rating: '5',
  }));
  assert('dono nao consegue avaliar o proprio espaco (so o locatario avalia)',
    !rDonoAvaliaEspaco.ok && (rDonoAvaliaEspaco.message?.includes('locatário') ?? false), rDonoAvaliaEspaco.message);

  // --- locatario avalia o espaco de verdade ---
  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const rAvaliaEspaco = await createReviewAction(undefined, formData({
    bookingId: bookingSemConta, kind: 'renter_to_space', rating: '5', comment: 'Espaço ótimo, super acessível.',
  }));
  assert('locatario avalia o espaco', rAvaliaEspaco.ok, rAvaliaEspaco.message);

  const [espacoAvaliado] = await sql<{ rating_avg: string; rating_count: number }[]>`
    SELECT rating_avg, rating_count FROM spaces WHERE id=${espacoSemContaId}`;
  expect('nota media do espaco foi recalculada pela trigger', espacoAvaliado?.rating_avg, '5.00');
  expect('contagem de avaliacoes bate', espacoAvaliado?.rating_count, 1);

  // --- avaliar de novo a MESMA reserva/mesmo tipo e recusado ---
  const rAvaliaDeNovo = await createReviewAction(undefined, formData({
    bookingId: bookingSemConta, kind: 'renter_to_space', rating: '3',
  }));
  assert('avaliar a mesma reserva duas vezes e recusado', !rAvaliaDeNovo.ok, rAvaliaDeNovo.message);
  expect('a segunda tentativa NAO mudou a nota gravada', (await sql<{ rating_avg: string }[]>`
    SELECT rating_avg FROM spaces WHERE id=${espacoSemContaId}`)[0]?.rating_avg, '5.00');

  // --- locatario nao avalia a SI MESMO (kind errado pra quem ele e) ---
  const rLocatarioAvaliaLocatario = await createReviewAction(undefined, formData({
    bookingId: bookingSemConta, kind: 'owner_to_renter', rating: '4',
  }));
  assert('locatario nao consegue avaliar locatario (so o proprietario faz essa avaliacao)',
    !rLocatarioAvaliaLocatario.ok && (rLocatarioAvaliaLocatario.message?.includes('proprietário') ?? false),
    rLocatarioAvaliaLocatario.message);

  // --- proprietario avalia o locatario (kind diferente, mesma reserva — nao colide) ---
  entrarComo(donoSemContaId, 'owner', 'Proprietario Sem Conta', `${tag}-dono-sem-conta@exemplo.invalid`);
  const rAvaliaLocatario = await createReviewAction(undefined, formData({
    bookingId: bookingSemConta, kind: 'owner_to_renter', rating: '4',
  }));
  assert('proprietario avalia o locatario, mesma reserva do outro tipo de avaliacao', rAvaliaLocatario.ok, rAvaliaLocatario.message);

  const [{ n: avaliacoesDaReserva }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM reviews WHERE booking_id=${bookingSemConta}`;
  expect('as duas avaliacoes (tipos diferentes) coexistem na mesma reserva', avaliacoesDaReserva, 2);

  const listaAvaliacoes = await listReviewsForSpace(espacoSemContaId);
  // Fase 21: quem avaliou aparece pelo nome PUBLICO (primeiro nome), nunca o completo.
  assert('listReviewsForSpace traz a avaliacao com o comentario e o nome publico do autor',
    listaAvaliacoes.rows.some((r) => r.comment === 'Espaço ótimo, super acessível.' && r.author.publicName === 'Locatario'),
    JSON.stringify(listaAvaliacoes));
  assert('listReviewsForSpace NAO expoe o nome completo de quem avaliou',
    !JSON.stringify(listaAvaliacoes).includes('Locatario de Teste'),
    JSON.stringify(listaAvaliacoes));

  const avaliadasLocatario = await listReviewedBookingIds(renterId, 'renter_to_space');
  assert('listReviewedBookingIds reflete a avaliacao do locatario', avaliadasLocatario.has(bookingSemConta));
  const avaliadasDono = await listReviewedBookingIds(donoSemContaId, 'owner_to_renter');
  assert('listReviewedBookingIds reflete a avaliacao do proprietario', avaliadasDono.has(bookingSemConta));

  // =========================================================================
  secao('10. Caução (Fase 20) — cobrança avulsa junto do checkout + confirmação via webhook');
  // =========================================================================

  const { releaseDeposit, runDepositAutoRelease } = await import('../src/lib/payments/deposits');
  const { resolveDepositAction, resolveReportAction } = await import('../src/lib/admin/actions');
  const { listModerationQueue } = await import('../src/lib/admin/queries');

  const depositoPrecoCents = 20_000;
  const espacoCaucaoId = await seedEspacoDeTeste(depositoPrecoCents, donoSemContaId);
  const { bookingId: bookingCaucao1 } = await seedBookingAprovada(espacoCaucaoId, depositoPrecoCents, {
    status: 'approved', ownerId: donoSemContaId, sufixo: '-caucao1', depositCents: depositoPrecoCents,
  });

  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  const checkoutComCaucao = await chamarComRedirect(() => startCheckoutAction(undefined, formData({
    bookingId: bookingCaucao1, cpfCnpj: cpfLocatario, method: 'card',
  })));
  assert('checkout com caução redireciona normalmente (pra fatura do ALUGUEL, não da caução)', checkoutComCaucao.redirecionou);

  const [depositoPendente] = await sql<{
    id: string; amount_cents: number; status: string; release_status: string;
    provider_payment_id: string; invoice_url: string | null;
  }[]>`SELECT id, amount_cents, status, release_status, provider_payment_id, invoice_url
       FROM booking_deposits WHERE booking_id=${bookingCaucao1}`;
  assert('cobrança da caução foi criada junto do checkout', Boolean(depositoPendente));
  expect('valor da caução gravado certo', depositoPendente?.amount_cents, depositoPrecoCents);
  expect('caução começa "pending" (ninguém pagou ainda)', depositoPendente?.status, 'pending');
  expect('custódia começa "held"', depositoPendente?.release_status, 'held');
  assert('caução tem link de fatura PRÓPRIO (separado do aluguel)',
    depositoPendente?.invoice_url?.includes('fake-invoice') ?? false, depositoPendente?.invoice_url ?? 'nenhum');

  const [pagamentoDoAluguel1] = await sql<{ provider_payment_id: string }[]>`
    SELECT provider_payment_id FROM payments WHERE booking_id=${bookingCaucao1}`;
  assert('a cobrança da caução é SEPARADA da cobrança do aluguel (ids diferentes)',
    depositoPendente!.provider_payment_id !== pagamentoDoAluguel1!.provider_payment_id);

  const rCaucaoConfirmada = await processAsaasWebhook({
    event: 'PAYMENT_CONFIRMED', payment: { id: depositoPendente!.provider_payment_id, value: depositoPrecoCents / 100 },
  });
  expect('webhook aceitou a confirmação da caução', rCaucaoConfirmada.ok, true);

  const [depositoConfirmado] = await sql<{ status: string; paid_at: Date | null }[]>`
    SELECT status, paid_at FROM booking_deposits WHERE id=${depositoPendente!.id}`;
  expect('caução virou "confirmed"', depositoConfirmado!.status, 'confirmed');
  assert('paid_at foi preenchido', depositoConfirmado!.paid_at !== null);

  const [bookingAindaAguardando] = await sql<{ status: string }[]>`SELECT status FROM bookings WHERE id=${bookingCaucao1}`;
  expect('confirmar A CAUÇÃO sozinha NÃO ativa a reserva (só o aluguel confirmado faz isso)',
    bookingAindaAguardando!.status, 'awaiting_payment');

  const [{ n: ledgerCaucaoCobrada }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM ledger_entries WHERE booking_id=${bookingCaucao1} AND type='deposit_charged'`;
  expect('lançamento deposit_charged criado', ledgerCaucaoCobrada, '1');

  const [notifCaucaoConfirmada] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM notifications WHERE data->>'bookingId'=${bookingCaucao1} AND title='Caução confirmada'`;
  expect('locatário foi notificado da confirmação da caução', notifCaucaoConfirmada?.user_id, renterId);

  // --- reentrega do mesmo evento: idempotente também na caução ---
  await processAsaasWebhook({
    event: 'PAYMENT_CONFIRMED', payment: { id: depositoPendente!.provider_payment_id, value: depositoPrecoCents / 100 },
  });
  const [{ n: ledgerCaucaoCobradaDepois }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM ledger_entries WHERE booking_id=${bookingCaucao1} AND type='deposit_charged'`;
  expect('reentrega NÃO duplicou o lançamento', ledgerCaucaoCobradaDepois, '1');

  // =========================================================================
  secao('11. Caução — liberação integral sem dano (releaseDeposit)');
  // =========================================================================

  const liberacao = await releaseDeposit(depositoPendente!.id, 0, null);
  assert('liberação integral aceita', liberacao.ok, liberacao.ok ? '' : liberacao.message);

  const [depositoLiberado] = await sql<{
    release_status: string; released_cents: number | null; forfeited_cents: number | null; released_at: Date | null;
  }[]>`SELECT release_status, released_cents, forfeited_cents, released_at FROM booking_deposits WHERE id=${depositoPendente!.id}`;
  expect('release_status virou "released"', depositoLiberado!.release_status, 'released');
  expect('released_cents = valor cheio', depositoLiberado!.released_cents, depositoPrecoCents);
  expect('forfeited_cents = 0', depositoLiberado!.forfeited_cents, 0);
  assert('released_at preenchido', depositoLiberado!.released_at !== null);

  const pagamentoEstornadoNoTestbed = testbed.asaasPayments.get(depositoPendente!.provider_payment_id);
  expect('Asaas (testbed) recebeu o estorno do valor cheio', pagamentoEstornadoNoTestbed?.refundedCents, depositoPrecoCents);

  const [{ soma: somaLedgerCaucao1 }] = await sql<{ soma: string }[]>`
    SELECT sum(amount_cents)::text AS soma FROM ledger_entries WHERE booking_id=${bookingCaucao1} AND type::text LIKE 'deposit_%'`;
  expect('lançamentos da caução somam ZERO (cobrado + devolvido se cancelam)', Number(somaLedgerCaucao1), 0);

  const [notifCaucaoDevolvida] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM notifications WHERE data->>'bookingId'=${bookingCaucao1} AND title='Caução devolvida'`;
  expect('locatário foi notificado da devolução', notifCaucaoDevolvida?.user_id, renterId);

  const liberacaoDeNovo = await releaseDeposit(depositoPendente!.id, 0, null);
  assert('liberar uma caução já resolvida é recusado', !liberacaoDeNovo.ok, liberacaoDeNovo.ok ? '' : liberacaoDeNovo.message);

  // =========================================================================
  secao('12. Caução — retenção parcial por dano (admin + fila de moderação)');
  // =========================================================================

  /*
   * Espaço PRÓPRIO pra esta reserva: `bookings_one_active_per_space` (índice
   * único parcial, ver src/db/schema/bookings.ts) proíbe duas reservas
   * 'approved'/'awaiting_payment'/'active'/'past_due' no MESMO espaço ao
   * mesmo tempo — e a 1ª reserva (bookingCaucao1) segue 'awaiting_payment'
   * (só a caução dela foi confirmada, nunca o aluguel), ocupando o slot de
   * espacoCaucaoId.
   */
  const espacoCaucao2Id = await seedEspacoDeTeste(depositoPrecoCents, donoSemContaId);
  const { bookingId: bookingCaucao2 } = await seedBookingAprovada(espacoCaucao2Id, depositoPrecoCents, {
    status: 'approved', ownerId: donoSemContaId, sufixo: '-caucao2', depositCents: depositoPrecoCents,
  });
  const checkoutCaucao2 = await chamarComRedirect(() => startCheckoutAction(undefined, formData({
    bookingId: bookingCaucao2, cpfCnpj: cpfLocatario, method: 'card',
  })));
  assert('segundo checkout (2ª reserva, mesmo locatário) também redireciona', checkoutCaucao2.redirecionou);

  const [depositoPendente2] = await sql<{ id: string; provider_payment_id: string }[]>`
    SELECT id, provider_payment_id FROM booking_deposits WHERE booking_id=${bookingCaucao2}`;
  await processAsaasWebhook({
    event: 'PAYMENT_CONFIRMED', payment: { id: depositoPendente2!.provider_payment_id, value: depositoPrecoCents / 100 },
  });

  const [{ reference: referenciaCaucao2 }] = await sql<{ reference: string }[]>`
    SELECT reference FROM bookings WHERE id=${bookingCaucao2}`;
  const [reportDano] = await sql<{ id: string }[]>`
    INSERT INTO reports (target_type, space_id, reporter_id, booking_id, reason, status, details)
    VALUES ('space', ${espacoCaucao2Id}, ${donoSemContaId}, ${bookingCaucao2}, 'dano_ao_espaco', 'reviewing', 'Piso da garagem manchado de óleo.')
    RETURNING id`;

  const filaAntes = await listModerationQueue();
  const itemFila = filaAntes.find((r) => r.id === reportDano!.id);
  assert('denúncia de dano aparece na fila de moderação', Boolean(itemFila));
  expect('fila mostra a caução ainda "held"', itemFila?.depositReleaseStatus, 'held');
  expect('fila mostra o valor certo da caução', itemFila?.depositAmountCents, depositoPrecoCents);
  expect('fila liga a denúncia à reserva certa', itemFila?.bookingId, bookingCaucao2);
  expect('fila mostra a referência da reserva', itemFila?.bookingReference, referenciaCaucao2);

  entrarComo(renterId, 'user', 'Locatario de Teste', `${tag}-renter@exemplo.invalid`);
  let semSerAdminLancou = false;
  try {
    await resolveDepositAction(undefined, formData({ bookingId: bookingCaucao2, forfeitValue: '80,00' }));
  } catch {
    semSerAdminLancou = true;
  }
  assert('quem não é admin não consegue resolver caução (lança, não silencia)', semSerAdminLancou);

  entrarComo(adminId, 'admin', 'Moderador de Teste', `${tag}-admin@exemplo.invalid`);
  const resolucao = await resolveDepositAction(undefined, formData({
    bookingId: bookingCaucao2, forfeitValue: '80,00', reportId: reportDano!.id,
  }));
  assert('admin resolve a caução (retenção parcial)', resolucao.ok, resolucao.message);

  const [depositoParcial] = await sql<{
    release_status: string; released_cents: number | null; forfeited_cents: number | null; resolved_report_id: string | null;
  }[]>`SELECT release_status, released_cents, forfeited_cents, resolved_report_id FROM booking_deposits WHERE id=${depositoPendente2!.id}`;
  expect('release_status "partially_forfeited"', depositoParcial!.release_status, 'partially_forfeited');
  expect('released_cents = 120,00 (200 - 80)', depositoParcial!.released_cents, depositoPrecoCents - 8000);
  expect('forfeited_cents = 80,00', depositoParcial!.forfeited_cents, 8000);
  expect('amarrado à denúncia que decidiu', depositoParcial!.resolved_report_id, reportDano!.id);

  const pagamentoParcialNoTestbed = testbed.asaasPayments.get(depositoPendente2!.provider_payment_id);
  expect('Asaas (testbed) recebeu o estorno só da PARTE devolvida', pagamentoParcialNoTestbed?.refundedCents, depositoPrecoCents - 8000);

  const [{ soma: somaLedgerCaucao2 }] = await sql<{ soma: string }[]>`
    SELECT sum(amount_cents)::text AS soma FROM ledger_entries WHERE booking_id=${bookingCaucao2} AND type::text LIKE 'deposit_%'`;
  expect('lançamentos da 2ª caução também somam ZERO (cobrado = devolvido + retido)', Number(somaLedgerCaucao2), 0);

  const [ledgerForfeit] = await sql<{ user_id: string | null; amount_cents: number }[]>`
    SELECT user_id, amount_cents FROM ledger_entries WHERE booking_id=${bookingCaucao2} AND type='deposit_forfeited_to_owner'`;
  expect('lançamento de retenção credita o PROPRIETÁRIO', ledgerForfeit?.user_id, donoSemContaId);
  expect('valor retido é negativo (saiu da custódia)', ledgerForfeit?.amount_cents, -8000);

  const [notifLocatarioRetido] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM notifications WHERE data->>'bookingId'=${bookingCaucao2} AND title='Parte da caução foi retida'`;
  expect('locatário foi avisado da retenção parcial', notifLocatarioRetido?.user_id, renterId);
  const [notifDonoRetido] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM notifications WHERE data->>'bookingId'=${bookingCaucao2} AND title='Caução retida a seu favor'`;
  expect('proprietário foi avisado do valor retido a seu favor', notifDonoRetido?.user_id, donoSemContaId);

  const [logResolucao] = await sql<{ action: string; actor_id: string }[]>`
    SELECT action, actor_id FROM audit_logs WHERE entity_id=${depositoPendente2!.id} AND action='deposit.resolved'`;
  assert('resolução da caução foi auditada', Boolean(logResolucao));
  expect('auditoria aponta o admin certo como autor', logResolucao?.actor_id, adminId);

  // --- resolver o REPORT em si é uma ação separada — a caução já resolvida não impede isso ---
  const resolucaoDenuncia = await resolveReportAction(undefined, formData({
    reportId: reportDano!.id, decision: 'upheld', resolutionNote: 'Confirmado com fotos do antes/depois.',
  }));
  assert('denúncia pode ser marcada procedente separadamente', resolucaoDenuncia.ok, resolucaoDenuncia.message);

  const filaDepois = await listModerationQueue();
  assert('denúncia já resolvida some da fila (só mostra open/reviewing)',
    !filaDepois.some((r) => r.id === reportDano!.id));

  const resolucaoDeNovo = await resolveDepositAction(undefined, formData({
    bookingId: bookingCaucao2, forfeitValue: '0,00',
  }));
  assert('resolver a mesma caução de novo é recusado (já foi resolvida)', !resolucaoDeNovo.ok, resolucaoDeNovo.message);

  // =========================================================================
  secao('13. Caução — liberação automática por tempo (cron), com exclusão por denúncia em aberto');
  // =========================================================================

  async function seedDepositoConfirmadoDireto(bookingId: string, amountCents: number, sufixo: string) {
    const providerPaymentId = `pay_${tag}_${sufixo}`;
    testbed.asaasPayments.set(providerPaymentId, {
      id: providerPaymentId, status: 'CONFIRMED', value: amountCents / 100, netValue: null,
      invoiceUrl: null, dueDate: new Date().toISOString().slice(0, 10), refundedCents: 0, subscription: null,
    });
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id, status, paid_at)
      VALUES (${bookingId}, ${amountCents}, 'asaas', ${providerPaymentId}, 'confirmed', now())
      RETURNING id`;
    return { depositId: row!.id, providerPaymentId };
  }

  const { bookingId: bookingElegivel } = await seedBookingAprovada(espacoCaucaoId, depositoPrecoCents, {
    status: 'ended', ownerId: donoSemContaId, sufixo: '-auto-elegivel',
  });
  await sql`UPDATE bookings SET ended_at = now() - interval '10 days' WHERE id=${bookingElegivel}`;
  const depositoElegivel = await seedDepositoConfirmadoDireto(bookingElegivel, depositoPrecoCents, 'auto1');

  const { bookingId: bookingMuitoRecente } = await seedBookingAprovada(espacoCaucaoId, depositoPrecoCents, {
    status: 'ended', ownerId: donoSemContaId, sufixo: '-auto-recente',
  });
  await sql`UPDATE bookings SET ended_at = now() - interval '2 days' WHERE id=${bookingMuitoRecente}`;
  const depositoRecente = await seedDepositoConfirmadoDireto(bookingMuitoRecente, depositoPrecoCents, 'auto2');

  const { bookingId: bookingComDenuncia } = await seedBookingAprovada(espacoCaucaoId, depositoPrecoCents, {
    status: 'ended', ownerId: donoSemContaId, sufixo: '-auto-denuncia',
  });
  await sql`UPDATE bookings SET ended_at = now() - interval '10 days' WHERE id=${bookingComDenuncia}`;
  const depositoComDenuncia = await seedDepositoConfirmadoDireto(bookingComDenuncia, depositoPrecoCents, 'auto3');
  await sql`INSERT INTO reports (target_type, space_id, reporter_id, booking_id, reason, status, details)
    VALUES ('space', ${espacoCaucaoId}, ${donoSemContaId}, ${bookingComDenuncia}, 'dano_ao_espaco', 'open', 'Em análise.')`;

  const resultadoAuto = await runDepositAutoRelease();
  assert('rodada do cron libera pelo menos a elegível', resultadoAuto.released >= 1, `released=${resultadoAuto.released}`);

  const [statusElegivel] = await sql<{ release_status: string }[]>`
    SELECT release_status FROM booking_deposits WHERE id=${depositoElegivel.depositId}`;
  expect('caução de reserva encerrada há mais de 7 dias, sem denúncia, foi liberada sozinha',
    statusElegivel!.release_status, 'released');

  const [statusRecente] = await sql<{ release_status: string }[]>`
    SELECT release_status FROM booking_deposits WHERE id=${depositoRecente.depositId}`;
  expect('caução de reserva encerrada há só 2 dias NÃO foi liberada ainda (janela de 7 dias)',
    statusRecente!.release_status, 'held');

  const [statusComDenuncia] = await sql<{ release_status: string }[]>`
    SELECT release_status FROM booking_deposits WHERE id=${depositoComDenuncia.depositId}`;
  expect('caução com denúncia de dano EM ABERTO não é liberada automaticamente',
    statusComDenuncia!.release_status, 'held');

  const resultadoAutoDeNovo = await runDepositAutoRelease();
  expect('rodando de novo, não tenta liberar o que já foi liberado (idempotente)', resultadoAutoDeNovo.released, 0);

  /*
   * SÓ AGORA, depois do 2º runDepositAutoRelease() acima — apagar antes
   * removeria o próprio bloqueio que a rodada de cima precisa ver, liberando
   * a caução de bookingComDenuncia "de graça" e quebrando esse assert de cima.
   * Apaga porque, diferente de bookings/payments/ledger_entries (ancorados
   * pra sempre por FK RESTRICT, ver limpar() no fim do arquivo), uma
   * `reports` 'open' sem isto ficaria de pé PARA SEMPRE — e
   * `listModerationQueue()` é uma contagem GLOBAL, sem filtro de `tag` desta
   * execução: uma denúncia órfã aqui infla a fila de moderação de toda
   * execução futura de verify-admin.ts (achado rodando a suíte completa:
   * "esperava 3, veio 5"). Nada a referencia por FK RESTRICT, então apagar é seguro.
   */
  await sql`DELETE FROM reports WHERE booking_id=${bookingComDenuncia} AND reason='dano_ao_espaco'`;

  /*
   * Some com `bookingMuitoRecente` e `bookingComDenuncia` por completo — os
   * dois ÚNICOS das 3 reservas desta seção que continuam 'held' até aqui
   * (nunca chegam a `releaseDeposit`, então não têm ledger_entries: seguro
   * apagar, sem FK RESTRICT no caminho). Sem isto ficariam 'held' PARA
   * SEMPRE (o primeiro nunca completa os 7 dias sozinho; o segundo, sem o
   * report que acabou de sumir, passa a ser "elegível" pra qualquer execução
   * FUTURA deste script — só que o `provider_payment_id` dele só existe no
   * testbed EM MEMÓRIA desta execução, então a tentativa de estornar numa
   * execução futura falharia com 404 o resto da vida, poluindo o console à
   * toa). `bookingElegivel` fica de fora de propósito: o `runDepositAutoRelease`
   * de cima já a liberou de verdade, o que gravou um `deposit_released` de
   * verdade no razão — essa, sim, fica ancorada pra sempre, mesma regra de
   * `limpar()` no fim do arquivo pra qualquer reserva com movimentação real.
   */
  await sql`DELETE FROM booking_deposits WHERE booking_id IN (${bookingMuitoRecente}, ${bookingComDenuncia})`;
  await sql`DELETE FROM bookings WHERE id IN (${bookingMuitoRecente}, ${bookingComDenuncia})`;

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

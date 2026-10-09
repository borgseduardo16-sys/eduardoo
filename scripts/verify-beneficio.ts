/**
 * Verificação do BENEFÍCIO DO PRIMEIRO MÊS do Premium (Etapa 2, Fase C) contra
 * Postgres real e o dublê do Asaas.
 *
 * ATENÇÃO: o dublê (scripts/testbed) NÃO é o Asaas. Este teste prova a LÓGICA
 * nossa (flag, travas do banco, fila, razão, idempotência). Que o Asaas real
 * aceite "PUT /payments com value e sem split" e "POST /transfers" é outra
 * coisa, e só scripts/validar-asaas-beneficio.ts, com chave de sandbox, mostra.
 *
 *   pnpm tsx scripts/verify-beneficio.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} } as never;

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { startTestbed, type Testbed } from './testbed/server';
import { criarAnuncio, darPremium, limparPremium } from './lib/fixtures';
import { computeFirstMonthBenefit } from '../src/lib/money';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 6, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;
const falhas: string[] = [];
const ok = (n: string, d = '') => { passed++; console.log(`  \x1b[32mOK\x1b[0m ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`); };
const bad = (n: string, d: string) => { failed++; falhas.push(n); console.log(`  \x1b[31mFALHOU\x1b[0m ${n}\n      ${d}`); };
const expect = (n: string, a: unknown, e: unknown) => (JSON.stringify(a) === JSON.stringify(e) ? ok(n, JSON.stringify(a)) : bad(n, `esperava ${JSON.stringify(e)}, veio ${JSON.stringify(a)}`));
const assert = (n: string, c: boolean, d = '') => (c ? ok(n, d) : bad(n, d || 'condicao falsa'));
const secao = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);
async function rejeita(n: string, fn: () => Promise<unknown>, regra: string) {
  try { await fn(); bad(n, 'o banco ACEITOU'); } catch (e) {
    const r = (e as { constraint_name?: string }).constraint_name ?? '';
    const msg = `${(e as Error).message} [${r}]`;
    if (msg.includes(regra)) ok(n, regra);
    else bad(n, `rejeitou por outro motivo: ${msg.slice(0, 160)}`);
  }
}

const tag = `ben-${Date.now()}`;
const ids = {
  locatario: crypto.randomUUID(), // Premium pago (Pix)
  locatario2: crypto.randomUUID(), // outra conta, mesmo CPF
  cartao: crypto.randomUUID(), // Premium pago no cartão (carência)
  teste: crypto.randomUUID(), // Premium de teste da administração
  dono: crypto.randomUUID(),
  semPremium: crypto.randomUUID(),
};
const todos = Object.values(ids);
const cpfLocatario = '52998224725';
let testbed: Testbed | undefined;
type Id = { id: string; role: 'user' | 'owner'; fullName: string };
let atual: Id = { id: '', role: 'user', fullName: '' };
const entrarComo = (id: string, fullName: string, role: Id['role'] = 'user') => { atual = { id, role, fullName }; };

async function main() {
  secao('1. A conta do abatimento (pura)');
  const c = (aluguel: number) => computeFirstMonthBenefit({ monthlyRentCents: aluguel, totalChargedCents: Math.round(aluguel * 1.03), maxCents: 10000, gatewayMinChargeCents: 500 });
  expect('aluguel de R$ 300: abate R$ 100 e o locatário paga R$ 209', c(30000), { applied: true, benefitCents: 10000, payerPaysCents: 20900 });
  expect('aluguel de R$ 165: abate R$ 100 (o teto)', (c(16500) as { benefitCents: number }).benefitCents, 10000);
  assert('o abatimento NUNCA passa do teto, em nenhum aluguel de R$ 100 a R$ 5.000',
    Array.from({ length: 4901 }, (_, i) => c((100 + i) * 100)).every((r) => !r.applied || r.benefitCents <= 10000));
  expect('aluguel de R$ 100: sobraria só a taxa (R$ 3,00) — abaixo do mínimo do gateway, não aplica (e não "completa" nada)', c(10000), { applied: false, reason: 'below_gateway_minimum', payerPaysCents: 10300 });
  expect('aluguel de R$ 80: sobraria R$ 2,40 — não aplica', (c(8000) as { applied: boolean }).applied, false);
  const menor = Array.from({ length: 30000 }, (_, i) => 10000 + i).find((r) => c(r).applied);
  assert('o menor aluguel que usa o benefício deixa pelo menos R$ 5,00 a cobrar', menor !== undefined && (c(menor) as { payerPaysCents: number }).payerPaysCents >= 500, `a partir de R$ ${(menor ?? 0) / 100}`);

  secao('2. Semente');
  for (const [nome, id] of Object.entries(ids)) {
    await sql`INSERT INTO auth.users (id, email) VALUES (${id}, ${`${tag}-${nome}@exemplo.invalid`})`;
    await sql`UPDATE profiles SET role='owner', full_name=${`Beneficio ${nome}`} WHERE id=${id}`;
  }
  // O benefício exige telefone verificado (um por conta — o banco garante a unicidade).
  let n = 0;
  for (const id of [ids.locatario, ids.locatario2, ids.cartao, ids.teste, ids.semPremium]) {
    n++;
    await sql`UPDATE profiles SET phone = ${`+55279${String(Date.now()).slice(-7)}${n}`}, phone_verified_at = now() WHERE id = ${id}`;
  }
  testbed = await startTestbed();
  Object.assign(process.env, {
    ASAAS_API_BASE_URL: `${testbed.url}/v3`, ASAAS_API_KEY: testbed.asaasApiKey, ASAAS_ENV: 'sandbox',
    ASAAS_WEBHOOK_TOKEN: `token-${tag}`, IDENTITY_HASH_SECRET: `segredo-${tag}`,
  });
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = { id: dalPath, filename: dalPath, loaded: true, exports: {
    requireUserOrThrow: async () => ({ id: atual.id, role: atual.role, email: `${atual.id}@exemplo.invalid`, fullName: atual.fullName, publicName: null, avatarPath: null, status: 'active', statusReason: null, acceptedTermsAt: new Date() }),
    getCurrentUser: async () => null,
  } } as never;
  const cp = req.resolve('next/cache');
  req.cache[cp] = { id: cp, filename: cp, loaded: true, exports: { revalidatePath: () => {}, revalidateTag: () => {} } } as never;

  const { requestBookingAction, respondToBookingRequestAction } = await import('../src/lib/bookings/actions');
  const { startCheckoutAction } = await import('../src/lib/payments/actions');
  const { processAsaasWebhook } = await import('../src/lib/payments/webhook');
  const asaas = await import('../src/lib/payments/asaas');
  const b = await import('../src/lib/premium/benefit');

  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const comRedirect = async <T>(fn: () => Promise<T>) => { try { return { redir: false as const, r: await fn() }; } catch (e) { if (!String((e as { digest?: string }).digest ?? '').startsWith('NEXT_REDIRECT')) throw e; return { redir: true as const }; } };
  const inicio = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })();
  const flag = (v: 0 | 1) => sql`UPDATE platform_settings SET value = ${sql.json(v)} WHERE key = 'premium.first_month_benefit_enabled'`;
  await flag(0);

  await darPremium(sql, ids.locatario, { pago: true });
  await darPremium(sql, ids.locatario2, { pago: true });
  await darPremium(sql, ids.teste, { dias: 20 });
  const sub = await asaas.createSubaccount({ name: 'Dono', email: 'd@exemplo.invalid', cpfCnpj: '11144477735', mobilePhone: '27999998888', incomeValue: 5000, birthDate: '1990-01-01', address: 'R', addressNumber: '1', province: 'C', postalCode: '29700000' });
  await sql`INSERT INTO owner_payout_accounts (owner_id, provider, provider_wallet_id, status, can_receive) VALUES (${ids.dono}, 'asaas', ${sub.walletId}, 'approved', true)`;

  const espaco = async (n: string, preco: number) => criarAnuncio(sql, { ownerId: ids.dono, slug: `${tag}-${n}`, precoCents: preco });
  async function aceitoPara(locatario: string, spaceId: string) {
    entrarComo(locatario, 'Locatario');
    await comRedirect(() => requestBookingAction(undefined, fd({ spaceId, startDate: inicio, renterMessage: 'Quero alugar.' })));
    const [bk] = await sql<{ id: string }[]>`SELECT id FROM bookings WHERE space_id=${spaceId} AND renter_id=${locatario} ORDER BY requested_at DESC LIMIT 1`;
    entrarComo(ids.dono, 'Dono', 'owner');
    await respondToBookingRequestAction(undefined, fd({ bookingId: bk!.id, decision: 'accept', accessInstructions: 'Portão azul ao lado da padaria; vaga atrás da pilastra.' }));
    return bk!.id;
  }
  const pagar = async (locatario: string, bookingId: string, cpf: string, method: 'pix' | 'card' = 'pix') => {
    entrarComo(locatario, 'Locatario');
    return comRedirect(() => startCheckoutAction(undefined, fd({ bookingId, cpfCnpj: cpf, method })));
  };
  const beneficioDe = async (bookingId: string) => (await sql<{ id: string; status: string; benefit_cents: number; payer_pays_cents: number; owner_payout_cents: number }[]>`
    SELECT id, status::text AS status, benefit_cents, payer_pays_cents, owner_payout_cents FROM premium_benefits WHERE booking_id=${bookingId}`)[0];

  secao('3. Flag DESLIGADA — nada financeiro acontece');
  expect('a flag nasce desligada', (await sql<{ v: unknown }[]>`SELECT value AS v FROM platform_settings WHERE key='premium.first_month_benefit_enabled'`)[0]!.v, 0);
  const eOff = await espaco('off', 30000);
  const bkOff = await aceitoPara(ids.locatario, eOff);
  const ckOff = await pagar(ids.locatario, bkOff, cpfLocatario);
  assert('o checkout funciona como sempre', ckOff.redir);
  const subOff = [...testbed.asaasSubscriptions.values()].find((s) => s.externalReference?.startsWith('MP-') && s.split?.[0]?.walletId === sub.walletId);
  expect('a cobrança é a cheia (R$ 309) com split de R$ 291', [subOff?.value, subOff?.split?.[0]?.fixedValue], [309, 291]);
  expect('nenhum benefício foi criado', await beneficioDe(bkOff), undefined);
  expect('nada foi alterado na cobrança do gateway', [...testbed.asaasPayments.values()].filter((p) => p.subscription === subOff!.id).map((p) => p.value), [309]);
  await rejeita('mesmo por SQL direto, o banco recusa criar benefício com a flag desligada',
    () => sql`INSERT INTO premium_benefits (cycle_id, user_id, identity_hash, period_key, booking_id, max_cents, benefit_cents, charge_total_cents, payer_pays_cents, owner_payout_cents)
              VALUES (${crypto.randomUUID()}, ${ids.locatario}, 'x', '2026-10', ${bkOff}, 10000, 10000, 30900, 20900, 29100)`, 'premium_benefits_flag_off');
  expect('o saldo e a fila de transferências ficam intactos', [(await b.processTransferOutbox()), testbed.asaasTransfers.size], [{ sent: 0, failed: 0 }, 0]);

  secao('4. Flag LIGADA — o fluxo completo contra o dublê');
  await flag(1);
  const e300 = await espaco('300', 30000);
  const bk = await aceitoPara(ids.locatario, e300);
  const ck = await pagar(ids.locatario, bk, cpfLocatario);
  assert('o checkout inicia', ck.redir);
  const ben = await beneficioDe(bk);
  expect('benefício reservado: abate R$ 100, locatário paga R$ 209, repasse devido R$ 291', [ben?.status, ben?.benefit_cents, ben?.payer_pays_cents, ben?.owner_payout_cents], ['reserved', 10000, 20900, 29100]);
  const subBen = [...testbed.asaasSubscriptions.values()].filter((s) => s.split?.[0]?.walletId === sub.walletId).at(-1)!;
  const primeira = [...testbed.asaasPayments.values()].find((p) => p.subscription === subBen.id)!;
  expect('a PRIMEIRA cobrança no gateway vale R$ 209 e perdeu o split (a plataforma recebe e transfere)', [primeira.value, primeira.split ?? []], [209, []]);
  expect('a assinatura (próximos meses) continua com R$ 309 — o benefício é só da primeira cobrança', subBen.value, 309);
  const [pgto] = await sql<{ amount_cents: number; provider_payment_id: string }[]>`SELECT amount_cents, provider_payment_id FROM payments WHERE booking_id=${bk}`;
  expect('a cobrança local também guarda R$ 209', pgto?.amount_cents, 20900);
  entrarComo(ids.locatario, 'Locatario');
  const outro = await espaco('outro', 30000);
  const bk2 = await aceitoPara(ids.locatario, outro);
  await pagar(ids.locatario, bk2, cpfLocatario);
  expect('um SEGUNDO aluguel no mesmo ciclo NÃO ganha benefício (um por ciclo)', await beneficioDe(bk2), undefined);

  await processAsaasWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: pgto!.provider_payment_id, value: 209, netValue: 207.01, subscription: subBen.id, billingType: 'PIX' } });
  expect('cobrança recebida: o benefício é consumido', (await beneficioDe(bk))?.status, 'consumed');
  const [fila] = await sql<{ status: string; amount_cents: number; destination_wallet_id: string }[]>`SELECT status::text AS status, amount_cents, destination_wallet_id FROM platform_transfers WHERE benefit_id=${ben!.id}`;
  expect('e a transferência ao proprietário entra na fila (R$ 291, carteira dele)', [fila?.status, fila?.amount_cents, fila?.destination_wallet_id], ['queued', 29100, sub.walletId]);
  await processAsaasWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: pgto!.provider_payment_id, value: 209, netValue: 207.01, subscription: subBen.id, billingType: 'PIX' } });
  expect('o mesmo aviso repetido não enfileira outra', (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM platform_transfers WHERE benefit_id=${ben!.id}`)[0]!.n, 1);

  const saldoAntes = testbed.asaasBalance.value;
  const envio = await b.processTransferOutbox();
  expect('a fila envia a transferência', envio, { sent: 1, failed: 0 });
  const tr = [...testbed.asaasTransfers.values()][0];
  expect('o Asaas (dublê) recebeu R$ 291 para a carteira do proprietário, com a referência do benefício', [tr?.value, tr?.walletId, tr?.externalReference], [291, sub.walletId, `benefit:${ben!.id}`]);
  expect('o saldo da conta principal caiu R$ 291', Math.round((saldoAntes - testbed.asaasBalance.value) * 100), 29100);
  expect('rodar a fila de novo não transfere outra vez (idempotente)', [await b.processTransferOutbox(), testbed.asaasTransfers.size], [{ sent: 0, failed: 0 }, 1]);
  const razao = await sql<{ type: string; amount_cents: number; premium_benefit_id: string | null }[]>`
    SELECT type::text AS type, amount_cents, premium_benefit_id FROM ledger_entries WHERE booking_id=${bk} ORDER BY amount_cents DESC, type`;
  expect('razão: +R$ 209 cobrados, −tarifa Pix, −R$ 291 de repasse e −R$ 291 da transferência da plataforma, tudo ligado ao benefício',
    razao.map((r) => [r.type, r.amount_cents, r.premium_benefit_id === ben!.id]),
    [['charge_captured', 20900, false], ['gateway_fee', -199, false], ['owner_payout', -29100, true], ['premium_benefit_funded', -29100, true]]);
  const [tp] = await sql<{ status: string; provider_transfer_id: string | null }[]>`SELECT status::text AS status, provider_transfer_id FROM platform_transfers WHERE benefit_id=${ben!.id}`;
  expect('a transferência fica "enviada" com o id do Asaas — confirmada só por webhook, que ainda não foi validado', [tp?.status, tp?.provider_transfer_id], ['sent', tr?.id]);

  secao('5. Validação de transferência (webhook do Asaas)');
  expect('aprova a transferência que está na fila, com valor e destino iguais', await b.validateTransferRequest({ externalReference: `benefit:${ben!.id}`, valueCents: 29100, walletId: sub.walletId }), { approved: true });
  expect('reprova valor diferente', (await b.validateTransferRequest({ externalReference: `benefit:${ben!.id}`, valueCents: 29101, walletId: sub.walletId })).approved, false);
  expect('reprova destino diferente', (await b.validateTransferRequest({ externalReference: `benefit:${ben!.id}`, valueCents: 29100, walletId: crypto.randomUUID() })).approved, false);
  expect('reprova transferência sem a nossa referência', (await b.validateTransferRequest({ externalReference: 'qualquer', valueCents: 100 })).approved, false);
  expect('reprova referência desconhecida', (await b.validateTransferRequest({ externalReference: `benefit:${crypto.randomUUID()}`, valueCents: 29100 })).approved, false);

  secao('6. Quem NÃO tem direito');
  const eT = await espaco('teste', 30000);
  const bkT = await aceitoPara(ids.teste, eT);
  await pagar(ids.teste, bkT, '11144477735');
  expect('Premium de TESTE da administração (sem marca financeira): sem benefício', await beneficioDe(bkT), undefined);
  const eS = await espaco('sem', 30000);
  const bkS = await aceitoPara(ids.semPremium, eS);
  await pagar(ids.semPremium, bkS, '12345678909'.replace('12345678909', '39053344705'));
  expect('quem não é Premium: sem benefício', await beneficioDe(bkS), undefined);

  // Outra conta com o MESMO CPF no mesmo período: a identidade já usou o direito.
  const eI = await espaco('ident', 30000);
  const bkI = await aceitoPara(ids.locatario2, eI);
  const dec = await b.decideFirstMonthBenefit({ renterId: ids.locatario2, ownerId: ids.dono, cpfCnpj: cpfLocatario, monthlyRentCents: 30000, totalChargedCents: 30900 });
  expect('trocar de conta com o mesmo CPF não dá novo benefício', dec, { kind: 'not_eligible', reason: 'identity_used' });
  void bkI;
  const [hash] = await sql<{ h: string }[]>`SELECT identity_hash AS h FROM premium_benefits WHERE id=${ben!.id}`;
  assert('o CPF não é guardado: só o hash', hash!.h.length === 64 && !hash!.h.includes(cpfLocatario), hash!.h.slice(0, 12) + '…');

  // Locação pequena: o que sobraria cobrar é menor que o mínimo do gateway.
  const eP = await espaco('pequeno', 8000);
  const dP = await b.decideFirstMonthBenefit({ renterId: ids.locatario2, ownerId: ids.dono, cpfCnpj: '39053344705', monthlyRentCents: 8000, totalChargedCents: 8240 });
  expect('aluguel de R$ 80: o benefício não se aplica por causa do mínimo do gateway (nunca é inflado)', dP, { kind: 'not_applied', reason: 'below_gateway_minimum' });
  void eP;

  secao('6b. Contas vinculadas e telefone (mais rigidez contra contas duplicadas)');
  const decidir = (renter: string, owner: string) => b.decideFirstMonthBenefit({ renterId: renter, ownerId: owner, cpfCnpj: '39053344705', monthlyRentCents: 30000, totalChargedCents: 30900 });
  // locatario2 já tem benefício bloqueado por identidade? Não: usa outro CPF aqui. Começa elegível.
  const [{ tel }] = await sql<{ tel: string }[]>`SELECT phone AS tel FROM profiles WHERE id = ${ids.locatario2}`;
  await sql`UPDATE profiles SET phone = ${tel.replace('+55', '0')} WHERE id = ${ids.dono}`;
  expect('locatário e proprietário com o MESMO telefone (escrito diferente): sem benefício', await decidir(ids.locatario2, ids.dono), { kind: 'not_eligible', reason: 'linked_accounts' });
  await sql`UPDATE profiles SET phone = NULL WHERE id = ${ids.dono}`;
  const [{ mail }] = await sql<{ mail: string }[]>`SELECT email AS mail FROM auth.users WHERE id = ${ids.locatario2}`;
  const [usuario, dominio] = mail.split('@');
  await sql`UPDATE auth.users SET email = ${`${usuario!.toUpperCase()}+outra@${dominio}`} WHERE id = ${ids.dono}`;
  expect('mesmo e-mail com "+etiqueta" e maiúsculas: sem benefício', await decidir(ids.locatario2, ids.dono), { kind: 'not_eligible', reason: 'linked_accounts' });
  await sql`UPDATE auth.users SET email = ${`${tag}-dono@exemplo.invalid`} WHERE id = ${ids.dono}`;
  const [g1] = await sql<{ a: string; b2: string }[]>`SELECT public.canonical_email('Fulano.Silva+mp@gmail.com') AS a, public.canonical_email('fulanosilva@googlemail.com') AS b2`;
  expect('no Gmail, pontos e "+etiqueta" não criam outra identidade', g1!.a, g1!.b2);
  const [inv] = await sql<{ id: string }[]>`
    INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date, monthly_rent_cents, renter_fee_bps, owner_fee_bps,
                          renter_fee_cents, owner_fee_cents, total_charged_cents, owner_payout_cents, activated_at)
    SELECT ${`MP-INV${String(Date.now()).slice(-5)}`}, ${eS}, ${ids.dono}, ${ids.semPremium}, 'requested', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
           30000, 300, 300, 900, 900, 30900, 29100, now()
    RETURNING id`;
  expect('o proprietário já alugou (pagou) do locatário — "rodízio" entre contas: vínculo detectado',
    (await sql<{ m: string | null }[]>`SELECT public.premium_accounts_linked(${ids.semPremium}, ${ids.dono}) AS m`)[0]!.m, 'locação no sentido inverso');
  await sql`DELETE FROM bookings WHERE id = ${inv!.id}`;
  await sql`UPDATE profiles SET phone_verified_at = NULL WHERE id = ${ids.locatario2}`;
  expect('sem telefone verificado: sem benefício', await decidir(ids.locatario2, ids.dono), { kind: 'not_eligible', reason: 'phone_unverified' });
  await sql`UPDATE profiles SET phone_verified_at = now() WHERE id = ${ids.locatario2}`;
  expect('sem vínculo e com telefone verificado: elegível', (await decidir(ids.locatario2, ids.dono)).kind, 'apply');

  secao('7. Carência do cartão (7 dias)');
  const cicloDe = async (u: string) => (await sql<{ c: string | null }[]>`SELECT public.premium_benefit_cycle_id(${u}) AS c`)[0]!.c;
  await limparPremium(sql, [ids.cartao]);
  const [cob] = await sql<{ id: string }[]>`
    INSERT INTO premium_charges (user_id, provider_payment_id, status, method, amount_cents, due_date, paid_at)
    VALUES (${ids.cartao}, ${`pay_cartao_${tag}`}, 'confirmed', 'credit_card', 11990, current_date, now() - interval '2 days') RETURNING id`;
  await sql`INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
            VALUES (${ids.cartao}, 1, 'subscription', ${cob!.id}, now() - interval '2 days', now() + interval '28 days', true)`;
  expect('Premium no cartão pago há 2 dias: benefício financeiro ainda em carência', await cicloDe(ids.cartao), null);
  expect('mas continua Premium (benefícios não financeiros funcionam)', (await sql<{ a: boolean }[]>`SELECT public.premium_is_active(${ids.cartao}) AS a`)[0]!.a, true);
  await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
  await sql`UPDATE premium_charges SET paid_at = now() - interval '8 days' WHERE id = ${cob!.id}`;
  await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
  assert('com 8 dias, a carência passou e o benefício libera', (await cicloDe(ids.cartao)) !== null);
  expect('no Pix a liberação é na confirmação', (await cicloDe(ids.locatario)) !== null, true);

  secao('8. Painel: exposição máxima × saldo');
  const exp = await b.getPremiumExposure();
  assert('a exposição máxima teórica é (ciclos sem uso) × R$ 100', exp.maxExposureCents === exp.unusedCycles * 10000, `${exp.unusedCycles} × R$ 100 = R$ ${exp.maxExposureCents / 100}`);
  expect('o saldo vem do servidor (dublê)', exp.balanceCents, Math.round(testbed.asaasBalance.value * 100));
  testbed.asaasBalance.value = 1;
  assert('com saldo pequeno a tela pode comparar e alertar', (await b.getPremiumExposure()).balanceCents === 100);

  secao('9. Trava do primeiro pagamento');
  const cicloLoc = (await cicloDe(ids.locatario))!;
  await rejeita('o banco recusa benefício numa locação já paga (renovação não tem direito)',
    () => sql`INSERT INTO premium_benefits (cycle_id, user_id, identity_hash, period_key, booking_id, max_cents, benefit_cents, charge_total_cents, payer_pays_cents, owner_payout_cents)
              SELECT ${cicloLoc}::uuid, ${ids.locatario}, 'zzz', '2099-01', ${bk}, 10000, 10000, 30900, 20900, 29100`, 'premium_benefits');
  await rejeita('o benefício não se edita nem se apaga', () => sql`DELETE FROM premium_benefits WHERE id=${ben!.id}`, 'premium_benefits_immutable');
  await rejeita('o valor consumido não muda', () => sql`UPDATE premium_benefits SET benefit_cents = 1 WHERE id=${ben!.id}`, 'premium_benefits_immutable');
}

async function limpar() {
  try {
    await flagOff();
    const reservas = sql`SELECT id FROM bookings WHERE owner_id = ANY(${todos}) OR renter_id = ANY(${todos})`;
    await sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`;
    try {
      await sql`DELETE FROM ledger_entries WHERE booking_id IN (${reservas})`;
    } finally {
      await sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`;
    }
    await sql`DELETE FROM platform_transfers WHERE booking_id IN (${reservas})`;
    await sql`ALTER TABLE premium_benefits DISABLE TRIGGER premium_benefits_no_delete`;
    try {
      await sql`DELETE FROM premium_benefits WHERE user_id = ANY(${todos})`;
    } finally {
      await sql`ALTER TABLE premium_benefits ENABLE TRIGGER premium_benefits_no_delete`;
    }
    await limparPremium(sql, todos);
    await sql`DELETE FROM notifications WHERE user_id = ANY(${todos})`;
    await sql`DELETE FROM payouts WHERE payment_id IN (SELECT id FROM payments WHERE booking_id IN (${reservas}))`;
    await sql`DELETE FROM payments WHERE booking_id IN (${reservas})`;
    await sql`DELETE FROM subscriptions WHERE booking_id IN (${reservas})`;
    await sql`DELETE FROM bookings WHERE owner_id = ANY(${todos}) OR renter_id = ANY(${todos})`;
    await sql`DELETE FROM owner_payout_accounts WHERE owner_id = ANY(${todos})`;
    await sql`DELETE FROM spaces WHERE owner_id = ANY(${todos})`;
    await sql`DELETE FROM renter_billing_profiles WHERE user_id = ANY(${todos})`;
    await sql.begin(async (tx) => {
      await tx`ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only`;
      await tx`DELETE FROM public.audit_logs WHERE actor_id = ANY(${todos})`;
      await tx`ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only`;
    });
    await sql`DELETE FROM profiles WHERE id = ANY(${todos})`;
    await sql`DELETE FROM auth.users WHERE id = ANY(${todos})`;
  } catch (err) {
    console.log(`  \x1b[33maviso na limpeza:\x1b[0m ${String(err).slice(0, 200)}`);
  }
}
const flagOff = () => sql`UPDATE platform_settings SET value = '0'::jsonb WHERE key = 'premium.first_month_benefit_enabled'`;

main()
  .catch((e) => { failed++; falhas.push('erro fatal'); console.error('\n\x1b[31mErro fatal:\x1b[0m', e); })
  .finally(async () => {
    await limpar();
    await testbed?.close();
    console.log(`\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` + (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : ''));
    if (falhas.length) console.log(`Falhas:\n - ${falhas.join('\n - ')}`);
    await sql.end();
    process.exit(failed ? 1 : 0);
  });

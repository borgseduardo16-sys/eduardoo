/**
 * Validação do benefício do primeiro mês no ASAAS SANDBOX (Etapa 2, Fase C).
 *
 * NÃO é um teste automático e NUNCA roda contra produção. Roda só se
 * ASAAS_ENV=sandbox e há ASAAS_API_KEY de sandbox no ambiente. Cada passo imprime
 * exatamente o que o Asaas respondeu. Ao primeiro passo que contradiz o que o
 * código assume, o script PARA — e o resultado deve ser levado ao responsável
 * pelo produto antes de qualquer alternativa (regra do projeto: não contornar).
 *
 *   ASAAS_ENV=sandbox ASAAS_API_KEY=… ASAAS_WEBHOOK_TOKEN=x pnpm tsx scripts/validar-asaas-beneficio.ts
 *
 * O que fica de fora e só o suporte do Asaas resolve: habilitar a validação de
 * transferência por webhook (a transferência pode ficar aguardando autorização).
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} } as never;

async function main() {
  if (process.env.ASAAS_ENV !== 'sandbox' || !process.env.ASAAS_API_KEY) {
    console.error('PARE: defina ASAAS_ENV=sandbox e ASAAS_API_KEY (chave de SANDBOX). Nada foi chamado.');
    process.exit(2);
  }
  const asaas = await import('../src/lib/payments/asaas');
  const achados: string[] = [];
  const passo = async <T>(nome: string, fn: () => Promise<T>): Promise<T> => {
    try {
      const r = await fn();
      console.log(`  OK     ${nome}`, JSON.stringify(r)?.slice(0, 300));
      achados.push(`OK     ${nome}`);
      return r;
    } catch (err) {
      const corpo = err instanceof asaas.AsaasError ? JSON.stringify({ status: err.status, body: err.body }) : String(err);
      console.log(`  FALHOU ${nome}\n         ${corpo}`);
      if (!(err instanceof asaas.AsaasError)) {
        console.log('\nIsto NÃO é uma resposta do Asaas: foi falha de rede/conexão (ou configuração local). Nada foi validado.');
        console.log('Rode este script numa máquina com acesso a api-sandbox.asaas.com.');
        process.exit(3);
      }
      console.log('\nPARE. Esta é uma limitação (ou configuração) do Asaas que muda o fluxo financeiro previsto.');
      console.log('Leve o texto acima ao responsável pelo produto. NÃO invente alternativa.');
      process.exit(1);
    }
  };

  console.log('1. Saldo da conta principal');
  await passo('GET /finance/balance', () => asaas.getBalanceCents());

  console.log('2. Pagador e subconta de teste');
  const cliente = await passo('POST /customers', () =>
    asaas.createCustomer({ name: 'Locatario Validacao', cpfCnpj: '52998224725', email: 'validacao@exemplo.invalid', externalReference: `val-${Date.now()}` }));
  const sub = await passo('POST /accounts (subconta do proprietário)', () =>
    asaas.createSubaccount({
      name: 'Proprietario Validacao', email: `val-${Date.now()}@exemplo.invalid`, cpfCnpj: '11144477735', mobilePhone: '27999998888',
      incomeValue: 5000, birthDate: '1990-01-01', address: 'Rua Teste', addressNumber: '100', province: 'Centro', postalCode: '29700000',
    }));

  console.log('3. Assinatura da locação com split (como hoje) — R$ 309 cobrados, R$ 294 ao proprietário');
  const assinatura = await passo('POST /subscriptions com split', () =>
    asaas.createSubscription({
      customer: cliente.id, billingType: 'PIX', value: 309, nextDueDate: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
      cycle: 'MONTHLY', split: asaas.splitForOwner(sub.walletId, 29400), externalReference: `val-sub-${Date.now()}`, description: 'Validação do benefício',
    }));
  const primeira = (await passo('GET /subscriptions/{id}/payments', () => asaas.listSubscriptionPayments(assinatura.id))).data[0];
  if (!primeira) { console.log('FALHOU: a assinatura não gerou a primeira cobrança.'); process.exit(1); }

  console.log('4. Abater o benefício na PRIMEIRA cobrança: valor menor e sem split');
  await passo('PUT /payments/{id} { value: 209, split: [] }', () =>
    asaas.updatePaymentValueAndSplit(primeira.id, { valueCents: 20900, split: [] }));
  const depois = await passo('GET /payments/{id} (confere o que ficou)', () => asaas.getPayment(primeira.id));
  console.log('         Conferir à mão: valor 209,00? split vazio? o valor das próximas mensalidades continua 309,00?', JSON.stringify(depois).slice(0, 300));

  console.log('5. Transferência da conta principal para a subconta (R$ 294)');
  await passo('POST /transfers { walletId, value }', () =>
    asaas.createTransferToWallet({ walletId: sub.walletId, valueCents: 29400, externalReference: `benefit:validacao-${Date.now()}` }));
  console.log('         Se o status vier como aguardando autorização, a validação por webhook ainda não está habilitada (pedir ao suporte).');

  await passo('limpeza: DELETE /subscriptions/{id}', () => asaas.cancelSubscription(assinatura.id));
  console.log('\nResumo:\n' + achados.map((a) => '  ' + a).join('\n'));
}
main().catch((e) => { console.error(e); process.exit(1); });

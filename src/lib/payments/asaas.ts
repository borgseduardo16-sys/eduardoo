import 'server-only';
import { requireIntegration } from '@/lib/env';

/**
 * Cliente HTTP do Asaas (gateway de pagamento — ver docs/PAGAMENTOS.md).
 *
 * ================================ LEIA ISTO ================================
 * O ambiente onde este cliente foi escrito bloqueia acesso direto a
 * `docs.asaas.com` (testado com `curl` e com fetch — bloqueio de politica de
 * rede, nao contornado de proposito). Tudo abaixo foi verificado por busca
 * (resumos indexados citando a documentacao oficial), nao por leitura direta
 * da pagina viva. Isso e mais confiavel que memoria/treinamento, mas MENOS
 * confiavel que ler a pagina — por isso cada grupo de campo abaixo diz o
 * quanto pode confiar nele. Ver docs/PAGAMENTOS.md §4 para o registro
 * completo da apuracao.
 *
 * CONFIRMADO por busca, cruzando varias paginas:
 *   - Base de producao: https://api.asaas.com/v3
 *   - Autenticacao: header `access_token` (NAO "Authorization: Bearer")
 *   - Split: array com {walletId, fixedValue} OU {walletId, percentualValue}
 *     — nao ambos no mesmo item. fixedValue: 2 casas decimais.
 *   - Subconta: POST /accounts devolve {apiKey, walletId} — apiKey so vem
 *     UMA vez, nunca mais e consultavel depois.
 *   - `incomeValue` e OBRIGATORIO em toda subconta (mudanca de contrato
 *     recente do proprio Asaas, achada num changelog).
 *   - Eventos de webhook: PAYMENT_CREATED, PAYMENT_AWAITING_RISK_ANALYSIS,
 *     PAYMENT_APPROVED_BY_RISK_ANALYSIS, PAYMENT_REPROVED_BY_RISK_ANALYSIS,
 *     PAYMENT_AUTHORIZED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED — nessa ordem
 *     tipica. PAYMENT_CONFIRMED != dinheiro disponivel; PAYMENT_RECEIVED e
 *     que significa saldo disponivel (por isso payment_status tem os dois
 *     estados separados — ver src/db/schema/enums.ts).
 *
 * MENOS confirmado (nome de campo plausivel, precisa checagem final antes de
 * credencial real — ver a nota em cada funcao abaixo):
 *   - Base de sandbox: buscas divergiram entre "sandbox.asaas.com/api/v3"
 *     (mais antigo) e "api-sandbox.asaas.com/v3" (mais recente, citado junto
 *     do prefixo de chave $aact_hmlg_). Uso o segundo como padrao, mas
 *     `ASAAS_API_BASE_URL` sobrescreve sem precisar mexer em codigo.
 *   - Campos exatos de criacao de cliente/subconta/assinatura.
 *   - Nomes de evento de estorno/chargeback (nao apareceram nas buscas).
 * =============================================================================
 */

const PRODUCTION_BASE = 'https://api.asaas.com/v3';
const SANDBOX_BASE = 'https://api-sandbox.asaas.com/v3';

function resolveBaseUrl(): string {
  const override = process.env.ASAAS_API_BASE_URL;
  if (override) return override.replace(/\/+$/, '');
  const { ASAAS_ENV } = requireIntegration('payments');
  return ASAAS_ENV === 'production' ? PRODUCTION_BASE : SANDBOX_BASE;
}

/** Erro vindo do Asaas (HTTP nao-2xx). Guarda o corpo bruto para auditoria/suporte. */
export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'AsaasError';
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'errors' in body) {
    const errors = (body as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { description?: string; code?: string };
      return first.description ?? first.code ?? null;
    }
  }
  return null;
}

async function asaasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { ASAAS_API_KEY } = requireIntegration('payments');

  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      access_token: ASAAS_API_KEY,
      'user-agent': 'MyPlace-Marketplace/1.0 (contato via plataforma)',
      ...init.headers,
    },
    cache: 'no-store',
  });

  const raw = await res.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;

  if (!res.ok) {
    const msg = extractErrorMessage(data) ?? `Asaas devolveu HTTP ${res.status}`;
    throw new AsaasError(res.status, data, msg);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Clientes (lado pagador — o locatario)
// ---------------------------------------------------------------------------

export type CreateCustomerInput = {
  name: string;
  cpfCnpj: string;
  email: string;
  mobilePhone?: string;
  /** Id interno (profile.id) devolvido depois no campo `externalReference`. */
  externalReference: string;
};

export type AsaasCustomer = {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string | null;
};

/**
 * Cria um cliente (cobravel) no Asaas.
 *
 * O Asaas NAO impede dois clientes com o mesmo `cpfCnpj` — por isso "achar ou
 * criar" e responsabilidade nossa (checar `renter_billing_profiles` no banco
 * ANTES de chamar isto), nao do gateway. Esta funcao so cria.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Subcontas (lado recebedor — o proprietario)
// ---------------------------------------------------------------------------

export type CreateSubaccountInput = {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  /** Faturamento/renda mensal em REAIS (nao centavos) — campo obrigatorio no Asaas. */
  incomeValue: number;
  /** Obrigatorio para pessoa fisica; pessoa juridica usa os campos empresariais (nao modelados aqui ainda). */
  birthDate?: string;
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
};

export type AsaasSubaccount = {
  id: string;
  /** So vem UMA vez, nesta resposta. Precisa ser cifrado e guardado na hora. */
  apiKey: string;
  walletId: string;
};

/**
 * Cria a subconta do proprietario (onboarding de recebimento).
 *
 * So chame isto depois do proprietario confirmar os proprios dados — nao ha
 * como "desfazer" uma subconta criada errada sem abrir chamado com o Asaas.
 */
export async function createSubaccount(input: CreateSubaccountInput): Promise<AsaasSubaccount> {
  return asaasFetch<AsaasSubaccount>('/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/** Um item do split. Use SO fixedValue OU SO percentualValue, nunca os dois no mesmo item. */
export type AsaasSplitItem =
  | { walletId: string; fixedValue: number }
  | { walletId: string; percentualValue: number };

/**
 * Monta o split de uma reserva: valor fixo para a carteira do proprietario.
 * `ownerPayoutCents` vem de `computeBookingAmounts` — a mesma fonte usada
 * para congelar os valores da reserva. fixedValue e OBRIGATORIAMENTE em
 * REAIS (nao centavos) e com 2 casas decimais, por isso a divisao por 100.
 */
export function splitForOwner(ownerWalletId: string, ownerPayoutCents: number): AsaasSplitItem[] {
  return [{ walletId: ownerWalletId, fixedValue: Math.round(ownerPayoutCents) / 100 }];
}

// ---------------------------------------------------------------------------
// Assinaturas (a recorrencia mensal de uma locacao)
// ---------------------------------------------------------------------------

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

export type CreateSubscriptionInput = {
  customer: string;
  billingType: AsaasBillingType;
  /** Em REAIS, nao centavos. */
  value: number;
  /** yyyy-mm-dd — quando a PRIMEIRA cobranca vence. */
  nextDueDate: string;
  cycle: 'MONTHLY';
  description?: string;
  split?: AsaasSplitItem[];
  /** Nosso id da reserva, para reconciliar em auditoria/suporte. */
  externalReference: string;
};

export type AsaasSubscription = {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
};

export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Cancela a assinatura — para quando um aluguel ativo e cancelado. */
export async function cancelSubscription(providerSubscriptionId: string): Promise<void> {
  await asaasFetch<unknown>(`/subscriptions/${encodeURIComponent(providerSubscriptionId)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Cobrancas individuais
// ---------------------------------------------------------------------------

export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  netValue: number | null;
  invoiceUrl: string | null;
  dueDate: string;
  billingType?: AsaasBillingType;
};

/** Busca uma cobranca pelo id do Asaas — usado para reconciliar apos webhook. */
export async function getPayment(providerPaymentId: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`);
}

/**
 * Lista as cobrancas geradas por uma assinatura — usado logo depois de
 * `createSubscription` pra achar a PRIMEIRA cobranca que o Asaas gerou
 * sozinho. Nao confirmei por leitura direta da documentacao que este
 * endpoint aceita `subscription` como filtro (busca so trouxe o padrao geral
 * de filtro por query string dos outros endpoints de listagem) — e o
 * caminho mais convencional/defensavel dado o que se sabe da API, mas
 * precisa de confirmacao antes de credencial real.
 */
export async function listSubscriptionPayments(
  providerSubscriptionId: string,
): Promise<{ data: AsaasPayment[] }> {
  return asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${encodeURIComponent(providerSubscriptionId)}&limit=1`,
  );
}

export type CreatePaymentInput = {
  customer: string;
  billingType: AsaasBillingType;
  /** Em REAIS, nao centavos. */
  value: number;
  /** yyyy-mm-dd. */
  dueDate: string;
  description?: string;
  /** Nosso id, para reconciliar em auditoria/suporte. */
  externalReference: string;
  /**
   * Mensalidade paga por Pix: cobranca avulsa COM split para o proprietario
   * (o split vale tambem para `POST /payments`, documentado em "Split em
   * cobranças avulsas"). Compra de Destaque/Turbo continua sem.
   */
  split?: AsaasSplitItem[];
};

/**
 * Cria uma cobranca UNICA (nao recorrente) — `POST /payments`, endpoint
 * separado de `/subscriptions`. Usado para compra avulsa de Destaque/Turbo:
 * dinheiro inteiro da plataforma, sem `split` (isso so existe para reservas,
 * onde uma parte vai para a carteira do proprietario).
 */
export async function createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Troca a forma de pagamento de uma cobranca que ainda nao foi paga
 * (`PUT /v3/payments/{id}` com `billingType` — permitido enquanto a cobranca
 * esta aguardando pagamento ou vencida; ver docs/ALUGUEL.md). E o que faz o
 * "Pagar agora" NUNCA criar uma cobranca nova: a mesma cobranca passa de
 * cartao para Pix (ou o contrario), e o historico continua um so.
 */
export async function updatePaymentBillingType(
  providerPaymentId: string,
  billingType: AsaasBillingType,
): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ billingType }),
  });
}

export type AsaasPixQrCode = {
  /** PNG em base64 (sem o prefixo data:). */
  encodedImage: string;
  /** Pix copia e cola. */
  payload: string;
  /** Quando o QR deixa de valer (formato do Asaas, ex.: "2026-10-02 23:59:59"). */
  expirationDate?: string | null;
};

/**
 * QR Code e "copia e cola" do Pix de uma cobranca (`GET
 * /v3/payments/{id}/pixQrCode`) — vale para cobrancas PIX, BOLETO ou
 * UNDEFINED. Exige chave Pix cadastrada na conta Asaas (ver docs/SETUP.md).
 */
export async function getPixQrCode(providerPaymentId: string): Promise<AsaasPixQrCode> {
  return asaasFetch<AsaasPixQrCode>(`/payments/${encodeURIComponent(providerPaymentId)}/pixQrCode`);
}

/**
 * Exclui uma cobranca que nao deve mais ser paga (aceite que expirou sem
 * pagamento, locacao encerrada). Cobranca ja paga nao e excluida — o Asaas recusa,
 * e o caminho nesse caso e o estorno.
 */
export async function deletePayment(providerPaymentId: string): Promise<void> {
  await asaasFetch<unknown>(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'DELETE' });
}

/**
 * Estorna uma cobranca. Sem `valueCents`, estorna o valor cheio.
 *
 * NAO decide politica de reembolso — so executa o que a camada de negocio
 * (ainda a definir, ver docs/PAGAMENTOS.md) mandar estornar.
 */
export async function refundPayment(
  providerPaymentId: string,
  valueCents?: number,
): Promise<AsaasPayment> {
  const body = valueCents !== undefined ? { value: Math.round(valueCents) / 100 } : {};
  return asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Benefício do primeiro mês (Fase C) — NADA ABAIXO FOI VALIDADO NO ASAAS REAL.
// Ver docs/PREMIUM-BENEFICIO.md e scripts/validar-asaas-beneficio.ts: antes de
// ligar a feature flag, cada chamada precisa ser exercitada no sandbox e depois
// na configuração real.
// ---------------------------------------------------------------------------

/** Saldo da conta PRINCIPAL (`GET /v3/finance/balance`). Só no servidor. */
export async function getBalanceCents(): Promise<number> {
  const r = await asaasFetch<{ balance: number }>('/finance/balance');
  if (typeof r.balance !== 'number') throw new AsaasError(502, r, 'Resposta de saldo sem o campo "balance".');
  return Math.round(r.balance * 100);
}

export type AsaasTransfer = { id: string; status?: string; value?: number };

/**
 * Transferência da conta principal para uma conta Asaas vinculada, pelo walletId
 * (`POST /v3/transfers`). É operação crítica: o Asaas pode exigir validação —
 * por webhook, que precisa ser habilitado pelo suporte (não vem ligado).
 */
export async function createTransferToWallet(input: {
  walletId: string;
  valueCents: number;
  externalReference: string;
}): Promise<AsaasTransfer> {
  return asaasFetch<AsaasTransfer>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      value: input.valueCents / 100,
      walletId: input.walletId,
      externalReference: input.externalReference,
    }),
  });
}

/** Ajusta valor e split de uma cobrança que ainda não foi paga (`PUT /v3/payments/{id}`). */
export async function updatePaymentValueAndSplit(
  providerPaymentId: string,
  input: { valueCents: number; split: AsaasSplitItem[] },
): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value: input.valueCents / 100, split: input.split }),
  });
}

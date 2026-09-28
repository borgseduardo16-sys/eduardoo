import 'server-only';
import { requireIntegration } from '@/lib/env';

/**
 * Cliente do Twilio Verify (verificação de telefone por SMS) — Fase 21.
 *
 * POR QUE O TWILIO VERIFY E NÃO "GERAR UM CÓDIGO E MANDAR POR SMS"
 *
 * O código nunca passa por nós: quem gera, envia, expira (10 min) e confere
 * é o provedor. Não há código guardado no nosso banco para vazar, nem
 * comparação feita por nós que um bug pudesse aceitar errado — o selo
 * "Telefone verificado" só é gravado quando o PROVEDOR responde `approved`.
 *
 * Contrato confirmado na documentação oficial (twilio.com/docs/verify/api):
 *   POST {base}/v2/Services/{ServiceSid}/Verifications      To, Channel=sms, Locale
 *   POST {base}/v2/Services/{ServiceSid}/VerificationCheck  To, Code
 *   Autenticação: HTTP Basic (Account SID : Auth Token).
 *   status: pending | approved | canceled | max_attempts_reached | deleted | failed | expired
 *   Erros relevantes: 20404 (verificação expirada/já aprovada), 60200 (número
 *   inválido), 60202 (mais de 5 conferências), 60203 (mais de 5 envios em
 *   10 min para o mesmo número), 60205 (número fixo, não recebe SMS).
 *
 * `TWILIO_VERIFY_BASE_URL` sobrescreve a base — é o que aponta os testes
 * automatizados para o dublê local (scripts/testbed/server.ts), mesmo padrão
 * de `ASAAS_API_BASE_URL`. Em produção fica vazio.
 */

const DEFAULT_BASE = 'https://verify.twilio.com';
const TIMEOUT_MS = 10_000;

function baseUrl(): string {
  return (process.env.TWILIO_VERIFY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

/** Erro devolvido pelo Twilio. `code` é o código numérico da documentação (ex.: 60203). */
export class TwilioVerifyError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'TwilioVerifyError';
  }
}

async function post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = requireIntegration('phoneVerification');
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const res = await fetch(`${baseUrl()}/v2/Services/${encodeURIComponent(TWILIO_VERIFY_SERVICE_SID)}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    // corpo não-JSON (proxy, página de erro): cai no erro genérico abaixo
  }

  if (!res.ok) {
    const code = typeof data.code === 'number' ? data.code : null;
    const message = typeof data.message === 'string' ? data.message : `Twilio devolveu HTTP ${res.status}`;
    throw new TwilioVerifyError(res.status, code, message);
  }
  return data;
}

/** Pede ao Twilio que envie um código por SMS para o número (E.164). */
export async function sendSmsCode(phoneE164: string): Promise<{ sid: string | null; status: string }> {
  const data = await post('/Verifications', { To: phoneE164, Channel: 'sms', Locale: 'pt-BR' });
  return {
    sid: typeof data.sid === 'string' ? data.sid : null,
    status: typeof data.status === 'string' ? data.status : 'unknown',
  };
}

/** Confere o código digitado. Só `status === 'approved'` significa verificado. */
export async function checkSmsCode(phoneE164: string, code: string): Promise<{ status: string; approved: boolean }> {
  const data = await post('/VerificationCheck', { To: phoneE164, Code: code });
  const status = typeof data.status === 'string' ? data.status : 'unknown';
  return { status, approved: status === 'approved' };
}

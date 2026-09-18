import 'server-only';
import { requireIntegration } from '@/lib/env';

/**
 * Cliente HTTP do Resend (e-mail transacional — ver docs/SETUP.md §5).
 *
 * Confirmado por busca em 18/09/2026 (docs.resend.com bloqueado pela politica
 * de rede deste ambiente, mesmo bloqueio ja registrado em docs/PAGAMENTOS.md
 * §4 para o Asaas): endpoint `POST https://api.resend.com/emails`,
 * autenticacao `Authorization: Bearer <chave>`, corpo
 * `{from, to: string[], subject, html}`. Formato exato do corpo de erro nao
 * confirmado por leitura direta — `extractErrorMessage` abaixo e defensivo
 * (tenta `message`, cai para o status HTTP se o formato vier diferente).
 */

const PRODUCTION_BASE = 'https://api.resend.com';

function resolveBaseUrl(): string {
  const override = process.env.RESEND_API_BASE_URL;
  if (override) return override.replace(/\/+$/, '');
  return PRODUCTION_BASE;
}

/** Erro vindo do Resend (HTTP nao-2xx). Guarda o corpo bruto para auditoria/suporte. */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ResendError';
  }
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return null;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type ResendEmail = { id: string };

/**
 * Envia um e-mail transacional.
 *
 * Lanca `IntegrationNotConfiguredError` (via `requireIntegration`) se
 * `RESEND_API_KEY`/`EMAIL_FROM` nao estiverem configurados — quem chama
 * decide o que fazer com isso. Esta funcao NUNCA finge que enviou.
 */
export async function sendEmail(input: SendEmailInput): Promise<ResendEmail> {
  const { RESEND_API_KEY, EMAIL_FROM } = requireIntegration('email');

  const res = await fetch(`${resolveBaseUrl()}/emails`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    cache: 'no-store',
  });

  const raw = await res.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;

  if (!res.ok) {
    const msg = extractErrorMessage(data) ?? `Resend devolveu HTTP ${res.status}`;
    throw new ResendError(res.status, data, msg);
  }
  return data as ResendEmail;
}

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireIntegration, IntegrationNotConfiguredError } from '@/lib/env';
import { processAsaasWebhook, type AsaasWebhookPayload } from '@/lib/payments/webhook';

/**
 * Compara os dois tokens em tempo constante.
 *
 * `!==` sai mais rapido quanto mais cedo os bytes divergem — um atacante
 * medindo a latencia da resposta consegue, byte a byte, descobrir o token
 * certo (timing attack). `timingSafeEqual` sempre compara todos os bytes,
 * mas exige os dois buffers do MESMO tamanho — por isso o `if` de tamanho
 * vem antes, e sozinho nao vaza informacao util (so "acertou o tamanho",
 * nao o conteudo).
 */
function tokensIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/asaas
 *
 * Autenticacao: header `asaas-access-token` com o valor combinado no painel
 * do Asaas na hora de criar o webhook (`ASAAS_WEBHOOK_TOKEN` — voce mesmo
 * inventa esse valor, ver docs/SETUP.md §4). Achado confirmado por busca:
 * o Asaas manda o token configurado nesse header exato em toda notificacao.
 *
 * NUNCA confie em "o frontend redirecionou para a pagina de sucesso" — essa
 * rota, alimentada pelo gateway, e a UNICA fonte que confirma pagamento de
 * verdade (regra explicita do projeto).
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let webhookToken: string;
  try {
    ({ ASAAS_WEBHOOK_TOKEN: webhookToken } = requireIntegration('payments'));
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      console.error('[webhook asaas] recebido antes da integracao estar configurada:', err.message);
      return NextResponse.json({ ok: false, reason: 'integracao nao configurada' }, { status: 503 });
    }
    throw err;
  }

  const recebido = request.headers.get('asaas-access-token');
  if (!recebido || !tokensIguais(recebido, webhookToken)) {
    // Nunca logar o valor recebido nem o esperado — so o fato de ter divergido.
    console.error('[webhook asaas] token invalido ou ausente');
    return NextResponse.json({ ok: false, reason: 'token invalido' }, { status: 401 });
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = (await request.json()) as AsaasWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: 'corpo nao e JSON valido' }, { status: 400 });
  }

  const resultado = await processAsaasWebhook(payload);

  /*
   * `ok: false` aqui significa "algo deu errado processando" — devolve 500
   * de proposito, para o Asaas reentregar depois (politica de retry dele).
   * `ok: true` cobre tanto "processado agora" quanto "ja tinha processado
   * antes" (idempotencia) e "evento reconhecido mas nao tratado ainda":
   * nenhum desses e erro do ponto de vista do Asaas — ele nao deve reentregar.
   */
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}

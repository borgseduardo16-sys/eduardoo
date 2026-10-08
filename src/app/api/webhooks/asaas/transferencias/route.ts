import { NextResponse, type NextRequest } from 'next/server';
import { requireIntegration, IntegrationNotConfiguredError } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security/tokens';
import { isBenefitEnabled, validateTransferRequest } from '@/lib/premium/benefit';

/**
 * POST /api/webhooks/asaas/transferencias
 *
 * Validação de transferência (operação crítica) do Asaas. O mecanismo NÃO vem
 * habilitado: é preciso pedir ao suporte do Asaas, e a liberação passa por
 * análise — ver docs/PREMIUM-BENEFICIO.md. O formato abaixo segue a documentação
 * lida (`transfer` com `value`, `externalReference` e a carteira de destino) e
 * NÃO foi confirmado contra o Asaas real; por isso responde REPROVADO em qualquer
 * dúvida. Só aprova transferência que existe na nossa fila, com o mesmo valor e
 * o mesmo destino, e só com a feature flag ligada.
 *
 * Mesma autenticação do webhook principal (header `asaas-access-token`).
 */
export const dynamic = 'force-dynamic';

const reprova = (reason: string) => NextResponse.json({ status: 'REFUSED', refuseReason: reason });

export async function POST(request: NextRequest) {
  let token: string;
  try {
    ({ ASAAS_WEBHOOK_TOKEN: token } = requireIntegration('payments'));
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) return NextResponse.json({ ok: false }, { status: 503 });
    throw err;
  }
  const recebido = request.headers.get('asaas-access-token');
  if (!recebido || !timingSafeEqualStrings(recebido, token)) {
    return NextResponse.json({ ok: false, reason: 'token invalido' }, { status: 401 });
  }
  if (!(await isBenefitEnabled())) return reprova('Benefício desligado.');

  let corpo: { transfer?: { value?: number; externalReference?: string | null; walletId?: string | null } };
  try {
    corpo = await request.json();
  } catch {
    return reprova('Corpo ilegível.');
  }
  const t = corpo.transfer;
  if (!t || typeof t.value !== 'number') return reprova('Transferência sem valor.');
  const r = await validateTransferRequest({
    externalReference: t.externalReference ?? null,
    valueCents: Math.round(t.value * 100),
    walletId: t.walletId ?? null,
  });
  return r.approved ? NextResponse.json({ status: 'APPROVED' }) : reprova(r.reason ?? 'Reprovada.');
}

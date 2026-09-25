import { NextResponse, type NextRequest } from 'next/server';
import { requireIntegration, IntegrationNotConfiguredError } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security/tokens';
import { runRentDueReminders, runOwnerActivityDigests } from '@/lib/notifications/cron';

/**
 * GET /api/cron/notificacoes
 *
 * Chamada pelo Vercel Cron (ver vercel.json) uma vez por dia. Autenticação:
 * header `Authorization: Bearer <CRON_SECRET>` — a Vercel manda esse header
 * automaticamente em toda invocação agendada quando a env var `CRON_SECRET`
 * está definida no projeto (convenção documentada da própria Vercel, não
 * algo inventado aqui). `CRON_SECRET` é você mesmo quem gera, mesmo padrão
 * de `ASAAS_WEBHOOK_TOKEN` — ver docs/SETUP.md §11.
 *
 * Sem a env var configurada, a rota recusa explicitamente (503) em vez de
 * fingir que rodou — mesma regra de todo o projeto para credencial ausente.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let cronSecret: string;
  try {
    ({ CRON_SECRET: cronSecret } = requireIntegration('cron'));
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      console.error('[cron notificacoes] recebido antes do CRON_SECRET estar configurado:', err.message);
      return NextResponse.json({ ok: false, reason: 'integracao nao configurada' }, { status: 503 });
    }
    throw err;
  }

  const auth = request.headers.get('authorization') ?? '';
  const recebido = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!recebido || !timingSafeEqualStrings(recebido, cronSecret)) {
    console.error('[cron notificacoes] token invalido ou ausente');
    return NextResponse.json({ ok: false, reason: 'token invalido' }, { status: 401 });
  }

  const [vencimentos, resumos] = await Promise.all([runRentDueReminders(), runOwnerActivityDigests()]);

  return NextResponse.json({ ok: true, vencimentos, resumos });
}

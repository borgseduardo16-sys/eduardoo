import { NextResponse, type NextRequest } from 'next/server';
import { requireIntegration, IntegrationNotConfiguredError } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security/tokens';
import { runRentDueReminders, runOwnerActivityDigests, runPromotionExpiringReminders } from '@/lib/notifications/cron';
import { runDepositAutoRelease } from '@/lib/payments/deposits';
import { runPriceDropCatchUp } from '@/lib/notifications/space-alerts';
import { runWaitlistSweep } from '@/lib/waitlist/notify';
import { runSavedSearchDigest } from '@/lib/alerts/matching';

/**
 * GET /api/cron/notificacoes
 *
 * O job diário agendado do projeto — não só notificação: também libera
 * sozinha a caução de aluguéis encerrados sem disputa (Fase 20). Os três
 * dividem a mesma rota de propósito: são o mesmo tipo de trabalho ("por
 * tempo, não por ação de alguém") e o plano Hobby da Vercel limita quantos
 * crons um projeto pode ter — não faz sentido gastar um segundo slot só
 * pra separar por nome.
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

  const [vencimentos, resumos, caucoes, promocoes, quedasDePreco, listaDeEspera, alertas] = await Promise.all([
    runRentDueReminders(),
    runOwnerActivityDigests(),
    runDepositAutoRelease(),
    runPromotionExpiringReminders(),
    // Fase 23: quedas de preço que ficaram para depois da janela mínima, a
    // rede de segurança da lista de espera e o resumo dos alertas de busca
    // (o que chegou dentro do intervalo mínimo e ficou na fila).
    runPriceDropCatchUp(),
    runWaitlistSweep(),
    runSavedSearchDigest(),
  ]);

  return NextResponse.json({ ok: true, vencimentos, resumos, caucoes, promocoes, quedasDePreco, listaDeEspera, alertas });
}

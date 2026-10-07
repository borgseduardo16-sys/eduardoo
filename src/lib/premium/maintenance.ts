import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { premiumMemberships, auditLogs } from '@/db/schema';
import * as asaas from '@/lib/payments/asaas';
import { isIntegrationConfigured } from '@/lib/env';
import { notifyUsers, type NotifyInput } from '@/lib/notifications/dispatch';
import { formatBrDate } from '@/lib/time';

/**
 * Manutenção do Premium pelo relógio (roda junto com a das locações —
 * `runBookingMaintenance`, chamada pelo agendador por minuto e pelo diário).
 *
 * A CORREÇÃO não depende disto: "é Premium agora?" vem do ciclo vigente, pelo
 * relógio do banco. Isto faz o que precisa acontecer na hora certa mesmo sem
 * ninguém abrir o app:
 *   1. arrumar o ESTADO guardado (período acabou → `expired`/`cancelled`);
 *   2. cancelar no Asaas a recorrência do que não vai mais renovar — repetindo
 *      até o gateway confirmar (nada de cobrança depois do fim);
 *   3. avisar uma vez só: "termina em breve", "renove", "terminou".
 *
 * Idempotente: duas execuções no mesmo minuto não duplicam aviso (dedupeKey) nem
 * cancelam duas vezes (marca de confirmação do gateway).
 */

export type PremiumMaintenanceSummary = { synced: number; cancelledAtGateway: number; failed: number; notices: number };

const AVISO_DIAS = 3;

function isNotFound(err: unknown): boolean {
  return err instanceof asaas.AsaasError && err.status === 404;
}

export async function runPremiumMaintenance(): Promise<PremiumMaintenanceSummary> {
  const resumo: PremiumMaintenanceSummary = { synced: 0, cancelledAtGateway: 0, failed: 0, notices: 0 };

  const [linha] = (await db.execute(sql`SELECT public.sync_premium_memberships() AS n`)) as unknown as { n: number }[];
  resumo.synced = Number(linha?.n ?? 0);

  // Recorrência a cancelar no gateway: pediu para não renovar, foi encerrada/revogada, ou expirou há mais
  // de N dias (esse intervalo deixa um pagamento atrasado ainda valer — ele reativa o ciclo e a assinatura segue).
  if (isIntegrationConfigured('payments')) {
    const paraCancelar = (await db.execute(sql`
      SELECT user_id, provider_subscription_id
        FROM premium_memberships
       WHERE provider_subscription_id IS NOT NULL
         AND provider_cancelled_at IS NULL
         AND (
           cancel_at_period_end
           OR status::text = 'cancelled'
           OR (status::text = 'expired'
               AND updated_at < now() - make_interval(days => public.platform_setting_int('premium.expired_cancel_after_days', 3)))
         )
       LIMIT 50
    `)) as unknown as { user_id: string; provider_subscription_id: string }[];

    for (const m of paraCancelar) {
      try {
        await asaas.cancelSubscription(m.provider_subscription_id);
      } catch (err) {
        if (!isNotFound(err)) {
          resumo.failed++;
          console.error('[manutenção premium] cancelar assinatura no Asaas falhou:', m.provider_subscription_id, err instanceof asaas.AsaasError ? err.body : err);
          continue;
        }
      }
      await db
        .update(premiumMemberships)
        .set({ providerCancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(premiumMemberships.userId, m.user_id));
      await db.insert(auditLogs).values({
        actorId: null,
        actorRole: 'system',
        action: 'premium.subscription_cancelled_at_gateway',
        entityType: 'profile',
        entityId: m.user_id,
        metadata: { providerSubscriptionId: m.provider_subscription_id },
      });
      resumo.cancelledAtGateway++;
    }
  }

  resumo.notices = await sendPremiumNotices();
  return resumo;
}

type LinhaFim = {
  user_id: string;
  cycle_id: string;
  ends_at: Date | string;
  cancel_at_period_end: boolean;
  open_charge_id: string | null;
};

/** Avisos que dependem do relógio. Cada um tem `dedupeKey`: nunca repete. */
export async function sendPremiumNotices(): Promise<number> {
  const avisos: NotifyInput[] = [];

  // 1. Ciclo pago terminando em até 3 dias e SEM ciclo seguinte já pago.
  const terminando = (await db.execute(sql`
    SELECT pm.user_id, c.id AS cycle_id, COALESCE(c.ended_early_at, c.ends_at) AS ends_at, pm.cancel_at_period_end,
           (SELECT ch.id FROM premium_charges ch
             WHERE ch.user_id = pm.user_id AND ch.status IN ('pending', 'overdue')
             ORDER BY ch.created_at DESC LIMIT 1) AS open_charge_id
      FROM premium_memberships pm
      JOIN premium_cycles c ON c.id = public.premium_current_cycle_id(pm.user_id)
     WHERE c.source::text = 'subscription'
       AND COALESCE(c.ended_early_at, c.ends_at) <= now() + make_interval(days => ${AVISO_DIAS})
       AND NOT EXISTS (SELECT 1 FROM premium_cycles n WHERE n.user_id = pm.user_id AND n.starts_at >= c.ends_at AND n.ended_early_at IS NULL)
  `)) as unknown as LinhaFim[];
  for (const t of terminando) {
    const fim = formatBrDate(new Date(t.ends_at));
    if (t.cancel_at_period_end) {
      avisos.push({
        userId: t.user_id, type: 'premium_changed', title: 'Seu Premium está terminando',
        body: `Seu Premium vai até ${fim} e não será renovado. Para continuar, reative a renovação em Meu Premium antes dessa data.`,
        linkPath: '/premium', data: { cycleId: t.cycle_id }, dedupeKey: `premium_ending:${t.cycle_id}`,
      });
    } else if (t.open_charge_id) {
      avisos.push({
        userId: t.user_id, type: 'premium_changed', title: 'Renove seu Premium',
        body: `Seu período pago termina em ${fim} e a renovação ainda não foi paga. Pague pelo app para continuar Premium sem interrupção.`,
        linkPath: '/premium', data: { cycleId: t.cycle_id }, dedupeKey: `premium_renew_soon:${t.cycle_id}`,
      });
    }
  }

  // 2. O período pago acabou sem renovação (a varredura já arrumou o estado; aqui só avisa).
  //    Estorno, contestação e revogação já avisaram por conta própria e ficam de fora.
  const terminaram = (await db.execute(sql`
    SELECT pm.user_id, lc.id AS cycle_id, COALESCE(lc.ended_early_at, lc.ends_at) AS ends_at,
           pm.cancel_at_period_end, NULL::uuid AS open_charge_id
      FROM premium_memberships pm
      JOIN LATERAL (
        SELECT id, ends_at, ended_early_at FROM premium_cycles WHERE user_id = pm.user_id ORDER BY number DESC LIMIT 1
      ) lc ON true
     WHERE pm.status::text IN ('expired', 'cancelled')
       AND pm.updated_at > now() - interval '1 day'
       AND lc.ended_early_at IS NULL
       AND NOT public.premium_is_active(pm.user_id)
  `)) as unknown as LinhaFim[];
  for (const t of terminaram) {
    avisos.push({
      userId: t.user_id, type: 'premium_changed', title: 'Seu Premium terminou',
      body: `O período pago do seu Premium terminou em ${formatBrDate(new Date(t.ends_at))}. Seus anúncios continuam no ar; os benefícios deixaram de valer. Dá para assinar de novo quando quiser.`,
      linkPath: '/premium', data: { cycleId: t.cycle_id }, dedupeKey: `premium_ended:${t.cycle_id}`,
    });
  }

  if (avisos.length === 0) return 0;
  await notifyUsers(db, avisos);
  return avisos.length;
}

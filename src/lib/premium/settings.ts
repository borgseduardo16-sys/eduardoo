import 'server-only';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';
import { settingInt } from '@/lib/settings';

/**
 * Configuração do Premium pago. Tudo vive em `platform_settings` (mudar é um
 * UPDATE, sem deploy) — os mesmos valores que as travas do banco leem.
 *
 * O PREÇO nunca vem do navegador: a assinatura é criada no Asaas com o valor
 * lido daqui, e o valor combinado fica congelado em `premium_memberships.plan_cents`.
 */

/** Preço mensal do Premium em centavos, ou null se a chave não existir (a página não inventa preço). */
export async function premiumMonthlyPriceCents(): Promise<number | null> {
  const cents = await settingInt('premium.price_monthly_cents', -1);
  return cents > 0 ? cents : null;
}

/** Destaques/Turbos gratuitos por CICLO PAGO (não acumulam). Mesmos números que a trava do banco usa. */
export async function cycleBenefitLimit(type: 'destaque' | 'turbo'): Promise<number> {
  return settingInt(`premium.cycle_${type}_limit`, type === 'turbo' ? 1 : 2);
}

/**
 * Renovação confirmada até N horas depois do fim do ciclo anterior continua o
 * ciclo (sem buraco no calendário). Depois disso o novo ciclo começa na
 * confirmação do pagamento — ciclo é período EFETIVAMENTE pago.
 */
export async function cycleContinuityHours(): Promise<number> {
  return settingInt('premium.cycle_continuity_hours', 24);
}

/**
 * Alcance ampliado no mapa: metros além do raio normal e máximo de anúncios
 * Premium individuais fora dele. Uma consulta só — o mapa chama isto a cada
 * movimento da tela.
 */
export async function premiumMapReach(): Promise<{ extraRadiusM: number; maxOutsidePins: number }> {
  const linhas = await db
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(inArray(platformSettings.key, ['premium.map_extra_radius_m', 'premium.map_max_outside_pins']));
  const valor = (chave: string, padrao: number) => {
    const n = Number(linhas.find((l) => l.key === chave)?.value);
    return Number.isFinite(n) && n >= 0 ? n : padrao;
  };
  return {
    extraRadiusM: valor('premium.map_extra_radius_m', 10000),
    maxOutsidePins: valor('premium.map_max_outside_pins', 5),
  };
}

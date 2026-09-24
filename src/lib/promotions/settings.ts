import 'server-only';
import { settingInt } from '@/lib/settings';

/**
 * Duracao e cota mensal de Destaque/Turbo.
 *
 * PLACEHOLDER: o usuario confirmou que ja tem um modelo de numeros para
 * isto e vai mandar depois — os valores abaixo sao so um ponto de partida
 * para a implementacao nao ficar travada, nao uma decisao de produto.
 * Vivem em `platform_settings` (mesmo padrao da taxa de 3%): trocar e um
 * UPDATE no banco, sem deploy e sem mexer neste arquivo.
 */
const DEFAULT_DURATION_HOURS = { destaque: 168, turbo: 48 } as const; // 7 dias / 48h
const DEFAULT_MONTHLY_LIMIT = { destaque: 2, turbo: 1 } as const;

export async function promotionDurationHours(type: 'destaque' | 'turbo'): Promise<number> {
  return settingInt(`promotions.${type}_duration_hours`, DEFAULT_DURATION_HOURS[type]);
}

export async function monthlyBenefitLimit(type: 'destaque' | 'turbo'): Promise<number> {
  return settingInt(`promotions.premium_monthly_${type}`, DEFAULT_MONTHLY_LIMIT[type]);
}

/** Quantos anuncios a secao "Espacos em destaque" mostra, no maximo. */
export async function featuredSectionLimit(): Promise<number> {
  return settingInt('promotions.featured_section_limit', 8);
}

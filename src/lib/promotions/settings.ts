import 'server-only';
import { settingInt } from '@/lib/settings';

/**
 * Duracao de Destaque/Turbo. (A cota do Premium vale POR CICLO PAGO e mora em src/lib/premium/settings.ts.)
 *
 * PLACEHOLDER: o usuario confirmou que ja tem um modelo de numeros para
 * isto e vai mandar depois — os valores abaixo sao so um ponto de partida
 * para a implementacao nao ficar travada, nao uma decisao de produto.
 * Vivem em `platform_settings` (mesmo padrao da taxa de 3%): trocar e um
 * UPDATE no banco, sem deploy e sem mexer neste arquivo.
 */
const DEFAULT_DURATION_HOURS = { destaque: 168, turbo: 48 } as const; // 7 dias / 48h

export async function promotionDurationHours(type: 'destaque' | 'turbo'): Promise<number> {
  return settingInt(`promotions.${type}_duration_hours`, DEFAULT_DURATION_HOURS[type]);
}

/** Quantos anuncios a secao "Espacos em destaque" mostra, no maximo. */
export async function featuredSectionLimit(): Promise<number> {
  return settingInt('promotions.featured_section_limit', 8);
}

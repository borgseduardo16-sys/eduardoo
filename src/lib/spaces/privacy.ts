import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';

/**
 * Privacidade da localização POR TIPO de espaço.
 *
 * Residência e tipos pessoais: o mapa público mostra só uma área aproximada, e
 * o endereço exato (rua, número, coordenada) só é liberado para o locatário
 * depois da locação confirmada. Tipos comerciais listados em
 * `privacy.exact_location_types` (loja, escritório, galpão…): o endereço já é
 * público por natureza, e o mapa mostra o ponto exato — quem garante isso é o
 * banco (`sync_approx_location`, migração 0033), então nenhuma consulta
 * pública precisa saber da exceção. Rua, número e complemento continuam
 * privados até a locação, para qualquer tipo.
 *
 * Isto só diz à tela QUAL das duas frases mostrar; não decide nada de segurança.
 */
export const exactLocationTypes = cache(async (): Promise<readonly string[]> => {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, 'privacy.exact_location_types'))
    .limit(1);
  const valor = row?.value;
  return Array.isArray(valor) ? valor.filter((t): t is string => typeof t === 'string') : [];
});

export async function isExactLocationType(type: string): Promise<boolean> {
  return (await exactLocationTypes()).includes(type);
}

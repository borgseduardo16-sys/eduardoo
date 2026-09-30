import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from './types';

/**
 * Texto da prévia de um link compartilhado (WhatsApp, redes — Fase 23):
 * tipo, preço e localização GERAL (bairro e cidade), depois o começo da
 * descrição. Recebe só campos públicos — rua, número e complemento nem
 * fazem parte do tipo, então não têm como entrar aqui.
 */
export function sharePreviewDescription(space: {
  type: string;
  priceMonthlyCents: number;
  district: string | null;
  city: string | null;
  description: string | null;
}): string | undefined {
  const local = [space.district, space.city].filter(Boolean).join(', ');
  const resumo = [
    spaceTypeLabel(space.type as SpaceTypeKey),
    `${formatBRL(space.priceMonthlyCents)}/mês`,
    local || null,
  ].filter(Boolean).join(' · ');
  const inicio = space.description?.slice(0, 140)?.trim();
  return [resumo, inicio].filter(Boolean).join('. ') || undefined;
}

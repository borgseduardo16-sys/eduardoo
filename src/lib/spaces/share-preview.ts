import { priceHeadline, type PriceSummary } from '@/lib/rentals/pricing';
import { spaceTypeLabel, type SpaceTypeKey } from './types';

/**
 * Texto da prévia de um link compartilhado (WhatsApp, redes — Fase 23):
 * tipo, preço e localização GERAL (bairro e cidade), depois o começo da
 * descrição. Recebe só campos públicos — rua, número e complemento nem
 * fazem parte do tipo, então não têm como entrar aqui.
 */
export function sharePreviewDescription(space: PriceSummary & {
  type: string;
  district: string | null;
  city: string | null;
  description: string | null;
}): string | undefined {
  const local = [space.district, space.city].filter(Boolean).join(', ');
  const preco = priceHeadline(space);
  const resumo = [
    spaceTypeLabel(space.type as SpaceTypeKey),
    preco ? `${preco.amount}${preco.suffix}` : null,
    local || null,
  ].filter(Boolean).join(' · ');
  const inicio = space.description?.slice(0, 140)?.trim();
  return [resumo, inicio].filter(Boolean).join('. ') || undefined;
}

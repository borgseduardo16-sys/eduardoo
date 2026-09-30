import { z } from 'zod';
import { centsToInputString, formatBRL } from '@/lib/money';
import { SPACE_TYPES, spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { VEHICLES, VEHICLE_LABEL, type Vehicle } from '@/lib/search/need/vocabulary';

/**
 * Critérios de um alerta de busca salva (Fase 23).
 *
 * É o formato GRAVADO em `saved_searches.criteria` — sempre montado e
 * validado pelo servidor a partir da busca que a pessoa fez, nunca aceito
 * pronto do navegador. O mesmo schema valida o que volta do banco antes de
 * usar (se uma coluna for adulterada por fora, o alerta é ignorado, não
 * executado com lixo).
 *
 * O texto livre de uma busca por necessidade NÃO é guardado: só os
 * critérios estruturados que saíram dele.
 *
 * Módulo puro (roda nos testes).
 */

const tipoSchema = z.enum(SPACE_TYPES);

export const alertCriteriaSchema = z
  .object({
    tipos: z.array(tipoSchema).max(6),
    cidade: z.string().min(1).max(120).nullable(),
    bairro: z.string().min(1).max(120).nullable(),
    ponto: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        raioM: z.number().int().min(500).max(50_000),
      })
      .nullable(),
    precoMinCents: z.number().int().min(0).max(100_000_000).nullable(),
    precoMaxCents: z.number().int().min(0).max(100_000_000).nullable(),
    caracteristicas: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(12),
    areaMin: z.number().int().min(1).max(100_000).nullable(),
    veiculo: z.enum(VEHICLES).nullable(),
    disponivelAgora: z.boolean(),
  })
  .strict();

export type AlertCriteria = z.infer<typeof alertCriteriaSchema>;

export function emptyAlertCriteria(): AlertCriteria {
  return {
    tipos: [], cidade: null, bairro: null, ponto: null, precoMinCents: null, precoMaxCents: null,
    caracteristicas: [], areaMin: null, veiculo: null, disponivelAgora: false,
  };
}

/**
 * Um alerta precisa dizer O QUE ou ONDE. "Qualquer espaço em qualquer
 * lugar" dispararia a cada anúncio publicado no país — isso é spam, não
 * alerta.
 */
export function isAlertable(c: AlertCriteria): boolean {
  return c.tipos.length > 0 || c.cidade != null || c.bairro != null || c.ponto != null;
}

/** Forma canônica — dois alertas com os mesmos critérios são o mesmo alerta. */
export function canonicalCriteria(c: AlertCriteria): string {
  return JSON.stringify({
    ...c,
    tipos: [...c.tipos].sort(),
    caracteristicas: [...c.caracteristicas].sort(),
    cidade: c.cidade?.toLowerCase() ?? null,
    bairro: c.bairro?.toLowerCase() ?? null,
  });
}

function listaComOu(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} ou ${itens[itens.length - 1]}`;
}

/** "Garagem • Centro, Colatina • até R$ 300,00 • Coberto" — gerado pelo servidor, nunca digitado. */
export function alertLabel(c: AlertCriteria, featureLabels: Map<string, string>): string {
  const partes: string[] = [];
  if (c.tipos.length > 0) {
    partes.push(listaComOu(c.tipos.map((t, i) => (i === 0 ? spaceTypeLabel(t) : spaceTypeLabel(t).toLowerCase()))));
  } else if (c.veiculo) {
    partes.push(`Para ${VEHICLE_LABEL[c.veiculo].toLowerCase()}`);
  }
  if (c.bairro) partes.push(c.cidade ? `${c.bairro}, ${c.cidade}` : c.bairro);
  else if (c.cidade) partes.push(c.cidade);
  else if (c.ponto) partes.push(`Até ${c.ponto.raioM >= 1000 ? `${String(c.ponto.raioM / 1000).replace('.', ',')} km` : `${c.ponto.raioM} m`} de um ponto`);
  if (c.precoMinCents != null && c.precoMaxCents != null) partes.push(`${formatBRL(c.precoMinCents)} a ${formatBRL(c.precoMaxCents)}`);
  else if (c.precoMaxCents != null) partes.push(`até ${formatBRL(c.precoMaxCents)}`);
  else if (c.precoMinCents != null) partes.push(`a partir de ${formatBRL(c.precoMinCents)}`);
  for (const k of c.caracteristicas) partes.push(featureLabels.get(k) ?? k);
  if (c.areaMin != null) partes.push(`${c.areaMin} m² ou mais`);
  if (c.disponivelAgora) partes.push('para começar já');
  const texto = partes.join(' • ');
  return (texto || 'Espaços').slice(0, 160);
}

/** A busca que mostra os espaços deste alerta hoje (o mesmo filtro, na tela de sempre). */
export function alertSearchHref(c: AlertCriteria, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (c.tipos.length === 1) p.set('tipo', c.tipos[0]!);
  else if (c.tipos.length > 1) p.set('tipos', c.tipos.join(','));
  if (c.ponto) {
    p.set('lat', String(c.ponto.lat));
    p.set('lng', String(c.ponto.lng));
    p.set('raio', String(c.ponto.raioM));
  } else if (c.bairro || c.cidade) {
    p.set('onde', c.bairro && c.cidade ? `${c.bairro}, ${c.cidade}` : (c.bairro ?? c.cidade)!);
  }
  if (c.precoMinCents != null) p.set('precoMin', centsToInputString(c.precoMinCents));
  if (c.precoMaxCents != null) p.set('precoMax', centsToInputString(c.precoMaxCents));
  if (c.caracteristicas.length > 0) p.set('caracteristicas', c.caracteristicas.join(','));
  if (c.areaMin != null) p.set('areaMin', String(c.areaMin));
  if (c.veiculo) p.set('veiculo', c.veiculo);
  if (c.disponivelAgora) p.set('disponivel', '1');
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  const qs = p.toString();
  return qs ? `/espacos?${qs}` : '/espacos';
}

/** O que o anúncio novo precisa ter para "atender de verdade" ao alerta. */
export type AlertCandidateSpace = {
  type: string;
  city: string | null;
  district: string | null;
  priceMonthlyCents: number;
  featureKeys: string[];
  sizeM2: string | null;
  /** Distância (m) do ponto do alerta, pela localização aproximada. Null = alerta sem ponto. */
  distanceMeters: number | null;
  /** Primeiro dia em que um aluguel pode começar. */
  earliestStart: string | null;
};

function mesmo(a: string | null, b: string | null): boolean {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return a != null && b != null && n(a) === n(b);
}

/**
 * TODOS os critérios do alerta precisam bater — é a regra "não enviar
 * notificação para qualquer anúncio, só se realmente atender". Veículo não
 * entra: é descrição da busca, não filtro (os tipos já saíram dele).
 */
export function spaceMatchesAlert(s: AlertCandidateSpace, c: AlertCriteria, today: string): boolean {
  if (c.tipos.length > 0 && !c.tipos.includes(s.type as SpaceTypeKey)) return false;
  if (c.cidade && !mesmo(s.city, c.cidade)) return false;
  if (c.bairro && !mesmo(s.district, c.bairro)) return false;
  if (c.ponto && (s.distanceMeters == null || s.distanceMeters > c.ponto.raioM)) return false;
  if (c.precoMaxCents != null && s.priceMonthlyCents > c.precoMaxCents) return false;
  if (c.precoMinCents != null && s.priceMonthlyCents < c.precoMinCents) return false;
  if (c.caracteristicas.some((k) => !s.featureKeys.includes(k))) return false;
  if (c.areaMin != null && (s.sizeM2 == null || Number(s.sizeM2) < c.areaMin)) return false;
  if (c.disponivelAgora && (s.earliestStart == null || s.earliestStart > today)) return false;
  return true;
}

export { type Vehicle };

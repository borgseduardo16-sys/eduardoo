import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { features } from '@/db/schema';
import { parseBRLToCents, InvalidAmountError } from '@/lib/money';
import { resolveLocation } from '@/lib/spaces/resolve-location';
import { matchSpaceTypeKeyword } from '@/lib/spaces/keywords';
import { SPACE_TYPES, type SpaceTypeKey } from '@/lib/spaces/types';
import { parseSizeParam, parseTypesParam, parseVehicleParam } from '@/lib/search/need/params';
import { alertCriteriaSchema, emptyAlertCriteria, isAlertable, type AlertCriteria } from './criteria';

/**
 * Busca atual (parâmetros de /espacos) → critérios de alerta (Fase 23).
 *
 * Mesma leitura que a página de resultados faz — o alerta avisa sobre
 * exatamente o que a pessoa estava vendo. O navegador manda só a query
 * string da busca; tudo é reinterpretado e validado aqui.
 */

export type CriteriaResult = { ok: true; criteria: AlertCriteria } | { ok: false; message: string };

function preco(v: string | undefined): number | null {
  if (!v) return null;
  try {
    return parseBRLToCents(v);
  } catch (err) {
    if (err instanceof InvalidAmountError) return null;
    throw err;
  }
}

const RAIO_PADRAO_M = 5_000;

function raio(v: string | undefined): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 500 && n <= 50_000 ? n : RAIO_PADRAO_M;
}

export async function criteriaFromSearch(sp: Record<string, string | undefined>): Promise<CriteriaResult> {
  const c = emptyAlertCriteria();

  const tipoBruto = sp.tipo?.trim();
  const tipo: SpaceTypeKey | null = tipoBruto
    ? (SPACE_TYPES as readonly string[]).includes(tipoBruto)
      ? (tipoBruto as SpaceTypeKey)
      : matchSpaceTypeKeyword(tipoBruto)
    : null;
  c.tipos = tipo ? [tipo] : parseTypesParam(sp.tipos);

  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  if (sp.lat && sp.lng && Number.isFinite(lat) && Number.isFinite(lng)) {
    c.ponto = { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)), raioM: raio(sp.raio) };
  } else if (sp.onde?.trim()) {
    const local = await resolveLocation({ onde: sp.onde });
    if (local.cepNotFound) return { ok: false, message: 'O CEP desta busca não existe. Corrija o local antes de criar o alerta.' };
    if (local.source === 'unresolved') {
      return { ok: false, message: 'Não conseguimos entender o local desta busca. Escolha uma cidade ou um bairro para criar o alerta.' };
    }
    if (local.districtFilter) {
      c.bairro = local.districtFilter;
      c.cidade = local.cityFilter;
    } else if (local.cityFilter) {
      c.cidade = local.cityFilter;
    } else if (local.point) {
      c.ponto = { lat: Number(local.point.lat.toFixed(5)), lng: Number(local.point.lng.toFixed(5)), raioM: raio(sp.raio) };
    }
  }

  c.precoMinCents = preco(sp.precoMin);
  c.precoMaxCents = preco(sp.precoMax);
  if (c.precoMinCents != null && c.precoMaxCents != null && c.precoMinCents > c.precoMaxCents) {
    return { ok: false, message: 'O preço mínimo está maior que o máximo. Ajuste os filtros antes de criar o alerta.' };
  }

  // Só características que existem no catálogo ativo.
  const pedidas = (sp.caracteristicas ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (pedidas.length > 0) {
    const ativas = new Set(
      (await db.select({ key: features.key }).from(features).where(eq(features.active, true))).map((f) => f.key),
    );
    c.caracteristicas = [...new Set(pedidas.filter((k) => ativas.has(k)))].slice(0, 12);
  }

  c.areaMin = parseSizeParam(sp.areaMin);
  c.veiculo = parseVehicleParam(sp.veiculo);
  c.disponivelAgora = sp.disponivel === '1';

  if (!isAlertable(c)) {
    return {
      ok: false,
      message: 'Para criar um alerta, escolha pelo menos um tipo de espaço ou um local — sem isso, você seria avisado de todo anúncio novo.',
    };
  }

  const validado = alertCriteriaSchema.safeParse(c);
  if (!validado.success) return { ok: false, message: 'Não foi possível montar o alerta com esta busca.' };
  return { ok: true, criteria: validado.data };
}

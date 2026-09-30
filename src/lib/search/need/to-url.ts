import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { features } from '@/db/schema';
import { matchKnownDistrictInCity } from '@/lib/spaces/queries';
import { interpretNeed } from './interpret';
import { interpretationToParams } from './params';
import { hasFilterCriterion, type NeedInterpretation } from './vocabulary';

/**
 * Do texto digitado em "O que você precisa?" até a URL de resultados
 * (Fase 23). Roda no servidor: aqui o que a interpretação trouxe é
 * conferido contra o banco antes de virar filtro —
 *
 * - característica só entra se existe no catálogo ATIVO e faz sentido para
 *   os tipos pedidos ("sala coberta": "coberto" não se aplica a sala, então
 *   não vira filtro que zeraria a busca — aparece como não usado);
 * - "centro de Colatina" vira "Centro, Colatina" quando esse bairro existe
 *   nessa cidade entre os anúncios; o campo "Onde?", quando preenchido,
 *   manda sobre o local da frase.
 */

const MAX_PALAVRAS_BUSCA_TEXTUAL = 4;

async function catalogoAtivo() {
  return db
    .select({ key: features.key, label: features.label, appliesTo: features.appliesTo })
    .from(features)
    .where(eq(features.active, true));
}

/** "centro de colatina" → ["centro", "colatina"]; sem conector, null. */
function bairroECidade(local: string): [string, string] | null {
  const m = /^(.+?)\s+(?:de|em|-)\s+(.+)$/i.exec(local.trim());
  return m ? [m[1]!, m[2]!] : null;
}

async function resolverLocal(daFrase: string | null, doCampo: string | null): Promise<{ onde: string | null; naoUsado: string | null }> {
  const campo = doCampo?.trim() || null;
  if (campo) {
    if (!daFrase) return { onde: campo, naoUsado: null };
    const bairro = await matchKnownDistrictInCity(daFrase, campo);
    return bairro
      ? { onde: `${bairro.district}, ${bairro.city}`, naoUsado: null }
      : { onde: campo, naoUsado: daFrase };
  }
  if (!daFrase) return { onde: null, naoUsado: null };
  const partes = bairroECidade(daFrase);
  if (partes) {
    const bairro = await matchKnownDistrictInCity(partes[0], partes[1]);
    if (bairro) return { onde: `${bairro.district}, ${bairro.city}`, naoUsado: null };
  }
  return { onde: daFrase, naoUsado: null };
}

export async function buildNeedSearchUrl(input: {
  q: string;
  onde?: string | null;
  gps?: { lat: number; lng: number } | null;
  clientKey: string;
  today?: string;
}): Promise<string> {
  const resultado = await interpretNeed(input.q, { clientKey: input.clientKey, today: input.today });
  const i: NeedInterpretation = { ...resultado.interpretation };
  const naoUsados = [...resultado.residual];

  const catalogo = await catalogoAtivo();
  const aceitas: typeof i.featureKeys = [];
  for (const key of i.featureKeys) {
    const f = catalogo.find((c) => c.key === key);
    if (!f) continue;
    const serve = i.types.length === 0 || f.appliesTo.length === 0 || i.types.some((t) => f.appliesTo.includes(t));
    if (serve) aceitas.push(key);
    else naoUsados.push(f.label.toLowerCase());
  }
  i.featureKeys = aceitas;

  const local = await resolverLocal(i.location, input.onde ?? null);
  if (local.naoUsado) naoUsados.push(local.naoUsado);

  const params = interpretationToParams(resultado.text, i, {
    onde: local.onde,
    ondeCampo: input.onde?.trim().slice(0, 120) || null,
    gps: input.gps ?? null,
    aiFailed: resultado.ai === 'falhou' || resultado.ai === 'limite',
    residual: naoUsados,
  });

  // Nenhum critério que filtre e texto curto ("adega", "canil"): cai na
  // busca textual de sempre (título, cidade, bairro), em vez de mostrar tudo
  // sem filtro nenhum.
  const palavras = resultado.text.split(/\s+/).filter(Boolean);
  if (!hasFilterCriterion(i) && palavras.length <= MAX_PALAVRAS_BUSCA_TEXTUAL) {
    params.set('texto', resultado.text);
    params.delete('ignorado');
  }

  return `/espacos?${params.toString()}`;
}

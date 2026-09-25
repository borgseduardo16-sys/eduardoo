import 'server-only';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { spaces, features, spaceQualityAssessments } from '@/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPACE_IMAGES_BUCKET } from '@/lib/storage/images';
import type { PhotoInput } from './vision';
import type { LocationComparable } from './scoring';

/** Quantas fotos mandar pra IA — o bastante pra avaliar, sem inflar custo/latência à toa. */
const MAX_PHOTOS_FOR_AI = 6;

/** Quantas características existem, no catálogo real, para cada papel — nunca um número fixo chutado. */
export async function fetchFeatureApplicability(
  spaceType: string,
): Promise<{ estruturaTotal: number; estruturaKeys: string[]; extrasApplicableKeys: string[] }> {
  const rows = await db
    .select({ key: features.key, category: features.category, appliesTo: features.appliesTo })
    .from(features)
    .where(eq(features.active, true));

  const appliesToThisType = (appliesTo: string[]) => appliesTo.length === 0 || appliesTo.includes(spaceType);

  const estrutura = rows.filter((f) => f.category === 'estrutura' && appliesToThisType(f.appliesTo));
  const extras = rows.filter(
    (f) => ['seguranca', 'acesso', 'veiculo'].includes(f.category) && appliesToThisType(f.appliesTo),
  );

  return {
    estruturaTotal: estrutura.length,
    estruturaKeys: estrutura.map((f) => f.key),
    extrasApplicableKeys: extras.map((f) => f.key),
  };
}

/**
 * Outros anúncios PUBLICADOS do mesmo tipo, na mesma cidade, com metragem
 * válida — a base real de comparação da Localização (ver scoring.ts).
 * Nunca inclui o próprio espaço.
 */
export async function fetchLocationComparables(
  spaceType: string,
  city: string | null,
  excludeSpaceId: string,
): Promise<LocationComparable[]> {
  if (!city) return [];

  const rows = await db
    .select({ priceMonthlyCents: spaces.priceMonthlyCents, sizeM2: spaces.sizeM2 })
    .from(spaces)
    .where(
      and(
        eq(spaces.status, 'published'),
        isNull(spaces.deletedAt),
        sql`${spaces.type}::text = ${spaceType}`,
        eq(spaces.city, city),
        ne(spaces.id, excludeSpaceId),
        sql`${spaces.sizeM2} IS NOT NULL AND ${spaces.sizeM2} > 0`,
      ),
    )
    .limit(200);

  return rows.map((r) => ({ priceMonthlyCents: r.priceMonthlyCents, sizeM2: Number(r.sizeM2) }));
}

/**
 * Baixa as fotos do espaço do Storage e devolve em base64, prontas pra IA.
 * Um caminho que falha ao baixar é ignorado (loga e segue) — a classificação
 * continua com as fotos que deram certo, em vez de falhar tudo por uma foto
 * corrompida.
 */
export async function downloadSpacePhotosAsBase64(
  images: Array<{ storagePath: string; contentType: string | null }>,
): Promise<PhotoInput[]> {
  const supabase = createAdminClient();
  const selecionadas = images.slice(0, MAX_PHOTOS_FOR_AI);

  const resultados = await Promise.all(
    selecionadas.map(async (img): Promise<PhotoInput | null> => {
      const { data, error } = await supabase.storage.from(SPACE_IMAGES_BUCKET).download(img.storagePath);
      if (error || !data) {
        console.error('[quality] falha ao baixar foto para análise de IA:', img.storagePath, error?.message);
        return null;
      }
      const bytes = Buffer.from(await data.arrayBuffer());
      const mediaType =
        img.contentType === 'image/png' || img.contentType === 'image/webp' ? img.contentType : 'image/jpeg';
      return { base64: bytes.toString('base64'), mediaType };
    }),
  );

  return resultados.filter((r): r is PhotoInput => r !== null);
}

export type QualityAssessmentRow = typeof spaceQualityAssessments.$inferSelect;

/** Histórico completo, mais recente primeiro. */
export async function listQualityAssessments(spaceId: string): Promise<QualityAssessmentRow[]> {
  return db
    .select()
    .from(spaceQualityAssessments)
    .where(eq(spaceQualityAssessments.spaceId, spaceId))
    .orderBy(desc(spaceQualityAssessments.createdAt));
}

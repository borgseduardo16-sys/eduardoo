'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { spaceQualityAssessments } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { getOwnedSpace, SpaceNotFoundError, NotSpaceOwnerError } from '@/lib/spaces/queries';
import { rateLimit } from '@/lib/rate-limit';
import { IntegrationNotConfiguredError } from '@/lib/env';
import { analyzeSpacePhotos, AiVisionError } from './vision';
import { computeQualityAssessment, InvalidAssessmentInputError } from './scoring';
import { computePriceSuggestion } from './pricing';
import { fetchFeatureApplicability, fetchLocationComparables, downloadSpacePhotosAsBase64 } from './queries';
import { requestQualityAssessmentSchema } from './schemas';

export type QualityActionState = { ok: boolean; message?: string };

/**
 * Roda a classificação de padrão do espaço (Fase 16) e, junto, a sugestão
 * de valor de aluguel (Fase 17): baixa as fotos de verdade, manda pra IA
 * analisar, monta os comparáveis reais da cidade, calcula o score e a
 * faixa de preço sugerida, e grava um snapshot completo — tudo numa linha
 * só, uma chamada de IA só (a sugestão de preço é aritmética em cima do
 * mesmo score, nunca uma segunda chamada).
 *
 * Ferramenta do PRÓPRIO proprietário — não é um selo público. Cada chamada
 * custa uma requisição real de IA, por isso o limite de uso (ver
 * `rateLimit` abaixo) e a checagem de dono ANTES de gastar qualquer coisa.
 */
export async function requestQualityAssessmentAction(
  _prev: QualityActionState | undefined,
  formData: FormData,
): Promise<QualityActionState> {
  const user = await requireUserOrThrow();

  const parsed = requestQualityAssessmentSchema.safeParse({
    spaceId: formData.get('spaceId'),
    conservationState: formData.get('conservationState'),
    ageYears: formData.get('ageYears'),
    renovatedRecently: formData.get('renovatedRecently'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { spaceId, conservationState, ageYears, renovatedRecently } = parsed.data;

  // 10 por dia é generoso pro uso legítimo (algumas tentativas por anúncio,
  // reclassificar depois de uma reforma) e limita o custo de uma chamada de
  // IA real disparada em excesso, de propósito ou por engano.
  const limit = await rateLimit(`quality-assessment:${user.id}`, { limit: 10, windowSeconds: 86400 });
  if (!limit.allowed) {
    return { ok: false, message: 'Você atingiu o limite de classificações por hoje. Tente novamente amanhã.' };
  }

  let space;
  try {
    space = await getOwnedSpace(spaceId, user.id);
  } catch (err) {
    if (err instanceof SpaceNotFoundError) return { ok: false, message: 'Espaço não encontrado.' };
    if (err instanceof NotSpaceOwnerError) return { ok: false, message: 'Este espaço não é seu.' };
    throw err;
  }

  if (space.images.length === 0) {
    return { ok: false, message: 'Adicione ao menos uma foto ao anúncio antes de classificar.' };
  }

  const photos = await downloadSpacePhotosAsBase64(space.images);
  if (photos.length === 0) {
    return { ok: false, message: 'Não foi possível carregar as fotos do anúncio agora. Tente de novo em instantes.' };
  }

  let aiFindings;
  try {
    aiFindings = await analyzeSpacePhotos(photos, { spaceType: space.type, title: space.title });
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      return {
        ok: false,
        message: 'A classificação por IA ainda não está configurada neste ambiente. Veja docs/SETUP.md §10.',
      };
    }
    if (err instanceof AiVisionError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  const [applicability, comparables] = await Promise.all([
    fetchFeatureApplicability(space.type),
    fetchLocationComparables(space.type, space.city, spaceId),
  ]);

  const estruturaSelecionadas = space.featureKeys.filter((k) => applicability.estruturaKeys.includes(k)).length;
  const extrasSelecionadas = space.featureKeys.filter((k) => applicability.extrasApplicableKeys.includes(k)).length;
  const sizeM2 = space.sizeM2 != null ? Number(space.sizeM2) : null;
  const ceilingHeightM = space.ceilingHeightM != null ? Number(space.ceilingHeightM) : null;

  let computed;
  try {
    computed = computeQualityAssessment({
      conservationState,
      ageYears,
      renovatedRecently,
      aiFindings,
      location: {
        thisPricePerM2: sizeM2 && sizeM2 > 0 ? space.priceMonthlyCents / sizeM2 : null,
        comparables,
      },
      structure: {
        estruturaFeatureCount: estruturaSelecionadas,
        estruturaFeatureTotal: applicability.estruturaTotal,
        ceilingHeightM,
      },
      extras: {
        selectedApplicableCount: extrasSelecionadas,
        applicableCount: applicability.extrasApplicableKeys.length,
      },
    });
  } catch (err) {
    if (err instanceof InvalidAssessmentInputError) return { ok: false, message: err.message };
    throw err;
  }

  const priceSuggestion = computePriceSuggestion({
    comparables,
    thisSizeM2: sizeM2,
    classification: computed.classification,
    extrasScore: computed.extrasScore,
  });

  await db.insert(spaceQualityAssessments).values({
    spaceId,
    requestedBy: user.id,
    conservationState,
    ageYears,
    renovatedRecently,
    photosScore: computed.photosScore.toFixed(2),
    locationScore: computed.locationScore.toFixed(2),
    structureScore: computed.structureScore.toFixed(2),
    extrasScore: computed.extrasScore.toFixed(2),
    baseScore: computed.baseScore.toFixed(2),
    conservationFactor: computed.conservationFactor.toFixed(2),
    ageFactor: computed.ageFactor.toFixed(2),
    renovationFactor: computed.renovationFactor.toFixed(2),
    finalScore: computed.finalScore.toFixed(2),
    classification: computed.classification,
    aiConservationState: aiFindings.conservacaoPercebida,
    aiFindings: {
      acabamento: aiFindings.acabamento,
      modernidade: aiFindings.modernidade,
      sinaisDeDesgaste: aiFindings.sinaisDeDesgaste,
      resumo: aiFindings.resumo,
    },
    userAiDivergent: computed.userAiDivergent,
    explanation: computed.explanation,
    priceComparablesCount: priceSuggestion.comparablesCount,
    priceLowConfidence: priceSuggestion.lowConfidence,
    priceBaseCents: priceSuggestion.baseCents,
    priceScoreFactorBps: priceSuggestion.scoreFactorBps,
    priceExtrasFactorBps: priceSuggestion.extrasFactorBps,
    suggestedPriceIdealCents: priceSuggestion.idealCents,
    suggestedPriceMinCents: priceSuggestion.minCents,
    suggestedPriceMaxCents: priceSuggestion.maxCents,
    priceMarketWarning: priceSuggestion.marketWarning,
  });

  revalidatePath(`/meus-espacos/${spaceId}/classificacao`);

  return { ok: true, message: 'Classificação concluída.' };
}

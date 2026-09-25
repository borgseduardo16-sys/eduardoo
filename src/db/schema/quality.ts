import {
  pgTable,
  uuid,
  integer,
  timestamp,
  boolean,
  jsonb,
  numeric,
  text,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { spaceConservationState, spaceQualityClassification, spacePriceMarketWarning } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';

/** O que a IA relatou ao olhar as fotos do espaco. */
export type AiPhotoFindings = {
  acabamento: number;
  modernidade: number;
  sinaisDeDesgaste: string[];
  resumo: string;
};

/**
 * Classificacao de padrao do espaco (Fase 16) — ferramenta do proprietario,
 * nao selo publico. Motor 100% descrito em `src/lib/quality/scoring.ts`
 * (fotos 45% via IA + localizacao 25% via comparaveis reais + estrutura 15%
 * + extras 15%, multiplicados por fatores de conservacao/idade/reforma).
 *
 * Cada linha e um snapshot completo — nunca so o resultado final — porque o
 * proprietario pode reclassificar depois de uma reforma e o historico
 * anterior continua explicavel sem precisar recalcular nada.
 *
 * Nao ha trigger de autorizacao aqui (diferente de `reviews`): a acao so
 * confere que quem pede e o dono do espaco, o mesmo padrao de editar
 * titulo/descricao do anuncio — o risco de um bug aqui e gastar uma
 * chamada de IA por engano, nao vazar dinheiro nem fabricar avaliacao de
 * terceiro.
 *
 * Fase 17 acrescentou a sugestao de valor de aluguel (colunas `price*`/
 * `suggestedPrice*`), derivada deste mesmo score — sem chamada de IA nova,
 * so aritmetica sobre comparaveis reais. E dinheiro, entao as colunas sao
 * INTEGER em centavos (nunca numeric/float) e os CHECKs abaixo refazem a
 * conta inteira em basis points, mesma disciplina de `src/lib/money.ts`.
 */
export const spaceQualityAssessments = pgTable(
  'space_quality_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    // ---- Informado pelo proprietario ----
    conservationState: spaceConservationState('conservation_state').notNull(),
    ageYears: integer('age_years').notNull(),
    renovatedRecently: boolean('renovated_recently').notNull().default(false),

    // ---- Componentes do score base (0-10 cada, antes dos multiplicadores) ----
    photosScore: numeric('photos_score', { precision: 4, scale: 2 }).notNull(),
    locationScore: numeric('location_score', { precision: 4, scale: 2 }).notNull(),
    structureScore: numeric('structure_score', { precision: 4, scale: 2 }).notNull(),
    extrasScore: numeric('extras_score', { precision: 4, scale: 2 }).notNull(),
    baseScore: numeric('base_score', { precision: 4, scale: 2 }).notNull(),

    /** Fatores efetivamente aplicados — podem diferir da tabela "pura" quando a IA diverge do dono. */
    conservationFactor: numeric('conservation_factor', { precision: 3, scale: 2 }).notNull(),
    ageFactor: numeric('age_factor', { precision: 3, scale: 2 }).notNull(),
    renovationFactor: numeric('renovation_factor', { precision: 3, scale: 2 }).notNull(),

    finalScore: numeric('final_score', { precision: 4, scale: 2 }).notNull(),
    classification: spaceQualityClassification('classification').notNull(),

    // ---- Analise de IA (fotos) e validacao IA vs proprietario ----
    aiConservationState: spaceConservationState('ai_conservation_state').notNull(),
    aiFindings: jsonb('ai_findings').$type<AiPhotoFindings>().notNull(),
    /** true = a IA discordou do dono o suficiente para reduzir o fator de conservacao. */
    userAiDivergent: boolean('user_ai_divergent').notNull().default(false),

    explanation: text('explanation').notNull(),

    // ---- Sugestao de valor de aluguel (Fase 17) — deriva deste mesmo score,
    // sem chamada de IA nova. Colunas nulas em conjunto quando nao ha
    // NENHUM comparavel real (nunca inventa um valor sem dado nenhum). ----
    priceComparablesCount: integer('price_comparables_count').notNull().default(0),
    /** < 5 comparaveis (recomendacao do proprio motor) — nunca escondido do proprietario. */
    priceLowConfidence: boolean('price_low_confidence').notNull().default(true),
    /** Mediana real de aluguel de anuncios comparaveis (mesmo tipo, mesma cidade, metragem +-20%) no momento desta classificacao. */
    priceBaseCents: integer('price_base_cents'),
    /** 7000 (economico) a 15000 (luxo) — basis points, tabela fixa por classificacao. */
    priceScoreFactorBps: integer('price_score_factor_bps'),
    /** 10000 a 11500 — basis points, funcao linear de extras_score. */
    priceExtrasFactorBps: integer('price_extras_factor_bps'),
    suggestedPriceIdealCents: integer('suggested_price_ideal_cents'),
    suggestedPriceMinCents: integer('suggested_price_min_cents'),
    suggestedPriceMaxCents: integer('suggested_price_max_cents'),
    priceMarketWarning: spacePriceMarketWarning('price_market_warning'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('space_quality_assessments_space_idx').on(t.spaceId, t.createdAt),
    index('space_quality_assessments_requested_by_idx').on(t.requestedBy),

    check('sqa_photos_score_range', sql`${t.photosScore} BETWEEN 0 AND 10`),
    check('sqa_location_score_range', sql`${t.locationScore} BETWEEN 0 AND 10`),
    check('sqa_structure_score_range', sql`${t.structureScore} BETWEEN 0 AND 10`),
    check('sqa_extras_score_range', sql`${t.extrasScore} BETWEEN 0 AND 10`),
    check('sqa_final_score_range', sql`${t.finalScore} BETWEEN 0 AND 10`),
    check('sqa_age_years_range', sql`${t.ageYears} BETWEEN 0 AND 200`),

    /** Fatores restritos as tabelas fixas do motor — nunca um numero arbitrario. */
    check('sqa_conservation_factor_valid', sql`${t.conservationFactor} IN (0.80, 0.90, 1.00, 1.05, 1.10)`),
    check('sqa_age_factor_valid', sql`${t.ageFactor} IN (0.80, 0.90, 1.00, 1.10)`),
    check('sqa_renovation_factor_valid', sql`${t.renovationFactor} IN (1.00, 1.10)`),

    /**
     * base_score e puramente aritmetico a partir das 4 colunas acima — o
     * banco recalcula e confere, no mesmo espirito de `bookings_total_matches`.
     */
    check(
      'sqa_base_score_matches_components',
      sql`${t.baseScore} = ROUND(${t.photosScore} * 0.45 + ${t.locationScore} * 0.25 + ${t.structureScore} * 0.15 + ${t.extrasScore} * 0.15, 2)`,
    ),
    /** final_score e base_score x fatores, sempre limitado a [0,10]. */
    check(
      'sqa_final_score_matches_formula',
      sql`${t.finalScore} = LEAST(10, GREATEST(0, ROUND(${t.baseScore} * ${t.conservationFactor} * ${t.ageFactor} * ${t.renovationFactor}, 2)))`,
    ),
    /** Classificacao tem que bater com a faixa do score final — nunca escrita solta. */
    check(
      'sqa_classification_matches_score',
      sql`(${t.classification} = 'economico'   AND ${t.finalScore} >= 0 AND ${t.finalScore} < 4)
       OR (${t.classification} = 'medio'       AND ${t.finalScore} >= 4 AND ${t.finalScore} < 7)
       OR (${t.classification} = 'alto_padrao' AND ${t.finalScore} >= 7 AND ${t.finalScore} < 9)
       OR (${t.classification} = 'luxo'        AND ${t.finalScore} >= 9 AND ${t.finalScore} <= 10)`,
    ),

    /** price_low_confidence e puramente derivado da contagem — nunca escondido/forcado. */
    check('sqa_price_low_confidence_matches_count', sql`${t.priceLowConfidence} = (${t.priceComparablesCount} < 5)`),
    check('sqa_price_comparables_count_range', sql`${t.priceComparablesCount} BETWEEN 0 AND 200`),

    /** As 6 colunas de preco sao nulas TODAS JUNTAS (sem comparavel nenhum) ou preenchidas TODAS JUNTAS. */
    check(
      'sqa_price_columns_null_together',
      sql`(${t.priceBaseCents} IS NULL AND ${t.priceScoreFactorBps} IS NULL AND ${t.priceExtrasFactorBps} IS NULL
           AND ${t.suggestedPriceIdealCents} IS NULL AND ${t.suggestedPriceMinCents} IS NULL AND ${t.suggestedPriceMaxCents} IS NULL)
       OR (${t.priceBaseCents} IS NOT NULL AND ${t.priceScoreFactorBps} IS NOT NULL AND ${t.priceExtrasFactorBps} IS NOT NULL
           AND ${t.suggestedPriceIdealCents} IS NOT NULL AND ${t.suggestedPriceMinCents} IS NOT NULL AND ${t.suggestedPriceMaxCents} IS NOT NULL)`,
    ),
    check('sqa_price_base_positive', sql`${t.priceBaseCents} IS NULL OR ${t.priceBaseCents} > 0`),
    check('sqa_price_ideal_positive', sql`${t.suggestedPriceIdealCents} IS NULL OR ${t.suggestedPriceIdealCents} > 0`),
    /** Tabela fixa por classificacao: economico 0,70x .. luxo 1,50x. */
    check('sqa_price_score_factor_valid', sql`${t.priceScoreFactorBps} IS NULL OR ${t.priceScoreFactorBps} IN (7000, 10000, 12000, 15000)`),
    /** price_score_factor_bps tem que bater com a tabela por classificacao — nunca solto do score real desta linha. */
    check(
      'sqa_price_score_factor_matches_classification',
      sql`${t.priceScoreFactorBps} IS NULL OR ${t.priceScoreFactorBps} = CASE ${t.classification}
            WHEN 'economico' THEN 7000 WHEN 'medio' THEN 10000 WHEN 'alto_padrao' THEN 12000 WHEN 'luxo' THEN 15000 END`,
    ),
    /** Funcao linear de extras_score (0..10) -> 1,00x..1,15x, refeita pelo banco a partir da coluna ja gravada. */
    check(
      'sqa_price_extras_factor_matches_score',
      sql`${t.priceExtrasFactorBps} IS NULL OR ${t.priceExtrasFactorBps} = 10000 + ROUND(${t.extrasScore} * 150)`,
    ),

    /** ideal = round(round(base x fator_score / 10000) x fator_extras / 10000) — o banco refaz a conta. */
    check(
      'sqa_price_ideal_matches_formula',
      sql`${t.suggestedPriceIdealCents} IS NULL OR ${t.suggestedPriceIdealCents} = ROUND(
            ROUND(${t.priceBaseCents}::numeric * ${t.priceScoreFactorBps} / 10000) * ${t.priceExtrasFactorBps} / 10000
          )`,
    ),
    /** min/max = ideal +-10%, mesma conta refeita pelo banco. */
    check('sqa_price_min_matches_formula', sql`${t.suggestedPriceMinCents} IS NULL OR ${t.suggestedPriceMinCents} = ROUND(${t.suggestedPriceIdealCents}::numeric * 9000 / 10000)`),
    check('sqa_price_max_matches_formula', sql`${t.suggestedPriceMaxCents} IS NULL OR ${t.suggestedPriceMaxCents} = ROUND(${t.suggestedPriceIdealCents}::numeric * 11000 / 10000)`),

    /** O alerta de mercado, quando presente, bate com a comparacao real ideal vs. base. */
    check(
      'sqa_price_market_warning_matches',
      sql`${t.priceMarketWarning} IS NULL OR (
            ${t.suggestedPriceIdealCents} IS NOT NULL AND (
              (${t.priceMarketWarning} = 'acima_da_media'  AND ${t.suggestedPriceIdealCents}::bigint * 10000 > ${t.priceBaseCents}::bigint * 15000)
              OR
              (${t.priceMarketWarning} = 'abaixo_da_media' AND ${t.suggestedPriceIdealCents}::bigint * 10000 < ${t.priceBaseCents}::bigint * 7000)
            )
          )`,
    ),
  ],
);

export const spaceQualityAssessmentsRelations = relations(spaceQualityAssessments, ({ one }) => ({
  space: one(spaces, { fields: [spaceQualityAssessments.spaceId], references: [spaces.id] }),
  requester: one(profiles, { fields: [spaceQualityAssessments.requestedBy], references: [profiles.id] }),
}));

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
import { spaceConservationState, spaceQualityClassification } from './enums';
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
  ],
);

export const spaceQualityAssessmentsRelations = relations(spaceQualityAssessments, ({ one }) => ({
  space: one(spaces, { fields: [spaceQualityAssessments.spaceId], references: [spaces.id] }),
  requester: one(profiles, { fields: [spaceQualityAssessments.requestedBy], references: [profiles.id] }),
}));

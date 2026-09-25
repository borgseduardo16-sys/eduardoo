CREATE TYPE "public"."space_price_market_warning" AS ENUM('acima_da_media', 'abaixo_da_media');--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_comparables_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_low_confidence" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_base_cents" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_score_factor_bps" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_extras_factor_bps" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_ideal_cents" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_min_cents" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_max_cents" integer;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD COLUMN "price_market_warning" "space_price_market_warning";--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_low_confidence_matches_count" CHECK ("space_quality_assessments"."price_low_confidence" = ("space_quality_assessments"."price_comparables_count" < 5));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_comparables_count_range" CHECK ("space_quality_assessments"."price_comparables_count" BETWEEN 0 AND 200);--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_columns_null_together" CHECK (("space_quality_assessments"."price_base_cents" IS NULL AND "space_quality_assessments"."price_score_factor_bps" IS NULL AND "space_quality_assessments"."price_extras_factor_bps" IS NULL
           AND "space_quality_assessments"."suggested_price_ideal_cents" IS NULL AND "space_quality_assessments"."suggested_price_min_cents" IS NULL AND "space_quality_assessments"."suggested_price_max_cents" IS NULL)
       OR ("space_quality_assessments"."price_base_cents" IS NOT NULL AND "space_quality_assessments"."price_score_factor_bps" IS NOT NULL AND "space_quality_assessments"."price_extras_factor_bps" IS NOT NULL
           AND "space_quality_assessments"."suggested_price_ideal_cents" IS NOT NULL AND "space_quality_assessments"."suggested_price_min_cents" IS NOT NULL AND "space_quality_assessments"."suggested_price_max_cents" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_base_positive" CHECK ("space_quality_assessments"."price_base_cents" IS NULL OR "space_quality_assessments"."price_base_cents" > 0);--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_ideal_positive" CHECK ("space_quality_assessments"."suggested_price_ideal_cents" IS NULL OR "space_quality_assessments"."suggested_price_ideal_cents" > 0);--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_score_factor_valid" CHECK ("space_quality_assessments"."price_score_factor_bps" IS NULL OR "space_quality_assessments"."price_score_factor_bps" IN (7000, 10000, 12000, 15000));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_extras_factor_range" CHECK ("space_quality_assessments"."price_extras_factor_bps" IS NULL OR "space_quality_assessments"."price_extras_factor_bps" BETWEEN 10000 AND 11500);--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_ideal_matches_formula" CHECK ("space_quality_assessments"."suggested_price_ideal_cents" IS NULL OR "space_quality_assessments"."suggested_price_ideal_cents" = ROUND(
            ROUND("space_quality_assessments"."price_base_cents"::numeric * "space_quality_assessments"."price_score_factor_bps" / 10000) * "space_quality_assessments"."price_extras_factor_bps" / 10000
          ));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_min_matches_formula" CHECK ("space_quality_assessments"."suggested_price_min_cents" IS NULL OR "space_quality_assessments"."suggested_price_min_cents" = ROUND("space_quality_assessments"."suggested_price_ideal_cents"::numeric * 9000 / 10000));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_max_matches_formula" CHECK ("space_quality_assessments"."suggested_price_max_cents" IS NULL OR "space_quality_assessments"."suggested_price_max_cents" = ROUND("space_quality_assessments"."suggested_price_ideal_cents"::numeric * 11000 / 10000));--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_market_warning_matches" CHECK ("space_quality_assessments"."price_market_warning" IS NULL OR (
            "space_quality_assessments"."suggested_price_ideal_cents" IS NOT NULL AND (
              ("space_quality_assessments"."price_market_warning" = 'acima_da_media'  AND "space_quality_assessments"."suggested_price_ideal_cents"::bigint * 10000 > "space_quality_assessments"."price_base_cents"::bigint * 15000)
              OR
              ("space_quality_assessments"."price_market_warning" = 'abaixo_da_media' AND "space_quality_assessments"."suggested_price_ideal_cents"::bigint * 10000 < "space_quality_assessments"."price_base_cents"::bigint * 7000)
            )
          ));
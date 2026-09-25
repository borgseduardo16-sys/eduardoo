CREATE TYPE "public"."space_conservation_state" AS ENUM('ruim', 'regular', 'bom', 'muito_bom', 'excelente');--> statement-breakpoint
CREATE TYPE "public"."space_quality_classification" AS ENUM('economico', 'medio', 'alto_padrao', 'luxo');--> statement-breakpoint
CREATE TABLE "space_quality_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"conservation_state" "space_conservation_state" NOT NULL,
	"age_years" integer NOT NULL,
	"renovated_recently" boolean DEFAULT false NOT NULL,
	"photos_score" numeric(4, 2) NOT NULL,
	"location_score" numeric(4, 2) NOT NULL,
	"structure_score" numeric(4, 2) NOT NULL,
	"extras_score" numeric(4, 2) NOT NULL,
	"base_score" numeric(4, 2) NOT NULL,
	"conservation_factor" numeric(3, 2) NOT NULL,
	"age_factor" numeric(3, 2) NOT NULL,
	"renovation_factor" numeric(3, 2) NOT NULL,
	"final_score" numeric(4, 2) NOT NULL,
	"classification" "space_quality_classification" NOT NULL,
	"ai_conservation_state" "space_conservation_state" NOT NULL,
	"ai_findings" jsonb NOT NULL,
	"user_ai_divergent" boolean DEFAULT false NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sqa_photos_score_range" CHECK ("space_quality_assessments"."photos_score" BETWEEN 0 AND 10),
	CONSTRAINT "sqa_location_score_range" CHECK ("space_quality_assessments"."location_score" BETWEEN 0 AND 10),
	CONSTRAINT "sqa_structure_score_range" CHECK ("space_quality_assessments"."structure_score" BETWEEN 0 AND 10),
	CONSTRAINT "sqa_extras_score_range" CHECK ("space_quality_assessments"."extras_score" BETWEEN 0 AND 10),
	CONSTRAINT "sqa_final_score_range" CHECK ("space_quality_assessments"."final_score" BETWEEN 0 AND 10),
	CONSTRAINT "sqa_age_years_range" CHECK ("space_quality_assessments"."age_years" BETWEEN 0 AND 200),
	CONSTRAINT "sqa_conservation_factor_valid" CHECK ("space_quality_assessments"."conservation_factor" IN (0.80, 0.90, 1.00, 1.05, 1.10)),
	CONSTRAINT "sqa_age_factor_valid" CHECK ("space_quality_assessments"."age_factor" IN (0.80, 0.90, 1.00, 1.10)),
	CONSTRAINT "sqa_renovation_factor_valid" CHECK ("space_quality_assessments"."renovation_factor" IN (1.00, 1.10)),
	CONSTRAINT "sqa_base_score_matches_components" CHECK ("space_quality_assessments"."base_score" = ROUND("space_quality_assessments"."photos_score" * 0.45 + "space_quality_assessments"."location_score" * 0.25 + "space_quality_assessments"."structure_score" * 0.15 + "space_quality_assessments"."extras_score" * 0.15, 2)),
	CONSTRAINT "sqa_final_score_matches_formula" CHECK ("space_quality_assessments"."final_score" = LEAST(10, GREATEST(0, ROUND("space_quality_assessments"."base_score" * "space_quality_assessments"."conservation_factor" * "space_quality_assessments"."age_factor" * "space_quality_assessments"."renovation_factor", 2)))),
	CONSTRAINT "sqa_classification_matches_score" CHECK (("space_quality_assessments"."classification" = 'economico'   AND "space_quality_assessments"."final_score" >= 0 AND "space_quality_assessments"."final_score" < 4)
       OR ("space_quality_assessments"."classification" = 'medio'       AND "space_quality_assessments"."final_score" >= 4 AND "space_quality_assessments"."final_score" < 7)
       OR ("space_quality_assessments"."classification" = 'alto_padrao' AND "space_quality_assessments"."final_score" >= 7 AND "space_quality_assessments"."final_score" < 9)
       OR ("space_quality_assessments"."classification" = 'luxo'        AND "space_quality_assessments"."final_score" >= 9 AND "space_quality_assessments"."final_score" <= 10))
);
--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "space_quality_assessments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "space_quality_assessments_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_quality_assessments_space_idx" ON "space_quality_assessments" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "space_quality_assessments_requested_by_idx" ON "space_quality_assessments" USING btree ("requested_by");
CREATE TYPE "public"."report_severity" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('space', 'user', 'message');--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_distinct" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id"),
	CONSTRAINT "user_blocks_reason_max" CHECK ("user_blocks"."reason" IS NULL OR length("user_blocks"."reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."report_reason";--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('anuncio_falso', 'endereco_incorreto', 'preco_enganoso', 'espaco_inexistente', 'fraude', 'golpe_pagamento', 'pagamento_fora_plataforma', 'assedio', 'discurso_odio', 'ameaca', 'identidade_falsa', 'conteudo_inadequado', 'spam', 'atividade_proibida', 'nao_compareceu', 'dano_ao_espaco', 'uso_indevido_do_espaco', 'outro');--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE "public"."report_reason" USING "reason"::"public"."report_reason";--> statement-breakpoint
DROP INDEX "reports_status_idx";--> statement-breakpoint
DROP INDEX "reports_one_open_per_reporter";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "upheld_report_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "flag_reason" text;--> statement-breakpoint
-- Adicionado com DEFAULT e depois sem: assim a migracao tambem funciona
-- em um banco que ja tenha denuncias gravadas (todas elas eram de anuncio).
ALTER TABLE "reports" ADD COLUMN "target_type" "report_target" NOT NULL DEFAULT 'space';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "target_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "target_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "severity" "report_severity" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "evidence_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "upheld" boolean;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_flagged_idx" ON "messages" USING btree ("flagged_at") WHERE flagged_at IS NOT NULL AND hidden_at IS NULL;--> statement-breakpoint
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "reports_message_idx" ON "reports" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","severity","created_at") WHERE status IN ('open','reviewing');--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_target" ON "reports" USING btree ("reporter_id","target_type",COALESCE(space_id, target_user_id, message_id)) WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches_type" CHECK (("reports"."target_type" = 'space'   AND "reports"."space_id" IS NOT NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'user'    AND "reports"."target_user_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'message' AND "reports"."message_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_no_self_report" CHECK ("reports"."target_user_id" IS NULL OR "reports"."reporter_id" IS NULL OR "reports"."target_user_id" <> "reports"."reporter_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_details_max" CHECK ("reports"."details" IS NULL OR length("reports"."details") <= 2000);
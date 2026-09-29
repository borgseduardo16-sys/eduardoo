-- ============================================================================
-- MyPlace — atualizacao do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Cada migracao so e aplicada se ainda nao
-- estiver registrada em drizzle.__drizzle_migrations.
--
-- Este arquivo tem SO as migracoes 10 em diante. Ele supoe que as
-- anteriores ja foram aplicadas — se este for um projeto novo, use
-- supabase/setup.sql, que traz o schema completo.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 15 migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

-- Tabela de controle. Precisa existir antes das checagens abaixo.
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);


-- ----------------------------------------------------------------------------
-- Migracao 10: 0010_status_expirado_reserva  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_10$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ca69412b4b6e0d2da1074f7ba1af89ae9b2c735c936069f62245b1092a5cead9'
  ) THEN
    RAISE NOTICE 'Migracao 10 (0010_status_expirado_reserva) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_10_0$ALTER TYPE "public"."booking_status" ADD VALUE 'expired' BEFORE 'awaiting_payment';$mp_10_0$;

    EXECUTE $mp_10_1$-- Prazo para o proprietario responder uma solicitacao antes dela expirar
-- sozinha. Nao existia settings key para isso ate a Parte 4 (fluxo real de
-- solicitacao/reserva) precisar de um estado "expirada" de verdade no banco.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('booking.request_expiry_days', '7'::jsonb,
   'Dias que uma solicitacao fica pendente antes de expirar sozinha, sem resposta do proprietario.', true)
ON CONFLICT (key) DO NOTHING;$mp_10_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ca69412b4b6e0d2da1074f7ba1af89ae9b2c735c936069f62245b1092a5cead9', 1789723772646);

    RAISE NOTICE 'Migracao 10 (0010_status_expirado_reserva) aplicada.';
  END IF;
END
$mp_bloco_10$;


-- ----------------------------------------------------------------------------
-- Migracao 11: 0011_suspensao_automatica  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_11$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '59c07e14fe556fd7ab14043106a9e3b052425dd934e608ed6df94156935c7fd7'
  ) THEN
    RAISE NOTICE 'Migracao 11 (0011_suspensao_automatica) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_11_0$-- ============================================================================
-- MyPlace — suspensao automatica por reincidencia (Fase 11)
--
-- `refresh_upheld_report_count` ja mantinha o contador de denuncias
-- procedentes. Agora, ao recalcular o contador, a mesma trigger tambem aplica
-- o limite de `safety.auto_suspend_upheld_threshold` (padrao 5): ao
-- atingi-lo, a conta vira 'suspended' com um motivo padrao.
--
-- So ESCALA: nunca reativa sozinha. Se um moderador corrigir uma denuncia
-- (upheld -> false) e o contador cair de novo abaixo do limite, a conta
-- continua suspensa ate um admin decidir reativar pelo painel — reativacao e
-- decisao humana, nao efeito colateral de um UPDATE.
--
-- So suspende quem esta 'active': nao mexe em quem ja esta banido/suspenso
-- por outro motivo nem ressuscita conta apagada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid;
  novo_total integer;
  limite integer;
BEGIN
  -- Para denuncia de anuncio ou mensagem, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO novo_total
  FROM public.reports r
  WHERE r.upheld = true
    AND COALESCE(
          r.target_user_id,
          (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
          (SELECT sender_id FROM public.messages WHERE id = r.message_id)
        ) = alvo;

  UPDATE public.profiles SET upheld_report_count = novo_total WHERE id = alvo;

  SELECT (value #>> '{}')::int INTO limite
  FROM public.platform_settings WHERE key = 'safety.auto_suspend_upheld_threshold';
  limite := COALESCE(limite, 5);

  IF novo_total >= limite THEN
    UPDATE public.profiles
    SET status = 'suspended',
        status_reason = 'Suspensão automática: ' || novo_total || ' denúncias procedentes.'
    WHERE id = alvo AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;$mp_11_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('59c07e14fe556fd7ab14043106a9e3b052425dd934e608ed6df94156935c7fd7', 1789834839015);

    RAISE NOTICE 'Migracao 11 (0011_suspensao_automatica) aplicada.';
  END IF;
END
$mp_bloco_11$;


-- ----------------------------------------------------------------------------
-- Migracao 12: 0012_absurd_banshee  (20 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_12$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'c215f21b3e8b05dfc10f576416c59e0f97dc64f2971336b903b4b1e54a57f32e'
  ) THEN
    RAISE NOTICE 'Migracao 12 (0012_absurd_banshee) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_12_0$CREATE TYPE "public"."premium_membership_source" AS ENUM('admin_grant', 'subscription');$mp_12_0$;

    EXECUTE $mp_12_1$CREATE TYPE "public"."premium_membership_status" AS ENUM('active', 'cancelled');$mp_12_1$;

    EXECUTE $mp_12_2$CREATE TYPE "public"."promotion_source" AS ENUM('premium_benefit', 'purchase');$mp_12_2$;

    EXECUTE $mp_12_3$CREATE TYPE "public"."promotion_status" AS ENUM('scheduled', 'active', 'expired', 'cancelled');$mp_12_3$;

    EXECUTE $mp_12_4$CREATE TYPE "public"."promotion_type" AS ENUM('destaque', 'turbo');$mp_12_4$;

    EXECUTE $mp_12_5$CREATE TABLE "premium_memberships" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" "premium_membership_status" DEFAULT 'active' NOT NULL,
	"source" "premium_membership_source" DEFAULT 'admin_grant' NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_memberships_cancelled_has_timestamp" CHECK (("premium_memberships"."status" <> 'cancelled') OR ("premium_memberships"."cancelled_at" IS NOT NULL))
);$mp_12_5$;

    EXECUTE $mp_12_6$CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "promotion_type" NOT NULL,
	"status" "promotion_status" DEFAULT 'active' NOT NULL,
	"source" "promotion_source" NOT NULL,
	"transaction_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_expires_after_started" CHECK ("promotions"."expires_at" > "promotions"."started_at"),
	CONSTRAINT "promotions_cancelled_has_timestamp" CHECK (("promotions"."status" <> 'cancelled') OR ("promotions"."cancelled_at" IS NOT NULL))
);$mp_12_6$;

    EXECUTE $mp_12_7$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_12_7$;

    EXECUTE $mp_12_8$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_12_8$;

    EXECUTE $mp_12_9$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_12_9$;

    EXECUTE $mp_12_10$ALTER TABLE "promotions" ADD CONSTRAINT "promotions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_12_10$;

    EXECUTE $mp_12_11$ALTER TABLE "promotions" ADD CONSTRAINT "promotions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_12_11$;

    EXECUTE $mp_12_12$ALTER TABLE "promotions" ADD CONSTRAINT "promotions_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_12_12$;

    EXECUTE $mp_12_13$CREATE INDEX "premium_memberships_status_idx" ON "premium_memberships" USING btree ("status");$mp_12_13$;

    EXECUTE $mp_12_14$CREATE INDEX "promotions_space_idx" ON "promotions" USING btree ("space_id");$mp_12_14$;

    EXECUTE $mp_12_15$CREATE INDEX "promotions_owner_period_idx" ON "promotions" USING btree ("owner_id","type","source","created_at");$mp_12_15$;

    EXECUTE $mp_12_16$CREATE INDEX "promotions_status_expires_idx" ON "promotions" USING btree ("status","expires_at");$mp_12_16$;

    EXECUTE $mp_12_17$CREATE UNIQUE INDEX "promotions_one_active_per_space" ON "promotions" USING btree ("space_id") WHERE status IN ('scheduled','active');$mp_12_17$;

    EXECUTE $mp_12_18$-- Tabela nasceu depois do loop generico de RLS da migracao 0001 (que so
-- alcancou as tabelas que ja existiam naquela hora) — precisa ligar aqui.
-- Sem nenhuma policy de proposito: mesma categoria de bookings/payments,
-- so o servidor (conexao privilegiada) le. `ALTER DEFAULT PRIVILEGES` da
-- migracao 0001 ja revoga o acesso de anon/authenticated por padrao em
-- tabela nova; isto fecha a mesma porta pelo lado do RLS tambem.
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;$mp_12_18$;

    EXECUTE $mp_12_19$ALTER TABLE "premium_memberships" ENABLE ROW LEVEL SECURITY;$mp_12_19$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('c215f21b3e8b05dfc10f576416c59e0f97dc64f2971336b903b4b1e54a57f32e', 1790256376220);

    RAISE NOTICE 'Migracao 12 (0012_absurd_banshee) aplicada.';
  END IF;
END
$mp_bloco_12$;


-- ----------------------------------------------------------------------------
-- Migracao 13: 0013_old_expediter  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_13$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '2935589abe7547b5e359929cfcad2f90eb457af62e6e1a750120dc726513aad3'
  ) THEN
    RAISE NOTICE 'Migracao 13 (0013_old_expediter) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_13_0$ALTER TABLE "favorites" ADD COLUMN "price_cents_at_favorite" integer;$mp_13_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('2935589abe7547b5e359929cfcad2f90eb457af62e6e1a750120dc726513aad3', 1790258624811);

    RAISE NOTICE 'Migracao 13 (0013_old_expediter) aplicada.';
  END IF;
END
$mp_bloco_13$;


-- ----------------------------------------------------------------------------
-- Migracao 14: 0014_hot_blink  (9 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_14$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '8a5381f785555e180b027ffb627769aaab1f5670f9a7b401f3f3c6fec4cda680'
  ) THEN
    RAISE NOTICE 'Migracao 14 (0014_hot_blink) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_14_0$CREATE TABLE "promotion_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "promotion_type" NOT NULL,
	"duration_hours" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"invoice_url" text,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"provider_payload" jsonb,
	"promotion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_purchases_price_positive" CHECK ("promotion_purchases"."price_cents" > 0),
	CONSTRAINT "promotion_purchases_duration_positive" CHECK ("promotion_purchases"."duration_hours" > 0)
);$mp_14_0$;

    EXECUTE $mp_14_1$ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_14_1$;

    EXECUTE $mp_14_2$ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_14_2$;

    EXECUTE $mp_14_3$ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;$mp_14_3$;

    EXECUTE $mp_14_4$CREATE UNIQUE INDEX "promotion_purchases_provider_id_key" ON "promotion_purchases" USING btree ("provider","provider_payment_id");$mp_14_4$;

    EXECUTE $mp_14_5$CREATE INDEX "promotion_purchases_space_idx" ON "promotion_purchases" USING btree ("space_id");$mp_14_5$;

    EXECUTE $mp_14_6$CREATE INDEX "promotion_purchases_owner_idx" ON "promotion_purchases" USING btree ("owner_id","created_at");$mp_14_6$;

    EXECUTE $mp_14_7$CREATE INDEX "promotion_purchases_status_idx" ON "promotion_purchases" USING btree ("status");$mp_14_7$;

    EXECUTE $mp_14_8$-- RLS: a migracao 0001 so ligou RLS nas tabelas que ja existiam naquele
-- momento (loop sobre pg_tables na hora de rodar) — toda tabela nova precisa
-- ligar a propria, mesmo padrao usado em 0012 (promotions/premium_memberships).
ALTER TABLE "promotion_purchases" ENABLE ROW LEVEL SECURITY;$mp_14_8$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('8a5381f785555e180b027ffb627769aaab1f5670f9a7b401f3f3c6fec4cda680', 1790283600163);

    RAISE NOTICE 'Migracao 14 (0014_hot_blink) aplicada.';
  END IF;
END
$mp_bloco_14$;


-- ----------------------------------------------------------------------------
-- Migracao 15: 0015_flashy_network  (7 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_15$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '17b446a2e2c1105ab17f0d67e7c6ab9146ff167063e4f4ddd38837e655e24139'
  ) THEN
    RAISE NOTICE 'Migracao 15 (0015_flashy_network) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_15_0$CREATE TYPE "public"."space_conservation_state" AS ENUM('ruim', 'regular', 'bom', 'muito_bom', 'excelente');$mp_15_0$;

    EXECUTE $mp_15_1$CREATE TYPE "public"."space_quality_classification" AS ENUM('economico', 'medio', 'alto_padrao', 'luxo');$mp_15_1$;

    EXECUTE $mp_15_2$CREATE TABLE "space_quality_assessments" (
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
);$mp_15_2$;

    EXECUTE $mp_15_3$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "space_quality_assessments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_15_3$;

    EXECUTE $mp_15_4$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "space_quality_assessments_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_15_4$;

    EXECUTE $mp_15_5$CREATE INDEX "space_quality_assessments_space_idx" ON "space_quality_assessments" USING btree ("space_id","created_at");$mp_15_5$;

    EXECUTE $mp_15_6$CREATE INDEX "space_quality_assessments_requested_by_idx" ON "space_quality_assessments" USING btree ("requested_by");$mp_15_6$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('17b446a2e2c1105ab17f0d67e7c6ab9146ff167063e4f4ddd38837e655e24139', 1790341759006);

    RAISE NOTICE 'Migracao 15 (0015_flashy_network) aplicada.';
  END IF;
END
$mp_bloco_15$;


-- ----------------------------------------------------------------------------
-- Migracao 16: 0016_next_smiling_tiger  (21 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_16$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '411fbb35bc7348b1d2f511226246d40e059726afc8f2aea019a63324790b4645'
  ) THEN
    RAISE NOTICE 'Migracao 16 (0016_next_smiling_tiger) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_16_0$CREATE TYPE "public"."space_price_market_warning" AS ENUM('acima_da_media', 'abaixo_da_media');$mp_16_0$;

    EXECUTE $mp_16_1$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_comparables_count" integer DEFAULT 0 NOT NULL;$mp_16_1$;

    EXECUTE $mp_16_2$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_low_confidence" boolean DEFAULT true NOT NULL;$mp_16_2$;

    EXECUTE $mp_16_3$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_base_cents" integer;$mp_16_3$;

    EXECUTE $mp_16_4$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_score_factor_bps" integer;$mp_16_4$;

    EXECUTE $mp_16_5$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_extras_factor_bps" integer;$mp_16_5$;

    EXECUTE $mp_16_6$ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_ideal_cents" integer;$mp_16_6$;

    EXECUTE $mp_16_7$ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_min_cents" integer;$mp_16_7$;

    EXECUTE $mp_16_8$ALTER TABLE "space_quality_assessments" ADD COLUMN "suggested_price_max_cents" integer;$mp_16_8$;

    EXECUTE $mp_16_9$ALTER TABLE "space_quality_assessments" ADD COLUMN "price_market_warning" "space_price_market_warning";$mp_16_9$;

    EXECUTE $mp_16_10$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_low_confidence_matches_count" CHECK ("space_quality_assessments"."price_low_confidence" = ("space_quality_assessments"."price_comparables_count" < 5));$mp_16_10$;

    EXECUTE $mp_16_11$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_comparables_count_range" CHECK ("space_quality_assessments"."price_comparables_count" BETWEEN 0 AND 200);$mp_16_11$;

    EXECUTE $mp_16_12$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_columns_null_together" CHECK (("space_quality_assessments"."price_base_cents" IS NULL AND "space_quality_assessments"."price_score_factor_bps" IS NULL AND "space_quality_assessments"."price_extras_factor_bps" IS NULL
           AND "space_quality_assessments"."suggested_price_ideal_cents" IS NULL AND "space_quality_assessments"."suggested_price_min_cents" IS NULL AND "space_quality_assessments"."suggested_price_max_cents" IS NULL)
       OR ("space_quality_assessments"."price_base_cents" IS NOT NULL AND "space_quality_assessments"."price_score_factor_bps" IS NOT NULL AND "space_quality_assessments"."price_extras_factor_bps" IS NOT NULL
           AND "space_quality_assessments"."suggested_price_ideal_cents" IS NOT NULL AND "space_quality_assessments"."suggested_price_min_cents" IS NOT NULL AND "space_quality_assessments"."suggested_price_max_cents" IS NOT NULL));$mp_16_12$;

    EXECUTE $mp_16_13$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_base_positive" CHECK ("space_quality_assessments"."price_base_cents" IS NULL OR "space_quality_assessments"."price_base_cents" > 0);$mp_16_13$;

    EXECUTE $mp_16_14$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_ideal_positive" CHECK ("space_quality_assessments"."suggested_price_ideal_cents" IS NULL OR "space_quality_assessments"."suggested_price_ideal_cents" > 0);$mp_16_14$;

    EXECUTE $mp_16_15$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_score_factor_valid" CHECK ("space_quality_assessments"."price_score_factor_bps" IS NULL OR "space_quality_assessments"."price_score_factor_bps" IN (7000, 10000, 12000, 15000));$mp_16_15$;

    EXECUTE $mp_16_16$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_extras_factor_range" CHECK ("space_quality_assessments"."price_extras_factor_bps" IS NULL OR "space_quality_assessments"."price_extras_factor_bps" BETWEEN 10000 AND 11500);$mp_16_16$;

    EXECUTE $mp_16_17$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_ideal_matches_formula" CHECK ("space_quality_assessments"."suggested_price_ideal_cents" IS NULL OR "space_quality_assessments"."suggested_price_ideal_cents" = ROUND(
            ROUND("space_quality_assessments"."price_base_cents"::numeric * "space_quality_assessments"."price_score_factor_bps" / 10000) * "space_quality_assessments"."price_extras_factor_bps" / 10000
          ));$mp_16_17$;

    EXECUTE $mp_16_18$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_min_matches_formula" CHECK ("space_quality_assessments"."suggested_price_min_cents" IS NULL OR "space_quality_assessments"."suggested_price_min_cents" = ROUND("space_quality_assessments"."suggested_price_ideal_cents"::numeric * 9000 / 10000));$mp_16_18$;

    EXECUTE $mp_16_19$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_max_matches_formula" CHECK ("space_quality_assessments"."suggested_price_max_cents" IS NULL OR "space_quality_assessments"."suggested_price_max_cents" = ROUND("space_quality_assessments"."suggested_price_ideal_cents"::numeric * 11000 / 10000));$mp_16_19$;

    EXECUTE $mp_16_20$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_market_warning_matches" CHECK ("space_quality_assessments"."price_market_warning" IS NULL OR (
            "space_quality_assessments"."suggested_price_ideal_cents" IS NOT NULL AND (
              ("space_quality_assessments"."price_market_warning" = 'acima_da_media'  AND "space_quality_assessments"."suggested_price_ideal_cents"::bigint * 10000 > "space_quality_assessments"."price_base_cents"::bigint * 15000)
              OR
              ("space_quality_assessments"."price_market_warning" = 'abaixo_da_media' AND "space_quality_assessments"."suggested_price_ideal_cents"::bigint * 10000 < "space_quality_assessments"."price_base_cents"::bigint * 7000)
            )
          ));$mp_16_20$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('411fbb35bc7348b1d2f511226246d40e059726afc8f2aea019a63324790b4645', 1790355254318);

    RAISE NOTICE 'Migracao 16 (0016_next_smiling_tiger) aplicada.';
  END IF;
END
$mp_bloco_16$;


-- ----------------------------------------------------------------------------
-- Migracao 17: 0017_neat_the_leader  (3 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_17$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '47db6940fce933861a02db577c6213e2841b903f2f43c986d883a25f7b8d4741'
  ) THEN
    RAISE NOTICE 'Migracao 17 (0017_neat_the_leader) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_17_0$ALTER TABLE "space_quality_assessments" DROP CONSTRAINT "sqa_price_extras_factor_range";$mp_17_0$;

    EXECUTE $mp_17_1$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_score_factor_matches_classification" CHECK ("space_quality_assessments"."price_score_factor_bps" IS NULL OR "space_quality_assessments"."price_score_factor_bps" = CASE "space_quality_assessments"."classification"
            WHEN 'economico' THEN 7000 WHEN 'medio' THEN 10000 WHEN 'alto_padrao' THEN 12000 WHEN 'luxo' THEN 15000 END);$mp_17_1$;

    EXECUTE $mp_17_2$ALTER TABLE "space_quality_assessments" ADD CONSTRAINT "sqa_price_extras_factor_matches_score" CHECK ("space_quality_assessments"."price_extras_factor_bps" IS NULL OR "space_quality_assessments"."price_extras_factor_bps" = 10000 + ROUND("space_quality_assessments"."extras_score" * 150));$mp_17_2$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('47db6940fce933861a02db577c6213e2841b903f2f43c986d883a25f7b8d4741', 1790355319260);

    RAISE NOTICE 'Migracao 17 (0017_neat_the_leader) aplicada.';
  END IF;
END
$mp_bloco_17$;


-- ----------------------------------------------------------------------------
-- Migracao 18: 0018_misty_deathstrike  (5 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_18$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '2e39266df6b3e75984c7a8e0f7b2957a257addb01a4836e45186f25792c17962'
  ) THEN
    RAISE NOTICE 'Migracao 18 (0018_misty_deathstrike) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_18_0$ALTER TYPE "public"."notification_type" ADD VALUE 'favorite_price_drop';$mp_18_0$;

    EXECUTE $mp_18_1$ALTER TYPE "public"."notification_type" ADD VALUE 'favorite_unavailable';$mp_18_1$;

    EXECUTE $mp_18_2$ALTER TYPE "public"."notification_type" ADD VALUE 'favorite_available_again';$mp_18_2$;

    EXECUTE $mp_18_3$ALTER TYPE "public"."notification_type" ADD VALUE 'new_compatible_space';$mp_18_3$;

    EXECUTE $mp_18_4$ALTER TYPE "public"."notification_type" ADD VALUE 'owner_activity_digest';$mp_18_4$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('2e39266df6b3e75984c7a8e0f7b2957a257addb01a4836e45186f25792c17962', 1790375730709);

    RAISE NOTICE 'Migracao 18 (0018_misty_deathstrike) aplicada.';
  END IF;
END
$mp_bloco_18$;


-- ----------------------------------------------------------------------------
-- Migracao 19: 0019_silky_talkback  (4 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_19$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'd939d3489563e354676c9607d31111b762b473fd5d60b09043df6f722f13a22b'
  ) THEN
    RAISE NOTICE 'Migracao 19 (0019_silky_talkback) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_19_0$CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_19_0$;

    EXECUTE $mp_19_1$ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_19_1$;

    EXECUTE $mp_19_2$CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");$mp_19_2$;

    EXECUTE $mp_19_3$CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");$mp_19_3$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('d939d3489563e354676c9607d31111b762b473fd5d60b09043df6f722f13a22b', 1790464243877);

    RAISE NOTICE 'Migracao 19 (0019_silky_talkback) aplicada.';
  END IF;
END
$mp_bloco_19$;


-- ----------------------------------------------------------------------------
-- Migracao 20: 0020_luxuriant_prima  (17 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_20$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'af49dc80e54ee802518fc2ffe35bdccf6dcf0ab34f9fd9d7fe2d1af4e0fdedf4'
  ) THEN
    RAISE NOTICE 'Migracao 20 (0020_luxuriant_prima) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_20_0$CREATE TYPE "public"."deposit_release_status" AS ENUM('held', 'released', 'forfeited', 'partially_forfeited');$mp_20_0$;

    EXECUTE $mp_20_1$ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_charged';$mp_20_1$;

    EXECUTE $mp_20_2$ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_released';$mp_20_2$;

    EXECUTE $mp_20_3$ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_forfeited_to_owner';$mp_20_3$;

    EXECUTE $mp_20_4$CREATE TABLE "booking_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"invoice_url" text,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"provider_payload" jsonb,
	"release_status" "deposit_release_status" DEFAULT 'held' NOT NULL,
	"released_cents" integer,
	"forfeited_cents" integer,
	"resolved_report_id" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_deposits_amount_positive" CHECK ("booking_deposits"."amount_cents" > 0),
	CONSTRAINT "booking_deposits_released_non_negative" CHECK ("booking_deposits"."released_cents" IS NULL OR "booking_deposits"."released_cents" >= 0),
	CONSTRAINT "booking_deposits_forfeited_non_negative" CHECK ("booking_deposits"."forfeited_cents" IS NULL OR "booking_deposits"."forfeited_cents" >= 0),
	CONSTRAINT "booking_deposits_release_amounts_consistent" CHECK (("booking_deposits"."release_status" = 'held' AND "booking_deposits"."released_cents" IS NULL AND "booking_deposits"."forfeited_cents" IS NULL)
          OR ("booking_deposits"."release_status" <> 'held' AND "booking_deposits"."released_cents" IS NOT NULL AND "booking_deposits"."forfeited_cents" IS NOT NULL
              AND "booking_deposits"."released_cents" + "booking_deposits"."forfeited_cents" = "booking_deposits"."amount_cents")),
	CONSTRAINT "booking_deposits_release_status_matches_split" CHECK ("booking_deposits"."release_status" NOT IN ('released','forfeited','partially_forfeited')
          OR (
            ("booking_deposits"."release_status" = 'released' AND "booking_deposits"."forfeited_cents" = 0)
            OR ("booking_deposits"."release_status" = 'forfeited' AND "booking_deposits"."released_cents" = 0)
            OR ("booking_deposits"."release_status" = 'partially_forfeited' AND "booking_deposits"."released_cents" > 0 AND "booking_deposits"."forfeited_cents" > 0)
          ))
);$mp_20_4$;

    EXECUTE $mp_20_5$ALTER TABLE "spaces" ADD COLUMN "deposit_enabled" boolean DEFAULT false NOT NULL;$mp_20_5$;

    EXECUTE $mp_20_6$ALTER TABLE "bookings" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;$mp_20_6$;

    EXECUTE $mp_20_7$ALTER TABLE "reports" ADD COLUMN "booking_id" uuid;$mp_20_7$;

    EXECUTE $mp_20_8$ALTER TABLE "booking_deposits" ADD CONSTRAINT "booking_deposits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_20_8$;

    EXECUTE $mp_20_9$ALTER TABLE "booking_deposits" ADD CONSTRAINT "booking_deposits_resolved_report_id_reports_id_fk" FOREIGN KEY ("resolved_report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;$mp_20_9$;

    EXECUTE $mp_20_10$CREATE UNIQUE INDEX "booking_deposits_booking_key" ON "booking_deposits" USING btree ("booking_id");$mp_20_10$;

    EXECUTE $mp_20_11$CREATE UNIQUE INDEX "booking_deposits_provider_id_key" ON "booking_deposits" USING btree ("provider","provider_payment_id");$mp_20_11$;

    EXECUTE $mp_20_12$CREATE INDEX "booking_deposits_status_idx" ON "booking_deposits" USING btree ("status");$mp_20_12$;

    EXECUTE $mp_20_13$CREATE INDEX "booking_deposits_release_status_idx" ON "booking_deposits" USING btree ("release_status");$mp_20_13$;

    EXECUTE $mp_20_14$ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;$mp_20_14$;

    EXECUTE $mp_20_15$CREATE INDEX "reports_booking_idx" ON "reports" USING btree ("booking_id");$mp_20_15$;

    EXECUTE $mp_20_16$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_non_negative" CHECK ("bookings"."deposit_cents" >= 0);$mp_20_16$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('af49dc80e54ee802518fc2ffe35bdccf6dcf0ab34f9fd9d7fe2d1af4e0fdedf4', 1790465210756);

    RAISE NOTICE 'Migracao 20 (0020_luxuriant_prima) aplicada.';
  END IF;
END
$mp_bloco_20$;


-- ----------------------------------------------------------------------------
-- Migracao 21: 0021_sleepy_brother_voodoo  (69 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_21$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '1638f2427a1494eb8b9d3bed55205895755270c880679a783f84c9788405ccee'
  ) THEN
    RAISE NOTICE 'Migracao 21 (0021_sleepy_brother_voodoo) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_21_0$-- ============================================================================
-- MyPlace — confianca, perfil, reputacao e verificacao (Fase 21)
--
-- O que este arquivo faz, em ordem:
--   1. Estruturas novas: nome de exibicao/bio/verificacoes no perfil,
--      verificacao de telefone, preferencias de notificacao, denuncia de
--      avaliacao e "quem recebeu" em cada avaliacao
--   2. Avaliacao: quem recebeu vem da reserva; nota e texto sao imutaveis;
--      apagar exige decisao explicita; media com UMA regra de arredondamento
--   3. Denuncia de avaliacao: evidencia e reincidencia cobrem o alvo novo
--   4. E-mail verificado: copia fiel de auth.users.email_confirmed_at
--   5. Telefone verificado: trocar o numero derruba a verificacao
--   6. RLS: fecha a leitura de telefone/CPF de terceiros pela API
--
-- Nota sobre enum: valores acrescentados com ALTER TYPE ... ADD VALUE nao
-- podem ser usados como literal na mesma transacao (o migrador do Drizzle
-- roda todas as migracoes pendentes numa transacao so). Por isso o CHECK
-- de denuncia compara `target_type::text` e as funcoes idem.
-- ============================================================================

CREATE TYPE "public"."identity_verification_status" AS ENUM('not_started', 'pending', 'verified', 'rejected', 'expired');$mp_21_0$;

    EXECUTE $mp_21_1$CREATE TYPE "public"."notification_category" AS ENUM('reservas', 'pagamentos', 'mensagens', 'avaliacoes', 'meus_espacos', 'recomendacoes', 'conta');$mp_21_1$;

    EXECUTE $mp_21_2$CREATE TYPE "public"."phone_verification_status" AS ENUM('pending', 'approved', 'failed', 'expired', 'cancelled');$mp_21_2$;

    EXECUTE $mp_21_3$ALTER TYPE "public"."notification_type" ADD VALUE 'review_available';$mp_21_3$;

    EXECUTE $mp_21_4$ALTER TYPE "public"."notification_type" ADD VALUE 'promotion_expiring';$mp_21_4$;

    EXECUTE $mp_21_5$ALTER TYPE "public"."notification_type" ADD VALUE 'premium_changed';$mp_21_5$;

    EXECUTE $mp_21_6$ALTER TYPE "public"."report_reason" ADD VALUE 'fotos_enganosas';$mp_21_6$;

    EXECUTE $mp_21_7$ALTER TYPE "public"."report_reason" ADD VALUE 'comportamento_suspeito';$mp_21_7$;

    EXECUTE $mp_21_8$ALTER TYPE "public"."report_reason" ADD VALUE 'informacao_falsa';$mp_21_8$;

    EXECUTE $mp_21_9$ALTER TYPE "public"."report_reason" ADD VALUE 'conteudo_ofensivo';$mp_21_9$;

    EXECUTE $mp_21_10$ALTER TYPE "public"."report_target" ADD VALUE 'review';$mp_21_10$;

    EXECUTE $mp_21_11$CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"status" "phone_verification_status" DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'twilio_verify' NOT NULL,
	"provider_sid" text,
	"check_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "phone_verifications_phone_e164" CHECK ("phone_verifications"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "phone_verifications_attempts_range" CHECK ("phone_verifications"."check_attempts" BETWEEN 0 AND 10),
	CONSTRAINT "phone_verifications_resolved_matches_status" CHECK (("phone_verifications"."status" = 'pending') = ("phone_verifications"."resolved_at" IS NULL))
);$mp_21_11$;

    EXECUTE $mp_21_12$CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_category_pk" PRIMARY KEY("user_id","category"),
	CONSTRAINT "notification_preferences_essential_locked" CHECK ("notification_preferences"."category" NOT IN ('reservas', 'pagamentos', 'conta') OR ("notification_preferences"."in_app" AND "notification_preferences"."push"))
);$mp_21_12$;

    EXECUTE $mp_21_13$ALTER TABLE "reports" DROP CONSTRAINT "reports_target_matches_type";$mp_21_13$;

    EXECUTE $mp_21_14$DROP INDEX "reports_one_open_per_target";$mp_21_14$;

    EXECUTE $mp_21_15$ALTER TABLE "profiles" ADD COLUMN "display_name" text;$mp_21_15$;

    EXECUTE $mp_21_16$ALTER TABLE "profiles" ADD COLUMN "public_name" text GENERATED ALWAYS AS (COALESCE(NULLIF(btrim("display_name"), ''), NULLIF(split_part(btrim(COALESCE("full_name", '')), ' ', 1), ''))) STORED;$mp_21_16$;

    EXECUTE $mp_21_17$ALTER TABLE "profiles" ADD COLUMN "bio" text;$mp_21_17$;

    EXECUTE $mp_21_18$ALTER TABLE "profiles" ADD COLUMN "email_verified_at" timestamp with time zone;$mp_21_18$;

    EXECUTE $mp_21_19$ALTER TABLE "profiles" ADD COLUMN "identity_verification_status" "identity_verification_status" DEFAULT 'not_started' NOT NULL;$mp_21_19$;

    EXECUTE $mp_21_20$ALTER TABLE "reports" ADD COLUMN "review_id" uuid;$mp_21_20$;

    EXECUTE $mp_21_21$-- `reviewed_user_id` nasce nulo, e preenchido a partir da propria reserva e
-- so entao vira NOT NULL — ja ha avaliacoes gravadas. As triggers ficam
-- desligadas so durante este UPDATE: ele nao mexe em nota nem texto, entao
-- nao ha media a recalcular nem `updated_at` a alterar.
ALTER TABLE "reviews" ADD COLUMN "reviewed_user_id" uuid;$mp_21_21$;

    EXECUTE $mp_21_22$ALTER TABLE "reviews" DISABLE TRIGGER USER;$mp_21_22$;

    EXECUTE $mp_21_23$UPDATE "reviews" r
SET "reviewed_user_id" = CASE WHEN r."kind" = 'renter_to_space' THEN b."owner_id" ELSE b."renter_id" END
FROM "bookings" b
WHERE b."id" = r."booking_id";$mp_21_23$;

    EXECUTE $mp_21_24$ALTER TABLE "reviews" ENABLE TRIGGER USER;$mp_21_24$;

    EXECUTE $mp_21_25$ALTER TABLE "reviews" ALTER COLUMN "reviewed_user_id" SET NOT NULL;$mp_21_25$;

    EXECUTE $mp_21_26$ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_21_26$;

    EXECUTE $mp_21_27$ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_21_27$;

    EXECUTE $mp_21_28$CREATE UNIQUE INDEX "phone_verifications_one_pending_per_user" ON "phone_verifications" USING btree ("user_id") WHERE status = 'pending';$mp_21_28$;

    EXECUTE $mp_21_29$CREATE INDEX "phone_verifications_user_created_idx" ON "phone_verifications" USING btree ("user_id","created_at");$mp_21_29$;

    EXECUTE $mp_21_30$ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;$mp_21_30$;

    EXECUTE $mp_21_31$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewed_user_id_profiles_id_fk" FOREIGN KEY ("reviewed_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_21_31$;

    EXECUTE $mp_21_32$CREATE UNIQUE INDEX "profiles_verified_phone_key" ON "profiles" USING btree ("phone") WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL;$mp_21_32$;

    EXECUTE $mp_21_33$CREATE INDEX "reports_review_idx" ON "reports" USING btree ("review_id");$mp_21_33$;

    EXECUTE $mp_21_34$CREATE INDEX "reviews_reviewed_user_idx" ON "reviews" USING btree ("reviewed_user_id","kind","created_at");$mp_21_34$;

    EXECUTE $mp_21_35$CREATE UNIQUE INDEX "reports_one_open_per_target" ON "reports" USING btree ("reporter_id","target_type",COALESCE(space_id, target_user_id, message_id, review_id)) WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;$mp_21_35$;

    EXECUTE $mp_21_36$ALTER TABLE "profiles" ADD CONSTRAINT "profiles_display_name_length" CHECK ("profiles"."display_name" IS NULL OR char_length(btrim("profiles"."display_name")) BETWEEN 2 AND 40);$mp_21_36$;

    EXECUTE $mp_21_37$ALTER TABLE "profiles" ADD CONSTRAINT "profiles_bio_length" CHECK ("profiles"."bio" IS NULL OR char_length("profiles"."bio") <= 500);$mp_21_37$;

    EXECUTE $mp_21_38$ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_path_own_folder" CHECK ("profiles"."avatar_path" IS NULL OR "profiles"."avatar_path" LIKE ("profiles"."id"::text || '/avatar/%'));$mp_21_38$;

    EXECUTE $mp_21_39$ALTER TABLE "profiles" ADD CONSTRAINT "profiles_identity_status_matches" CHECK (("profiles"."identity_verification_status" = 'verified') = ("profiles"."document_verified_at" IS NOT NULL));$mp_21_39$;

    EXECUTE $mp_21_40$ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches_type" CHECK (("reports"."target_type"::text = 'space'   AND "reports"."space_id" IS NOT NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'user'    AND "reports"."target_user_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."message_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'message' AND "reports"."message_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'review'  AND "reports"."review_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL));$mp_21_40$;

    EXECUTE $mp_21_41$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_not_self" CHECK ("reviews"."author_id" <> "reviews"."reviewed_user_id");$mp_21_41$;

    EXECUTE $mp_21_42$-- ---------------------------------------------------------------------------
-- 2. Avaliacao
-- ---------------------------------------------------------------------------

-- Mesma validacao de antes (reserva existe, esta encerrada, autor e a parte
-- certa) e agora tambem decide QUEM recebeu a avaliacao: sempre a outra parte
-- da reserva. Um INSERT que omite o campo recebe o valor certo; um que
-- informa outra pessoa e recusado.
CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b record;
  avaliado uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva % nao existe', NEW.booking_id;
  END IF;

  IF b.status <> 'ended' THEN
    RAISE EXCEPTION 'So e possivel avaliar apos o encerramento da locacao (status atual: %)', b.status;
  END IF;

  IF NEW.kind = 'renter_to_space' THEN
    IF NEW.author_id <> b.renter_id THEN
      RAISE EXCEPTION 'Apenas o locatario da reserva pode avaliar o espaco';
    END IF;
    IF NEW.space_id <> b.space_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um espaco diferente do da reserva';
    END IF;
    avaliado := b.owner_id;
  ELSE
    IF NEW.author_id <> b.owner_id THEN
      RAISE EXCEPTION 'Apenas o proprietario da reserva pode avaliar o locatario';
    END IF;
    IF NEW.target_user_id <> b.renter_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um usuario que nao e o locatario da reserva';
    END IF;
    avaliado := b.renter_id;
  END IF;

  IF NEW.reviewed_user_id IS NULL THEN
    NEW.reviewed_user_id := avaliado;
  ELSIF NEW.reviewed_user_id <> avaliado THEN
    RAISE EXCEPTION 'A avaliacao aponta para uma pessoa que nao e a outra parte da reserva';
  END IF;

  RETURN NEW;
END;
$$;$mp_21_42$;

    EXECUTE $mp_21_43$-- Avaliacao publicada nao muda: nem nota, nem texto, nem autor, nem alvo.
-- A moderacao so pode OCULTAR (hidden_at/hidden_reason), e isso fica
-- registrado. Apagar tambem e bloqueado — apagar avaliacao ruim e o jeito mais
-- simples de inflar media. Para manutencao excepcional (ex.: pedido de
-- exclusao de dados pela LGPD), quem opera o banco liga explicitamente
-- `SET LOCAL myplace.allow_review_delete = 'on'` na propria transacao; a
-- aplicacao nunca faz isso.
CREATE OR REPLACE FUNCTION public.guard_review_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('myplace.allow_review_delete', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Avaliacao nao pode ser apagada; para tirar do ar, oculte (hidden_at)';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.space_id IS DISTINCT FROM OLD.space_id
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.reviewed_user_id IS DISTINCT FROM OLD.reviewed_user_id
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Avaliacao publicada nao pode ser alterada (so ocultada pela moderacao)';
  END IF;

  RETURN NEW;
END;
$$;$mp_21_43$;

    EXECUTE $mp_21_44$CREATE TRIGGER reviews_guard_immutable
  BEFORE UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_immutable();$mp_21_44$;

    EXECUTE $mp_21_45$-- Media do anuncio com UMA casa decimal, arredondada uma unica vez a partir
-- das notas (metade para cima: 4,65 -> 4,7; 4,6666 -> 4,7). Antes guardava
-- duas casas e a tela arredondava de novo — dois arredondamentos seguidos
-- podem divergir do valor certo (4,649 -> 4,65 -> 4,7, quando o certo e 4,6).
-- A reputacao por pessoa usa a mesma regra (src/lib/reviews/reputation.ts).
CREATE OR REPLACE FUNCTION public.refresh_space_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.space_id, OLD.space_id);
  IF target IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.spaces s
  SET rating_avg = sub.avg_rating,
      rating_count = sub.cnt
  FROM (
    SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS cnt
    FROM public.reviews
    WHERE space_id = target AND hidden_at IS NULL
  ) sub
  WHERE s.id = target;

  RETURN COALESCE(NEW, OLD);
END;
$$;$mp_21_45$;

    EXECUTE $mp_21_46$-- Recalcula as medias ja gravadas com a regra nova (so onde muda algo).
UPDATE public.spaces s
SET rating_avg = sub.avg_rating,
    rating_count = sub.cnt
FROM (
  SELECT space_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS cnt
  FROM public.reviews
  WHERE space_id IS NOT NULL AND hidden_at IS NULL
  GROUP BY space_id
) sub
WHERE s.id = sub.space_id
  AND (s.rating_avg IS DISTINCT FROM sub.avg_rating OR s.rating_count IS DISTINCT FROM sub.cnt);$mp_21_46$;

    EXECUTE $mp_21_47$-- ---------------------------------------------------------------------------
-- 3. Denuncia de avaliacao
-- ---------------------------------------------------------------------------

-- Evidencia: agora tambem copia a avaliacao denunciada.
CREATE OR REPLACE FUNCTION public.capture_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.evidence_snapshot IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.target_type::text = 'message' THEN
    SELECT jsonb_build_object(
             'body', m.body,
             'sender_id', m.sender_id,
             'conversation_id', m.conversation_id,
             'sent_at', m.created_at,
             'flag_reason', m.flag_reason)
      INTO NEW.evidence_snapshot
      FROM public.messages m WHERE m.id = NEW.message_id;

  ELSIF NEW.target_type::text = 'space' THEN
    SELECT jsonb_build_object(
             'title', s.title,
             'description', s.description,
             'price_monthly_cents', s.price_monthly_cents,
             'city', s.city,
             'district', s.district,
             'owner_id', s.owner_id,
             'status', s.status)
      INTO NEW.evidence_snapshot
      FROM public.spaces s WHERE s.id = NEW.space_id;

  ELSIF NEW.target_type::text = 'user' THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'role', p.role,
             'status', p.status,
             'member_since', p.created_at,
             'upheld_report_count', p.upheld_report_count)
      INTO NEW.evidence_snapshot
      FROM public.profiles p WHERE p.id = NEW.target_user_id;

  ELSIF NEW.target_type::text = 'review' THEN
    SELECT jsonb_build_object(
             'rating', rv.rating,
             'comment', rv.comment,
             'kind', rv.kind,
             'author_id', rv.author_id,
             'reviewed_user_id', rv.reviewed_user_id,
             'booking_id', rv.booking_id,
             'space_id', rv.space_id,
             'created_at', rv.created_at)
      INTO NEW.evidence_snapshot
      FROM public.reviews rv WHERE rv.id = NEW.review_id;
  END IF;

  RETURN NEW;
END;
$$;$mp_21_47$;

    EXECUTE $mp_21_48$-- Reincidencia: denuncia procedente de avaliacao conta contra quem ESCREVEU.
-- Resto igual a 0011 (suspensao automatica ao atingir o limite).
CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid;
  novo_total integer;
  limite integer;
BEGIN
  -- Para denuncia de anuncio, mensagem ou avaliacao, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id),
    (SELECT author_id FROM public.reviews WHERE id = NEW.review_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO novo_total
  FROM public.reports r
  WHERE r.upheld = true
    AND COALESCE(
          r.target_user_id,
          (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
          (SELECT sender_id FROM public.messages WHERE id = r.message_id),
          (SELECT author_id FROM public.reviews WHERE id = r.review_id)
        ) = alvo;

  UPDATE public.profiles SET upheld_report_count = novo_total WHERE id = alvo;

  SELECT (value #>> '{}')::int INTO limite
  FROM public.platform_settings WHERE key = 'safety.auto_suspend_upheld_threshold';
  limite := COALESCE(limite, 5);

  IF novo_total >= limite THEN
    UPDATE public.profiles
    SET status = 'suspended',
        status_reason = 'Suspensão automática: ' || novo_total || ' denúncias procedentes.'
    WHERE id = alvo AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;$mp_21_48$;

    EXECUTE $mp_21_49$-- ---------------------------------------------------------------------------
-- 4. E-mail verificado
--
-- A fonte da verdade e o Supabase Auth: `auth.users.email_confirmed_at` so e
-- preenchido quando a pessoa abre o link de confirmacao. `profiles` guarda
-- uma copia, mantida por trigger, para o selo sair do dado real e nao de uma
-- suposicao do app. (Exige "Confirm email" LIGADO no Supabase — com ele
-- desligado o Auth marca todo cadastro como confirmado; ver docs/SETUP.md.)
-- ---------------------------------------------------------------------------

-- O stub local de auth.users (migracao 0001) nao tinha a coluna. No Supabase
-- ela ja existe e nada acontece aqui.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
  END IF;
END $$;$mp_21_49$;

    EXECUTE $mp_21_50$CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email_verified_at)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    NEW.email_confirmed_at
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;$mp_21_50$;

    EXECUTE $mp_21_51$CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email_verified_at = NEW.email_confirmed_at
  WHERE id = NEW.id
    AND email_verified_at IS DISTINCT FROM NEW.email_confirmed_at;
  RETURN NEW;
END;
$$;$mp_21_51$;

    EXECUTE $mp_21_52$DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;$mp_21_52$;

    EXECUTE $mp_21_53$CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified();$mp_21_53$;

    EXECUTE $mp_21_54$-- Quem ja confirmou antes desta migracao.
UPDATE public.profiles p
SET email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE u.id = p.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified_at IS NULL;$mp_21_54$;

    EXECUTE $mp_21_55$-- ---------------------------------------------------------------------------
-- 5. Selos so mudam pelo caminho certo
--
-- (a) Trocar o telefone derruba a verificacao do numero anterior — senao a
--     pessoa verificaria um numero e depois trocaria por outro mantendo o selo.
-- (b) Pela API do navegador (requisicao com JWT), ninguem altera selo nem
--     contador, nem no proprio perfil. O privilegio por coluna ja impede;
--     isto e a segunda trava. O servidor (sem JWT) e as triggers do sistema
--     seguem livres — e so por eles que a verificacao real chega.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
       NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
    OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
    OR NEW.document_verified_at IS DISTINCT FROM OLD.document_verified_at
    OR NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status
    OR NEW.completed_bookings_count IS DISTINCT FROM OLD.completed_bookings_count
    OR NEW.upheld_report_count IS DISTINCT FROM OLD.upheld_report_count
  ) THEN
    RAISE EXCEPTION 'Verificacoes e contadores do perfil nao podem ser alterados por esta via';
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone
     AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;$mp_21_55$;

    EXECUTE $mp_21_56$CREATE TRIGGER profiles_guard_verification
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verification();$mp_21_56$;

    EXECUTE $mp_21_57$-- ---------------------------------------------------------------------------
-- 6. RLS — o que o navegador consegue ler
--
-- Achado desta fase: `authenticated` tinha SELECT em TODAS as colunas de
-- profiles, e a policy "profiles_select_public_subset" libera todas as
-- linhas ativas. Somadas, qualquer conta logada lia telefone e CPF de todo
-- mundo pela API REST do Supabase, com a chave publica. O app nao usa esse
-- caminho (o servidor le com conexao privilegiada), mas a porta existia.
--
-- Correcao: SELECT por COLUNA, so nas colunas que podem ser publicas.
-- Telefone, CPF/CNPJ, nome completo, cidade, motivo de bloqueio e contadores
-- de moderacao ficam de fora. O proprio usuario tambem perde a leitura
-- direta desses campos pela API — o app ja os le pelo servidor.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.profiles FROM anon, authenticated;$mp_21_57$;

    EXECUTE $mp_21_58$GRANT SELECT (id, public_name, avatar_path, bio, created_at,
              email_verified_at, phone_verified_at, document_verified_at,
              identity_verification_status, completed_bookings_count,
              status, deleted_at)
  ON public.profiles TO authenticated;$mp_21_58$;

    EXECUTE $mp_21_59$-- A view publica passa a expor o nome PUBLICO (nome de exibicao ou primeiro
-- nome), nunca o nome completo, e os selos como booleanos.
DROP VIEW IF EXISTS public.public_profiles;$mp_21_59$;

    EXECUTE $mp_21_60$CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id,
         public_name,
         avatar_path,
         bio,
         created_at,
         email_verified_at IS NOT NULL AS email_verified,
         phone_verified_at IS NOT NULL AS phone_verified,
         identity_verification_status = 'verified' AS identity_verified,
         completed_bookings_count
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;$mp_21_60$;

    EXECUTE $mp_21_61$GRANT SELECT ON public.public_profiles TO authenticated;$mp_21_61$;

    EXECUTE $mp_21_62$-- Quem denunciou acompanha o andamento da propria denuncia, mas nao le a
-- evidencia copiada (que pode trazer dado de moderacao do denunciado, como
-- o contador de denuncias procedentes) nem a anotacao interna de quem julgou.
REVOKE SELECT ON public.reports FROM authenticated;$mp_21_62$;

    EXECUTE $mp_21_63$GRANT SELECT (id, target_type, space_id, target_user_id, message_id, review_id,
              booking_id, reporter_id, reason, details, status, created_at, resolved_at)
  ON public.reports TO authenticated;$mp_21_63$;

    EXECUTE $mp_21_64$-- Tabelas sem RLS ligada (criadas depois da 0001, que ligou em todas as que
-- existiam). Sem grant elas ja eram inalcancaveis pelo navegador; com RLS
-- ligada e nenhuma policy, continuam assim mesmo que alguem conceda um grant
-- por engano no futuro. O servidor e dono das tabelas e nao e afetado.
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;$mp_21_64$;

    EXECUTE $mp_21_65$ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;$mp_21_65$;

    EXECUTE $mp_21_66$ALTER TABLE public.booking_deposits ENABLE ROW LEVEL SECURITY;$mp_21_66$;

    EXECUTE $mp_21_67$ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;$mp_21_67$;

    EXECUTE $mp_21_68$ALTER TABLE public.space_quality_assessments ENABLE ROW LEVEL SECURITY;$mp_21_68$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('1638f2427a1494eb8b9d3bed55205895755270c880679a783f84c9788405ccee', 1790592696127);

    RAISE NOTICE 'Migracao 21 (0021_sleepy_brother_voodoo) aplicada.';
  END IF;
END
$mp_bloco_21$;


-- ----------------------------------------------------------------------------
-- Migracao 22: 0022_first_steel_serpent  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_22$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '674942af1dcea11495017669fee4b1c5127eff1309a3208a45b6c74694d480e4'
  ) THEN
    RAISE NOTICE 'Migracao 22 (0022_first_steel_serpent) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_22_0$-- ============================================================================
-- MyPlace — idempotencia de notificacao (Fase 21)
--
-- O mesmo evento processado duas vezes (webhook reenviado com outro id,
-- cron rodando de novo, clique duplo) gera a mesma `dedupe_key`; o indice
-- unico parcial faz o segundo INSERT virar nada via ON CONFLICT DO NOTHING.
-- Notificacoes antigas ficam com a chave NULL e nao participam do indice.
-- ============================================================================

ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;$mp_22_0$;

    EXECUTE $mp_22_1$CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key") WHERE dedupe_key IS NOT NULL;$mp_22_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('674942af1dcea11495017669fee4b1c5127eff1309a3208a45b6c74694d480e4', 1790595802223);

    RAISE NOTICE 'Migracao 22 (0022_first_steel_serpent) aplicada.';
  END IF;
END
$mp_bloco_22$;


-- ----------------------------------------------------------------------------
-- Migracao 23: 0023_stub_auth_usage  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_23$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'cace7c7a684bc73bf23a360183982ae1adce9d3fdf09db46250007c367d4dd2e'
  ) THEN
    RAISE NOTICE 'Migracao 23 (0023_stub_auth_usage) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_23_0$-- ============================================================================
-- MyPlace — fidelidade do stub local de `auth` (Fase 21)
--
-- No Supabase, os papeis da API (anon, authenticated) tem USAGE no schema
-- `auth` — e isso que deixa `auth.uid()` funcionar dentro de funcoes
-- plpgsql que rodam com os privilegios de quem chamou, como as triggers
-- `guard_profile_privileges` e `guard_profile_verification`.
--
-- O stub local criado na 0001 nao concedia esse USAGE. Resultado: uma
-- requisicao do navegador que alterasse o proprio perfil (ex.: trocar o
-- telefone) falhava localmente com "permission denied for schema auth",
-- enquanto no Supabase funciona. A diferenca apareceu no teste da Fase 21
-- (scripts/verify-schema.ts, secao 14), que exercita esse caminho.
--
-- No Supabase o privilegio ja existe e este bloco nao faz nada.
-- ============================================================================

DO $$
BEGIN
  IF NOT has_schema_privilege('authenticated', 'auth', 'USAGE') THEN
    GRANT USAGE ON SCHEMA auth TO authenticated;
  END IF;
  IF NOT has_schema_privilege('anon', 'auth', 'USAGE') THEN
    GRANT USAGE ON SCHEMA auth TO anon;
  END IF;
END $$;$mp_23_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('cace7c7a684bc73bf23a360183982ae1adce9d3fdf09db46250007c367d4dd2e', 1790624952280);

    RAISE NOTICE 'Migracao 23 (0023_stub_auth_usage) aplicada.';
  END IF;
END
$mp_bloco_23$;


-- ----------------------------------------------------------------------------
-- Migracao 24: 0024_rotulos_com_acento  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_24$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'dc24726c525e93d0ec621804ef70990161da8bf617c47ad9c92d4641a4ffee60'
  ) THEN
    RAISE NOTICE 'Migracao 24 (0024_rotulos_com_acento) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_24_0$-- ============================================================================
-- MyPlace — acentuação dos rótulos das características (Fase 21)
--
-- O catálogo semeado na 0001 foi escrito sem acento ("Iluminacao",
-- "Portao", "Agua"...), e esses rótulos aparecem para todo mundo: cartões
-- da busca, página do anúncio, filtros e etapa de características do
-- anúncio. Achado na revisão visual da Fase 21.
--
-- Só troca o texto que ainda é o original: se alguém já corrigiu ou
-- renomeou um rótulo no painel, fica como está. A chave (`key`) não muda —
-- é ela que os anúncios guardam, então nada precisa ser migrado neles.
-- ============================================================================

UPDATE public.features AS f
SET label = v.novo
FROM (VALUES
  ('acesso_caminhao', 'Acesso para caminhao',     'Acesso para caminhão'),
  ('agua',            'Agua',                     'Água'),
  ('camera',          'Camera de seguranca',      'Câmera de segurança'),
  ('carga_descarga',  'Area de carga e descarga', 'Área de carga e descarga'),
  ('iluminacao',      'Iluminacao',               'Iluminação'),
  ('portao',          'Portao',                   'Portão'),
  ('portaria',        'Portaria / vigilancia',    'Portaria / vigilância'),
  ('terreo',          'Terreo',                   'Térreo')
) AS v(key, antigo, novo)
WHERE f.key = v.key AND f.label = v.antigo;$mp_24_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('dc24726c525e93d0ec621804ef70990161da8bf617c47ad9c92d4641a4ffee60', 1790626157211);

    RAISE NOTICE 'Migracao 24 (0024_rotulos_com_acento) aplicada.';
  END IF;
END
$mp_bloco_24$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 25 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 25
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa

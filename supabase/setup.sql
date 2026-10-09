-- ============================================================================
-- MyPlace — schema do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Cada migracao so e aplicada se ainda nao
-- estiver registrada em drizzle.__drizzle_migrations. Projeto novo recebe
-- tudo; projeto que ja tem parte do schema recebe apenas o que falta.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 38 migracoes
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
-- Migracao 0: 0000_young_big_bertha  (138 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_0$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '2f03bdc057b4a4fb602b1972c2e42d5d85f8f219ee8c72b7b305c159b3409444'
  ) THEN
    RAISE NOTICE 'Migracao 0 (0000_young_big_bertha) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_0_0$-- Extensoes necessarias. PostGIS da as consultas por distancia real;
-- pgcrypto/pgcrypto-equivalente fornece gen_random_uuid() (nativo no PG13+).
CREATE EXTENSION IF NOT EXISTS "postgis";$mp_0_0$;

    EXECUTE $mp_0_1$CREATE EXTENSION IF NOT EXISTS "pg_trgm";$mp_0_1$;

    EXECUTE $mp_0_2$CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'banned', 'deleted');$mp_0_2$;

    EXECUTE $mp_0_3$CREATE TYPE "public"."booking_status" AS ENUM('requested', 'approved', 'rejected', 'awaiting_payment', 'active', 'past_due', 'cancelled', 'ended');$mp_0_3$;

    EXECUTE $mp_0_4$CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge_captured', 'gateway_fee', 'platform_fee_renter', 'platform_fee_owner', 'owner_payout', 'refund', 'chargeback', 'adjustment');$mp_0_4$;

    EXECUTE $mp_0_5$CREATE TYPE "public"."notification_type" AS ENUM('space_published', 'space_rejected', 'booking_requested', 'booking_approved', 'booking_rejected', 'booking_cancelled', 'payment_confirmed', 'payment_upcoming', 'payment_failed', 'payout_settled', 'new_message', 'review_received', 'report_resolved', 'account_notice');$mp_0_5$;

    EXECUTE $mp_0_6$CREATE TYPE "public"."payment_method" AS ENUM('pix', 'pix_automatico', 'credit_card', 'boleto');$mp_0_6$;

    EXECUTE $mp_0_7$CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'received', 'overdue', 'refunded', 'partially_refunded', 'chargeback', 'failed', 'cancelled');$mp_0_7$;

    EXECUTE $mp_0_8$CREATE TYPE "public"."payout_account_status" AS ENUM('not_started', 'pending_documents', 'under_review', 'approved', 'rejected', 'disabled');$mp_0_8$;

    EXECUTE $mp_0_9$CREATE TYPE "public"."payout_status" AS ENUM('pending', 'scheduled', 'settled', 'failed', 'reversed');$mp_0_9$;

    EXECUTE $mp_0_10$CREATE TYPE "public"."report_reason" AS ENUM('fraude', 'conteudo_inadequado', 'endereco_incorreto', 'anuncio_falso', 'atividade_proibida', 'outro');$mp_0_10$;

    EXECUTE $mp_0_11$CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');$mp_0_11$;

    EXECUTE $mp_0_12$CREATE TYPE "public"."review_kind" AS ENUM('renter_to_space', 'owner_to_renter');$mp_0_12$;

    EXECUTE $mp_0_13$CREATE TYPE "public"."space_status" AS ENUM('draft', 'pending_review', 'published', 'paused', 'rented', 'archived', 'removed');$mp_0_13$;

    EXECUTE $mp_0_14$CREATE TYPE "public"."space_type" AS ENUM('garagem', 'vaga_carro', 'vaga_moto', 'deposito', 'quarto', 'galpao', 'sala', 'escritorio', 'loja', 'terreno', 'outro');$mp_0_14$;

    EXECUTE $mp_0_15$CREATE TYPE "public"."subscription_status" AS ENUM('pending_authorization', 'active', 'past_due', 'paused', 'cancelled', 'expired');$mp_0_15$;

    EXECUTE $mp_0_16$CREATE TYPE "public"."user_role" AS ENUM('user', 'owner', 'admin');$mp_0_16$;

    EXECUTE $mp_0_17$CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed', 'ignored');$mp_0_17$;

    EXECUTE $mp_0_18$CREATE TABLE "owner_payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_account_id" text,
	"provider_wallet_id" text,
	"status" "payout_account_status" DEFAULT 'not_started' NOT NULL,
	"status_details" jsonb,
	"onboarding_url" text,
	"onboarding_url_expires_at" timestamp with time zone,
	"can_receive" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_18$;

    EXECUTE $mp_0_19$CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"avatar_path" text,
	"cpf_cnpj" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"accepted_terms_at" timestamp with time zone,
	"accepted_terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);$mp_0_19$;

    EXECUTE $mp_0_20$CREATE TABLE "renter_billing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_20$;

    EXECUTE $mp_0_21$CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_space_id_pk" PRIMARY KEY("user_id","space_id")
);$mp_0_21$;

    EXECUTE $mp_0_22$CREATE TABLE "features" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"icon" text,
	"applies_to" "space_type"[] DEFAULT '{}'::space_type[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_22$;

    EXECUTE $mp_0_23$CREATE TABLE "space_features" (
	"space_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	CONSTRAINT "space_features_space_id_feature_key_pk" PRIMARY KEY("space_id","feature_key")
);$mp_0_23$;

    EXECUTE $mp_0_24$CREATE TABLE "space_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"content_type" text,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_24$;

    EXECUTE $mp_0_25$CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"type" "space_type" NOT NULL,
	"status" "space_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"location" geometry(Point,4326),
	"approx_location" geometry(Point,4326),
	"size_m2" numeric(10, 2),
	"ceiling_height_m" numeric(5, 2),
	"price_monthly_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"rules_text" text,
	"allowed_items" text,
	"forbidden_items" text,
	"access_hours" text,
	"draft_step" integer DEFAULT 1 NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "spaces_price_positive" CHECK ("spaces"."price_monthly_cents" > 0),
	CONSTRAINT "spaces_price_sane" CHECK ("spaces"."price_monthly_cents" <= 100000000),
	CONSTRAINT "spaces_size_positive" CHECK ("spaces"."size_m2" IS NULL OR "spaces"."size_m2" > 0),
	CONSTRAINT "spaces_published_requires_location" CHECK ("spaces"."status" <> 'published' OR ("spaces"."location" IS NOT NULL AND "spaces"."approx_location" IS NOT NULL))
);$mp_0_25$;

    EXECUTE $mp_0_26$CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"space_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"monthly_rent_cents" integer NOT NULL,
	"renter_fee_bps" integer NOT NULL,
	"owner_fee_bps" integer NOT NULL,
	"renter_fee_cents" integer NOT NULL,
	"owner_fee_cents" integer NOT NULL,
	"total_charged_cents" integer NOT NULL,
	"owner_payout_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"terms_snapshot" jsonb,
	"renter_message" text,
	"owner_response" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_distinct_parties" CHECK ("bookings"."renter_id" <> "bookings"."owner_id"),
	CONSTRAINT "bookings_dates_ordered" CHECK ("bookings"."end_date" IS NULL OR "bookings"."end_date" > "bookings"."start_date"),
	CONSTRAINT "bookings_rent_positive" CHECK ("bookings"."monthly_rent_cents" > 0),
	CONSTRAINT "bookings_fees_non_negative" CHECK ("bookings"."renter_fee_cents" >= 0 AND "bookings"."owner_fee_cents" >= 0),
	CONSTRAINT "bookings_total_matches" CHECK ("bookings"."total_charged_cents" = "bookings"."monthly_rent_cents" + "bookings"."renter_fee_cents"),
	CONSTRAINT "bookings_payout_matches" CHECK ("bookings"."owner_payout_cents" = "bookings"."monthly_rent_cents" - "bookings"."owner_fee_cents"),
	CONSTRAINT "bookings_payout_positive" CHECK ("bookings"."owner_payout_cents" > 0)
);$mp_0_26$;

    EXECUTE $mp_0_27$CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"booking_id" uuid,
	"payment_id" uuid,
	"payout_id" uuid,
	"user_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"description" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_not_zero" CHECK ("ledger_entries"."amount_cents" <> 0)
);$mp_0_27$;

    EXECUTE $mp_0_28$CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"subscription_id" uuid,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"gateway_fee_cents" integer,
	"net_amount_cents" integer,
	"platform_net_cents" integer,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"invoice_url" text,
	"failure_reason" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_refund_within_amount" CHECK ("payments"."refunded_cents" BETWEEN 0 AND "payments"."amount_cents")
);$mp_0_28$;

    EXECUTE $mp_0_29$CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_split_id" text,
	"provider_wallet_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount_cents" > 0)
);$mp_0_29$;

    EXECUTE $mp_0_30$CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_subscription_id" text,
	"status" "subscription_status" DEFAULT 'pending_authorization' NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_cents" integer NOT NULL,
	"billing_day" integer NOT NULL,
	"next_due_date" date,
	"failed_cycles" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_billing_day_range" CHECK ("subscriptions"."billing_day" BETWEEN 1 AND 28),
	CONSTRAINT "subscriptions_amount_positive" CHECK ("subscriptions"."amount_cents" > 0)
);$mp_0_30$;

    EXECUTE $mp_0_31$CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);$mp_0_31$;

    EXECUTE $mp_0_32$CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"booking_id" uuid,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_distinct_parties" CHECK ("conversations"."renter_id" <> "conversations"."owner_id")
);$mp_0_32$;

    EXECUTE $mp_0_33$CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_not_empty" CHECK (length(trim("messages"."body")) > 0),
	CONSTRAINT "messages_body_max" CHECK (length("messages"."body") <= 4000)
);$mp_0_33$;

    EXECUTE $mp_0_34$CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_34$;

    EXECUTE $mp_0_35$CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "review_kind" NOT NULL,
	"author_id" uuid NOT NULL,
	"space_id" uuid,
	"target_user_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"hidden_at" timestamp with time zone,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_comment_max" CHECK ("reviews"."comment" IS NULL OR length("reviews"."comment") <= 2000),
	CONSTRAINT "reviews_target_matches_kind" CHECK (("reviews"."kind" = 'renter_to_space' AND "reviews"."space_id" IS NOT NULL AND "reviews"."target_user_id" IS NULL)
          OR ("reviews"."kind" = 'owner_to_renter' AND "reviews"."target_user_id" IS NOT NULL AND "reviews"."space_id" IS NULL))
);$mp_0_35$;

    EXECUTE $mp_0_36$CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_36$;

    EXECUTE $mp_0_37$CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_path" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_37$;

    EXECUTE $mp_0_38$CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);$mp_0_38$;

    EXECUTE $mp_0_39$ALTER TABLE "owner_payout_accounts" ADD CONSTRAINT "owner_payout_accounts_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_39$;

    EXECUTE $mp_0_40$ALTER TABLE "renter_billing_profiles" ADD CONSTRAINT "renter_billing_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_40$;

    EXECUTE $mp_0_41$ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_41$;

    EXECUTE $mp_0_42$ALTER TABLE "favorites" ADD CONSTRAINT "favorites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_42$;

    EXECUTE $mp_0_43$ALTER TABLE "space_features" ADD CONSTRAINT "space_features_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_43$;

    EXECUTE $mp_0_44$ALTER TABLE "space_features" ADD CONSTRAINT "space_features_feature_key_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "public"."features"("key") ON DELETE cascade ON UPDATE no action;$mp_0_44$;

    EXECUTE $mp_0_45$ALTER TABLE "space_images" ADD CONSTRAINT "space_images_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_45$;

    EXECUTE $mp_0_46$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_46$;

    EXECUTE $mp_0_47$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;$mp_0_47$;

    EXECUTE $mp_0_48$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renter_id_profiles_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_48$;

    EXECUTE $mp_0_49$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_49$;

    EXECUTE $mp_0_50$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_0_50$;

    EXECUTE $mp_0_51$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_0_51$;

    EXECUTE $mp_0_52$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;$mp_0_52$;

    EXECUTE $mp_0_53$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;$mp_0_53$;

    EXECUTE $mp_0_54$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_54$;

    EXECUTE $mp_0_55$ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_0_55$;

    EXECUTE $mp_0_56$ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;$mp_0_56$;

    EXECUTE $mp_0_57$ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;$mp_0_57$;

    EXECUTE $mp_0_58$ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_58$;

    EXECUTE $mp_0_59$ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_0_59$;

    EXECUTE $mp_0_60$ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_60$;

    EXECUTE $mp_0_61$ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renter_id_profiles_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_61$;

    EXECUTE $mp_0_62$ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_62$;

    EXECUTE $mp_0_63$ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;$mp_0_63$;

    EXECUTE $mp_0_64$ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;$mp_0_64$;

    EXECUTE $mp_0_65$ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_65$;

    EXECUTE $mp_0_66$ALTER TABLE "reports" ADD CONSTRAINT "reports_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_66$;

    EXECUTE $mp_0_67$ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_0_67$;

    EXECUTE $mp_0_68$ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_0_68$;

    EXECUTE $mp_0_69$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_0_69$;

    EXECUTE $mp_0_70$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_0_70$;

    EXECUTE $mp_0_71$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_0_71$;

    EXECUTE $mp_0_72$ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_72$;

    EXECUTE $mp_0_73$ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_0_73$;

    EXECUTE $mp_0_74$ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_0_74$;

    EXECUTE $mp_0_75$ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_0_75$;

    EXECUTE $mp_0_76$CREATE UNIQUE INDEX "owner_payout_accounts_owner_provider_key" ON "owner_payout_accounts" USING btree ("owner_id","provider");$mp_0_76$;

    EXECUTE $mp_0_77$CREATE UNIQUE INDEX "owner_payout_accounts_wallet_key" ON "owner_payout_accounts" USING btree ("provider_wallet_id");$mp_0_77$;

    EXECUTE $mp_0_78$CREATE INDEX "owner_payout_accounts_status_idx" ON "owner_payout_accounts" USING btree ("status");$mp_0_78$;

    EXECUTE $mp_0_79$CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");$mp_0_79$;

    EXECUTE $mp_0_80$CREATE INDEX "profiles_status_idx" ON "profiles" USING btree ("status");$mp_0_80$;

    EXECUTE $mp_0_81$CREATE UNIQUE INDEX "profiles_cpf_cnpj_key" ON "profiles" USING btree ("cpf_cnpj") WHERE cpf_cnpj IS NOT NULL;$mp_0_81$;

    EXECUTE $mp_0_82$CREATE UNIQUE INDEX "renter_billing_profiles_user_provider_key" ON "renter_billing_profiles" USING btree ("user_id","provider");$mp_0_82$;

    EXECUTE $mp_0_83$CREATE UNIQUE INDEX "renter_billing_profiles_customer_key" ON "renter_billing_profiles" USING btree ("provider","provider_customer_id");$mp_0_83$;

    EXECUTE $mp_0_84$CREATE INDEX "favorites_space_idx" ON "favorites" USING btree ("space_id");$mp_0_84$;

    EXECUTE $mp_0_85$CREATE INDEX "favorites_user_created_idx" ON "favorites" USING btree ("user_id","created_at");$mp_0_85$;

    EXECUTE $mp_0_86$CREATE INDEX "features_category_idx" ON "features" USING btree ("category");$mp_0_86$;

    EXECUTE $mp_0_87$CREATE INDEX "space_features_feature_idx" ON "space_features" USING btree ("feature_key");$mp_0_87$;

    EXECUTE $mp_0_88$CREATE INDEX "space_images_space_idx" ON "space_images" USING btree ("space_id","position");$mp_0_88$;

    EXECUTE $mp_0_89$CREATE UNIQUE INDEX "space_images_path_key" ON "space_images" USING btree ("storage_path");$mp_0_89$;

    EXECUTE $mp_0_90$CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces" USING btree ("slug");$mp_0_90$;

    EXECUTE $mp_0_91$CREATE INDEX "spaces_owner_idx" ON "spaces" USING btree ("owner_id");$mp_0_91$;

    EXECUTE $mp_0_92$CREATE INDEX "spaces_status_idx" ON "spaces" USING btree ("status");$mp_0_92$;

    EXECUTE $mp_0_93$CREATE INDEX "spaces_type_idx" ON "spaces" USING btree ("type");$mp_0_93$;

    EXECUTE $mp_0_94$CREATE INDEX "spaces_price_idx" ON "spaces" USING btree ("price_monthly_cents");$mp_0_94$;

    EXECUTE $mp_0_95$CREATE INDEX "spaces_city_state_idx" ON "spaces" USING btree ("city","state");$mp_0_95$;

    EXECUTE $mp_0_96$CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings" USING btree ("reference");$mp_0_96$;

    EXECUTE $mp_0_97$CREATE INDEX "bookings_space_idx" ON "bookings" USING btree ("space_id");$mp_0_97$;

    EXECUTE $mp_0_98$CREATE INDEX "bookings_renter_idx" ON "bookings" USING btree ("renter_id","status");$mp_0_98$;

    EXECUTE $mp_0_99$CREATE INDEX "bookings_owner_idx" ON "bookings" USING btree ("owner_id","status");$mp_0_99$;

    EXECUTE $mp_0_100$CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");$mp_0_100$;

    EXECUTE $mp_0_101$CREATE UNIQUE INDEX "bookings_one_active_per_space" ON "bookings" USING btree ("space_id") WHERE status IN ('approved','awaiting_payment','active','past_due');$mp_0_101$;

    EXECUTE $mp_0_102$CREATE INDEX "ledger_booking_idx" ON "ledger_entries" USING btree ("booking_id");$mp_0_102$;

    EXECUTE $mp_0_103$CREATE INDEX "ledger_payment_idx" ON "ledger_entries" USING btree ("payment_id");$mp_0_103$;

    EXECUTE $mp_0_104$CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id");$mp_0_104$;

    EXECUTE $mp_0_105$CREATE INDEX "ledger_type_occurred_idx" ON "ledger_entries" USING btree ("type","occurred_at");$mp_0_105$;

    EXECUTE $mp_0_106$CREATE UNIQUE INDEX "payments_provider_id_key" ON "payments" USING btree ("provider","provider_payment_id");$mp_0_106$;

    EXECUTE $mp_0_107$CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");$mp_0_107$;

    EXECUTE $mp_0_108$CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");$mp_0_108$;

    EXECUTE $mp_0_109$CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");$mp_0_109$;

    EXECUTE $mp_0_110$CREATE INDEX "payments_due_date_idx" ON "payments" USING btree ("due_date");$mp_0_110$;

    EXECUTE $mp_0_111$CREATE UNIQUE INDEX "payouts_provider_split_key" ON "payouts" USING btree ("provider","provider_split_id");$mp_0_111$;

    EXECUTE $mp_0_112$CREATE INDEX "payouts_payment_idx" ON "payouts" USING btree ("payment_id");$mp_0_112$;

    EXECUTE $mp_0_113$CREATE INDEX "payouts_owner_idx" ON "payouts" USING btree ("owner_id","status");$mp_0_113$;

    EXECUTE $mp_0_114$CREATE UNIQUE INDEX "subscriptions_provider_id_key" ON "subscriptions" USING btree ("provider","provider_subscription_id");$mp_0_114$;

    EXECUTE $mp_0_115$CREATE INDEX "subscriptions_booking_idx" ON "subscriptions" USING btree ("booking_id");$mp_0_115$;

    EXECUTE $mp_0_116$CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");$mp_0_116$;

    EXECUTE $mp_0_117$CREATE INDEX "subscriptions_next_due_idx" ON "subscriptions" USING btree ("next_due_date");$mp_0_117$;

    EXECUTE $mp_0_118$CREATE UNIQUE INDEX "subscriptions_one_live_per_booking" ON "subscriptions" USING btree ("booking_id") WHERE status IN ('pending_authorization','active','past_due','paused');$mp_0_118$;

    EXECUTE $mp_0_119$CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","provider_event_id");$mp_0_119$;

    EXECUTE $mp_0_120$CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status","received_at");$mp_0_120$;

    EXECUTE $mp_0_121$CREATE INDEX "webhook_events_type_idx" ON "webhook_events" USING btree ("event_type");$mp_0_121$;

    EXECUTE $mp_0_122$CREATE UNIQUE INDEX "conversations_space_renter_key" ON "conversations" USING btree ("space_id","renter_id");$mp_0_122$;

    EXECUTE $mp_0_123$CREATE INDEX "conversations_owner_idx" ON "conversations" USING btree ("owner_id","last_message_at");$mp_0_123$;

    EXECUTE $mp_0_124$CREATE INDEX "conversations_renter_idx" ON "conversations" USING btree ("renter_id","last_message_at");$mp_0_124$;

    EXECUTE $mp_0_125$CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");$mp_0_125$;

    EXECUTE $mp_0_126$CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_id");$mp_0_126$;

    EXECUTE $mp_0_127$CREATE INDEX "reports_space_idx" ON "reports" USING btree ("space_id");$mp_0_127$;

    EXECUTE $mp_0_128$CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");$mp_0_128$;

    EXECUTE $mp_0_129$CREATE UNIQUE INDEX "reports_one_open_per_reporter" ON "reports" USING btree ("space_id","reporter_id") WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;$mp_0_129$;

    EXECUTE $mp_0_130$CREATE UNIQUE INDEX "reviews_booking_author_kind_key" ON "reviews" USING btree ("booking_id","author_id","kind");$mp_0_130$;

    EXECUTE $mp_0_131$CREATE INDEX "reviews_space_idx" ON "reviews" USING btree ("space_id");$mp_0_131$;

    EXECUTE $mp_0_132$CREATE INDEX "reviews_target_user_idx" ON "reviews" USING btree ("target_user_id");$mp_0_132$;

    EXECUTE $mp_0_133$CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");$mp_0_133$;

    EXECUTE $mp_0_134$CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");$mp_0_134$;

    EXECUTE $mp_0_135$CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");$mp_0_135$;

    EXECUTE $mp_0_136$CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");$mp_0_136$;

    EXECUTE $mp_0_137$CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");$mp_0_137$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('2f03bdc057b4a4fb602b1972c2e42d5d85f8f219ee8c72b7b305c159b3409444', 1789587473103);

    RAISE NOTICE 'Migracao 0 (0000_young_big_bertha) aplicada.';
  END IF;
END
$mp_bloco_0$;


-- ----------------------------------------------------------------------------
-- Migracao 1: 0001_integridade_indices_e_rls  (54 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_1$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '382e101b16729861ed66e094696d3c9343393545caeb961b1fecb110ab01d654'
  ) THEN
    RAISE NOTICE 'Migracao 1 (0001_integridade_indices_e_rls) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_1_0$-- ============================================================================
-- MyPlace — integridade, indices geoespaciais, triggers e RLS
--
-- O que este arquivo faz, em ordem:
--   1. Liga o perfil da aplicacao a identidade do Supabase Auth
--   2. Indices GIST para busca por distancia e trigram para busca textual
--   3. Triggers que protegem invariantes que a aplicacao nao pode garantir
--   4. RLS: por padrao o navegador NAO le nada; libera-se caso a caso
--   5. Dados iniciais (taxas da plataforma e catalogo de caracteristicas)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Identidade
-- ---------------------------------------------------------------------------

-- No Supabase o schema `auth` ja existe e e gerenciado por eles.
-- Em desenvolvimento local criamos um stub minimo para que ESTA MESMA
-- migracao rode nos dois ambientes sem ramificacao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- No Supabase, auth.uid() le o `sub` do JWT da requisicao.
    EXECUTE $f$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $body$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $f$;
  END IF;
END $$;$mp_1_0$;

    EXECUTE $mp_1_1$-- O perfil e uma extensao 1:1 da identidade. Apagar o usuario apaga o perfil.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;$mp_1_1$;

    EXECUTE $mp_1_2$-- Cria o perfil automaticamente quando alguem se cadastra.
-- Sem isto haveria uma janela em que o usuario existe mas nao tem perfil.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;$mp_1_2$;

    EXECUTE $mp_1_3$DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;$mp_1_3$;

    EXECUTE $mp_1_4$CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();$mp_1_4$;

    EXECUTE $mp_1_5$-- Quem e o usuario da requisicao atual (NULL para visitante).
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, auth
AS $$ SELECT auth.uid() $$;$mp_1_5$;

    EXECUTE $mp_1_6$-- SECURITY DEFINER para consultar profiles sem recursao de RLS.
-- search_path fixo impede sequestro da funcao por schema malicioso.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
  );
$$;$mp_1_6$;

    EXECUTE $mp_1_7$-- ---------------------------------------------------------------------------
-- 2. Indices
-- ---------------------------------------------------------------------------

-- Busca por raio ("ate 2 km de mim") usa ST_DWithin(coluna::geography, ...).
-- O indice precisa ser sobre EXATAMENTE essa expressao, senao o planner ignora.
CREATE INDEX "spaces_location_gix"
  ON "spaces" USING GIST ((("location")::geography));$mp_1_7$;

    EXECUTE $mp_1_8$CREATE INDEX "spaces_approx_location_gix"
  ON "spaces" USING GIST ((("approx_location")::geography));$mp_1_8$;

    EXECUTE $mp_1_9$-- Busca textual tolerante a acento/erro de digitacao em titulo, cidade e bairro.
CREATE INDEX "spaces_title_trgm_idx" ON "spaces" USING GIN ("title" gin_trgm_ops);$mp_1_9$;

    EXECUTE $mp_1_10$CREATE INDEX "spaces_city_trgm_idx" ON "spaces" USING GIN ("city" gin_trgm_ops);$mp_1_10$;

    EXECUTE $mp_1_11$CREATE INDEX "spaces_district_trgm_idx" ON "spaces" USING GIN ("district" gin_trgm_ops);$mp_1_11$;

    EXECUTE $mp_1_12$-- O caminho quente da busca: anuncios publicados, filtrados por tipo e preco.
CREATE INDEX "spaces_published_browse_idx"
  ON "spaces" ("type", "price_monthly_cents")
  WHERE "status" = 'published' AND "deleted_at" IS NULL;$mp_1_12$;

    EXECUTE $mp_1_13$-- ---------------------------------------------------------------------------
-- 3. Triggers de integridade
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;$mp_1_13$;

    EXECUTE $mp_1_14$DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','owner_payout_accounts','renter_billing_profiles','spaces',
    'bookings','subscriptions','payments','payouts','reviews'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;$mp_1_14$;

    EXECUTE $mp_1_15$-- Impede avaliacao falsa. A aplicacao ja checa, mas isto e o que vale mesmo:
-- so avalia quem participou da locacao, e so depois dela terminar.
CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE b record;
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
  ELSE
    IF NEW.author_id <> b.owner_id THEN
      RAISE EXCEPTION 'Apenas o proprietario da reserva pode avaliar o locatario';
    END IF;
    IF NEW.target_user_id <> b.renter_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um usuario que nao e o locatario da reserva';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;$mp_1_15$;

    EXECUTE $mp_1_16$CREATE TRIGGER reviews_validate
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review();$mp_1_16$;

    EXECUTE $mp_1_17$-- Mantem a nota media do anuncio coerente com as avaliacoes visiveis.
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
    SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS cnt
    FROM public.reviews
    WHERE space_id = target AND hidden_at IS NULL
  ) sub
  WHERE s.id = target;

  RETURN COALESCE(NEW, OLD);
END;
$$;$mp_1_17$;

    EXECUTE $mp_1_18$CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_space_rating();$mp_1_18$;

    EXECUTE $mp_1_19$-- O livro-razao e append-only: correcao se faz com lancamento novo, nunca
-- reescrevendo o passado. Isto vale inclusive para quem tem acesso direto ao banco.
CREATE OR REPLACE FUNCTION public.forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela % e append-only: use um novo lancamento para corrigir (tentativa de %)',
    TG_TABLE_NAME, TG_OP;
END;
$$;$mp_1_19$;

    EXECUTE $mp_1_20$CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();$mp_1_20$;

    EXECUTE $mp_1_21$CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();$mp_1_21$;

    EXECUTE $mp_1_22$-- Ninguem vira admin sozinho. Mudanca de papel/status so por admin ou pelo
-- servidor com conexao privilegiada (que roda como owner e nao dispara isto).
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- servidor confiavel (sem JWT): a autorizacao ja foi feita na aplicacao
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.cpf_cnpj IS DISTINCT FROM OLD.cpf_cnpj)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Alteracao de papel, status ou CPF/CNPJ nao permitida por esta via';
  END IF;

  RETURN NEW;
END;
$$;$mp_1_22$;

    EXECUTE $mp_1_23$CREATE TRIGGER profiles_guard_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();$mp_1_23$;

    EXECUTE $mp_1_24$-- Mantem a conversa ordenada por atividade sem custo de subquery na listagem.
CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;$mp_1_24$;

    EXECUTE $mp_1_25$CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();$mp_1_25$;

    EXECUTE $mp_1_26$-- ---------------------------------------------------------------------------
-- 4. RLS — Row Level Security
--
-- Postura: NEGAR POR PADRAO.
--
-- O servidor Next.js fala com o banco por uma conexao privilegiada (dona das
-- tabelas), que por definicao ignora RLS — toda a autorizacao desse caminho
-- vive na Data Access Layer, em src/lib/auth/dal.ts.
--
-- O RLS abaixo protege o OUTRO caminho: o navegador falando direto com o
-- Supabase (necessario para o chat em tempo real). Ali o RLS e a unica
-- barreira, entao ele so libera o que o cliente realmente precisa ler.
-- ---------------------------------------------------------------------------

-- Papeis do Supabase. Em desenvolvimento local eles nao existem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;$mp_1_26$;

    EXECUTE $mp_1_27$-- Liga RLS em tudo. Tabela com RLS ligada e sem policy = ninguem le nada,
-- que e exatamente o padrao que queremos.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;$mp_1_27$;

    EXECUTE $mp_1_28$-- Ponto de partida: o navegador nao alcanca nada.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;$mp_1_28$;

    EXECUTE $mp_1_29$REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;$mp_1_29$;

    EXECUTE $mp_1_30$ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;$mp_1_30$;

    EXECUTE $mp_1_31$GRANT USAGE ON SCHEMA public TO anon, authenticated;$mp_1_31$;

    EXECUTE $mp_1_32$-- ===== profiles =====
-- Leitura do proprio perfil. Dados de outras pessoas saem pela view publica
-- mais abaixo, que nao inclui telefone nem CPF.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());$mp_1_32$;

    EXECUTE $mp_1_33$CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND status = 'active')
  WITH CHECK (id = auth.uid());$mp_1_33$;

    EXECUTE $mp_1_34$GRANT SELECT ON public.profiles TO authenticated;$mp_1_34$;

    EXECUTE $mp_1_35$-- Privilegio por COLUNA: mesmo com a policy acima, o usuario so consegue
-- escrever nestes tres campos. Papel, status e CPF ficam fora do alcance.
GRANT UPDATE (full_name, phone, avatar_path, accepted_terms_at, accepted_terms_version)
  ON public.profiles TO authenticated;$mp_1_35$;

    EXECUTE $mp_1_36$-- Identificacao publica e minima de um usuario (quem anuncia, quem avaliou).
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id, full_name, avatar_path, created_at
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;$mp_1_36$;

    EXECUTE $mp_1_37$CREATE POLICY "profiles_select_public_subset" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND deleted_at IS NULL);$mp_1_37$;

    EXECUTE $mp_1_38$GRANT SELECT ON public.public_profiles TO anon, authenticated;$mp_1_38$;

    EXECUTE $mp_1_39$-- ===== favorites =====
CREATE POLICY "favorites_all_own" ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());$mp_1_39$;

    EXECUTE $mp_1_40$GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;$mp_1_40$;

    EXECUTE $mp_1_41$-- ===== conversations / messages =====
-- O chat e o unico fluxo em que o navegador conversa direto com o banco
-- (Supabase Realtime). Por isso estas policies sao a barreira de verdade.
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (renter_id = auth.uid() OR owner_id = auth.uid());$mp_1_41$;

    EXECUTE $mp_1_42$GRANT SELECT ON public.conversations TO authenticated;$mp_1_42$;

    EXECUTE $mp_1_43$CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (
    hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );$mp_1_43$;

    EXECUTE $mp_1_44$-- Enviar mensagem exige: ser participante, ser o proprio remetente, a conversa
-- estar aberta, e a mensagem nao ser marcada como do sistema.
CREATE POLICY "messages_insert_participant" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_system = false
    AND hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.closed_at IS NULL
        AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );$mp_1_44$;

    EXECUTE $mp_1_45$GRANT SELECT, INSERT ON public.messages TO authenticated;$mp_1_45$;

    EXECUTE $mp_1_46$-- ===== notifications =====
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());$mp_1_46$;

    EXECUTE $mp_1_47$CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());$mp_1_47$;

    EXECUTE $mp_1_48$GRANT SELECT ON public.notifications TO authenticated;$mp_1_48$;

    EXECUTE $mp_1_49$GRANT UPDATE (read_at) ON public.notifications TO authenticated;$mp_1_49$;

    EXECUTE $mp_1_50$-- ===== features =====
-- Catalogo publico, sem dado sensivel.
CREATE POLICY "features_select_active" ON public.features
  FOR SELECT TO anon, authenticated
  USING (active = true);$mp_1_50$;

    EXECUTE $mp_1_51$GRANT SELECT ON public.features TO anon, authenticated;$mp_1_51$;

    EXECUTE $mp_1_52$-- NOTA DELIBERADA: spaces, bookings, payments, payouts, ledger_entries,
-- subscriptions, reports, reviews, audit_logs, webhook_events e as tabelas de
-- dados de recebimento NAO recebem grant algum para anon/authenticated.
-- Elas so sao alcancaveis pelo servidor. Endereco exato, valores e dados
-- financeiros nunca trafegam por consulta feita no navegador.


-- ---------------------------------------------------------------------------
-- 5. Dados iniciais
-- ---------------------------------------------------------------------------

-- Taxas em basis points (1 bps = 0,01%). 200 bps = 2%.
-- Ficam no banco, e nao no codigo, para que mudar taxa nao exija deploy e para
-- que cada mudanca fique registrada em audit_logs.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('fees.renter_fee_bps', '200'::jsonb,
   'Taxa cobrada de quem aluga, sobre o valor do aluguel. 200 = 2%.', true),
  ('fees.owner_fee_bps', '200'::jsonb,
   'Taxa retida de quem recebe, sobre o valor do aluguel. 200 = 2%.', true),
  ('booking.min_rent_cents', '5000'::jsonb,
   'Aluguel minimo aceito (R$ 50,00). Abaixo disso a tarifa do gateway supera a receita.', true),
  ('booking.billing_day_default', '5'::jsonb,
   'Dia padrao de vencimento mensal.', false),
  ('booking.max_failed_cycles', '2'::jsonb,
   'Ciclos seguidos com falha antes de suspender a locacao.', false),
  ('privacy.approx_location_meters', '300'::jsonb,
   'Raio do deslocamento aplicado ao ponto publico no mapa.', false)
ON CONFLICT (key) DO NOTHING;$mp_1_52$;

    EXECUTE $mp_1_53$INSERT INTO public.features (key, label, category, icon, applies_to, sort_order) VALUES
  ('coberto',          'Coberto',                'estrutura', 'Umbrella',      '{garagem,vaga_carro,vaga_moto,deposito,galpao,terreno}', 10),
  ('fechado',          'Fechado / trancado',     'seguranca', 'Lock',          '{garagem,deposito,galpao,sala,escritorio,loja,quarto}', 20),
  ('portao',           'Portao',                 'acesso',    'DoorClosed',    '{garagem,vaga_carro,vaga_moto,deposito,galpao,terreno}', 30),
  ('acesso_24h',       'Acesso 24 horas',        'acesso',    'Clock',         '{}', 40),
  ('camera',           'Camera de seguranca',    'seguranca', 'Cctv',          '{}', 50),
  ('alarme',           'Alarme',                 'seguranca', 'BellRing',      '{}', 60),
  ('portaria',         'Portaria / vigilancia',  'seguranca', 'ShieldCheck',   '{}', 70),
  ('iluminacao',       'Iluminacao',             'estrutura', 'Lightbulb',     '{}', 80),
  ('energia',          'Tomada / energia',       'estrutura', 'Zap',           '{garagem,deposito,galpao,sala,escritorio,loja,quarto}', 90),
  ('agua',             'Agua',                   'estrutura', 'Droplets',      '{galpao,sala,escritorio,loja,terreno}', 100),
  ('banheiro',         'Banheiro',               'estrutura', 'Bath',          '{galpao,sala,escritorio,loja,deposito}', 110),
  ('seco_ventilado',   'Seco e ventilado',       'estrutura', 'Wind',          '{deposito,galpao,quarto,sala}', 120),
  ('piso_concreto',    'Piso de concreto',       'estrutura', 'Grid3x3',       '{garagem,deposito,galpao,terreno}', 130),
  ('acesso_carro',     'Acesso para carro',      'veiculo',   'Car',           '{garagem,vaga_carro,deposito,galpao,terreno}', 140),
  ('acesso_moto',      'Acesso para moto',       'veiculo',   'Bike',          '{garagem,vaga_carro,vaga_moto,deposito}', 150),
  ('acesso_caminhao',  'Acesso para caminhao',   'veiculo',   'Truck',         '{galpao,terreno,deposito}', 160),
  ('carga_descarga',   'Area de carga e descarga','veiculo',  'PackageOpen',   '{galpao,loja,deposito,terreno}', 170),
  ('elevador',         'Elevador',               'acesso',    'MoveVertical',  '{sala,escritorio,loja,deposito,quarto}', 180),
  ('terreo',           'Terreo',                 'acesso',    'ArrowDownToLine','{sala,escritorio,loja,deposito,galpao}', 190),
  ('mobiliado',        'Mobiliado',              'estrutura', 'Armchair',      '{sala,escritorio,loja,quarto}', 200)
ON CONFLICT (key) DO NOTHING;$mp_1_53$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('382e101b16729861ed66e094696d3c9343393545caeb961b1fecb110ab01d654', 1789587488214);

    RAISE NOTICE 'Migracao 1 (0001_integridade_indices_e_rls) aplicada.';
  END IF;
END
$mp_bloco_1$;


-- ----------------------------------------------------------------------------
-- Migracao 2: 0002_great_harpoon  (34 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_2$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '4eae0bd8ab6cc5b1e9e8c137bb1df60a5e03825acfe0b60aebb8e4e795f27d05'
  ) THEN
    RAISE NOTICE 'Migracao 2 (0002_great_harpoon) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_2_0$CREATE TYPE "public"."report_severity" AS ENUM('low', 'normal', 'high', 'critical');$mp_2_0$;

    EXECUTE $mp_2_1$CREATE TYPE "public"."report_target" AS ENUM('space', 'user', 'message');$mp_2_1$;

    EXECUTE $mp_2_2$CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_distinct" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id"),
	CONSTRAINT "user_blocks_reason_max" CHECK ("user_blocks"."reason" IS NULL OR length("user_blocks"."reason") <= 500)
);$mp_2_2$;

    EXECUTE $mp_2_3$ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE text;$mp_2_3$;

    EXECUTE $mp_2_4$DROP TYPE "public"."report_reason";$mp_2_4$;

    EXECUTE $mp_2_5$CREATE TYPE "public"."report_reason" AS ENUM('anuncio_falso', 'endereco_incorreto', 'preco_enganoso', 'espaco_inexistente', 'fraude', 'golpe_pagamento', 'pagamento_fora_plataforma', 'assedio', 'discurso_odio', 'ameaca', 'identidade_falsa', 'conteudo_inadequado', 'spam', 'atividade_proibida', 'nao_compareceu', 'dano_ao_espaco', 'uso_indevido_do_espaco', 'outro');$mp_2_5$;

    EXECUTE $mp_2_6$ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE "public"."report_reason" USING "reason"::"public"."report_reason";$mp_2_6$;

    EXECUTE $mp_2_7$DROP INDEX "reports_status_idx";$mp_2_7$;

    EXECUTE $mp_2_8$DROP INDEX "reports_one_open_per_reporter";$mp_2_8$;

    EXECUTE $mp_2_9$ALTER TABLE "reports" ALTER COLUMN "space_id" DROP NOT NULL;$mp_2_9$;

    EXECUTE $mp_2_10$ALTER TABLE "profiles" ADD COLUMN "upheld_report_count" integer DEFAULT 0 NOT NULL;$mp_2_10$;

    EXECUTE $mp_2_11$ALTER TABLE "messages" ADD COLUMN "flagged_at" timestamp with time zone;$mp_2_11$;

    EXECUTE $mp_2_12$ALTER TABLE "messages" ADD COLUMN "flag_reason" text;$mp_2_12$;

    EXECUTE $mp_2_13$-- Adicionado com DEFAULT e depois sem: assim a migracao tambem funciona
-- em um banco que ja tenha denuncias gravadas (todas elas eram de anuncio).
ALTER TABLE "reports" ADD COLUMN "target_type" "report_target" NOT NULL DEFAULT 'space';$mp_2_13$;

    EXECUTE $mp_2_14$ALTER TABLE "reports" ALTER COLUMN "target_type" DROP DEFAULT;$mp_2_14$;

    EXECUTE $mp_2_15$ALTER TABLE "reports" ADD COLUMN "target_user_id" uuid;$mp_2_15$;

    EXECUTE $mp_2_16$ALTER TABLE "reports" ADD COLUMN "message_id" uuid;$mp_2_16$;

    EXECUTE $mp_2_17$ALTER TABLE "reports" ADD COLUMN "severity" "report_severity" DEFAULT 'normal' NOT NULL;$mp_2_17$;

    EXECUTE $mp_2_18$ALTER TABLE "reports" ADD COLUMN "evidence_snapshot" jsonb;$mp_2_18$;

    EXECUTE $mp_2_19$ALTER TABLE "reports" ADD COLUMN "upheld" boolean;$mp_2_19$;

    EXECUTE $mp_2_20$ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_2_20$;

    EXECUTE $mp_2_21$ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_2_21$;

    EXECUTE $mp_2_22$CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");$mp_2_22$;

    EXECUTE $mp_2_23$ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_2_23$;

    EXECUTE $mp_2_24$ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;$mp_2_24$;

    EXECUTE $mp_2_25$CREATE INDEX "messages_flagged_idx" ON "messages" USING btree ("flagged_at") WHERE flagged_at IS NOT NULL AND hidden_at IS NULL;$mp_2_25$;

    EXECUTE $mp_2_26$CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");$mp_2_26$;

    EXECUTE $mp_2_27$CREATE INDEX "reports_message_idx" ON "reports" USING btree ("message_id");$mp_2_27$;

    EXECUTE $mp_2_28$CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");$mp_2_28$;

    EXECUTE $mp_2_29$CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","severity","created_at") WHERE status IN ('open','reviewing');$mp_2_29$;

    EXECUTE $mp_2_30$CREATE UNIQUE INDEX "reports_one_open_per_target" ON "reports" USING btree ("reporter_id","target_type",COALESCE(space_id, target_user_id, message_id)) WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;$mp_2_30$;

    EXECUTE $mp_2_31$ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches_type" CHECK (("reports"."target_type" = 'space'   AND "reports"."space_id" IS NOT NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'user'    AND "reports"."target_user_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'message' AND "reports"."message_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL));$mp_2_31$;

    EXECUTE $mp_2_32$ALTER TABLE "reports" ADD CONSTRAINT "reports_no_self_report" CHECK ("reports"."target_user_id" IS NULL OR "reports"."reporter_id" IS NULL OR "reports"."target_user_id" <> "reports"."reporter_id");$mp_2_32$;

    EXECUTE $mp_2_33$ALTER TABLE "reports" ADD CONSTRAINT "reports_details_max" CHECK ("reports"."details" IS NULL OR length("reports"."details") <= 2000);$mp_2_33$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('4eae0bd8ab6cc5b1e9e8c137bb1df60a5e03825acfe0b60aebb8e4e795f27d05', 1789589651338);

    RAISE NOTICE 'Migracao 2 (0002_great_harpoon) aplicada.';
  END IF;
END
$mp_bloco_2$;


-- ----------------------------------------------------------------------------
-- Migracao 3: 0003_seguranca_e_taxas  (22 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_3$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '68dd2c46d7208ea381d1622ebe11d4d30f472f8e0e3039a4280aa1dda8561d36'
  ) THEN
    RAISE NOTICE 'Migracao 3 (0003_seguranca_e_taxas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_3_0$-- ============================================================================
-- MyPlace — sistemas de seguranca interna + novas taxas
--
--   1. Bloqueio entre usuarios, garantido por trigger
--   2. Reincidencia: contagem de denuncias procedentes
--   3. Snapshot de evidencia (o conteudo denunciado nao some)
--   4. RLS das tabelas novas
--   5. Taxas 3% + 3% e aluguel minimo de R$ 35,00
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Bloqueio entre usuarios
--
-- O bloqueio e enforcado por TRIGGER, e nao so por RLS ou pelo codigo da
-- aplicacao, porque o servidor usa conexao privilegiada e ignora RLS. Trigger
-- pega os dois caminhos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;$mp_3_0$;

    EXECUTE $mp_3_1$-- Conversa nova entre pessoas que se bloquearam nao nasce.
CREATE OR REPLACE FUNCTION public.guard_conversation_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_between(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel iniciar conversa: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;$mp_3_1$;

    EXECUTE $mp_3_2$CREATE TRIGGER conversations_guard_block
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_block();$mp_3_2$;

    EXECUTE $mp_3_3$-- E conversa antiga para de receber mensagem se o bloqueio vier depois.
CREATE OR REPLACE FUNCTION public.guard_message_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE c record;
BEGIN
  SELECT renter_id, owner_id, closed_at INTO c
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa % nao existe', NEW.conversation_id;
  END IF;

  IF c.closed_at IS NOT NULL AND NEW.is_system = false THEN
    RAISE EXCEPTION 'Esta conversa esta encerrada' USING ERRCODE = 'check_violation';
  END IF;

  -- Mensagem do sistema ("reserva cancelada") continua passando: ela informa,
  -- nao e contato entre as pessoas.
  IF NEW.is_system = false AND public.is_blocked_between(c.renter_id, c.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel enviar mensagem: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;

  -- O remetente tem que ser parte da conversa.
  IF NEW.is_system = false AND NEW.sender_id NOT IN (c.renter_id, c.owner_id) THEN
    RAISE EXCEPTION 'Remetente nao participa desta conversa'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;$mp_3_3$;

    EXECUTE $mp_3_4$CREATE TRIGGER messages_guard_block
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_block();$mp_3_4$;

    EXECUTE $mp_3_5$-- Bloqueio tambem impede reserva — senao contorna-se o bloqueio alugando.
CREATE OR REPLACE FUNCTION public.guard_booking_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_between(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel reservar: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;$mp_3_5$;

    EXECUTE $mp_3_6$CREATE TRIGGER bookings_guard_block
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_block();$mp_3_6$;

    EXECUTE $mp_3_7$-- Bloquear encerra a conversa existente entre as duas pessoas. Sem isso, a
-- thread continuaria aberta na tela das duas, sugerindo que da para responder.
CREATE OR REPLACE FUNCTION public.close_conversations_on_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET closed_at = now()
  WHERE closed_at IS NULL
    AND ((renter_id = NEW.blocker_id AND owner_id = NEW.blocked_id)
      OR (renter_id = NEW.blocked_id AND owner_id = NEW.blocker_id));
  RETURN NEW;
END;
$$;$mp_3_7$;

    EXECUTE $mp_3_8$CREATE TRIGGER user_blocks_close_conversations
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.close_conversations_on_block();$mp_3_8$;

    EXECUTE $mp_3_9$-- ---------------------------------------------------------------------------
-- 2. Reincidencia
--
-- Quando o moderador resolve uma denuncia como procedente, o contador do
-- denunciado sobe. E o que permite aplicar politica de suspensao sem varrer a
-- tabela de denuncias a cada acao.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE alvo uuid;
BEGIN
  -- Para denuncia de anuncio ou mensagem, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  UPDATE public.profiles p
  SET upheld_report_count = (
    SELECT COUNT(*)
    FROM public.reports r
    WHERE r.upheld = true
      AND COALESCE(
            r.target_user_id,
            (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
            (SELECT sender_id FROM public.messages WHERE id = r.message_id)
          ) = alvo
  )
  WHERE p.id = alvo;

  RETURN NEW;
END;
$$;$mp_3_9$;

    EXECUTE $mp_3_10$CREATE TRIGGER reports_refresh_upheld_count
  AFTER INSERT OR UPDATE OF upheld ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.refresh_upheld_report_count();$mp_3_10$;

    EXECUTE $mp_3_11$-- ---------------------------------------------------------------------------
-- 3. Evidencia
--
-- Guarda o conteudo denunciado no momento da denuncia. Conteudo denunciado e
-- exatamente o que costuma ser editado ou apagado logo depois; sem a copia, o
-- moderador recebe um caso sem o que julgar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.evidence_snapshot IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.target_type = 'message' THEN
    SELECT jsonb_build_object(
             'body', m.body,
             'sender_id', m.sender_id,
             'conversation_id', m.conversation_id,
             'sent_at', m.created_at,
             'flag_reason', m.flag_reason)
      INTO NEW.evidence_snapshot
      FROM public.messages m WHERE m.id = NEW.message_id;

  ELSIF NEW.target_type = 'space' THEN
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

  ELSIF NEW.target_type = 'user' THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'role', p.role,
             'status', p.status,
             'member_since', p.created_at,
             'upheld_report_count', p.upheld_report_count)
      INTO NEW.evidence_snapshot
      FROM public.profiles p WHERE p.id = NEW.target_user_id;
  END IF;

  RETURN NEW;
END;
$$;$mp_3_11$;

    EXECUTE $mp_3_12$CREATE TRIGGER reports_capture_evidence
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_report_evidence();$mp_3_12$;

    EXECUTE $mp_3_13$-- ---------------------------------------------------------------------------
-- 4. RLS das tabelas novas
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;$mp_3_13$;

    EXECUTE $mp_3_14$-- A pessoa gerencia a propria lista de bloqueios. Ninguem consulta a lista de
-- outra pessoa — nem para saber se foi bloqueado.
CREATE POLICY "user_blocks_manage_own" ON public.user_blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());$mp_3_14$;

    EXECUTE $mp_3_15$GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;$mp_3_15$;

    EXECUTE $mp_3_16$-- Denuncia: quem denunciou acompanha a propria denuncia. Ninguem ve denuncia
-- feita contra si — saber quem denunciou e o caminho mais curto para retaliacao.
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());$mp_3_16$;

    EXECUTE $mp_3_17$GRANT SELECT ON public.reports TO authenticated;$mp_3_17$;

    EXECUTE $mp_3_18$-- INSERT de denuncia passa pelo servidor (que valida motivo, severidade,
-- limites e captura evidencia). Nao ha grant de INSERT para o navegador.


-- ---------------------------------------------------------------------------
-- 5. Taxas e limites
--
-- Mudanca de 2%+2% para 3%+3%, e aluguel minimo de R$ 50,00 para R$ 35,00.
--
-- IMPORTANTE: isto NAO altera reserva nenhuma ja existente. Cada reserva
-- guarda as taxas vigentes no momento do aceite (bookings.renter_fee_bps e
-- owner_fee_bps), entao contrato em andamento segue com o que foi combinado.
-- ---------------------------------------------------------------------------

UPDATE public.platform_settings
SET value = '300'::jsonb,
    description = 'Taxa cobrada de quem aluga, sobre o valor do aluguel. 300 = 3%.',
    updated_at = now()
WHERE key = 'fees.renter_fee_bps';$mp_3_18$;

    EXECUTE $mp_3_19$UPDATE public.platform_settings
SET value = '300'::jsonb,
    description = 'Taxa retida de quem recebe, sobre o valor do aluguel. 300 = 3%.',
    updated_at = now()
WHERE key = 'fees.owner_fee_bps';$mp_3_19$;

    EXECUTE $mp_3_20$UPDATE public.platform_settings
SET value = '3500'::jsonb,
    description = 'Aluguel minimo aceito (R$ 35,00). Ponto de equilibrio a 3%+3% e R$ 33,17 no Pix.',
    updated_at = now()
WHERE key = 'booking.min_rent_cents';$mp_3_20$;

    EXECUTE $mp_3_21$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('safety.flag_contact_info', 'true'::jsonb,
   'Sinalizar mensagens com telefone, e-mail ou chave Pix. Sinaliza e avisa; nao bloqueia o envio.', false),
  ('safety.auto_review_upheld_threshold', '3'::jsonb,
   'Denuncias procedentes ate a conta entrar em revisao obrigatoria.', false),
  ('safety.auto_suspend_upheld_threshold', '5'::jsonb,
   'Denuncias procedentes ate a suspensao automatica da conta.', false),
  ('safety.max_reports_per_day', '10'::jsonb,
   'Denuncias que um usuario pode abrir por dia. Evita uso da denuncia como assedio.', false),
  ('safety.reveal_address_on_status', '"active"'::jsonb,
   'Status de reserva a partir do qual o endereco completo e revelado ao locatario.', true)
ON CONFLICT (key) DO NOTHING;$mp_3_21$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('68dd2c46d7208ea381d1622ebe11d4d30f472f8e0e3039a4280aa1dda8561d36', 1789589723620);

    RAISE NOTICE 'Migracao 3 (0003_seguranca_e_taxas) aplicada.';
  END IF;
END
$mp_bloco_3$;


-- ----------------------------------------------------------------------------
-- Migracao 4: 0004_wooden_newton_destine  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_4$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '96592144990223f2cf1788744beaf61c87564fd2bf0cc6d0f8bcf0cb63143fbc'
  ) THEN
    RAISE NOTICE 'Migracao 4 (0004_wooden_newton_destine) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_4_0$ALTER TABLE "profiles" ADD COLUMN "document_verified_at" timestamp with time zone;$mp_4_0$;

    EXECUTE $mp_4_1$ALTER TABLE "profiles" ADD COLUMN "completed_bookings_count" integer DEFAULT 0 NOT NULL;$mp_4_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('96592144990223f2cf1788744beaf61c87564fd2bf0cc6d0f8bcf0cb63143fbc', 1789590971572);

    RAISE NOTICE 'Migracao 4 (0004_wooden_newton_destine) aplicada.';
  END IF;
END
$mp_bloco_4$;


-- ----------------------------------------------------------------------------
-- Migracao 5: 0005_contagem_de_locacoes  (5 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_5$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ba4b6dce37e7099fa96fcfb10035f80c5356897e7b9924cf158cda6769078131'
  ) THEN
    RAISE NOTICE 'Migracao 5 (0005_contagem_de_locacoes) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_5_0$-- ============================================================================
-- Contagem de locacoes concluidas
--
-- Conta os dois lados: quem alugou e quem foi alugado. Uma locacao que chegou
-- ao fim e sinal de confianca para ambos.
--
-- Este numero existe por uma razao de produto, nao so de exibicao: e a
-- reputacao que a pessoa perde ao sair da plataforma. Aviso nao segura
-- ninguem; historico construido aqui, sim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_completed_bookings_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE pessoa uuid;
BEGIN
  FOREACH pessoa IN ARRAY ARRAY[
    COALESCE(NEW.renter_id, OLD.renter_id),
    COALESCE(NEW.owner_id, OLD.owner_id)
  ] LOOP
    UPDATE public.profiles p
    SET completed_bookings_count = (
      SELECT COUNT(*)
      FROM public.bookings b
      WHERE b.status = 'ended'
        AND (b.renter_id = pessoa OR b.owner_id = pessoa)
    )
    WHERE p.id = pessoa;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;$mp_5_0$;

    EXECUTE $mp_5_1$-- Dispara so quando o status muda: UPDATE de qualquer outra coluna nao
-- precisa recontar nada.
CREATE TRIGGER bookings_refresh_completed_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_completed_bookings_count();$mp_5_1$;

    EXECUTE $mp_5_2$-- A view publica de perfil ganha os sinais de confianca. Nada aqui e sensivel:
-- sao exatamente os dados que ajudam alguem a decidir se confia na outra parte.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id,
         full_name,
         avatar_path,
         created_at,
         phone_verified_at IS NOT NULL AS phone_verified,
         document_verified_at IS NOT NULL AS document_verified,
         completed_bookings_count
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;$mp_5_2$;

    EXECUTE $mp_5_3$GRANT SELECT ON public.public_profiles TO anon, authenticated;$mp_5_3$;

    EXECUTE $mp_5_4$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('safety.visit_before_booking', 'true'::jsonb,
   'Recomendar visita ao espaco antes de fechar a reserva.', true),
  ('safety.protection_copy_version', '"2026-09-16"'::jsonb,
   'Versao do texto de protecao exibido. Muda quando a politica muda.', true)
ON CONFLICT (key) DO NOTHING;$mp_5_4$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ba4b6dce37e7099fa96fcfb10035f80c5356897e7b9924cf158cda6769078131', 1789590989707);

    RAISE NOTICE 'Migracao 5 (0005_contagem_de_locacoes) aplicada.';
  END IF;
END
$mp_bloco_5$;


-- ----------------------------------------------------------------------------
-- Migracao 6: 0006_uneven_quasimodo  (4 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_6$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '81a0621ea17b81a45b9dc8bbcbda00818637c564fe91ef6404bd327ad9febba6'
  ) THEN
    RAISE NOTICE 'Migracao 6 (0006_uneven_quasimodo) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_6_0$ALTER TABLE "profiles" ADD COLUMN "city" text;$mp_6_0$;

    EXECUTE $mp_6_1$ALTER TABLE "profiles" ADD COLUMN "state" text;$mp_6_1$;

    EXECUTE $mp_6_2$ALTER TABLE "spaces" ADD COLUMN "available_from" date;$mp_6_2$;

    EXECUTE $mp_6_3$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_published_requires_complete" CHECK ("spaces"."status" NOT IN ('published','rented') OR (
            "spaces"."city" IS NOT NULL AND length(trim("spaces"."city")) > 0
            AND "spaces"."state" IS NOT NULL AND length(trim("spaces"."state")) = 2
            AND "spaces"."district" IS NOT NULL AND length(trim("spaces"."district")) > 0
            AND length(trim("spaces"."title")) >= 10
            AND "spaces"."description" IS NOT NULL AND length(trim("spaces"."description")) >= 20
            AND "spaces"."available_from" IS NOT NULL
          ));$mp_6_3$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('81a0621ea17b81a45b9dc8bbcbda00818637c564fe91ef6404bd327ad9febba6', 1789606858948);

    RAISE NOTICE 'Migracao 6 (0006_uneven_quasimodo) aplicada.';
  END IF;
END
$mp_bloco_6$;


-- ----------------------------------------------------------------------------
-- Migracao 7: 0007_localizacao_aproximada  (6 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_7$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '41ec89beb8492b6cc04655fbe58856892fa0b0aa7835965295199279dd42ee8c'
  ) THEN
    RAISE NOTICE 'Migracao 7 (0007_localizacao_aproximada) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_7_0$-- ============================================================================
-- Localizacao aproximada, calculada pelo banco
--
-- O requisito de privacidade diz que o ponto exato nunca aparece em mapa
-- publico. Ate aqui isso dependia da aplicacao lembrar de preencher duas
-- colunas. Agora e o banco que garante: gravou `location`, ganhou
-- `approx_location` automaticamente.
--
-- Por que o deslocamento e DETERMINISTICO (derivado do id do espaco) e nao
-- sorteado: ponto sorteado a cada gravacao muda de lugar a cada visita da
-- pagina, e quem cruzar algumas leituras consegue triangular o centro real.
-- Deslocamento fixo por espaco nao vaza nada com repeticao.
-- ============================================================================

SET search_path = public, extensions;$mp_7_0$;

    EXECUTE $mp_7_1$CREATE OR REPLACE FUNCTION public.fuzz_location(
  exact_point geometry,
  seed uuid,
  radius_m integer DEFAULT 300
)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN exact_point IS NULL THEN NULL
    ELSE ST_Project(
      exact_point::geography,
      -- Distancia entre 40% e 100% do raio. Nunca 0: deslocamento nulo
      -- entregaria o ponto exato de quem calhasse de cair no zero.
      radius_m * (0.4 + 0.6 * ((abs(hashtext(seed::text)) % 1000)::double precision / 1000.0)),
      -- Azimute derivado de um hash DIFERENTE, senao distancia e direcao
      -- ficariam correlacionadas e o padrao seria reversivel.
      radians((abs(hashtext(seed::text || ':azimute')) % 360)::double precision)
    )::geometry
  END
$$;$mp_7_1$;

    EXECUTE $mp_7_2$CREATE OR REPLACE FUNCTION public.sync_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE raio integer;
BEGIN
  IF NEW.location IS NULL THEN
    NEW.approx_location := NULL;
    RETURN NEW;
  END IF;

  -- So recalcula quando o ponto exato muda. Assim o deslocamento de um anuncio
  -- publicado nao "pula" a cada edicao de titulo ou preco.
  IF TG_OP = 'UPDATE'
     AND OLD.location IS NOT NULL
     AND ST_Equals(OLD.location, NEW.location)
     AND NEW.approx_location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 300) INTO raio
  FROM public.platform_settings WHERE key = 'privacy.approx_location_meters';

  NEW.approx_location := public.fuzz_location(NEW.location, NEW.id, COALESCE(raio, 300));
  RETURN NEW;
END;
$$;$mp_7_2$;

    EXECUTE $mp_7_3$CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();$mp_7_3$;

    EXECUTE $mp_7_4$-- Preenche o que ja existir (em banco novo nao faz nada).
UPDATE public.spaces
SET approx_location = public.fuzz_location(location, id, 300)
WHERE location IS NOT NULL AND approx_location IS NULL;$mp_7_4$;

    EXECUTE $mp_7_5$-- Indice para a listagem publica: publicados, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "spaces_public_listing_idx"
  ON public.spaces (published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;$mp_7_5$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('41ec89beb8492b6cc04655fbe58856892fa0b0aa7835965295199279dd42ee8c', 1789606885331);

    RAISE NOTICE 'Migracao 7 (0007_localizacao_aproximada) aplicada.';
  END IF;
END
$mp_bloco_7$;


-- ----------------------------------------------------------------------------
-- Migracao 8: 0008_late_zeigeist  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_8$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '49ab5242cf89c4ca47e902ad1870f1349a6ad1966d94fd267ebc52fc1e2d0178'
  ) THEN
    RAISE NOTICE 'Migracao 8 (0008_late_zeigeist) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_8_0$ALTER TABLE "space_images" ADD COLUMN "thumb_path" text;$mp_8_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('49ab5242cf89c4ca47e902ad1870f1349a6ad1966d94fd267ebc52fc1e2d0178', 1789662093309);

    RAISE NOTICE 'Migracao 8 (0008_late_zeigeist) aplicada.';
  END IF;
END
$mp_bloco_8$;


-- ----------------------------------------------------------------------------
-- Migracao 9: 0009_fotos_e_storage  (11 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_9$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '4401e244007763ce3ae67f910d4179f32c196911d9bf9427a195cf1ed5e32eac'
  ) THEN
    RAISE NOTICE 'Migracao 9 (0009_fotos_e_storage) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_9_0$-- ============================================================================
-- Fotos: regra de publicacao no banco, e o Storage trancado por dono
--
-- Duas coisas que estavam so no codigo passam a ser garantidas pelo banco:
--
--  1. Anuncio publicado precisa de um minimo de fotos. Antes, um UPDATE
--     manual no painel ou um caminho novo na aplicacao conseguia publicar
--     anuncio sem foto nenhuma.
--
--  2. Cada usuario mexe apenas na SUA pasta dentro do bucket de fotos.
--     A aplicacao ja checa o dono antes de qualquer upload (ver
--     src/lib/storage/actions.ts), mas essa checagem e codigo: se um dia
--     alguem escrever uma tela que fala com o Storage direto do navegador,
--     a politica abaixo e o que continua segurando.
-- ============================================================================

-- `ADD CONSTRAINT` nao aceita IF NOT EXISTS para CHECK, entao a checagem e
-- explicita: assim rodar de novo nao estoura em "constraint already exists".
DO $mp_check_pos$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_images_position_positive'
  ) THEN
    ALTER TABLE public.space_images
      ADD CONSTRAINT space_images_position_positive CHECK (position >= 0);
  END IF;
END $mp_check_pos$;$mp_9_0$;

    EXECUTE $mp_9_1$-- ---------------------------------------------------------------------------
-- 1. Minimo de fotos para publicar
-- ---------------------------------------------------------------------------

-- O numero vive em platform_settings, junto das taxas: mudar exigencia de
-- catalogo nao pode precisar de migracao nova.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('space.min_photos_to_publish', '3'::jsonb,
   'Minimo de fotos para um anuncio ser publicado. Recomendacao na interface e 5.', true)
ON CONFLICT (key) DO NOTHING;$mp_9_1$;

    EXECUTE $mp_9_2$CREATE OR REPLACE FUNCTION public.min_photos_to_publish()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings
      WHERE key = 'space.min_photos_to_publish'),
    3
  )
$$;$mp_9_2$;

    EXECUTE $mp_9_3$CREATE OR REPLACE FUNCTION public.guard_publish_requires_photos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  quantas integer;
BEGIN
  -- So interessa a transicao PARA publicado. Rascunho pode ter zero foto.
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO quantas FROM public.space_images WHERE space_id = NEW.id;

  IF quantas < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado precisa de pelo menos % fotos (tem %)', minimo, quantas
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;$mp_9_3$;

    EXECUTE $mp_9_4$DROP TRIGGER IF EXISTS spaces_publish_requires_photos ON public.spaces;$mp_9_4$;

    EXECUTE $mp_9_5$CREATE TRIGGER spaces_publish_requires_photos
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_photos();$mp_9_5$;

    EXECUTE $mp_9_6$-- Apagar foto de anuncio publicado nao pode derrubar o anuncio abaixo do
-- minimo: o anuncio continuaria no ar, mais pobre, sem ninguem perceber.
CREATE OR REPLACE FUNCTION public.guard_delete_photo_of_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  situacao space_status;
  restantes integer;
BEGIN
  SELECT status INTO situacao FROM public.spaces WHERE id = OLD.space_id;

  -- Anuncio sendo apagado em cascata: nao ha o que proteger.
  IF situacao IS NULL OR situacao <> 'published' THEN
    RETURN OLD;
  END IF;

  SELECT count(*) - 1 INTO restantes
    FROM public.space_images WHERE space_id = OLD.space_id;

  IF restantes < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado ficaria com % fotos, abaixo do minimo de %', restantes, minimo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;$mp_9_6$;

    EXECUTE $mp_9_7$DROP TRIGGER IF EXISTS space_images_keep_minimum ON public.space_images;$mp_9_7$;

    EXECUTE $mp_9_8$CREATE TRIGGER space_images_keep_minimum
  BEFORE DELETE ON public.space_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_delete_photo_of_published();$mp_9_8$;

    EXECUTE $mp_9_9$-- ---------------------------------------------------------------------------
-- 2. Bucket de fotos e politicas do Storage
--
-- Roda so onde existe o Storage do Supabase (schema `storage`). Em Postgres
-- puro — desenvolvimento e testes — o bloco avisa e segue: nao ha Storage
-- para configurar, e falhar aqui impediria de rodar a migracao localmente.
-- ---------------------------------------------------------------------------

DO $mp_storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando configuracao do bucket (normal fora do Supabase).';
    RETURN;
  END IF;

  /*
   * Bucket PRIVADO. O acesso a foto e sempre por URL assinada, com validade
   * curta, gerada no servidor. Nao existe URL publica permanente.
   *
   * O bloco interno existe porque `storage.buckets` pertence ao papel
   * supabase_storage_admin. Se o papel que roda este SQL nao tiver privilegio,
   * a migracao NAO pode falhar por causa disso — ela avisa e segue, e a
   * configuracao se faz pelo painel.
   */
  BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'space-images', 'space-images', false, 8388608,
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 8388608,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

    RAISE NOTICE 'Bucket space-images configurado: privado, 8 MB, jpeg/png/webp.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para configurar o bucket por SQL. Faca no painel: Storage > space-images > Settings (privado, 8 MB, image/jpeg,image/png,image/webp).';
  END;
END $mp_storage$;$mp_9_9$;

    EXECUTE $mp_9_10$DO $mp_storage_pol$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando politicas do Storage.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Papel authenticated ausente — pulando politicas do Storage.';
    RETURN;
  END IF;

  /*
   * O caminho do arquivo e `<owner_id>/<space_id>/<uuid>.<ext>`, montado por
   * buildImagePath() em src/lib/storage/images.ts. A primeira pasta ser o id
   * do dono e o que permite escrever a regra aqui: cada um mexe no que esta
   * embaixo do proprio id, e em nada mais.
   *
   * Nao existe politica para o papel `anon`: visitante nao lista, nao le e
   * nao escreve nada no bucket. Quem le foto de anuncio publicado le pela
   * URL assinada que o servidor gera.
   */
  BEGIN
    EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_le ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY space_images_dono_le ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'space-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )$pol$;

    EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_envia ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY space_images_dono_envia ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'space-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )$pol$;

    EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_substitui ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY space_images_dono_substitui ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'space-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'space-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )$pol$;

    EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_apaga ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY space_images_dono_apaga ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'space-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )$pol$;

    RAISE NOTICE 'Politicas do bucket space-images aplicadas (4 politicas, por pasta do dono).';

  /*
   * Mesma razao do bloco do bucket: `storage.objects` nao pertence ao papel
   * do SQL Editor em todo projeto. Sem privilegio, avisamos o que fazer no
   * painel em vez de derrubar a migracao inteira — e vale lembrar que a
   * autorizacao de verdade esta na aplicacao (src/lib/storage/actions.ts).
   * Estas politicas sao a segunda tranca.
   */
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para criar politica em storage.objects. Crie no painel (Storage > Policies) restringindo cada usuario a pasta (storage.foldername(name))[1] = auth.uid()::text. Detalhes em docs/SETUP.md secao 1.5.';
  END;
END $mp_storage_pol$;$mp_9_10$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('4401e244007763ce3ae67f910d4179f32c196911d9bf9427a195cf1ed5e32eac', 1789677839915);

    RAISE NOTICE 'Migracao 9 (0009_fotos_e_storage) aplicada.';
  END IF;
END
$mp_bloco_9$;


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


-- ----------------------------------------------------------------------------
-- Migracao 25: 0025_chemical_marrow  (43 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_25$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'd36311c02b67aecf12887584441dc31e6a544f1440d27d8e3114151f13d3c7cf'
  ) THEN
    RAISE NOTICE 'Migracao 25 (0025_chemical_marrow) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_25_0$CREATE TYPE "public"."availability_block_reason" AS ENUM('manutencao', 'uso_proprio', 'viagem', 'outro');$mp_25_0$;

    EXECUTE $mp_25_1$CREATE TYPE "public"."listing_suggestion_status" AS ENUM('ready', 'partially_applied', 'applied', 'dismissed', 'failed');$mp_25_1$;

    EXECUTE $mp_25_2$CREATE TYPE "public"."saved_search_status" AS ENUM('active', 'paused');$mp_25_2$;

    EXECUTE $mp_25_3$CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'left', 'closed');$mp_25_3$;

    EXECUTE $mp_25_4$ALTER TYPE "public"."notification_category" ADD VALUE 'alertas';$mp_25_4$;

    EXECUTE $mp_25_5$ALTER TYPE "public"."notification_type" ADD VALUE 'waitlist_available';$mp_25_5$;

    EXECUTE $mp_25_6$ALTER TYPE "public"."notification_type" ADD VALUE 'saved_search_match';$mp_25_6$;

    EXECUTE $mp_25_7$ALTER TYPE "public"."notification_type" ADD VALUE 'monthly_report';$mp_25_7$;

    EXECUTE $mp_25_8$CREATE TABLE "ai_usage_counters" (
	"day" date NOT NULL,
	"feature" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_counters_day_feature_pk" PRIMARY KEY("day","feature"),
	CONSTRAINT "ai_usage_counters_calls_non_negative" CHECK ("ai_usage_counters"."calls" >= 0)
);$mp_25_8$;

    EXECUTE $mp_25_9$CREATE TABLE "listing_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "listing_suggestion_status" NOT NULL,
	"model" text,
	"input_snapshot" jsonb NOT NULL,
	"suggestion" jsonb,
	"removed_claims" jsonb,
	"applied_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);$mp_25_9$;

    EXECUTE $mp_25_10$CREATE TABLE "saved_search_matches" (
	"saved_search_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "saved_search_matches_saved_search_id_space_id_pk" PRIMARY KEY("saved_search_id","space_id")
);$mp_25_10$;

    EXECUTE $mp_25_11$CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"status" "saved_search_status" DEFAULT 'active' NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_label_length" CHECK (char_length("saved_searches"."label") BETWEEN 1 AND 160),
	CONSTRAINT "saved_searches_criteria_object" CHECK (jsonb_typeof("saved_searches"."criteria") = 'object')
);$mp_25_11$;

    EXECUTE $mp_25_12$CREATE TABLE "space_availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" "availability_block_reason" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "space_availability_blocks_dates_ordered" CHECK ("space_availability_blocks"."ends_on" >= "space_availability_blocks"."starts_on"),
	CONSTRAINT "space_availability_blocks_max_length" CHECK ("space_availability_blocks"."ends_on" - "space_availability_blocks"."starts_on" <= 366),
	CONSTRAINT "space_availability_blocks_note_length" CHECK ("space_availability_blocks"."note" IS NULL OR char_length("space_availability_blocks"."note") <= 200)
);$mp_25_12$;

    EXECUTE $mp_25_13$CREATE TABLE "space_daily_stats" (
	"space_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_daily_stats_space_id_day_pk" PRIMARY KEY("space_id","day"),
	CONSTRAINT "space_daily_stats_non_negative" CHECK ("space_daily_stats"."views" >= 0 AND "space_daily_stats"."shares" >= 0)
);$mp_25_13$;

    EXECUTE $mp_25_14$CREATE TABLE "space_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"old_price_cents" integer NOT NULL,
	"new_price_cents" integer NOT NULL,
	"changed_by" uuid,
	"space_status" "space_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_price_history_prices_positive" CHECK ("space_price_history"."old_price_cents" > 0 AND "space_price_history"."new_price_cents" > 0),
	CONSTRAINT "space_price_history_real_change" CHECK ("space_price_history"."old_price_cents" <> "space_price_history"."new_price_cents")
);$mp_25_14$;

    EXECUTE $mp_25_15$CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "waitlist_entries_status_dates" CHECK (("waitlist_entries"."status" = 'left') = ("waitlist_entries"."left_at" IS NOT NULL)
          AND ("waitlist_entries"."status" = 'notified') = ("waitlist_entries"."notified_at" IS NOT NULL)
          AND ("waitlist_entries"."status" = 'closed') = ("waitlist_entries"."closed_at" IS NOT NULL))
);$mp_25_15$;

    EXECUTE $mp_25_16$ALTER TABLE "favorites" ADD COLUMN "price_alert" boolean DEFAULT true NOT NULL;$mp_25_16$;

    EXECUTE $mp_25_17$ALTER TABLE "favorites" ADD COLUMN "price_alert_baseline_cents" integer;$mp_25_17$;

    EXECUTE $mp_25_18$ALTER TABLE "favorites" ADD COLUMN "price_alert_notified_at" timestamp with time zone;$mp_25_18$;

    EXECUTE $mp_25_19$ALTER TABLE "listing_suggestions" ADD CONSTRAINT "listing_suggestions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_19$;

    EXECUTE $mp_25_20$ALTER TABLE "listing_suggestions" ADD CONSTRAINT "listing_suggestions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_20$;

    EXECUTE $mp_25_21$ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;$mp_25_21$;

    EXECUTE $mp_25_22$ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_22$;

    EXECUTE $mp_25_23$ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_23$;

    EXECUTE $mp_25_24$ALTER TABLE "space_availability_blocks" ADD CONSTRAINT "space_availability_blocks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_24$;

    EXECUTE $mp_25_25$ALTER TABLE "space_availability_blocks" ADD CONSTRAINT "space_availability_blocks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_25_25$;

    EXECUTE $mp_25_26$ALTER TABLE "space_daily_stats" ADD CONSTRAINT "space_daily_stats_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_26$;

    EXECUTE $mp_25_27$ALTER TABLE "space_price_history" ADD CONSTRAINT "space_price_history_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_27$;

    EXECUTE $mp_25_28$ALTER TABLE "space_price_history" ADD CONSTRAINT "space_price_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_25_28$;

    EXECUTE $mp_25_29$ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_29$;

    EXECUTE $mp_25_30$ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_30$;

    EXECUTE $mp_25_31$CREATE INDEX "listing_suggestions_owner_idx" ON "listing_suggestions" USING btree ("owner_id","created_at");$mp_25_31$;

    EXECUTE $mp_25_32$CREATE INDEX "listing_suggestions_space_idx" ON "listing_suggestions" USING btree ("space_id","created_at");$mp_25_32$;

    EXECUTE $mp_25_33$CREATE INDEX "saved_search_matches_pending_idx" ON "saved_search_matches" USING btree ("saved_search_id","notified_at");$mp_25_33$;

    EXECUTE $mp_25_34$CREATE INDEX "saved_search_matches_space_idx" ON "saved_search_matches" USING btree ("space_id");$mp_25_34$;

    EXECUTE $mp_25_35$CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id","created_at");$mp_25_35$;

    EXECUTE $mp_25_36$CREATE INDEX "saved_searches_status_idx" ON "saved_searches" USING btree ("status");$mp_25_36$;

    EXECUTE $mp_25_37$CREATE INDEX "space_availability_blocks_space_idx" ON "space_availability_blocks" USING btree ("space_id","starts_on");$mp_25_37$;

    EXECUTE $mp_25_38$CREATE INDEX "space_price_history_space_idx" ON "space_price_history" USING btree ("space_id","changed_at");$mp_25_38$;

    EXECUTE $mp_25_39$CREATE UNIQUE INDEX "waitlist_entries_one_waiting_per_user_space" ON "waitlist_entries" USING btree ("user_id","space_id") WHERE status = 'waiting';$mp_25_39$;

    EXECUTE $mp_25_40$CREATE INDEX "waitlist_entries_space_status_idx" ON "waitlist_entries" USING btree ("space_id","status");$mp_25_40$;

    EXECUTE $mp_25_41$CREATE INDEX "waitlist_entries_user_joined_idx" ON "waitlist_entries" USING btree ("user_id","joined_at");$mp_25_41$;

    EXECUTE $mp_25_42$ALTER TABLE "favorites" ADD CONSTRAINT "favorites_price_alert_baseline_positive" CHECK ("favorites"."price_alert_baseline_cents" IS NULL OR "favorites"."price_alert_baseline_cents" > 0);$mp_25_42$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('d36311c02b67aecf12887584441dc31e6a544f1440d27d8e3114151f13d3c7cf', 1790736611137);

    RAISE NOTICE 'Migracao 25 (0025_chemical_marrow) aplicada.';
  END IF;
END
$mp_bloco_25$;


-- ----------------------------------------------------------------------------
-- Migracao 26: 0026_gatilhos_descoberta  (30 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_26$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '3cd55828946dd292e778f592516b46129305aa4dcd21752034fff55fc4e49d09'
  ) THEN
    RAISE NOTICE 'Migracao 26 (0026_gatilhos_descoberta) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_26_0$-- ===========================================================================
-- Fase 23 — gatilhos, travas e permissões das funcionalidades de descoberta,
-- disponibilidade, acompanhamento de preço e desempenho.
--
-- As tabelas em si vêm da 0025 (gerada pelo Drizzle). Aqui fica o que o
-- Drizzle não expressa: triggers, travas de concorrência, RLS, dados
-- existentes que precisam ser corrigidos e os valores iniciais de
-- configuração.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Ocupação real do espaço
--
-- Achado da auditoria desta fase: o status `rented` existia no schema, e a
-- aplicação já o tratava (aba "Alugados", edição restrita, "Alugado no
-- momento" nos favoritos), mas nada o aplicava. Um espaço com aluguel ativo
-- continuava `published`: aparecia na busca como disponível, aceitava
-- solicitações que o índice `bookings_one_active_per_space` impediria de
-- aceitar. Era disponibilidade falsa.
--
-- Agora o banco mantém o status em dia sozinho, a partir da própria reserva:
-- qualquer caminho que mude o status da reserva (aceite, pagamento, webhook,
-- cancelamento, encerramento) leva o anúncio junto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_occupies(s public.booking_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT s IN ('approved', 'awaiting_payment', 'active', 'past_due')
$$;$mp_26_0$;

    EXECUTE $mp_26_1$CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ocupava boolean := TG_OP = 'UPDATE' AND public.booking_occupies(OLD.status);
  ocupa boolean := public.booking_occupies(NEW.status);
BEGIN
  IF ocupa AND NOT ocupava THEN
    -- Só publicado vira alugado. Pausado continua pausado (quem pausou
    -- decidiu tirar do ar); rascunho nunca chega aqui.
    UPDATE public.spaces SET status = 'rented'
     WHERE id = NEW.space_id AND status = 'published';

  ELSIF ocupava AND NOT ocupa THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.space_id = NEW.space_id
         AND b.id <> NEW.id
         AND public.booking_occupies(b.status)
    ) THEN
      BEGIN
        UPDATE public.spaces SET status = 'published'
         WHERE id = NEW.space_id AND status = 'rented';
      EXCEPTION WHEN check_violation THEN
        -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
        -- fotos). O aluguel encerra do mesmo jeito — travar o encerramento
        -- por causa do anúncio seria pior — e o anúncio fica pausado até o
        -- proprietário corrigir.
        UPDATE public.spaces SET status = 'paused'
         WHERE id = NEW.space_id AND status = 'rented';
      END;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;$mp_26_1$;

    EXECUTE $mp_26_2$CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();$mp_26_2$;

    EXECUTE $mp_26_3$-- O caminho inverso também: nenhum anúncio fica `published` enquanto tem
-- reserva vigente — retomar um anúncio pausado, ou republicar depois de
-- editar a descrição de um espaço alugado, volta para `rented`.
CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.id AND public.booking_occupies(b.status)
  ) THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;$mp_26_3$;

    EXECUTE $mp_26_4$CREATE TRIGGER spaces_published_not_occupied
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_not_occupied();$mp_26_4$;

    EXECUTE $mp_26_5$-- Dados existentes: publicado com reserva vigente passa a alugado.
UPDATE public.spaces s
   SET status = 'rented'
 WHERE s.status = 'published'
   AND s.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.space_id = s.id AND public.booking_occupies(b.status)
   );$mp_26_5$;

    EXECUTE $mp_26_6$-- Anúncio alugado também não pode ficar abaixo do mínimo de fotos: senão,
-- quando o aluguel acabasse, ele não conseguiria voltar ao ar.
CREATE OR REPLACE FUNCTION public.guard_delete_photo_of_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  situacao space_status;
  restantes integer;
BEGIN
  SELECT status INTO situacao FROM public.spaces WHERE id = OLD.space_id;

  -- Anuncio sendo apagado em cascata: nao ha o que proteger.
  IF situacao IS NULL OR situacao NOT IN ('published', 'rented') THEN
    RETURN OLD;
  END IF;

  SELECT count(*) - 1 INTO restantes
    FROM public.space_images WHERE space_id = OLD.space_id;

  IF restantes < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado ficaria com % fotos, abaixo do minimo de %', restantes, minimo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;$mp_26_6$;

    EXECUTE $mp_26_7$-- ---------------------------------------------------------------------------
-- 2. Histórico de preço — registrado pelo banco, imutável
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_space_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ator uuid;
BEGIN
  -- Antes da primeira publicação o preço não era público, e o rascunho nasce
  -- com um valor provisório (o CHECK exige > 0 desde o INSERT). Registrar
  -- isso seria histórico artificial.
  IF OLD.published_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- Quem mudou: o servidor informa na mesma transação do UPDATE
  -- (set_config('myplace.actor_id', ..., true)). Ausente = fora do app.
  BEGIN
    ator := NULLIF(current_setting('myplace.actor_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    ator := NULL;
  END;

  INSERT INTO public.space_price_history
    (space_id, old_price_cents, new_price_cents, changed_by, space_status)
  VALUES
    (NEW.id, OLD.price_monthly_cents, NEW.price_monthly_cents, ator, NEW.status);

  RETURN NULL;
END;
$$;$mp_26_7$;

    EXECUTE $mp_26_8$CREATE TRIGGER spaces_record_price_change
  AFTER UPDATE OF price_monthly_cents ON public.spaces
  FOR EACH ROW
  WHEN (OLD.price_monthly_cents IS DISTINCT FROM NEW.price_monthly_cents)
  EXECUTE FUNCTION public.record_space_price_change();$mp_26_8$;

    EXECUTE $mp_26_9$CREATE OR REPLACE FUNCTION public.guard_price_history_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A única saída de uma linha do histórico é o próprio anúncio deixar de
  -- existir (DELETE em cascata): aí o pai já não está mais visível aqui.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.spaces WHERE id = OLD.space_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'O historico de preco e imutavel (tentativa de %)', TG_OP;
END;
$$;$mp_26_9$;

    EXECUTE $mp_26_10$CREATE TRIGGER space_price_history_immutable
  BEFORE UPDATE OR DELETE ON public.space_price_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_history_immutable();$mp_26_10$;

    EXECUTE $mp_26_11$-- ---------------------------------------------------------------------------
-- 3. Favoritos: preço de referência do aviso de queda
--
-- O navegador tem INSERT em `favorites` (policy `favorites_all_own`). Pela
-- API, os campos que o servidor calcula — preço no momento de favoritar e o
-- menor preço já conhecido — vêm do anúncio, nunca do que foi enviado: um
-- valor inventado faria o aviso mostrar um "preço anterior" que nunca existiu.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: pelo navegador, quem dispara é o papel `authenticated`,
-- que não lê `spaces` diretamente (RLS). A função só lê o preço do próprio
-- anúncio favoritado, com search_path fixo.
CREATE OR REPLACE FUNCTION public.guard_favorite_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  preco integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND (
         NEW.price_cents_at_favorite IS DISTINCT FROM OLD.price_cents_at_favorite
      OR NEW.price_alert_baseline_cents IS DISTINCT FROM OLD.price_alert_baseline_cents
      OR NEW.price_alert_notified_at IS DISTINCT FROM OLD.price_alert_notified_at
    ) THEN
      RAISE EXCEPTION 'Campos calculados pelo servidor nao podem ser alterados por esta via';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT price_monthly_cents INTO preco FROM public.spaces WHERE id = NEW.space_id;
      NEW.price_cents_at_favorite := preco;
      NEW.price_alert_baseline_cents := preco;
      NEW.price_alert_notified_at := NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.price_alert_baseline_cents IS NULL THEN
    SELECT price_monthly_cents INTO NEW.price_alert_baseline_cents
      FROM public.spaces WHERE id = NEW.space_id;
  END IF;
  RETURN NEW;
END;
$$;$mp_26_11$;

    EXECUTE $mp_26_12$CREATE TRIGGER favorites_guard_server_fields
  BEFORE INSERT OR UPDATE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.guard_favorite_server_fields();$mp_26_12$;

    EXECUTE $mp_26_13$-- Favoritos existentes partem do preço de hoje: nenhum aviso retroativo.
UPDATE public.favorites f
   SET price_alert_baseline_cents = s.price_monthly_cents
  FROM public.spaces s
 WHERE s.id = f.space_id
   AND f.price_alert_baseline_cents IS NULL;$mp_26_13$;

    EXECUTE $mp_26_14$-- ---------------------------------------------------------------------------
-- 4. Lista de espera: quem pode entrar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_waitlist_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dono uuid;
  apagado timestamptz;
BEGIN
  SELECT owner_id, deleted_at INTO dono, apagado FROM public.spaces WHERE id = NEW.space_id;
  IF dono IS NULL OR apagado IS NOT NULL THEN
    RAISE EXCEPTION 'Espaco inexistente'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'waitlist_entries_space_exists';
  END IF;
  IF dono = NEW.user_id THEN
    RAISE EXCEPTION 'O proprietario nao entra na lista de espera do proprio espaco'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'waitlist_entries_not_owner';
  END IF;
  -- Bloqueio entre as duas pessoas vale aqui também: quem bloqueou (ou foi
  -- bloqueado) não recebe aviso sobre o espaço da outra.
  IF public.is_blocked_between(NEW.user_id, dono) THEN
    RAISE EXCEPTION 'Ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'waitlist_entries_not_blocked';
  END IF;
  RETURN NEW;
END;
$$;$mp_26_14$;

    EXECUTE $mp_26_15$CREATE TRIGGER waitlist_entries_guard
  BEFORE INSERT ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_waitlist_entry();$mp_26_15$;

    EXECUTE $mp_26_16$-- ---------------------------------------------------------------------------
-- 5. Calendário: bloqueio de datas × reservas
--
-- As duas regras ("bloqueio não cobre reserva vigente" e "reserva não é
-- aceita por cima de bloqueio") vivem no banco e trancam a linha do espaço
-- (SELECT ... FOR UPDATE) antes de conferir: um bloqueio criado numa aba e
-- um aceite na outra, no mesmo instante, passam em fila — um dos dois vê o
-- outro e é recusado. Uma reserva sem data de término ocupa o espaço de
-- `start_date` em diante, para sempre (daterange sem limite superior).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange := daterange(NEW.starts_on, NEW.ends_on, '[]');
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.space_availability_blocks o
     WHERE o.space_id = NEW.space_id
       AND o.id <> NEW.id
       AND o.cancelled_at IS NULL
       AND daterange(o.starts_on, o.ends_on, '[]') && periodo
  ) THEN
    RAISE EXCEPTION 'Ja existe um bloqueio que cobre essas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_overlap';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.space_id
       AND public.booking_occupies(b.status)
       AND daterange(b.start_date, b.end_date, '[)') && periodo
  ) THEN
    RAISE EXCEPTION 'Ha uma reserva vigente nessas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_booking';
  END IF;

  RETURN NEW;
END;
$$;$mp_26_16$;

    EXECUTE $mp_26_17$CREATE TRIGGER space_availability_blocks_guard
  BEFORE INSERT OR UPDATE ON public.space_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_availability_block();$mp_26_17$;

    EXECUTE $mp_26_18$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bloqueio record;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Já ocupava exatamente o mesmo período (ex.: active -> past_due): nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND daterange(k.starts_on, k.ends_on, '[]') && daterange(NEW.start_date, NEW.end_date, '[)')
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o espaco de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;$mp_26_18$;

    EXECUTE $mp_26_19$CREATE TRIGGER bookings_guard_blocked_period
  BEFORE INSERT OR UPDATE OF status, start_date, end_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_against_blocks();$mp_26_19$;

    EXECUTE $mp_26_20$-- ---------------------------------------------------------------------------
-- 6. Nenhuma tabela nova é alcançável pelo navegador
--
-- RLS ligada e nenhuma policy, e sem privilégio para os papéis da API: o
-- Supabase concede privilégios padrão em tabelas novas do schema public, e
-- a RLS sozinha já barraria, mas as duas travas juntas não dependem uma da
-- outra. O servidor (dono das tabelas) não é afetado.
-- ---------------------------------------------------------------------------

ALTER TABLE public.space_price_history ENABLE ROW LEVEL SECURITY;$mp_26_20$;

    EXECUTE $mp_26_21$ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;$mp_26_21$;

    EXECUTE $mp_26_22$ALTER TABLE public.space_availability_blocks ENABLE ROW LEVEL SECURITY;$mp_26_22$;

    EXECUTE $mp_26_23$ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;$mp_26_23$;

    EXECUTE $mp_26_24$ALTER TABLE public.saved_search_matches ENABLE ROW LEVEL SECURITY;$mp_26_24$;

    EXECUTE $mp_26_25$ALTER TABLE public.listing_suggestions ENABLE ROW LEVEL SECURITY;$mp_26_25$;

    EXECUTE $mp_26_26$ALTER TABLE public.space_daily_stats ENABLE ROW LEVEL SECURITY;$mp_26_26$;

    EXECUTE $mp_26_27$ALTER TABLE public.ai_usage_counters ENABLE ROW LEVEL SECURITY;$mp_26_27$;

    EXECUTE $mp_26_28$DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'space_price_history', 'waitlist_entries', 'space_availability_blocks',
    'saved_searches', 'saved_search_matches', 'listing_suggestions',
    'space_daily_stats', 'ai_usage_counters'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END;
$$;$mp_26_28$;

    EXECUTE $mp_26_29$-- ---------------------------------------------------------------------------
-- 7. Configuração inicial (mudar é um UPDATE, sem deploy)
-- ---------------------------------------------------------------------------

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('alerts.saved_search_max_free', '2'::jsonb,
   'Alertas de busca ATIVOS por conta sem Premium.', false),
  ('alerts.saved_search_max_premium', '20'::jsonb,
   'Alertas de busca ATIVOS por conta Premium.', false),
  ('alerts.price_drop_min_bps', '100'::jsonb,
   'Queda minima, em pontos-base sobre o menor preco ja avisado, para gerar aviso de queda (100 = 1%).', false),
  ('alerts.price_drop_cooldown_hours', '24'::jsonb,
   'Janela minima entre dois avisos de queda de preco do mesmo espaco para a mesma pessoa.', false),
  ('analytics.free_history_days', '30'::jsonb,
   'Dias de historico do painel de desempenho para contas sem Premium.', false),
  ('ai.search_daily_limit', '500'::jsonb,
   'Teto diario de interpretacoes de busca por IA, somando todas as pessoas.', false),
  ('ai.listing_daily_limit_per_owner', '5'::jsonb,
   'Pedidos de melhoria de anuncio por IA, por proprietario, por dia.', false),
  ('ai.listing_space_cooldown_minutes', '10'::jsonb,
   'Intervalo minimo entre dois pedidos de melhoria para o mesmo anuncio.', false),
  ('ai.listing_daily_limit', '300'::jsonb,
   'Teto diario de pedidos de melhoria de anuncio, somando todas as pessoas.', false),
  ('premium.price_monthly_cents', '7990'::jsonb,
   'Preco do Premium mensal, em centavos. A assinatura paga ainda nao existe.', true),
  ('premium.price_yearly_cents', '75905'::jsonb,
   'Preco do Premium anual, em centavos. A assinatura paga ainda nao existe.', true)
ON CONFLICT (key) DO NOTHING;$mp_26_29$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('3cd55828946dd292e778f592516b46129305aa4dcd21752034fff55fc4e49d09', 1790736629418);

    RAISE NOTICE 'Migracao 26 (0026_gatilhos_descoberta) aplicada.';
  END IF;
END
$mp_bloco_26$;


-- ----------------------------------------------------------------------------
-- Migracao 27: 0027_certain_bloodstorm  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_27$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '86644415bb4e9d81c4db191a64fb01570cdd9fd21a166854cccf3dbeb38f1b53'
  ) THEN
    RAISE NOTICE 'Migracao 27 (0027_certain_bloodstorm) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_27_0$ALTER TABLE "saved_searches" ADD COLUMN "criteria_key" text NOT NULL;$mp_27_0$;

    EXECUTE $mp_27_1$CREATE UNIQUE INDEX "saved_searches_user_criteria_key" ON "saved_searches" USING btree ("user_id","criteria_key");$mp_27_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('86644415bb4e9d81c4db191a64fb01570cdd9fd21a166854cccf3dbeb38f1b53', 1790740678115);

    RAISE NOTICE 'Migracao 27 (0027_certain_bloodstorm) aplicada.';
  END IF;
END
$mp_bloco_27$;


-- ----------------------------------------------------------------------------
-- Migracao 28: 0028_limite_alertas  (4 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_28$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '0335e942c91ec021aa5d556925d4257f4b3b4cba996e7000bdb2b6f249a637e7'
  ) THEN
    RAISE NOTICE 'Migracao 28 (0028_limite_alertas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_28_0$-- Fase 23 — limite de alertas ativos por pessoa, garantido pelo banco.
--
-- O código confere antes (para dar uma mensagem clara), mas é aqui que a
-- regra vale de verdade: duas abas criando alerta ao mesmo tempo, ou uma
-- chamada direta à ação, não passam do limite. A linha do perfil é travada
-- (FOR UPDATE) durante a conta, então dois inserts simultâneos da mesma
-- pessoa entram em fila e o segundo já enxerga o primeiro.
--
-- O limite vem de platform_settings (plano gratuito x Premium ativo), o
-- mesmo lugar de onde o app lê — mudar o número não exige deploy.

CREATE OR REPLACE FUNCTION public.guard_saved_search_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_premium boolean;
  v_limite integer;
  v_ativos integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW; -- já contava; editar critérios de um alerta ativo não muda a conta
  END IF;

  PERFORM 1 FROM profiles WHERE id = NEW.user_id FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM premium_memberships pm WHERE pm.user_id = NEW.user_id AND pm.status = 'active'
  ) INTO v_premium;

  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM platform_settings
      WHERE key = CASE WHEN v_premium THEN 'alerts.saved_search_max_premium' ELSE 'alerts.saved_search_max_free' END),
    CASE WHEN v_premium THEN 20 ELSE 2 END
  ) INTO v_limite;

  SELECT count(*) INTO v_ativos
  FROM saved_searches
  WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

  IF v_ativos >= v_limite THEN
    RAISE EXCEPTION 'Limite de % alertas ativos atingido', v_limite
      USING ERRCODE = 'check_violation', CONSTRAINT = 'saved_searches_active_limit';
  END IF;
  RETURN NEW;
END;
$$;$mp_28_0$;

    EXECUTE $mp_28_1$DROP TRIGGER IF EXISTS saved_searches_active_limit ON public.saved_searches;$mp_28_1$;

    EXECUTE $mp_28_2$CREATE TRIGGER saved_searches_active_limit
  BEFORE INSERT OR UPDATE OF status ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.guard_saved_search_limit();$mp_28_2$;

    EXECUTE $mp_28_3$-- Intervalo mínimo entre dois avisos do mesmo alerta (horas). O que chegar
-- nesse meio-tempo vem agrupado no aviso seguinte ("Encontramos 4 novos
-- espaços…") ou no resumo diário do cron.
INSERT INTO public.platform_settings (key, value, description, is_public)
VALUES
  ('alerts.digest_hours_free', '24'::jsonb, 'Intervalo mínimo entre avisos do mesmo alerta, plano gratuito (horas).', false),
  ('alerts.digest_hours_premium', '1'::jsonb, 'Intervalo mínimo entre avisos do mesmo alerta, Premium (horas).', false)
ON CONFLICT (key) DO NOTHING;$mp_28_3$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('0335e942c91ec021aa5d556925d4257f4b3b4cba996e7000bdb2b6f249a637e7', 1790740684524);

    RAISE NOTICE 'Migracao 28 (0028_limite_alertas) aplicada.';
  END IF;
END
$mp_bloco_28$;


-- ----------------------------------------------------------------------------
-- Migracao 29: 0029_inicio_contagem_visualizacoes  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_29$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '41e2a5411b6b463774afb15ffec097cccd01aae94664f824db093023a628869f'
  ) THEN
    RAISE NOTICE 'Migracao 29 (0029_inicio_contagem_visualizacoes) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_29_0$-- Fase 23 — desde quando o app conta visualizações de anúncio.
--
-- O painel de desempenho não pode mostrar "0 visualizações" num período em
-- que a contagem nem existia: antes desta data, a tela mostra "—" e diz a
-- partir de quando os números valem. É gravado uma vez (ON CONFLICT DO
-- NOTHING): rodar de novo não empurra a data para frente.
INSERT INTO public.platform_settings (key, value, description, is_public)
VALUES (
  'analytics.views_counting_since',
  to_jsonb(to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')),
  'Primeiro dia em que visualizações de anúncio passaram a ser contadas.',
  false
)
ON CONFLICT (key) DO NOTHING;$mp_29_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('41e2a5411b6b463774afb15ffec097cccd01aae94664f824db093023a628869f', 1790777551398);

    RAISE NOTICE 'Migracao 29 (0029_inicio_contagem_visualizacoes) aplicada.';
  END IF;
END
$mp_bloco_29$;


-- ----------------------------------------------------------------------------
-- Migracao 30: 0030_datas_invertidas  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_30$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ca2f97e555d8231f3c3455c45c76b1379188319a62419e4cabf059f3ecc38e25'
  ) THEN
    RAISE NOTICE 'Migracao 30 (0030_datas_invertidas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_30_0$-- Fase 23 — datas invertidas recusadas pela regra certa.
--
-- Achado da verificação do schema: as triggers de calendário montam o
-- intervalo de datas (daterange) antes de qualquer outra conferência. Com a
-- data final antes da inicial, o próprio daterange estourava ("range lower
-- bound must be less than or equal to range upper bound") e a recusa saía
-- com essa mensagem crua, sem o nome da regra. As triggers rodam antes dos
-- CHECKs; agora elas deixam passar o que está invertido e quem recusa é o
-- CHECK de sempre (`space_availability_blocks_dates_ordered`,
-- `bookings_dates_ordered`), com o nome dele no erro. Nada que era aceito
-- passa a ser aceito: só muda QUEM recusa.

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange;
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK space_availability_blocks_dates_ordered recusa.
  IF NEW.ends_on < NEW.starts_on THEN
    RETURN NEW;
  END IF;
  periodo := daterange(NEW.starts_on, NEW.ends_on, '[]');

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.space_availability_blocks o
     WHERE o.space_id = NEW.space_id
       AND o.id <> NEW.id
       AND o.cancelled_at IS NULL
       AND daterange(o.starts_on, o.ends_on, '[]') && periodo
  ) THEN
    RAISE EXCEPTION 'Ja existe um bloqueio que cobre essas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_overlap';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.space_id
       AND public.booking_occupies(b.status)
       AND daterange(b.start_date, b.end_date, '[)') && periodo
  ) THEN
    RAISE EXCEPTION 'Ha uma reserva vigente nessas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_booking';
  END IF;

  RETURN NEW;
END;
$$;$mp_30_0$;

    EXECUTE $mp_30_1$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bloqueio record;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK bookings_dates_ordered recusa.
  IF NEW.end_date IS NOT NULL AND NEW.end_date <= NEW.start_date THEN
    RETURN NEW;
  END IF;
  -- Já ocupava exatamente o mesmo período (ex.: active -> past_due): nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND daterange(k.starts_on, k.ends_on, '[]') && daterange(NEW.start_date, NEW.end_date, '[)')
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o espaco de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;$mp_30_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ca2f97e555d8231f3c3455c45c76b1379188319a62419e4cabf059f3ecc38e25', 1790821127802);

    RAISE NOTICE 'Migracao 30 (0030_datas_invertidas) aplicada.';
  END IF;
END
$mp_bloco_30$;


-- ----------------------------------------------------------------------------
-- Migracao 31: 0031_third_fenris  (67 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_31$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062'
  ) THEN
    RAISE NOTICE 'Migracao 31 (0031_third_fenris) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_31_0$CREATE TYPE "public"."booking_end_reason" AS ENUM('completed', 'cancelled_by_renter', 'cancelled_by_owner', 'payment_not_received', 'hold_expired');$mp_31_0$;

    EXECUTE $mp_31_1$CREATE TYPE "public"."operating_hours_mode" AS ENUM('always', 'daily');$mp_31_1$;

    EXECUTE $mp_31_2$CREATE TYPE "public"."rental_kind" AS ENUM('continuous', 'temporary');$mp_31_2$;

    EXECUTE $mp_31_3$CREATE TYPE "public"."rental_time_unit" AS ENUM('hour', 'day', 'week');$mp_31_3$;

    EXECUTE $mp_31_4$CREATE TYPE "public"."temporary_pricing_mode" AS ENUM('per_period', 'packages');$mp_31_4$;

    EXECUTE $mp_31_5$ALTER TYPE "public"."notification_type" ADD VALUE 'rental_ending_soon';$mp_31_5$;

    EXECUTE $mp_31_6$ALTER TYPE "public"."notification_type" ADD VALUE 'payment_refunded';$mp_31_6$;

    EXECUTE $mp_31_7$ALTER TYPE "public"."space_type" ADD VALUE 'estacionamento';$mp_31_7$;

    EXECUTE $mp_31_8$ALTER TYPE "public"."space_type" ADD VALUE 'espaco_eventos';$mp_31_8$;

    EXECUTE $mp_31_9$ALTER TYPE "public"."space_type" ADD VALUE 'area_lazer';$mp_31_9$;

    EXECUTE $mp_31_10$ALTER TYPE "public"."space_type" ADD VALUE 'oficina';$mp_31_10$;

    EXECUTE $mp_31_11$CREATE TABLE "space_unit_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"allows_continuous" boolean DEFAULT true NOT NULL,
	"allows_temporary" boolean DEFAULT false NOT NULL,
	"monthly_price_cents" integer,
	"temp_pricing_mode" "temporary_pricing_mode",
	"temp_unit" "rental_time_unit",
	"temp_price_cents" integer,
	"temp_max_units" integer,
	"temp_allow_fraction" boolean DEFAULT false NOT NULL,
	"temp_packages" jsonb,
	"renewal_allowed" boolean DEFAULT true NOT NULL,
	"hours_mode" "operating_hours_mode" DEFAULT 'always' NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_unit_groups_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_unit_groups_name_length" CHECK (char_length(trim("space_unit_groups"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "space_unit_groups_some_mode" CHECK ("space_unit_groups"."allows_continuous" OR "space_unit_groups"."allows_temporary"),
	CONSTRAINT "space_unit_groups_continuous_price" CHECK (NOT "space_unit_groups"."allows_continuous" OR ("space_unit_groups"."monthly_price_cents" IS NOT NULL AND "space_unit_groups"."monthly_price_cents" BETWEEN 1 AND 100000000)),
	CONSTRAINT "space_unit_groups_temporary_rule" CHECK (NOT "space_unit_groups"."allows_temporary" OR (
            "space_unit_groups"."temp_pricing_mode" IS NOT NULL AND "space_unit_groups"."temp_unit" IS NOT NULL AND (
              ("space_unit_groups"."temp_pricing_mode" = 'per_period'
                AND "space_unit_groups"."temp_price_cents" BETWEEN 1 AND 100000000
                AND "space_unit_groups"."temp_max_units" BETWEEN 1 AND 1000)
              OR ("space_unit_groups"."temp_pricing_mode" = 'packages'
                AND jsonb_typeof("space_unit_groups"."temp_packages") = 'array'
                AND jsonb_array_length("space_unit_groups"."temp_packages") BETWEEN 1 AND 6)
            )
          )),
	CONSTRAINT "space_unit_groups_fraction_rule" CHECK (NOT "space_unit_groups"."temp_allow_fraction" OR ("space_unit_groups"."temp_pricing_mode" = 'per_period' AND "space_unit_groups"."temp_unit" IN ('day', 'week'))),
	CONSTRAINT "space_unit_groups_hours_temporary" CHECK ("space_unit_groups"."hours_mode" = 'always' OR NOT "space_unit_groups"."allows_temporary" OR "space_unit_groups"."temp_unit" = 'hour'),
	CONSTRAINT "space_unit_groups_hours" CHECK (("space_unit_groups"."hours_mode" = 'always' AND "space_unit_groups"."opens_at" IS NULL AND "space_unit_groups"."closes_at" IS NULL)
          OR ("space_unit_groups"."hours_mode" = 'daily' AND "space_unit_groups"."opens_at" IS NOT NULL AND "space_unit_groups"."closes_at" IS NOT NULL AND "space_unit_groups"."opens_at" < "space_unit_groups"."closes_at"))
);$mp_31_11$;

    EXECUTE $mp_31_12$CREATE TABLE "space_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_units_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_units_group_id_id_key" UNIQUE("group_id","id"),
	CONSTRAINT "space_units_label_length" CHECK (char_length(trim("space_units"."label")) BETWEEN 1 AND 40)
);$mp_31_12$;

    EXECUTE $mp_31_13$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_positive";$mp_31_13$;

    EXECUTE $mp_31_14$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_sane";$mp_31_14$;

    EXECUTE $mp_31_15$DROP INDEX "bookings_one_active_per_space";$mp_31_15$;

    EXECUTE $mp_31_16$ALTER TABLE "spaces" ALTER COLUMN "price_monthly_cents" DROP NOT NULL;$mp_31_16$;

    EXECUTE $mp_31_17$ALTER TABLE "spaces" ADD COLUMN "temp_from_cents" integer;$mp_31_17$;

    EXECUTE $mp_31_18$ALTER TABLE "spaces" ADD COLUMN "temp_from_units" integer;$mp_31_18$;

    EXECUTE $mp_31_19$ALTER TABLE "spaces" ADD COLUMN "temp_from_unit" "rental_time_unit";$mp_31_19$;

    EXECUTE $mp_31_20$ALTER TABLE "bookings" ADD COLUMN "kind" "rental_kind" DEFAULT 'continuous' NOT NULL;$mp_31_20$;

    EXECUTE $mp_31_21$ALTER TABLE "bookings" ADD COLUMN "group_id" uuid;$mp_31_21$;

    EXECUTE $mp_31_22$ALTER TABLE "bookings" ADD COLUMN "unit_id" uuid;$mp_31_22$;

    EXECUTE $mp_31_23$ALTER TABLE "bookings" ADD COLUMN "starts_at" timestamp with time zone;$mp_31_23$;

    EXECUTE $mp_31_24$ALTER TABLE "bookings" ADD COLUMN "ends_at" timestamp with time zone;$mp_31_24$;

    EXECUTE $mp_31_25$ALTER TABLE "bookings" ADD COLUMN "occupied_until" timestamp with time zone;$mp_31_25$;

    EXECUTE $mp_31_26$ALTER TABLE "bookings" ADD COLUMN "duration_units" integer;$mp_31_26$;

    EXECUTE $mp_31_27$ALTER TABLE "bookings" ADD COLUMN "duration_unit" "rental_time_unit";$mp_31_27$;

    EXECUTE $mp_31_28$ALTER TABLE "bookings" ADD COLUMN "renewal_allowed" boolean DEFAULT false NOT NULL;$mp_31_28$;

    EXECUTE $mp_31_29$ALTER TABLE "bookings" ADD COLUMN "renewed_from_id" uuid;$mp_31_29$;

    EXECUTE $mp_31_30$ALTER TABLE "bookings" ADD COLUMN "hold_expires_at" timestamp with time zone;$mp_31_30$;

    EXECUTE $mp_31_31$ALTER TABLE "bookings" ADD COLUMN "payment_issue_started_at" timestamp with time zone;$mp_31_31$;

    EXECUTE $mp_31_32$ALTER TABLE "bookings" ADD COLUMN "payment_issue_deadline_at" timestamp with time zone;$mp_31_32$;

    EXECUTE $mp_31_33$ALTER TABLE "bookings" ADD COLUMN "end_reason" "booking_end_reason";$mp_31_33$;

    EXECUTE $mp_31_34$ALTER TABLE "bookings" ADD COLUMN "idempotency_key" text;$mp_31_34$;

    EXECUTE $mp_31_35$ALTER TABLE "payments" ADD COLUMN "pix_payload" text;$mp_31_35$;

    EXECUTE $mp_31_36$ALTER TABLE "payments" ADD COLUMN "pix_qr_image" text;$mp_31_36$;

    EXECUTE $mp_31_37$ALTER TABLE "payments" ADD COLUMN "pix_expires_at" timestamp with time zone;$mp_31_37$;

    EXECUTE $mp_31_38$ALTER TABLE "payments" ADD COLUMN "payer_started_at" timestamp with time zone;$mp_31_38$;

    EXECUTE $mp_31_39$ALTER TABLE "payments" ADD COLUMN "refund_requested_at" timestamp with time zone;$mp_31_39$;

    EXECUTE $mp_31_40$ALTER TABLE "payments" ADD COLUMN "refund_reason" text;$mp_31_40$;

    EXECUTE $mp_31_41$ALTER TABLE "payments" ADD COLUMN "delete_requested_at" timestamp with time zone;$mp_31_41$;

    EXECUTE $mp_31_42$ALTER TABLE "payments" ADD COLUMN "provider_deleted_at" timestamp with time zone;$mp_31_42$;

    EXECUTE $mp_31_43$ALTER TABLE "subscriptions" ADD COLUMN "provider_cancelled_at" timestamp with time zone;$mp_31_43$;

    EXECUTE $mp_31_44$ALTER TABLE "space_unit_groups" ADD CONSTRAINT "space_unit_groups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_44$;

    EXECUTE $mp_31_45$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_45$;

    EXECUTE $mp_31_46$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE cascade ON UPDATE no action;$mp_31_46$;

    EXECUTE $mp_31_47$CREATE INDEX "space_unit_groups_space_idx" ON "space_unit_groups" USING btree ("space_id");$mp_31_47$;

    EXECUTE $mp_31_48$CREATE UNIQUE INDEX "space_unit_groups_space_name_key" ON "space_unit_groups" USING btree ("space_id",lower("name"));$mp_31_48$;

    EXECUTE $mp_31_49$CREATE INDEX "space_units_group_idx" ON "space_units" USING btree ("group_id","position");$mp_31_49$;

    EXECUTE $mp_31_50$CREATE INDEX "space_units_space_idx" ON "space_units" USING btree ("space_id");$mp_31_50$;

    EXECUTE $mp_31_51$CREATE UNIQUE INDEX "space_units_space_label_key" ON "space_units" USING btree ("space_id","label");$mp_31_51$;

    EXECUTE $mp_31_52$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renewed_from_id_bookings_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;$mp_31_52$;

    EXECUTE $mp_31_53$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE no action ON UPDATE no action;$mp_31_53$;

    EXECUTE $mp_31_54$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_same_group_fk" FOREIGN KEY ("group_id","unit_id") REFERENCES "public"."space_units"("group_id","id") ON DELETE no action ON UPDATE no action;$mp_31_54$;

    EXECUTE $mp_31_55$CREATE INDEX "bookings_unit_status_idx" ON "bookings" USING btree ("unit_id","status");$mp_31_55$;

    EXECUTE $mp_31_56$CREATE INDEX "bookings_group_idx" ON "bookings" USING btree ("group_id");$mp_31_56$;

    EXECUTE $mp_31_57$CREATE INDEX "bookings_hold_expires_idx" ON "bookings" USING btree ("hold_expires_at") WHERE status = 'awaiting_payment';$mp_31_57$;

    EXECUTE $mp_31_58$CREATE INDEX "bookings_payment_deadline_idx" ON "bookings" USING btree ("payment_issue_deadline_at") WHERE status = 'past_due';$mp_31_58$;

    EXECUTE $mp_31_59$CREATE INDEX "bookings_temporary_ending_idx" ON "bookings" USING btree ("occupied_until") WHERE kind = 'temporary' AND status = 'active';$mp_31_59$;

    EXECUTE $mp_31_60$CREATE UNIQUE INDEX "bookings_renter_idempotency_key" ON "bookings" USING btree ("renter_id","idempotency_key") WHERE idempotency_key IS NOT NULL;$mp_31_60$;

    EXECUTE $mp_31_61$CREATE UNIQUE INDEX "bookings_one_live_renewal" ON "bookings" USING btree ("renewed_from_id") WHERE renewed_from_id IS NOT NULL AND status IN ('approved','awaiting_payment','active','past_due');$mp_31_61$;

    EXECUTE $mp_31_62$CREATE INDEX "payments_outbox_idx" ON "payments" USING btree ("updated_at") WHERE (refund_requested_at IS NOT NULL AND status NOT IN ('refunded','partially_refunded')) OR (delete_requested_at IS NOT NULL AND provider_deleted_at IS NULL);$mp_31_62$;

    EXECUTE $mp_31_63$CREATE INDEX "subscriptions_cancel_pending_idx" ON "subscriptions" USING btree ("cancelled_at") WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_31_63$;

    EXECUTE $mp_31_64$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_temp_summary_complete" CHECK (("spaces"."temp_from_cents" IS NULL AND "spaces"."temp_from_units" IS NULL AND "spaces"."temp_from_unit" IS NULL)
          OR ("spaces"."temp_from_cents" > 0 AND "spaces"."temp_from_units" > 0 AND "spaces"."temp_from_unit" IS NOT NULL));$mp_31_64$;

    EXECUTE $mp_31_65$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_positive" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" > 0);$mp_31_65$;

    EXECUTE $mp_31_66$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_sane" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" <= 100000000);$mp_31_66$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062', 1790849029369);

    RAISE NOTICE 'Migracao 31 (0031_third_fenris) aplicada.';
  END IF;
END
$mp_bloco_31$;


-- ----------------------------------------------------------------------------
-- Migracao 32: 0032_aluguel_unidades  (51 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_32$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2'
  ) THEN
    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_32_0$-- ===========================================================================
-- Parte 12 — unidades, aluguel temporário e contínuo, prazos e pagamentos.
--
-- As tabelas e colunas vêm da 0031 (gerada pelo Drizzle). Aqui fica o que o
-- Drizzle não descreve, na ordem em que precisa acontecer:
--   1. extensão btree_gist (restrição de exclusão por unidade);
--   2. regras dos grupos: pacotes válidos, resumo de preço do anúncio;
--   3. ocupação do anúncio por unidade (substitui "um aluguel por espaço");
--   4. travas de publicação, desativação e exclusão de unidade;
--   5. preço, horário e forma da reserva conferidos pelo banco;
--   6. a função que encerra o que venceu (reserva não paga, temporário que
--      acabou, pagamento pendente sem pagamento);
--   7. preenchimento dos dados que já existiam;
--   8. só então, as restrições que dependem desse preenchimento;
--   9. RLS e configurações.
--
-- Nota: valores novos de enum EXISTENTE (space_type, notification_type) não
-- são usados como literal aqui — o migrador roda tudo numa transação só e o
-- Postgres não deixa usar um valor acrescentado na mesma transação. Os tipos
-- NOVOS (rental_kind, booking_end_reason...) podem: foram criados inteiros.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;$mp_32_0$;

    EXECUTE $mp_32_1$-- ---------------------------------------------------------------------------
-- 2a. Pacotes de preço: em ordem, sem duração repetida, sem pacote mais
-- longo mais barato que um mais curto. Nunca duas regras para a mesma
-- duração, e nenhuma ambiguidade sobre qual pacote vale.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_unit_group_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  u numeric;
  p numeric;
  anterior_u numeric := 0;
  anterior_p numeric := 0;
  i integer := 0;
BEGIN
  NEW.name := trim(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  IF NEW.allows_temporary AND NEW.temp_pricing_mode = 'packages' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.temp_packages) LOOP
      i := i + 1;
      IF jsonb_typeof(item) <> 'object'
         OR jsonb_typeof(item -> 'units') IS DISTINCT FROM 'number'
         OR jsonb_typeof(item -> 'priceCents') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Pacote % sem duracao ou preco', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      u := (item ->> 'units')::numeric;
      p := (item ->> 'priceCents')::numeric;
      IF u <> trunc(u) OR p <> trunc(p) OR u < 1 OR u > 1000 OR p < 1 OR p > 100000000 THEN
        RAISE EXCEPTION 'Pacote % com duracao ou preco invalido', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      IF u <= anterior_u THEN
        RAISE EXCEPTION 'Pacotes fora de ordem ou com a mesma duracao'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      IF p < anterior_p THEN
        RAISE EXCEPTION 'Pacote mais longo nao pode custar menos que um mais curto'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      anterior_u := u;
      anterior_p := p;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;$mp_32_1$;

    EXECUTE $mp_32_2$CREATE TRIGGER space_unit_groups_guard
  BEFORE INSERT OR UPDATE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_group_config();$mp_32_2$;

    EXECUTE $mp_32_3$-- ---------------------------------------------------------------------------
-- 2b. Resumo de preço do anúncio, sempre derivado dos grupos com unidade
-- ativa: o menor preço mensal (contínuo) e a entrada mais barata do
-- temporário na menor unidade de tempo. Busca, cartões, mapa, histórico de
-- preço e avisos de favorito continuam lendo colunas do próprio anúncio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_rental_summary(
  p_space uuid,
  OUT monthly_cents integer,
  OUT temp_cents integer,
  OUT temp_units integer,
  OUT temp_unit public.rental_time_unit
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT min(g.monthly_price_cents)
       FROM public.space_unit_groups g
      WHERE g.space_id = p_space AND g.active AND g.allows_continuous
        AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)),
    t.cents, t.units, t.unit
  FROM (SELECT 1) AS um
  LEFT JOIN LATERAL (
    SELECT x.cents, x.units, x.unit
      FROM (
        SELECT CASE WHEN g.temp_pricing_mode = 'per_period' THEN g.temp_price_cents
                    ELSE (g.temp_packages -> 0 ->> 'priceCents')::integer END AS cents,
               CASE WHEN g.temp_pricing_mode = 'per_period' THEN 1
                    ELSE (g.temp_packages -> 0 ->> 'units')::integer END AS units,
               g.temp_unit AS unit
          FROM public.space_unit_groups g
         WHERE g.space_id = p_space AND g.active AND g.allows_temporary
           AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)
      ) AS x
     ORDER BY CASE x.unit WHEN 'hour' THEN 1 WHEN 'day' THEN 2 ELSE 3 END, x.cents, x.units
     LIMIT 1
  ) AS t ON true
$$;$mp_32_3$;

    EXECUTE $mp_32_4$CREATE OR REPLACE FUNCTION public.sync_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid := COALESCE(NEW.space_id, OLD.space_id);
  r record;
BEGIN
  SELECT * INTO r FROM public.space_rental_summary(alvo);

  UPDATE public.spaces
     SET price_monthly_cents = r.monthly_cents,
         temp_from_cents = r.temp_cents,
         temp_from_units = r.temp_units,
         temp_from_unit = r.temp_unit,
         updated_at = now()
   WHERE id = alvo
     AND (price_monthly_cents IS DISTINCT FROM r.monthly_cents
          OR temp_from_cents IS DISTINCT FROM r.temp_cents
          OR temp_from_units IS DISTINCT FROM r.temp_units
          OR temp_from_unit IS DISTINCT FROM r.temp_unit);

  RETURN NULL;
END;
$$;$mp_32_4$;

    EXECUTE $mp_32_5$CREATE TRIGGER space_unit_groups_sync_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_5$;

    EXECUTE $mp_32_6$CREATE TRIGGER space_units_sync_summary
  AFTER INSERT OR UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_6$;

    EXECUTE $mp_32_7$-- Quem tem grupos não grava preço direto no anúncio: o preço que aparece
-- é sempre o que vale na hora de reservar. Gravar outro valor é um bug, e
-- o banco recusa em vez de deixar a vitrine mentir.
CREATE OR REPLACE FUNCTION public.guard_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.space_rental_summary(NEW.id);
  IF NEW.price_monthly_cents IS DISTINCT FROM r.monthly_cents
     OR NEW.temp_from_cents IS DISTINCT FROM r.temp_cents
     OR NEW.temp_from_units IS DISTINCT FROM r.temp_units
     OR NEW.temp_from_unit IS DISTINCT FROM r.temp_unit THEN
    RAISE EXCEPTION 'O preco do anuncio vem dos grupos de unidades'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_price_from_units';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_7$;

    EXECUTE $mp_32_8$CREATE TRIGGER spaces_price_from_units
  BEFORE UPDATE OF price_monthly_cents, temp_from_cents, temp_from_units, temp_from_unit ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_rental_summary();$mp_32_8$;

    EXECUTE $mp_32_9$-- Histórico de preço (Fase 23) só entre dois preços mensais reais: anúncio
-- que passou a alugar só por hora (preço mensal NULL) não vira "R$ 0".
CREATE OR REPLACE FUNCTION public.record_space_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ator uuid;
BEGIN
  IF OLD.published_at IS NULL THEN
    RETURN NULL;
  END IF;
  IF OLD.price_monthly_cents IS NULL OR NEW.price_monthly_cents IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    ator := NULLIF(current_setting('myplace.actor_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    ator := NULL;
  END;

  INSERT INTO public.space_price_history
    (space_id, old_price_cents, new_price_cents, changed_by, space_status)
  VALUES
    (NEW.id, OLD.price_monthly_cents, NEW.price_monthly_cents, ator, NEW.status);

  RETURN NULL;
END;
$$;$mp_32_9$;

    EXECUTE $mp_32_10$-- ---------------------------------------------------------------------------
-- 3. Ocupação do anúncio por UNIDADE.
--
-- O anúncio só vira `rented` quando TODAS as unidades ativas estão com
-- aluguel CONTÍNUO vigente — um estacionamento com 3 de 10 vagas mensalistas
-- continua no ar. Aluguel temporário nunca tira o anúncio do ar: dura horas,
-- e a disponibilidade de cada horário é calculada por unidade.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_fully_rented(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
             AND NOT EXISTS (
               SELECT 1 FROM public.bookings b
                WHERE b.unit_id = u.id
                  AND b.kind = 'continuous'
                  AND public.booking_occupies(b.status)
             )
         )
$$;$mp_32_10$;

    EXECUTE $mp_32_11$CREATE OR REPLACE FUNCTION public.apply_space_occupancy(p_space uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.space_fully_rented(p_space) THEN
    UPDATE public.spaces SET status = 'rented'
     WHERE id = p_space AND status = 'published';
  ELSE
    BEGIN
      UPDATE public.spaces SET status = 'published'
       WHERE id = p_space AND status = 'rented';
    EXCEPTION WHEN check_violation THEN
      -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
      -- fotos): o aluguel encerra do mesmo jeito e o anúncio fica pausado
      -- até o proprietário corrigir (mesma regra da Fase 23).
      UPDATE public.spaces SET status = 'paused'
       WHERE id = p_space AND status = 'rented';
    END;
  END IF;
END;
$$;$mp_32_11$;

    EXECUTE $mp_32_12$CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'continuous' THEN
    RETURN NULL;
  END IF;
  PERFORM public.apply_space_occupancy(NEW.space_id);
  RETURN NULL;
END;
$$;$mp_32_12$;

    EXECUTE $mp_32_13$DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;$mp_32_13$;

    EXECUTE $mp_32_14$CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status, unit_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();$mp_32_14$;

    EXECUTE $mp_32_15$CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND public.space_fully_rented(NEW.id) THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_15$;

    EXECUTE $mp_32_16$CREATE OR REPLACE FUNCTION public.sync_occupancy_from_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_space_occupancy(COALESCE(NEW.space_id, OLD.space_id));
  RETURN NULL;
END;
$$;$mp_32_16$;

    EXECUTE $mp_32_17$CREATE TRIGGER space_units_sync_occupancy
  AFTER INSERT OR UPDATE OF active OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_17$;

    EXECUTE $mp_32_18$CREATE TRIGGER space_unit_groups_sync_occupancy
  AFTER UPDATE OF active ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_18$;

    EXECUTE $mp_32_19$-- ---------------------------------------------------------------------------
-- 4. Travas: anúncio no ar precisa de unidade para alugar, e unidade (ou
-- grupo) com aluguel em andamento ou futuro não pode ser desativada.
-- Unidade com histórico de reserva nem pode ser apagada (a chave
-- estrangeira da reserva impede) — só desativada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_has_rentable_unit(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_units u
      JOIN public.space_unit_groups g ON g.id = u.group_id
     WHERE u.space_id = p_space AND u.active AND g.active
  )
$$;$mp_32_19$;

    EXECUTE $mp_32_20$CREATE OR REPLACE FUNCTION public.guard_publish_requires_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published', 'rented')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('published', 'rented'))
     AND NOT public.space_has_rentable_unit(NEW.id) THEN
    RAISE EXCEPTION 'Anuncio sem unidade para alugar'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_20$;

    EXECUTE $mp_32_21$CREATE TRIGGER spaces_publish_requires_units
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_units();$mp_32_21$;

    EXECUTE $mp_32_22$CREATE OR REPLACE FUNCTION public.unit_has_live_rental(p_unit uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.unit_id = p_unit
       AND public.booking_occupies(b.status)
       AND (b.occupied_until IS NULL OR b.occupied_until > now())
       AND NOT (b.status = 'awaiting_payment' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at <= now())
  )
$$;$mp_32_22$;

    EXECUTE $mp_32_23$-- Sobra pelo menos uma unidade ativa (num grupo ativo) no anúncio no ar,
-- desconsiderando a unidade ou o grupo que está saindo.
CREATE OR REPLACE FUNCTION public.space_keeps_a_unit(p_space uuid, p_without_unit uuid, p_without_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = p_space AND s.status IN ('published', 'rented'))
      OR EXISTS (
           SELECT 1 FROM public.space_units u
             JOIN public.space_unit_groups g ON g.id = u.group_id
            WHERE u.space_id = p_space AND u.active AND g.active
              AND u.id IS DISTINCT FROM p_without_unit
              AND g.id IS DISTINCT FROM p_without_group
         )
$$;$mp_32_23$;

    EXECUTE $mp_32_24$CREATE OR REPLACE FUNCTION public.guard_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, OLD.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF public.unit_has_live_rental(NEW.id) THEN
      RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NEW.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  IF NEW.group_id <> OLD.group_id AND public.unit_has_live_rental(NEW.id) THEN
    RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_24$;

    EXECUTE $mp_32_25$CREATE TRIGGER space_units_guard_change
  BEFORE UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_change();$mp_32_25$;

    EXECUTE $mp_32_26$CREATE OR REPLACE FUNCTION public.guard_group_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, NULL, OLD.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF EXISTS (
      SELECT 1 FROM public.space_units u
       WHERE u.group_id = NEW.id AND u.active AND public.unit_has_live_rental(u.id)
    ) THEN
      RAISE EXCEPTION 'Grupo com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NULL, NEW.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;$mp_32_26$;

    EXECUTE $mp_32_27$CREATE TRIGGER space_unit_groups_guard_change
  BEFORE UPDATE OF active OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_change();$mp_32_27$;

    EXECUTE $mp_32_28$-- ---------------------------------------------------------------------------
-- 5. Preço, horário e forma da reserva conferidos pelo banco.
--
-- O servidor calcula (src/lib/rentals/pricing.ts) e o banco confere com a
-- MESMA regra: se um bug gravar um valor diferente do que as regras do
-- grupo mandam, o INSERT falha. Arredondamento do proporcional: uma vez,
-- meio para cima, sobre o total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.temporary_rent_cents(p_group uuid, p_units integer, p_unit public.rental_time_unit)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  preco bigint;
  divisor integer;
BEGIN
  SELECT * INTO g FROM public.space_unit_groups WHERE id = p_group;
  IF NOT FOUND OR NOT g.allows_temporary OR p_units IS NULL OR p_units < 1 OR p_unit IS NULL THEN
    RETURN NULL;
  END IF;

  IF g.temp_pricing_mode = 'packages' THEN
    IF p_unit <> g.temp_unit THEN
      RETURN NULL;
    END IF;
    SELECT (value ->> 'priceCents')::bigint INTO preco
      FROM jsonb_array_elements(g.temp_packages)
     WHERE (value ->> 'units')::integer = p_units
     LIMIT 1;
  ELSIF p_unit = g.temp_unit THEN
    IF p_units > g.temp_max_units THEN
      RETURN NULL;
    END IF;
    preco := g.temp_price_cents::bigint * p_units;
  ELSE
    IF g.temp_allow_fraction AND g.temp_unit = 'day' AND p_unit = 'hour' THEN
      divisor := 24;
    ELSIF g.temp_allow_fraction AND g.temp_unit = 'week' AND p_unit = 'day' THEN
      divisor := 7;
    ELSE
      RETURN NULL;
    END IF;
    IF p_units > g.temp_max_units * divisor THEN
      RETURN NULL;
    END IF;
    preco := (g.temp_price_cents::bigint * p_units * 2 + divisor) / (2 * divisor);
  END IF;

  IF preco IS NULL OR preco < 1 OR preco > 100000000 THEN
    RETURN NULL;
  END IF;
  RETURN preco::integer;
END;
$$;$mp_32_28$;

    EXECUTE $mp_32_29$CREATE OR REPLACE FUNCTION public.rental_unit_interval(p_unit public.rental_time_unit)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_unit WHEN 'hour' THEN interval '1 hour' WHEN 'day' THEN interval '24 hours' ELSE interval '168 hours' END
$$;$mp_32_29$;

    EXECUTE $mp_32_30$CREATE OR REPLACE FUNCTION public.platform_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = p_key),
    p_default
  )
$$;$mp_32_30$;

    EXECUTE $mp_32_31$CREATE OR REPLACE FUNCTION public.guard_booking_rental_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  anterior public.bookings%ROWTYPE;
  esperado integer;
  ini timestamp;
  fim timestamp;
BEGIN
  -- Contínuo: o horário exato de início é sempre a meia-noite (Brasília)
  -- do dia de início — derivado aqui, nunca informado à parte.
  IF NEW.kind = 'continuous' THEN
    NEW.starts_at := (NEW.start_date::timestamp AT TIME ZONE 'America/Sao_Paulo');

    -- Valor de UMA mensalidade = preço mensal do grupo, conferido quando a
    -- solicitação nasce e quando é aceita (o aceite congela o valor vigente).
    IF NEW.group_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR (OLD.status = 'requested' AND NEW.status = 'approved')) THEN
      SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
      IF NOT g.allows_continuous OR g.monthly_price_cents IS DISTINCT FROM NEW.monthly_rent_cents THEN
        RAISE EXCEPTION 'Valor mensal diferente do preco do grupo'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ---- Temporário ----
  IF TG_OP = 'UPDATE' THEN
    -- Depois de criada, a reserva temporária não muda de unidade, horário,
    -- duração nem valor. Só a proteção pós-fim pode encolher (renovação).
    IF NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.duration_units IS DISTINCT FROM OLD.duration_units
       OR NEW.duration_unit IS DISTINCT FROM OLD.duration_unit
       OR NEW.monthly_rent_cents IS DISTINCT FROM OLD.monthly_rent_cents
       OR NEW.total_charged_cents IS DISTINCT FROM OLD.total_charged_cents
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.occupied_until > OLD.occupied_until THEN
      RAISE EXCEPTION 'Reserva temporaria nao muda depois de criada'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_frozen';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
  IF NOT FOUND OR NOT g.active OR NOT g.allows_temporary THEN
    RAISE EXCEPTION 'Grupo nao aceita aluguel temporario'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  esperado := public.temporary_rent_cents(NEW.group_id, NEW.duration_units, NEW.duration_unit);
  IF esperado IS NULL THEN
    RAISE EXCEPTION 'Duracao fora das regras do grupo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;
  IF esperado <> NEW.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valor diferente do que as regras do grupo calculam'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
  END IF;
  IF NEW.monthly_rent_cents < public.platform_setting_int('booking.min_rent_cents', 3500) THEN
    RAISE EXCEPTION 'Valor abaixo do minimo por cobranca'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_minimum';
  END IF;

  IF NEW.starts_at IS NULL
     OR NEW.ends_at IS DISTINCT FROM NEW.starts_at + NEW.duration_units * public.rental_unit_interval(NEW.duration_unit) THEN
    RAISE EXCEPTION 'Fim da reserva diferente de inicio + duracao'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  IF NEW.status = 'awaiting_payment'
     AND (NEW.hold_expires_at IS NULL
          OR NEW.hold_expires_at > now() + make_interval(mins => public.platform_setting_int('rental.hold_minutes', 15) + 1)) THEN
    RAISE EXCEPTION 'Prazo para pagar fora do permitido'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_hold';
  END IF;

  IF NEW.renewed_from_id IS NOT NULL THEN
    -- Renovação: mesma pessoa, mesma unidade, começando exatamente onde a
    -- anterior termina, pedida até 7 minutos depois do fim.
    SELECT * INTO anterior FROM public.bookings WHERE id = NEW.renewed_from_id;
    IF NOT FOUND
       OR anterior.kind <> 'temporary' OR anterior.status <> 'active' OR NOT anterior.renewal_allowed
       OR anterior.renter_id <> NEW.renter_id
       OR anterior.unit_id IS DISTINCT FROM NEW.unit_id
       OR anterior.ends_at <> NEW.starts_at
       OR now() > anterior.ends_at + interval '7 minutes' THEN
      RAISE EXCEPTION 'Renovacao fora das regras'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_renewal_rules';
    END IF;
  ELSIF NEW.starts_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Inicio no passado'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;
  IF NEW.starts_at > now() + make_interval(days => public.platform_setting_int('rental.max_advance_days', 30)) THEN
    RAISE EXCEPTION 'Inicio longe demais'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;

  -- Horário de funcionamento, no relógio de Brasília. Em minutos desde a
  -- meia-noite do dia do início — fechar às 24:00 também funciona.
  IF g.hours_mode = 'daily' THEN
    ini := NEW.starts_at AT TIME ZONE 'America/Sao_Paulo';
    fim := NEW.ends_at AT TIME ZONE 'America/Sao_Paulo';
    IF extract(epoch FROM (ini - ini::date::timestamp)) < extract(epoch FROM g.opens_at) THEN
      RAISE EXCEPTION 'O espaco abre as %', to_char(g.opens_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
    IF extract(epoch FROM (fim - ini::date::timestamp)) > extract(epoch FROM g.closes_at) THEN
      RAISE EXCEPTION 'O espaco fecha as %', to_char(g.closes_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
  END IF;

  -- Dias que a reserva toca (fim exclusivo), no relógio de Brasília — é o
  -- que o calendário de bloqueios compara (trigger bookings_guard_blocked_period).
  NEW.start_date := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  NEW.end_date := CASE
    WHEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::time = '00:00'
      THEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date
    ELSE (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date + 1
  END;
  -- Proteção depois do fim: 7 minutos para renovar, se o grupo aceita.
  NEW.renewal_allowed := g.renewal_allowed;
  NEW.occupied_until := NEW.ends_at + CASE WHEN g.renewal_allowed THEN interval '7 minutes' ELSE interval '0' END;

  RETURN NEW;
END;
$$;$mp_32_31$;

    EXECUTE $mp_32_32$-- O nome começa com "derive" de propósito: triggers BEFORE rodam em ordem
-- alfabética, e esta precisa preencher as datas antes de
-- `bookings_guard_blocked_period` conferir o calendário.
CREATE TRIGGER bookings_derive_rental_shape
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_rental_shape();$mp_32_32$;

    EXECUTE $mp_32_33$-- ---------------------------------------------------------------------------
-- 6. Encerrar o que venceu — sempre pelo relógio do banco.
--
-- Chamada (a) pela transação que vai alugar uma unidade, antes de procurar
-- unidade livre, e (b) pelo agendador por minuto. Só mexe em estado; os
-- efeitos fora do banco (avisos, cancelar a recorrência no Asaas, excluir a
-- cobrança que não deve mais ser paga) ficam marcados aqui e são executados
-- pela aplicação, que repete até o gateway confirmar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_rentals(p_space uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n_reservas integer := 0;
  n_temporarios integer := 0;
  n_pendentes integer := 0;
BEGIN
  -- Reserva temporária não paga no prazo: unidade liberada; a cobrança em
  -- aberto é marcada para exclusão no gateway (não pode mais ser paga).
  WITH vencidas AS (
    UPDATE public.bookings
       SET status = 'expired', end_reason = 'hold_expired', updated_at = now()
     WHERE kind = 'temporary' AND status = 'awaiting_payment'
       AND hold_expires_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), cobrancas AS (
    UPDATE public.payments p
       SET delete_requested_at = now(), updated_at = now()
      FROM vencidas v
     WHERE p.booking_id = v.id AND p.status IN ('pending', 'overdue') AND p.delete_requested_at IS NULL
    RETURNING p.id
  )
  SELECT count(*) INTO n_reservas FROM vencidas;

  -- Temporário que terminou e cuja janela de renovação já passou.
  UPDATE public.bookings
     SET status = 'ended', end_reason = 'completed', ended_at = ends_at, updated_at = now()
   WHERE kind = 'temporary' AND status = 'active'
     AND occupied_until <= now()
     AND (p_space IS NULL OR space_id = p_space);
  GET DIAGNOSTICS n_temporarios = ROW_COUNT;

  -- Pagamento pendente que passou do prazo total (40 min + 1 h): aluguel
  -- encerrado, recorrência marcada como cancelada (o cancelamento no Asaas
  -- é feito pela aplicação e repetido até confirmar).
  WITH encerradas AS (
    UPDATE public.bookings
       SET status = 'ended', end_reason = 'payment_not_received', ended_at = now(), updated_at = now()
     WHERE status = 'past_due'
       AND payment_issue_deadline_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), assinaturas AS (
    UPDATE public.subscriptions s
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      FROM encerradas e
     WHERE s.booking_id = e.id
       AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
    RETURNING s.id
  )
  SELECT count(*) INTO n_pendentes FROM encerradas;

  RETURN n_reservas + n_temporarios + n_pendentes;
END;
$$;$mp_32_33$;

    EXECUTE $mp_32_34$-- ---------------------------------------------------------------------------
-- 7. Dados que já existiam: cada anúncio que já tinha passado da etapa de
-- preço ganha um grupo e uma unidade, com o mesmo preço mensal; cada reserva
-- aponta para essa unidade. Nada muda para quem já alugava.
-- ---------------------------------------------------------------------------
INSERT INTO public.space_unit_groups (space_id, name, position, allows_continuous, allows_temporary, monthly_price_cents)
SELECT s.id, 'Padrão', 0, true, false, s.price_monthly_cents
  FROM public.spaces s
 WHERE s.price_monthly_cents IS NOT NULL
   AND (s.status <> 'draft' OR s.draft_step >= 7)
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_34$;

    EXECUTE $mp_32_35$INSERT INTO public.space_units (space_id, group_id, label, position)
SELECT g.space_id, g.id, 'Unidade 1', 1
  FROM public.space_unit_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id);$mp_32_35$;

    EXECUTE $mp_32_36$-- Rascunho que ainda não chegou no preço tinha 1 centavo provisório (o CHECK
-- exigia > 0 desde o INSERT). Agora o campo aceita NULL: sai o provisório.
UPDATE public.spaces s
   SET price_monthly_cents = NULL
 WHERE s.status = 'draft'
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_36$;

    EXECUTE $mp_32_37$-- Reservas antigas apontam para a unidade criada acima. O início exato
-- (meia-noite de Brasília do dia de início) vem da trigger da seção 5.
UPDATE public.bookings b
   SET kind = 'continuous',
       group_id = g.id,
       unit_id = u.id
  FROM public.space_unit_groups g
  JOIN public.space_units u ON u.group_id = g.id
 WHERE g.space_id = b.space_id
   AND b.group_id IS NULL;$mp_32_37$;

    EXECUTE $mp_32_38$-- Atraso que já existia ganha o prazo novo a partir de agora (antes não
-- havia prazo nenhum: a unidade podia ficar ocupada para sempre).
UPDATE public.bookings
   SET payment_issue_started_at = now(),
       payment_issue_deadline_at = now() + interval '100 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NULL;$mp_32_38$;

    EXECUTE $mp_32_39$-- Cancelamentos anteriores já passavam pelo Asaas antes do banco.
UPDATE public.subscriptions
   SET provider_cancelled_at = cancelled_at
 WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_32_39$;

    EXECUTE $mp_32_40$-- ---------------------------------------------------------------------------
-- 8. Restrições que dependem do preenchimento acima.
-- ---------------------------------------------------------------------------

-- Ninguém ocupa a mesma unidade ao mesmo tempo. Contínuo tem intervalo sem
-- fim (occupied_until NULL), então também bloqueia temporário por cima dele.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_unit_no_overlap
  EXCLUDE USING gist (unit_id WITH =, tstzrange(starts_at, occupied_until, '[)') WITH &&)
  WHERE (unit_id IS NOT NULL AND status IN ('approved', 'awaiting_payment', 'active', 'past_due'));$mp_32_40$;

    EXECUTE $mp_32_41$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_occupying_has_unit
  CHECK (status NOT IN ('approved', 'awaiting_payment', 'active', 'past_due')
         OR (unit_id IS NOT NULL AND group_id IS NOT NULL AND starts_at IS NOT NULL));$mp_32_41$;

    EXECUTE $mp_32_42$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_shape
  CHECK (kind <> 'temporary' OR (
    group_id IS NOT NULL AND unit_id IS NOT NULL
    AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
    AND occupied_until IS NOT NULL
    AND occupied_until >= ends_at
    AND occupied_until <= ends_at + interval '7 minutes'
    AND duration_units IS NOT NULL AND duration_units > 0 AND duration_unit IS NOT NULL
    AND status NOT IN ('requested', 'approved', 'rejected', 'past_due')
  ));$mp_32_42$;

    EXECUTE $mp_32_43$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_continuous_open_ended
  CHECK (kind <> 'continuous' OR (
    ends_at IS NULL AND occupied_until IS NULL AND hold_expires_at IS NULL
    AND duration_units IS NULL AND duration_unit IS NULL AND renewed_from_id IS NULL
  ));$mp_32_43$;

    EXECUTE $mp_32_44$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_hold
  CHECK (kind <> 'temporary' OR status <> 'awaiting_payment' OR hold_expires_at IS NOT NULL);$mp_32_44$;

    EXECUTE $mp_32_45$-- Pagamento pendente: só no contínuo, sempre com o prazo fixo de 40 min +
-- 1 h a partir do início da falha. Fora dele, os campos ficam vazios — só o
-- aluguel encerrado guarda a última janela, como histórico.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_window
  CHECK (
    (status = 'past_due'
      AND kind = 'continuous'
      AND payment_issue_started_at IS NOT NULL
      AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
    OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
    OR (status = 'ended' AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
  );$mp_32_45$;

    EXECUTE $mp_32_46$-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE
-- (0010), e num banco novo todas as migrações rodam numa transação só — o
-- Postgres não deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));$mp_32_46$;

    EXECUTE $mp_32_47$-- ---------------------------------------------------------------------------
-- 9. RLS (nenhum acesso direto do navegador) e configurações.
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_unit_groups ENABLE ROW LEVEL SECURITY;$mp_32_47$;

    EXECUTE $mp_32_48$ALTER TABLE public.space_units ENABLE ROW LEVEL SECURITY;$mp_32_48$;

    EXECUTE $mp_32_49$DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['space_unit_groups', 'space_units'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;

  -- Funções que mudam estado não são chamáveis pela API do navegador (RPC).
  FOREACH f IN ARRAY ARRAY['public.release_expired_rentals(uuid)', 'public.apply_space_occupancy(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    END IF;
  END LOOP;
END;
$$;$mp_32_49$;

    EXECUTE $mp_32_50$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('rental.hold_minutes', '15'::jsonb,
   'Minutos que uma reserva temporária fica segura enquanto a pessoa paga.', true),
  ('rental.max_advance_days', '30'::jsonb,
   'Com quantos dias de antecedência dá para reservar um aluguel temporário.', true)
ON CONFLICT (key) DO NOTHING;$mp_32_50$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2', 1790849030748);

    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) aplicada.';
  END IF;
END
$mp_bloco_32$;


-- ----------------------------------------------------------------------------
-- Migracao 33: 0033_modelo_mensal_quantidade  (126 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_33$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '602a6622fa40d80b91893ce7a2a449b714fa7c5a80e3cfa02ef8e2f57cea6d2f'
  ) THEN
    RAISE NOTICE 'Migracao 33 (0033_modelo_mensal_quantidade) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_33_0$-- ===========================================================================
-- 0033 — Modelo mensal por quantidade.
--
-- O marketplace passa a trabalhar SÓ com aluguel mensal. Um anúncio tem uma
-- QUANTIDADE de unidades oferecidas (uma garagem = 1; um estacionamento = 80
-- de 100 vagas) e cada locação que ocupa consome uma. Saem as unidades
-- individuais (A1, B17…), os grupos de unidades e o aluguel por
-- hora/dia/semana da Parte 12: a organização física é do proprietário e vai
-- nas instruções de acesso, que agora são obrigatórias no aceite.
--
-- Ordem (cada passo depende do anterior):
--   1. dados que não podem ficar para trás (locações por hora, anúncios sem
--      preço mensal, pedidos duplicados);
--   2. quantidade nos anúncios e prazos/instruções nas reservas;
--   3. remoção do modelo antigo (gatilhos, colunas, tabelas, funções, tipos);
--   4. estruturas novas (enums, tabela de pedidos de encerramento, áudio);
--   5. regras no banco: última vaga, preço, aceite, prazos, encerramento;
--   6. calendário (bloqueio vale para o INÍCIO de novas locações);
--   7. Storage do áudio, configurações e RLS.
--
-- Nota: valores novos de enum EXISTENTE (notification_type) não são usados
-- como literal aqui — o migrador roda tudo numa transação só e o Postgres
-- não deixa usar um valor acrescentado na mesma transação.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Dados que não podem ficar para trás
-- ---------------------------------------------------------------------------

-- Locações por hora/dia/semana deixam de existir. As que ainda estão vivas
-- são encerradas — nunca apagadas: pagamentos e livro-razão apontam para elas
-- e o livro-razão não aceita DELETE. Cobrança ainda em aberto é marcada para
-- exclusão no gateway (a fila de manutenção executa).
UPDATE public.payments p
   SET delete_requested_at = now(), updated_at = now()
  FROM public.bookings b
 WHERE p.booking_id = b.id
   AND b.kind = 'temporary'
   AND b.status IN ('requested', 'approved', 'awaiting_payment')
   AND p.status IN ('pending', 'overdue')
   AND p.delete_requested_at IS NULL;$mp_33_0$;

    EXECUTE $mp_33_1$-- (`cancelled`, não `expired`: num banco novo todas as migrações rodam numa
-- transação só e o Postgres não deixa usar na mesma transação o valor
-- `expired`, acrescentado ao enum pela 0010.)
UPDATE public.bookings
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Aluguel por hora, dia ou semana descontinuado.',
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('requested', 'approved', 'awaiting_payment');$mp_33_1$;

    EXECUTE $mp_33_2$UPDATE public.bookings
   SET status = 'ended',
       ended_at = COALESCE(LEAST(ends_at, now()), now()),
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('active', 'past_due');$mp_33_2$;

    EXECUTE $mp_33_3$-- Anúncio no ar sem preço mensal (só alugava por hora) não pode continuar no
-- ar: preço mensal passa a ser obrigatório para publicar. Fica pausado até o
-- proprietário informar o preço.
UPDATE public.spaces
   SET status = 'paused', updated_at = now()
 WHERE price_monthly_cents IS NULL AND status IN ('published', 'rented');$mp_33_3$;

    EXECUTE $mp_33_4$-- ---------------------------------------------------------------------------
-- 2. Quantidade nos anúncios e prazos/instruções nas reservas
-- ---------------------------------------------------------------------------

ALTER TABLE public.spaces ADD COLUMN quantity_offered integer DEFAULT 1 NOT NULL;$mp_33_4$;

    EXECUTE $mp_33_5$ALTER TABLE public.spaces ADD COLUMN quantity_total integer;$mp_33_5$;

    EXECUTE $mp_33_6$ALTER TABLE public.spaces ADD COLUMN quantity_available integer DEFAULT 1 NOT NULL;$mp_33_6$;

    EXECUTE $mp_33_7$-- Quem tinha N unidades ativas passa a oferecer N (no mínimo 1, e nunca menos
-- do que já está ocupado). O disponível sai da contagem de reservas.
UPDATE public.spaces s
   SET quantity_offered = GREATEST(
         1,
         (SELECT count(*) FROM public.space_units u WHERE u.space_id = s.id AND u.active)::integer,
         (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer
       );$mp_33_7$;

    EXECUTE $mp_33_8$UPDATE public.spaces s
   SET quantity_available = s.quantity_offered
         - (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer;$mp_33_8$;

    EXECUTE $mp_33_9$ALTER TABLE public.bookings ADD COLUMN response_deadline_at timestamp with time zone;$mp_33_9$;

    EXECUTE $mp_33_10$ALTER TABLE public.bookings ADD COLUMN first_payment_deadline_at timestamp with time zone;$mp_33_10$;

    EXECUTE $mp_33_11$ALTER TABLE public.bookings ADD COLUMN access_instructions text;$mp_33_11$;

    EXECUTE $mp_33_12$ALTER TABLE public.bookings ADD COLUMN access_audio_path text;$mp_33_12$;

    EXECUTE $mp_33_13$ALTER TABLE public.bookings ADD COLUMN access_audio_duration_ms integer;$mp_33_13$;

    EXECUTE $mp_33_14$ALTER TABLE public.bookings ADD COLUMN access_audio_mime text;$mp_33_14$;

    EXECUTE $mp_33_15$ALTER TABLE public.bookings ADD COLUMN access_instructions_at timestamp with time zone;$mp_33_15$;

    EXECUTE $mp_33_16$-- Quem já estava esperando começa um prazo novo a partir de agora (o prazo
-- antigo era de 7 dias e não existia para pagar): ninguém expira de surpresa
-- por causa desta migração.
UPDATE public.bookings SET response_deadline_at = now() + interval '24 hours' WHERE status = 'requested';$mp_33_16$;

    EXECUTE $mp_33_17$UPDATE public.bookings SET first_payment_deadline_at = now() + interval '24 hours'
 WHERE status IN ('approved', 'awaiting_payment');$mp_33_17$;

    EXECUTE $mp_33_18$-- Dois pedidos PENDENTES da mesma pessoa para o mesmo anúncio: fica o mais
-- antigo, os outros são cancelados. Sem isto o índice único de pedido
-- pendente (abaixo) não nasceria.
UPDATE public.bookings d
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Pedido duplicado, cancelado na migração do modelo mensal.',
       updated_at = now()
 WHERE d.status = 'requested'
   AND EXISTS (
     SELECT 1 FROM public.bookings o
      WHERE o.space_id = d.space_id AND o.renter_id = d.renter_id AND o.id <> d.id
        AND o.status = 'requested'
        AND (o.requested_at < d.requested_at
             OR (o.requested_at = d.requested_at AND o.id < d.id))
   );$mp_33_18$;

    EXECUTE $mp_33_19$-- ---------------------------------------------------------------------------
-- 3. Remoção do modelo antigo (unidades, grupos, locação por hora)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS bookings_derive_rental_shape ON public.bookings;$mp_33_19$;

    EXECUTE $mp_33_20$DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;$mp_33_20$;

    EXECUTE $mp_33_21$DROP TRIGGER IF EXISTS bookings_guard_blocked_period ON public.bookings;$mp_33_21$;

    EXECUTE $mp_33_22$DROP TRIGGER IF EXISTS spaces_price_from_units ON public.spaces;$mp_33_22$;

    EXECUTE $mp_33_23$DROP TRIGGER IF EXISTS spaces_publish_requires_units ON public.spaces;$mp_33_23$;

    EXECUTE $mp_33_24$-- As colunas levam junto o que depende delas: a restrição de exclusão por
-- unidade, as chaves para grupo/unidade e os índices e CHECKs do aluguel por
-- hora (o Postgres derruba restrição que envolve a coluna removida).
ALTER TABLE public.bookings
  DROP COLUMN kind,
  DROP COLUMN group_id,
  DROP COLUMN unit_id,
  DROP COLUMN starts_at,
  DROP COLUMN ends_at,
  DROP COLUMN occupied_until,
  DROP COLUMN duration_units,
  DROP COLUMN duration_unit,
  DROP COLUMN renewal_allowed,
  DROP COLUMN renewed_from_id,
  DROP COLUMN hold_expires_at;$mp_33_24$;

    EXECUTE $mp_33_25$ALTER TABLE public.spaces
  DROP COLUMN temp_from_cents,
  DROP COLUMN temp_from_units,
  DROP COLUMN temp_from_unit;$mp_33_25$;

    EXECUTE $mp_33_26$DROP TABLE public.space_units;$mp_33_26$;

    EXECUTE $mp_33_27$DROP TABLE public.space_unit_groups;$mp_33_27$;

    EXECUTE $mp_33_28$DROP FUNCTION IF EXISTS public.guard_unit_group_config();$mp_33_28$;

    EXECUTE $mp_33_29$DROP FUNCTION IF EXISTS public.space_rental_summary(uuid);$mp_33_29$;

    EXECUTE $mp_33_30$DROP FUNCTION IF EXISTS public.sync_space_rental_summary();$mp_33_30$;

    EXECUTE $mp_33_31$DROP FUNCTION IF EXISTS public.guard_space_rental_summary();$mp_33_31$;

    EXECUTE $mp_33_32$DROP FUNCTION IF EXISTS public.space_fully_rented(uuid);$mp_33_32$;

    EXECUTE $mp_33_33$DROP FUNCTION IF EXISTS public.apply_space_occupancy(uuid);$mp_33_33$;

    EXECUTE $mp_33_34$DROP FUNCTION IF EXISTS public.sync_space_occupancy();$mp_33_34$;

    EXECUTE $mp_33_35$DROP FUNCTION IF EXISTS public.sync_occupancy_from_units();$mp_33_35$;

    EXECUTE $mp_33_36$DROP FUNCTION IF EXISTS public.space_has_rentable_unit(uuid);$mp_33_36$;

    EXECUTE $mp_33_37$DROP FUNCTION IF EXISTS public.guard_publish_requires_units();$mp_33_37$;

    EXECUTE $mp_33_38$DROP FUNCTION IF EXISTS public.unit_has_live_rental(uuid);$mp_33_38$;

    EXECUTE $mp_33_39$DROP FUNCTION IF EXISTS public.space_keeps_a_unit(uuid, uuid, uuid);$mp_33_39$;

    EXECUTE $mp_33_40$DROP FUNCTION IF EXISTS public.guard_unit_change();$mp_33_40$;

    EXECUTE $mp_33_41$DROP FUNCTION IF EXISTS public.guard_group_change();$mp_33_41$;

    EXECUTE $mp_33_42$DROP FUNCTION IF EXISTS public.temporary_rent_cents(uuid, integer, public.rental_time_unit);$mp_33_42$;

    EXECUTE $mp_33_43$DROP FUNCTION IF EXISTS public.rental_unit_interval(public.rental_time_unit);$mp_33_43$;

    EXECUTE $mp_33_44$DROP FUNCTION IF EXISTS public.guard_booking_rental_shape();$mp_33_44$;

    EXECUTE $mp_33_45$DROP TYPE public.rental_kind;$mp_33_45$;

    EXECUTE $mp_33_46$DROP TYPE public.rental_time_unit;$mp_33_46$;

    EXECUTE $mp_33_47$DROP TYPE public.temporary_pricing_mode;$mp_33_47$;

    EXECUTE $mp_33_48$DROP TYPE public.operating_hours_mode;$mp_33_48$;

    EXECUTE $mp_33_49$-- Motivos de encerramento: o tipo muda de valores (saem `completed` e
-- `hold_expired`, entram `request_not_answered` e `owner_end_request`).
-- Valor de enum não se apaga, então o tipo é recriado, preservando o que já
-- estava gravado (`hold_expired` vira `payment_not_received`; `completed`,
-- que era o fim natural do aluguel por hora, fica sem motivo).
CREATE TYPE public.booking_end_reason_novo AS ENUM (
  'cancelled_by_renter', 'cancelled_by_owner', 'request_not_answered', 'payment_not_received', 'owner_end_request'
);$mp_33_49$;

    EXECUTE $mp_33_50$ALTER TABLE public.bookings ADD COLUMN end_reason_novo public.booking_end_reason_novo;$mp_33_50$;

    EXECUTE $mp_33_51$UPDATE public.bookings
   SET end_reason_novo = (CASE end_reason::text
         WHEN 'cancelled_by_renter' THEN 'cancelled_by_renter'
         WHEN 'cancelled_by_owner' THEN 'cancelled_by_owner'
         WHEN 'payment_not_received' THEN 'payment_not_received'
         WHEN 'hold_expired' THEN 'payment_not_received'
         ELSE NULL
       END)::public.booking_end_reason_novo
 WHERE end_reason IS NOT NULL;$mp_33_51$;

    EXECUTE $mp_33_52$ALTER TABLE public.bookings DROP COLUMN end_reason;$mp_33_52$;

    EXECUTE $mp_33_53$DROP TYPE public.booking_end_reason;$mp_33_53$;

    EXECUTE $mp_33_54$ALTER TYPE public.booking_end_reason_novo RENAME TO booking_end_reason;$mp_33_54$;

    EXECUTE $mp_33_55$ALTER TABLE public.bookings RENAME COLUMN end_reason_novo TO end_reason;$mp_33_55$;

    EXECUTE $mp_33_56$-- Configurações do modelo antigo (nada mais as lê).
DELETE FROM public.platform_settings
 WHERE key IN ('rental.hold_minutes', 'rental.max_advance_days', 'booking.request_expiry_days');$mp_33_56$;

    EXECUTE $mp_33_57$-- ---------------------------------------------------------------------------
-- 4. Estruturas novas
-- ---------------------------------------------------------------------------

CREATE TYPE public.booking_end_request_status AS ENUM ('pending', 'withdrawn', 'completed');$mp_33_57$;

    EXECUTE $mp_33_58$CREATE TYPE public.message_kind AS ENUM ('text', 'audio');$mp_33_58$;

    EXECUTE $mp_33_59$ALTER TYPE public.notification_type ADD VALUE 'booking_request_expiring';$mp_33_59$;

    EXECUTE $mp_33_60$ALTER TYPE public.notification_type ADD VALUE 'booking_expired';$mp_33_60$;

    EXECUTE $mp_33_61$ALTER TYPE public.notification_type ADD VALUE 'rental_started';$mp_33_61$;

    EXECUTE $mp_33_62$ALTER TYPE public.notification_type ADD VALUE 'rental_end_requested';$mp_33_62$;

    EXECUTE $mp_33_63$CREATE TABLE public.booking_end_requests (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_end_date" date NOT NULL,
	"reason" text,
	"status" public.booking_end_request_status DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "booking_end_requests_reason_max" CHECK ("booking_end_requests"."reason" IS NULL OR char_length("booking_end_requests"."reason") <= 500),
	CONSTRAINT "booking_end_requests_resolved_matches" CHECK (("booking_end_requests"."status" = 'pending') = ("booking_end_requests"."resolved_at" IS NULL))
);$mp_33_63$;

    EXECUTE $mp_33_64$ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_33_64$;

    EXECUTE $mp_33_65$ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_33_65$;

    EXECUTE $mp_33_66$CREATE INDEX "booking_end_requests_booking_idx" ON public.booking_end_requests USING btree ("booking_id","created_at");$mp_33_66$;

    EXECUTE $mp_33_67$CREATE UNIQUE INDEX "booking_end_requests_one_pending" ON public.booking_end_requests USING btree ("booking_id") WHERE status = 'pending';$mp_33_67$;

    EXECUTE $mp_33_68$CREATE INDEX "booking_end_requests_due_idx" ON public.booking_end_requests USING btree ("requested_end_date") WHERE status = 'pending';$mp_33_68$;

    EXECUTE $mp_33_69$-- Mensagens: texto ou áudio (imagem não existe).
ALTER TABLE public.messages ADD COLUMN kind public.message_kind DEFAULT 'text' NOT NULL;$mp_33_69$;

    EXECUTE $mp_33_70$ALTER TABLE public.messages ADD COLUMN audio_path text;$mp_33_70$;

    EXECUTE $mp_33_71$ALTER TABLE public.messages ADD COLUMN audio_duration_ms integer;$mp_33_71$;

    EXECUTE $mp_33_72$ALTER TABLE public.messages ADD COLUMN audio_mime text;$mp_33_72$;

    EXECUTE $mp_33_73$ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';$mp_33_73$;

    EXECUTE $mp_33_74$ALTER TABLE public.messages DROP CONSTRAINT messages_body_not_empty;$mp_33_74$;

    EXECUTE $mp_33_75$ALTER TABLE public.messages ADD CONSTRAINT messages_body_not_empty
  CHECK (kind::text = 'audio' OR length(trim(body)) > 0);$mp_33_75$;

    EXECUTE $mp_33_76$ALTER TABLE public.messages ADD CONSTRAINT messages_audio_shape
  CHECK ((kind::text = 'text' AND audio_path IS NULL AND audio_duration_ms IS NULL AND audio_mime IS NULL)
      OR (kind::text = 'audio' AND audio_path IS NOT NULL AND audio_duration_ms BETWEEN 1000 AND 180000
          AND audio_mime IS NOT NULL AND body = ''));$mp_33_76$;

    EXECUTE $mp_33_77$-- O arquivo de áudio mora na pasta da própria conversa: ninguém aponta uma
-- mensagem para o áudio de outra conversa.
ALTER TABLE public.messages ADD CONSTRAINT messages_audio_path_in_conversation
  CHECK (audio_path IS NULL OR audio_path LIKE (conversation_id::text || '/%'));$mp_33_77$;

    EXECUTE $mp_33_78$-- Anúncios: quantidade e preço obrigatório para ir ao ar.
ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_offered_range
  CHECK (quantity_offered BETWEEN 1 AND 10000);$mp_33_78$;

    EXECUTE $mp_33_79$ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_total_covers_offered
  CHECK (quantity_total IS NULL OR quantity_total >= quantity_offered);$mp_33_79$;

    EXECUTE $mp_33_80$ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_available_range
  CHECK (quantity_available BETWEEN 0 AND quantity_offered);$mp_33_80$;

    EXECUTE $mp_33_81$ALTER TABLE public.spaces ADD CONSTRAINT spaces_published_requires_price
  CHECK (status NOT IN ('published', 'rented') OR price_monthly_cents IS NOT NULL);$mp_33_81$;

    EXECUTE $mp_33_82$-- Reservas: índices de varredura, um pedido pendente por pessoa e anúncio, e
-- as regras de formato.
CREATE INDEX "bookings_space_occupying_idx" ON public.bookings USING btree ("space_id")
  WHERE status IN ('approved','awaiting_payment','active','past_due');$mp_33_82$;

    EXECUTE $mp_33_83$CREATE INDEX "bookings_response_deadline_idx" ON public.bookings USING btree ("response_deadline_at")
  WHERE status = 'requested';$mp_33_83$;

    EXECUTE $mp_33_84$CREATE INDEX "bookings_first_payment_deadline_idx" ON public.bookings USING btree ("first_payment_deadline_at")
  WHERE status IN ('approved','awaiting_payment');$mp_33_84$;

    EXECUTE $mp_33_85$CREATE UNIQUE INDEX "bookings_one_pending_per_renter_space" ON public.bookings USING btree ("space_id","renter_id")
  WHERE status = 'requested';$mp_33_85$;

    EXECUTE $mp_33_86$ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_instructions_length
  CHECK (access_instructions IS NULL OR char_length(btrim(access_instructions)) BETWEEN 10 AND 1000);$mp_33_86$;

    EXECUTE $mp_33_87$-- O áudio das instruções anda junto com a duração e o tipo (mesmos limites do
-- áudio do chat: de 1 s a 3 min).
ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_audio_shape
  CHECK ((access_audio_path IS NULL AND access_audio_duration_ms IS NULL AND access_audio_mime IS NULL)
      OR (access_audio_path IS NOT NULL AND access_audio_duration_ms BETWEEN 1000 AND 180000
          AND access_audio_mime IS NOT NULL));$mp_33_87$;

    EXECUTE $mp_33_88$-- A janela do pagamento pendente passa a ser TOTAL de 2 h (era 40 min + 1 h =
-- 100 min). Quem está dentro dela agora recebe os 120 minutos completos; a
-- janela guardada nas locações já encerradas é histórico e fica como estava.
UPDATE public.bookings
   SET payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NOT NULL;$mp_33_88$;

    EXECUTE $mp_33_89$ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_window
  CHECK ((status = 'past_due'
            AND payment_issue_started_at IS NOT NULL
            AND payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes')
          OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
          OR (status = 'ended' AND payment_issue_started_at IS NOT NULL AND payment_issue_deadline_at > payment_issue_started_at));$mp_33_89$;

    EXECUTE $mp_33_90$-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE (0010),
-- e num banco novo todas as migrações rodam numa transação só — o Postgres não
-- deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));$mp_33_90$;

    EXECUTE $mp_33_91$-- ---------------------------------------------------------------------------
-- 5. Regras no banco
-- ---------------------------------------------------------------------------

-- Recontagem da disponibilidade de um anúncio. RECONTA (não soma/subtrai):
-- o número nunca diverge das reservas, mesmo se algum caminho esquecer de
-- avisar. Trava a linha do anúncio, então duas alterações simultâneas passam
-- em fila. Se a contagem passar do oferecido (nunca deveria: a trava de
-- capacidade impede), o CHECK `spaces_quantity_available_range` recusa em
-- voz alta em vez de esconder o problema.
CREATE OR REPLACE FUNCTION public.refresh_space_availability(p_space uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  oferecidas integer;
  situacao public.space_status;
  ocupadas integer;
  livres integer;
BEGIN
  SELECT quantity_offered, status INTO oferecidas, situacao
    FROM public.spaces WHERE id = p_space FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*) INTO ocupadas
    FROM public.bookings b
   WHERE b.space_id = p_space AND public.booking_occupies(b.status);
  livres := oferecidas - ocupadas;

  UPDATE public.spaces SET quantity_available = livres
   WHERE id = p_space AND quantity_available IS DISTINCT FROM livres;

  IF situacao = 'published' AND livres <= 0 THEN
    UPDATE public.spaces SET status = 'rented' WHERE id = p_space;
  ELSIF situacao = 'rented' AND livres > 0 THEN
    BEGIN
      UPDATE public.spaces SET status = 'published' WHERE id = p_space;
    EXCEPTION WHEN check_violation THEN
      -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
      -- fotos). A locação encerra do mesmo jeito — travar o encerramento por
      -- causa do anúncio seria pior — e o anúncio fica pausado até o
      -- proprietário corrigir.
      UPDATE public.spaces SET status = 'paused' WHERE id = p_space;
    END;
  END IF;
END;
$$;$mp_33_91$;

    EXECUTE $mp_33_92$-- Disponibilidade acompanha qualquer mudança de reserva.
CREATE OR REPLACE FUNCTION public.sync_space_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_space_availability(OLD.space_id);
  ELSE
    PERFORM public.refresh_space_availability(NEW.space_id);
  END IF;
  RETURN NULL;
END;
$$;$mp_33_92$;

    EXECUTE $mp_33_93$CREATE TRIGGER bookings_sync_availability
  AFTER INSERT OR UPDATE OF status, space_id OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_availability();$mp_33_93$;

    EXECUTE $mp_33_94$-- A ÚLTIMA VAGA. Quando uma reserva passa a ocupar (aceite, ou inserção
-- direta já ocupando), o banco trava a linha do anúncio e conta quem já
-- ocupa: se não sobra vaga, recusa. O SELECT ... FOR UPDATE e a contagem são
-- comandos separados de propósito — em READ COMMITTED a contagem enxerga o
-- que a transação concorrente acabou de gravar depois que ela solta a trava.
-- Duas pessoas aceitas ao mesmo tempo para a última vaga: uma passa, a outra
-- recebe `bookings_capacity`.
CREATE OR REPLACE FUNCTION public.guard_booking_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  oferecidas integer;
  ocupadas integer;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Já ocupava uma vaga deste anúncio: nada novo (active -> past_due etc.).
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.space_id = OLD.space_id THEN
    RETURN NEW;
  END IF;

  SELECT quantity_offered INTO oferecidas
    FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anuncio inexistente'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'bookings_space_exists';
  END IF;

  SELECT count(*) INTO ocupadas
    FROM public.bookings b
   WHERE b.space_id = NEW.space_id
     AND b.id <> NEW.id
     AND public.booking_occupies(b.status);

  IF ocupadas >= oferecidas THEN
    RAISE EXCEPTION 'Nao ha vaga disponivel neste anuncio'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_capacity';
  END IF;

  RETURN NEW;
END;
$$;$mp_33_94$;

    EXECUTE $mp_33_95$CREATE TRIGGER bookings_guard_capacity
  BEFORE INSERT OR UPDATE OF status, space_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_capacity();$mp_33_95$;

    EXECUTE $mp_33_96$-- O valor mensal da reserva é sempre o preço do anúncio: conferido quando o
-- pedido nasce e de novo no aceite (que congela o preço vigente). O servidor
-- calcula; o banco confere.
CREATE OR REPLACE FUNCTION public.guard_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  preco integer;
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.status = 'requested' AND NEW.status = 'approved') THEN
    SELECT price_monthly_cents INTO preco FROM public.spaces WHERE id = NEW.space_id;
    IF preco IS NULL OR preco IS DISTINCT FROM NEW.monthly_rent_cents THEN
      RAISE EXCEPTION 'Valor mensal diferente do preco do anuncio'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_space';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;$mp_33_96$;

    EXECUTE $mp_33_97$CREATE TRIGGER bookings_guard_price
  BEFORE INSERT OR UPDATE OF status, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_price();$mp_33_97$;

    EXECUTE $mp_33_98$-- Uma pessoa não tem duas locações vivas do MESMO anúncio: ao nascer um pedido
-- (ou reserva), se ela já tem outra viva ali, o banco recusa. É uma trava de
-- INSERT, não um índice sobre todas as linhas, para não depender de os dados
-- antigos estarem arrumados. Dois cliques ao mesmo tempo caem no índice único
-- de pedido pendente.
CREATE OR REPLACE FUNCTION public.guard_booking_single_live()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('requested', 'approved', 'awaiting_payment', 'active', 'past_due')
     AND EXISTS (
       SELECT 1 FROM public.bookings o
        WHERE o.space_id = NEW.space_id AND o.renter_id = NEW.renter_id AND o.id <> NEW.id
          AND o.status IN ('requested', 'approved', 'awaiting_payment', 'active', 'past_due')
     ) THEN
    RAISE EXCEPTION 'Voce ja tem uma locacao ou pedido em andamento neste anuncio'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_one_live_per_renter_space';
  END IF;
  RETURN NEW;
END;
$$;$mp_33_98$;

    EXECUTE $mp_33_99$CREATE TRIGGER bookings_guard_single_live
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_single_live();$mp_33_99$;

    EXECUTE $mp_33_100$-- Pedido novo: o prazo de resposta (24 h) começa a contar no relógio do banco.
CREATE OR REPLACE FUNCTION public.set_booking_deadlines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'requested' AND NEW.response_deadline_at IS NULL THEN
    NEW.response_deadline_at := now()
      + make_interval(hours => public.platform_setting_int('booking.request_expiry_hours', 24));
  END IF;
  RETURN NEW;
END;
$$;$mp_33_100$;

    EXECUTE $mp_33_101$CREATE TRIGGER bookings_set_deadlines
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_deadlines();$mp_33_101$;

    EXECUTE $mp_33_102$-- O ACEITE: só dentro do prazo de resposta, só com instruções de acesso
-- (texto de pelo menos 10 caracteres OU áudio), e é nele que começa o prazo
-- de 24 h para o locatário pagar.
CREATE OR REPLACE FUNCTION public.guard_booking_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'requested' AND NEW.status = 'approved' THEN
    IF OLD.response_deadline_at IS NOT NULL AND OLD.response_deadline_at < now() THEN
      RAISE EXCEPTION 'O prazo para responder esta solicitacao terminou'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_response_window';
    END IF;
    IF NOT (
      (NEW.access_instructions IS NOT NULL AND char_length(btrim(NEW.access_instructions)) >= 10)
      OR NEW.access_audio_path IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Informe como o locatario encontra e usa o espaco (texto ou audio)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_access_required';
    END IF;
    -- O áudio mora na pasta da conversa entre ESTE locatário e este anúncio:
    -- ninguém aponta a locação para o áudio de outra conversa.
    IF NEW.access_audio_path IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.space_id = NEW.space_id AND c.renter_id = NEW.renter_id
         AND NEW.access_audio_path LIKE (c.id::text || '/%')
    ) THEN
      RAISE EXCEPTION 'O audio das instrucoes precisa estar na conversa desta locacao'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_access_audio_in_conversation';
    END IF;
    NEW.access_instructions_at := now();
    NEW.first_payment_deadline_at := now()
      + make_interval(hours => public.platform_setting_int('booking.payment_deadline_hours', 24));
  END IF;
  RETURN NEW;
END;
$$;$mp_33_102$;

    EXECUTE $mp_33_103$CREATE TRIGGER bookings_guard_approval
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_approval();$mp_33_103$;

    EXECUTE $mp_33_104$-- Quantidade do anúncio: nunca abaixo do que já está ocupado; o disponível é
-- recalculado na hora (anúncio novo nasce com tudo disponível).
CREATE OR REPLACE FUNCTION public.guard_space_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ocupadas integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.quantity_available := NEW.quantity_offered;
    RETURN NEW;
  END IF;

  IF NEW.quantity_offered IS DISTINCT FROM OLD.quantity_offered THEN
    SELECT count(*) INTO ocupadas
      FROM public.bookings b
     WHERE b.space_id = NEW.id AND public.booking_occupies(b.status);
    IF NEW.quantity_offered < ocupadas THEN
      RAISE EXCEPTION 'Ha % locacoes em andamento: a quantidade nao pode ser menor que isso', ocupadas
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_quantity_covers_rentals';
    END IF;
    NEW.quantity_available := NEW.quantity_offered - ocupadas;
  END IF;
  RETURN NEW;
END;
$$;$mp_33_104$;

    EXECUTE $mp_33_105$CREATE TRIGGER spaces_guard_quantity
  BEFORE INSERT OR UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_quantity();$mp_33_105$;

    EXECUTE $mp_33_106$-- Mudou a quantidade oferecida: o status acompanha (alugado <-> no ar).
CREATE OR REPLACE FUNCTION public.sync_space_after_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_space_availability(NEW.id);
  RETURN NULL;
END;
$$;$mp_33_106$;

    EXECUTE $mp_33_107$CREATE TRIGGER spaces_sync_after_quantity_change
  AFTER UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW
  WHEN (NEW.quantity_offered IS DISTINCT FROM OLD.quantity_offered)
  EXECUTE FUNCTION public.sync_space_after_quantity_change();$mp_33_107$;

    EXECUTE $mp_33_108$-- Nenhum anúncio fica `published` sem vaga: retomar um anúncio pausado ou
-- republicar um lotado volta para `rented`. (O gatilho já existe desde a 0026.)
CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.quantity_available <= 0 THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;$mp_33_108$;

    EXECUTE $mp_33_109$-- Pedido de encerramento do proprietário: só ele pede, só de locação em
-- andamento, e a data respeita o prazo mínimo configurado (hoje 0 dias: as
-- regras de aviso prévio ainda não foram decididas e entram aqui, sem deploy).
CREATE OR REPLACE FUNCTION public.guard_booking_end_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dono uuid;
  situacao public.booking_status;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  minimo integer := public.platform_setting_int('rental.end_request_min_notice_days', 0);
BEGIN
  SELECT owner_id, status INTO dono, situacao
    FROM public.bookings WHERE id = NEW.booking_id FOR UPDATE;
  IF NOT FOUND OR dono <> NEW.requested_by THEN
    RAISE EXCEPTION 'So o proprietario da locacao pede o encerramento'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_by_owner';
  END IF;
  IF situacao NOT IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'So locacao em andamento pode ter encerramento pedido'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_live_booking';
  END IF;
  IF NEW.requested_end_date < hoje + minimo THEN
    RAISE EXCEPTION 'A data pedida precisa ter pelo menos % dias de antecedencia', minimo
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_min_notice';
  END IF;
  IF NEW.requested_end_date > hoje + 365 THEN
    RAISE EXCEPTION 'A data pedida esta longe demais'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_horizon';
  END IF;
  RETURN NEW;
END;
$$;$mp_33_109$;

    EXECUTE $mp_33_110$CREATE TRIGGER booking_end_requests_guard
  BEFORE INSERT ON public.booking_end_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_end_request();$mp_33_110$;

    EXECUTE $mp_33_111$-- Encerrar o que venceu — sempre pelo relógio do banco. Chamada (a) pela
-- transação que vai aceitar um pedido, (b) pelas telas antes de mostrar e (c)
-- pelo agendador. Só mexe em estado; o que acontece FORA do banco (cancelar a
-- recorrência no Asaas, excluir cobrança que não vale mais, avisar) fica
-- marcado aqui e é executado pela aplicação, que repete até o gateway
-- confirmar. Trava o anúncio ANTES de mexer nas reservas dele — a mesma
-- ordem das ações da aplicação, para duas transações nunca se esperarem.
CREATE OR REPLACE FUNCTION public.release_expired_rentals(p_space uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total integer := 0;
  n integer;
  alvo uuid;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR alvo IN
    SELECT DISTINCT b.space_id FROM public.bookings b
     WHERE (p_space IS NULL OR b.space_id = p_space)
       AND (   (b.status = 'requested' AND b.response_deadline_at <= now())
            OR (b.status IN ('approved', 'awaiting_payment') AND b.first_payment_deadline_at <= now())
            OR (b.status = 'past_due' AND b.payment_issue_deadline_at <= now())
            OR (b.status IN ('active', 'past_due') AND EXISTS (
                  SELECT 1 FROM public.booking_end_requests r
                   WHERE r.booking_id = b.id AND r.status = 'pending' AND r.requested_end_date <= hoje)))
  LOOP
    PERFORM 1 FROM public.spaces WHERE id = alvo FOR UPDATE;

    -- Pedido que o proprietário não respondeu em 24 h.
    UPDATE public.bookings
       SET status = 'expired', end_reason = 'request_not_answered', updated_at = now()
     WHERE space_id = alvo AND status = 'requested' AND response_deadline_at <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;

    -- Locação aceita que não foi paga em 24 h: a vaga volta; a cobrança em
    -- aberto e a recorrência ficam marcadas para o gateway.
    WITH vencidas AS (
      UPDATE public.bookings
         SET status = 'expired', end_reason = 'payment_not_received', updated_at = now()
       WHERE space_id = alvo AND status IN ('approved', 'awaiting_payment')
         AND first_payment_deadline_at <= now()
      RETURNING id
    ), cobrancas AS (
      UPDATE public.payments p
         SET delete_requested_at = now(), updated_at = now()
        FROM vencidas v
       WHERE p.booking_id = v.id AND p.status IN ('pending', 'overdue') AND p.delete_requested_at IS NULL
      RETURNING p.id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM vencidas v
       WHERE s.booking_id = v.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    )
    SELECT count(*) INTO n FROM vencidas;
    total := total + n;

    -- Pagamento pendente que passou da janela de 2 h: locação encerrada,
    -- recorrência marcada como cancelada.
    WITH encerradas AS (
      UPDATE public.bookings
         SET status = 'ended', end_reason = 'payment_not_received', ended_at = now(), updated_at = now()
       WHERE space_id = alvo AND status = 'past_due' AND payment_issue_deadline_at <= now()
      RETURNING id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM encerradas e
       WHERE s.booking_id = e.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    )
    SELECT count(*) INTO n FROM encerradas;
    total := total + n;

    -- Pedido de encerramento do proprietário cuja data chegou.
    WITH vencidos AS (
      SELECT r.id AS pedido, b.id AS reserva
        FROM public.booking_end_requests r
        JOIN public.bookings b ON b.id = r.booking_id
       WHERE b.space_id = alvo AND r.status = 'pending'
         AND r.requested_end_date <= hoje AND b.status IN ('active', 'past_due')
    ), encerradas AS (
      UPDATE public.bookings b
         SET status = 'ended', end_reason = 'owner_end_request', ended_at = now(), updated_at = now()
        FROM vencidos v
       WHERE b.id = v.reserva
      RETURNING b.id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM encerradas e
       WHERE s.booking_id = e.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    ), cumpridos AS (
      UPDATE public.booking_end_requests r
         SET status = 'completed', resolved_at = now()
        FROM vencidos v
       WHERE r.id = v.pedido
      RETURNING r.id
    )
    SELECT count(*) INTO n FROM encerradas;
    total := total + n;
  END LOOP;

  -- Pedido de encerramento que ficou para trás porque a locação terminou por
  -- outro motivo: não há mais o que pedir.
  UPDATE public.booking_end_requests r
     SET status = 'completed', resolved_at = now()
    FROM public.bookings b
   WHERE r.booking_id = b.id AND r.status = 'pending'
     AND b.status NOT IN ('active', 'past_due')
     AND (p_space IS NULL OR b.space_id = p_space);

  RETURN total;
END;
$$;$mp_33_111$;

    EXECUTE $mp_33_112$-- ---------------------------------------------------------------------------
-- 6. Calendário: o bloqueio vale para o INÍCIO de novas locações
--
-- Num aluguel mensal sem data para terminar, "bloqueio nunca cobre reserva
-- vigente" impedia qualquer bloqueio futuro assim que existisse uma locação
-- ativa — e com várias vagas isso é o normal. Agora o bloqueio fecha dias
-- para o início de locações novas (o equivalente a um calendário de entrada);
-- quem já está dentro continua. O aceite de um pedido cuja data de início cai
-- num dia bloqueado é recusado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange;
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK space_availability_blocks_dates_ordered recusa.
  IF NEW.ends_on < NEW.starts_on THEN
    RETURN NEW;
  END IF;
  periodo := daterange(NEW.starts_on, NEW.ends_on, '[]');

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.space_availability_blocks o
     WHERE o.space_id = NEW.space_id
       AND o.id <> NEW.id
       AND o.cancelled_at IS NULL
       AND daterange(o.starts_on, o.ends_on, '[]') && periodo
  ) THEN
    RAISE EXCEPTION 'Ja existe um bloqueio que cobre essas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_overlap';
  END IF;

  RETURN NEW;
END;
$$;$mp_33_112$;

    EXECUTE $mp_33_113$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bloqueio record;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Já ocupava uma vaga com esta mesma data de início: nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND NEW.start_date BETWEEN k.starts_on AND k.ends_on
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o inicio de locacoes de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;$mp_33_113$;

    EXECUTE $mp_33_114$CREATE TRIGGER bookings_guard_blocked_period
  BEFORE INSERT OR UPDATE OF status, start_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_against_blocks();$mp_33_114$;

    EXECUTE $mp_33_115$-- ---------------------------------------------------------------------------
-- 7. RLS, Storage do áudio e configurações
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_end_requests ENABLE ROW LEVEL SECURITY;$mp_33_115$;

    EXECUTE $mp_33_116$DO $$
DECLARE
  f text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.booking_end_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.booking_end_requests FROM authenticated;
  END IF;

  -- Funções que mudam estado não são chamáveis pela API do navegador (RPC).
  FOREACH f IN ARRAY ARRAY['public.refresh_space_availability(uuid)', 'public.release_expired_rentals(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    END IF;
  END LOOP;
END;
$$;$mp_33_116$;

    EXECUTE $mp_33_117$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('booking.request_expiry_hours', '24'::jsonb,
   'Horas que o proprietário tem para aceitar ou recusar um pedido antes dele expirar.', true),
  ('booking.payment_deadline_hours', '24'::jsonb,
   'Horas que o locatário tem para pagar uma locação aceita antes dela expirar e a vaga voltar.', true),
  ('booking.max_start_advance_days', '90'::jsonb,
   'Com quantos dias de antecedência dá para escolher a data de início de uma locação.', true),
  ('rental.end_request_min_notice_days', '0'::jsonb,
   'Aviso prévio mínimo, em dias, para o proprietário pedir o encerramento de uma locação. As regras de aviso e multa ainda não foram definidas.', false),
  ('privacy.exact_location_types',
   '["loja","escritorio","galpao","estacionamento","espaco_eventos","oficina"]'::jsonb,
   'Tipos de espaço comercial cujo endereço já é público: o mapa mostra o ponto exato. Os demais mostram só a região aproximada até a locação ser confirmada.', false)
ON CONFLICT (key) DO NOTHING;$mp_33_117$;

    EXECUTE $mp_33_118$-- Privacidade da localização por TIPO de espaço. O mapa público só lê
-- `approx_location`. Para residências e tipos pessoais ela é um ponto
-- DESLOCADO (o endereço só é liberado depois da locação confirmada). Para os
-- tipos comerciais listados em `privacy.exact_location_types` o endereço já é
-- público por natureza (loja, escritório, galpão…) e `approx_location` é o
-- ponto exato — assim nenhuma consulta pública precisa saber da exceção:
-- nenhuma delas lê `location`. Rua, número e complemento continuam privados
-- até a locação ser confirmada, para qualquer tipo.
CREATE OR REPLACE FUNCTION public.sync_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  raio integer;
  exatos jsonb;
BEGIN
  IF NEW.location IS NULL THEN
    NEW.approx_location := NULL;
    RETURN NEW;
  END IF;

  SELECT value INTO exatos FROM public.platform_settings WHERE key = 'privacy.exact_location_types';
  IF jsonb_typeof(exatos) = 'array' AND exatos ? NEW.type::text THEN
    NEW.approx_location := NEW.location;
    RETURN NEW;
  END IF;

  -- So recalcula quando o ponto exato (ou o tipo) muda. Assim o deslocamento
  -- de um anuncio publicado nao "pula" a cada edicao de titulo ou preco.
  IF TG_OP = 'UPDATE'
     AND OLD.location IS NOT NULL
     AND ST_Equals(OLD.location, NEW.location)
     AND OLD.type IS NOT DISTINCT FROM NEW.type
     AND NEW.approx_location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 300) INTO raio
  FROM public.platform_settings WHERE key = 'privacy.approx_location_meters';

  NEW.approx_location := public.fuzz_location(NEW.location, NEW.id, COALESCE(raio, 300));
  RETURN NEW;
END;
$$;$mp_33_118$;

    EXECUTE $mp_33_119$DROP TRIGGER IF EXISTS spaces_sync_approx_location ON public.spaces;$mp_33_119$;

    EXECUTE $mp_33_120$CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location, type ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();$mp_33_120$;

    EXECUTE $mp_33_121$-- Mudou a lista de tipos (ou o raio): os anúncios existentes são recalculados
-- na hora. O deslocamento dos que continuam aproximados é determinístico por
-- anúncio, então não "pula".
CREATE OR REPLACE FUNCTION public.resync_approx_after_privacy_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.spaces SET approx_location = NULL, location = location WHERE location IS NOT NULL;
  RETURN NULL;
END;
$$;$mp_33_121$;

    EXECUTE $mp_33_122$CREATE TRIGGER platform_settings_privacy_resync
  AFTER INSERT OR UPDATE OF value ON public.platform_settings
  FOR EACH ROW
  WHEN (NEW.key IN ('privacy.exact_location_types', 'privacy.approx_location_meters'))
  EXECUTE FUNCTION public.resync_approx_after_privacy_setting();$mp_33_122$;

    EXECUTE $mp_33_123$-- Aplica a regra aos anúncios que já existem.
UPDATE public.spaces SET approx_location = NULL, location = location WHERE location IS NOT NULL;$mp_33_123$;

    EXECUTE $mp_33_124$DO $mp_audio_bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando o bucket de áudio (normal fora do Supabase).';
    RETURN;
  END IF;

  -- Bucket PRIVADO. O áudio só é servido por URL assinada de validade curta,
  -- gerada no servidor para quem participa da conversa.
  BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'chat-audio', 'chat-audio', false, 5242880,
      ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

    RAISE NOTICE 'Bucket chat-audio configurado: privado, 5 MB, webm/ogg/mp4/mpeg.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para configurar o bucket por SQL. Faca no painel: Storage > New bucket > chat-audio (privado, 5 MB, audio/webm,audio/ogg,audio/mp4,audio/mpeg).';
  END;
END $mp_audio_bucket$;$mp_33_124$;

    EXECUTE $mp_33_125$DO $mp_audio_pol$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando politicas do áudio.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Papel authenticated ausente — pulando politicas do áudio.';
    RETURN;
  END IF;

  /*
   * O caminho é `<id da conversa>/<uuid>.<ext>`. A primeira pasta ser o id da
   * conversa permite escrever a regra aqui: só quem participa dela (locatário
   * ou proprietário) lê ou envia. Não há política para `anon`, nem para
   * atualizar ou apagar: o áudio enviado não se edita. A autorização de
   * verdade está na aplicação (src/lib/messaging/audio.ts); estas políticas
   * são a segunda tranca.
   */
  BEGIN
    EXECUTE $pol$DROP POLICY IF EXISTS chat_audio_participante_le ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY chat_audio_participante_le ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'chat-audio'
        AND EXISTS (
          SELECT 1 FROM public.conversations c
           WHERE c.id::text = (storage.foldername(name))[1]
             AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
        )
      )$pol$;

    EXECUTE $pol$DROP POLICY IF EXISTS chat_audio_participante_envia ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY chat_audio_participante_envia ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'chat-audio'
        AND EXISTS (
          SELECT 1 FROM public.conversations c
           WHERE c.id::text = (storage.foldername(name))[1]
             AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
        )
      )$pol$;

    RAISE NOTICE 'Politicas do bucket chat-audio aplicadas (2 politicas, por conversa).';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para criar politica em storage.objects. Crie no painel (Storage > Policies) restringindo leitura e envio do bucket chat-audio a quem participa da conversa da primeira pasta.';
  END;
END $mp_audio_pol$;$mp_33_125$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('602a6622fa40d80b91893ce7a2a449b714fa7c5a80e3cfa02ef8e2f57cea6d2f', 1791100000000);

    RAISE NOTICE 'Migracao 33 (0033_modelo_mensal_quantidade) aplicada.';
  END IF;
END
$mp_bloco_33$;


-- ----------------------------------------------------------------------------
-- Migracao 34: 0034_premium_assinatura_paga  (56 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_34$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '52a8c8b227d07b52e5805d2e15ba0bb7b6264e40a0631bc8a0cafe5f49df5beb'
  ) THEN
    RAISE NOTICE 'Migracao 34 (0034_premium_assinatura_paga) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_34_0$-- ===========================================================================
-- 0034 — Premium pago (Etapa 2, Fase A).
--
-- O Premium deixa de ser uma concessão manual "para sempre" e vira uma
-- ASSINATURA PAGA de R$ 119,90 por mês, recorrente e PRÓPRIA no Asaas
-- (separada das assinaturas das locações: sem split, dinheiro da plataforma).
--
-- Ideias que o banco passa a garantir:
--   * Premium = pagamento confirmado. Existir uma assinatura NÃO basta: só um
--     CICLO pago cujo período cobre "agora" faz a pessoa ser Premium
--     (`premium_is_active`, pelo relógio do banco).
--   * Ciclo = período mensal EFETIVAMENTE pago. Cada cobrança confirmada gera
--     exatamente um ciclo; ciclos da mesma pessoa nunca se sobrepõem.
--   * Os benefícios (2 Destaques e 1 Turbo) valem POR CICLO e não acumulam: a
--     trava `promotions_guard_premium_quota` conta no ciclo, com o ciclo
--     travado, e recusa o que passa do limite.
--   * Concessão administrativa existe só como modo teste/suporte: tem data de
--     fim, não tem cobrança e NÃO dá os benefícios financeiros (taxa reduzida,
--     primeiro mês) a menos que a marca de teste seja ligada de propósito.
--
-- Nota sobre `premium_membership_status`: 'pending_payment' e 'expired' são
-- valores NOVOS de um enum EXISTENTE. O migrador roda tudo numa transação só e
-- o Postgres não deixa usar um valor recém-acrescentado na mesma transação —
-- por isso nada aqui os usa como literal (só em corpos plpgsql, que são
-- compilados na primeira execução, e em comparações por texto).
-- ===========================================================================

ALTER TYPE "public"."premium_membership_status" ADD VALUE 'pending_payment';$mp_34_0$;

    EXECUTE $mp_34_1$ALTER TYPE "public"."premium_membership_status" ADD VALUE 'expired';$mp_34_1$;

    EXECUTE $mp_34_2$CREATE TABLE "premium_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" "payment_method",
	"amount_cents" integer NOT NULL,
	"gateway_fee_cents" integer,
	"net_amount_cents" integer,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"invoice_url" text,
	"failure_reason" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_charges_amount_positive" CHECK ("premium_charges"."amount_cents" > 0),
	CONSTRAINT "premium_charges_refund_within_amount" CHECK ("premium_charges"."refunded_cents" BETWEEN 0 AND "premium_charges"."amount_cents")
);$mp_34_2$;

    EXECUTE $mp_34_3$CREATE TABLE "premium_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"source" "premium_membership_source" NOT NULL,
	"charge_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_early_at" timestamp with time zone,
	"ended_early_reason" text,
	"financial_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_cycles_ends_after_starts" CHECK ("premium_cycles"."ends_at" > "premium_cycles"."starts_at"),
	CONSTRAINT "premium_cycles_ended_early_within" CHECK ("premium_cycles"."ended_early_at" IS NULL OR ("premium_cycles"."ended_early_at" >= "premium_cycles"."starts_at" AND "premium_cycles"."ended_early_at" <= "premium_cycles"."ends_at")),
	CONSTRAINT "premium_cycles_charge_matches_source" CHECK (("premium_cycles"."source"::text = 'subscription') = ("premium_cycles"."charge_id" IS NOT NULL))
);$mp_34_3$;

    EXECUTE $mp_34_4$ALTER TABLE "premium_memberships" ALTER COLUMN "status" DROP DEFAULT;$mp_34_4$;

    EXECUTE $mp_34_5$ALTER TABLE "premium_memberships" ALTER COLUMN "source" DROP DEFAULT;$mp_34_5$;

    EXECUTE $mp_34_6$ALTER TABLE "ledger_entries" ADD COLUMN "premium_charge_id" uuid;$mp_34_6$;

    EXECUTE $mp_34_7$ALTER TABLE "premium_memberships" ADD COLUMN "provider" text;$mp_34_7$;

    EXECUTE $mp_34_8$ALTER TABLE "premium_memberships" ADD COLUMN "provider_subscription_id" text;$mp_34_8$;

    EXECUTE $mp_34_9$ALTER TABLE "premium_memberships" ADD COLUMN "billing_method" "payment_method";$mp_34_9$;

    EXECUTE $mp_34_10$ALTER TABLE "premium_memberships" ADD COLUMN "plan_cents" integer;$mp_34_10$;

    EXECUTE $mp_34_11$ALTER TABLE "premium_memberships" ADD COLUMN "current_period_start" timestamp with time zone;$mp_34_11$;

    EXECUTE $mp_34_12$ALTER TABLE "premium_memberships" ADD COLUMN "current_period_end" timestamp with time zone;$mp_34_12$;

    EXECUTE $mp_34_13$ALTER TABLE "premium_memberships" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;$mp_34_13$;

    EXECUTE $mp_34_14$ALTER TABLE "premium_memberships" ADD COLUMN "cancel_requested_at" timestamp with time zone;$mp_34_14$;

    EXECUTE $mp_34_15$ALTER TABLE "premium_memberships" ADD COLUMN "provider_cancelled_at" timestamp with time zone;$mp_34_15$;

    EXECUTE $mp_34_16$ALTER TABLE "premium_memberships" ADD COLUMN "financial_test_enabled" boolean DEFAULT false NOT NULL;$mp_34_16$;

    EXECUTE $mp_34_17$ALTER TABLE "promotions" ADD COLUMN "premium_cycle_id" uuid;$mp_34_17$;

    EXECUTE $mp_34_18$ALTER TABLE "premium_charges" ADD CONSTRAINT "premium_charges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_18$;

    EXECUTE $mp_34_19$ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_19$;

    EXECUTE $mp_34_20$ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_charge_id_premium_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;$mp_34_20$;

    EXECUTE $mp_34_21$CREATE UNIQUE INDEX "premium_charges_provider_id_key" ON "premium_charges" USING btree ("provider","provider_payment_id");$mp_34_21$;

    EXECUTE $mp_34_22$CREATE INDEX "premium_charges_user_idx" ON "premium_charges" USING btree ("user_id","created_at");$mp_34_22$;

    EXECUTE $mp_34_23$CREATE INDEX "premium_charges_status_idx" ON "premium_charges" USING btree ("status");$mp_34_23$;

    EXECUTE $mp_34_24$CREATE INDEX "premium_charges_subscription_idx" ON "premium_charges" USING btree ("provider_subscription_id");$mp_34_24$;

    EXECUTE $mp_34_25$CREATE UNIQUE INDEX "premium_cycles_user_number_key" ON "premium_cycles" USING btree ("user_id","number");$mp_34_25$;

    EXECUTE $mp_34_26$CREATE UNIQUE INDEX "premium_cycles_charge_key" ON "premium_cycles" USING btree ("charge_id");$mp_34_26$;

    EXECUTE $mp_34_27$CREATE INDEX "premium_cycles_user_ends_idx" ON "premium_cycles" USING btree ("user_id","ends_at");$mp_34_27$;

    EXECUTE $mp_34_28$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_charge_id_premium_charges_id_fk" FOREIGN KEY ("premium_charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;$mp_34_28$;

    EXECUTE $mp_34_29$ALTER TABLE "promotions" ADD CONSTRAINT "promotions_premium_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("premium_cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_29$;

    EXECUTE $mp_34_30$CREATE INDEX "ledger_premium_charge_idx" ON "ledger_entries" USING btree ("premium_charge_id");$mp_34_30$;

    EXECUTE $mp_34_31$CREATE UNIQUE INDEX "premium_memberships_provider_sub_key" ON "premium_memberships" USING btree ("provider","provider_subscription_id") WHERE provider_subscription_id IS NOT NULL;$mp_34_31$;

    EXECUTE $mp_34_32$CREATE INDEX "premium_memberships_cancel_pending_idx" ON "premium_memberships" USING btree ("updated_at") WHERE provider_subscription_id IS NOT NULL AND provider_cancelled_at IS NULL;$mp_34_32$;

    EXECUTE $mp_34_33$CREATE INDEX "promotions_premium_cycle_idx" ON "promotions" USING btree ("premium_cycle_id","type");$mp_34_33$;

    EXECUTE $mp_34_34$-- ---------------------------------------------------------------------------
-- Tabelas novas: só o servidor lê (mesma categoria de payments/promotions —
-- RLS ligado e nenhuma policy; `ALTER DEFAULT PRIVILEGES` da 0001 já tira o
-- acesso de anon/authenticated).
-- ---------------------------------------------------------------------------
ALTER TABLE "premium_charges" ENABLE ROW LEVEL SECURITY;$mp_34_34$;

    EXECUTE $mp_34_35$ALTER TABLE "premium_cycles" ENABLE ROW LEVEL SECURITY;$mp_34_35$;

    EXECUTE $mp_34_36$-- ---------------------------------------------------------------------------
-- Dados que já existiam. A concessão manual antiga não tinha data de fim
-- ("para sempre"). Daqui em diante TODO Premium tem fim: as concessões que
-- estão ativas passam a valer por mais 30 dias a partir desta migração, como
-- ciclo administrativo (sem benefícios financeiros). As demais ficam como estão.
-- ---------------------------------------------------------------------------
UPDATE public.premium_memberships
   SET current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
 WHERE status::text = 'active';$mp_34_36$;

    EXECUTE $mp_34_37$INSERT INTO public.premium_cycles (user_id, number, source, starts_at, ends_at, financial_eligible)
SELECT user_id, 1, 'admin_grant', current_period_start, current_period_end, false
  FROM public.premium_memberships
 WHERE status::text = 'active';$mp_34_37$;

    EXECUTE $mp_34_38$-- Agora as regras que dependem desses dados.
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_period_order" CHECK ("premium_memberships"."current_period_start" IS NULL OR "premium_memberships"."current_period_end" IS NULL OR "premium_memberships"."current_period_end" > "premium_memberships"."current_period_start");$mp_34_38$;

    EXECUTE $mp_34_39$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_active_has_period" CHECK ("premium_memberships"."status"::text <> 'active' OR "premium_memberships"."current_period_end" IS NOT NULL);$mp_34_39$;

    EXECUTE $mp_34_40$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_cancel_request_has_timestamp" CHECK (NOT "premium_memberships"."cancel_at_period_end" OR "premium_memberships"."cancel_requested_at" IS NOT NULL);$mp_34_40$;

    EXECUTE $mp_34_41$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_financial_test_admin_only" CHECK (NOT "premium_memberships"."financial_test_enabled" OR "premium_memberships"."source"::text = 'admin_grant');$mp_34_41$;

    EXECUTE $mp_34_42$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_subscription_has_plan" CHECK ("premium_memberships"."source"::text <> 'subscription' OR ("premium_memberships"."plan_cents" IS NOT NULL AND "premium_memberships"."plan_cents" > 0));$mp_34_42$;

    EXECUTE $mp_34_43$-- Ciclos da mesma pessoa nunca se sobrepõem (intervalo meio-aberto: um ciclo
-- que começa exatamente quando o outro termina é permitido). O fim efetivo é
-- o antecipado, quando houver. `btree_gist` vem da 0032.
ALTER TABLE public.premium_cycles
  ADD CONSTRAINT premium_cycles_no_overlap
  EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, COALESCE(ended_early_at, ends_at)) WITH &&);$mp_34_43$;

    EXECUTE $mp_34_44$-- ---------------------------------------------------------------------------
-- "Esta pessoa é Premium agora?" — UMA definição, usada por todo o app e por
-- todo gatilho. Pelo relógio do banco (`now()`), nunca do servidor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_current_cycle_id(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
    FROM public.premium_cycles c
   WHERE c.user_id = p_user
     AND c.starts_at <= now()
     AND now() < COALESCE(c.ended_early_at, c.ends_at)
   ORDER BY c.ends_at DESC
   LIMIT 1
$$;$mp_34_44$;

    EXECUTE $mp_34_45$CREATE OR REPLACE FUNCTION public.premium_is_active(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.premium_cycles c
     WHERE c.user_id = p_user
       AND c.starts_at <= now()
       AND now() < COALESCE(c.ended_early_at, c.ends_at)
  )
$$;$mp_34_45$;

    EXECUTE $mp_34_46$-- Premium que dá direito aos benefícios FINANCEIROS (taxa reduzida, primeiro
-- mês): o ciclo vigente precisa ter nascido de pagamento confirmado — ou de
-- concessão administrativa com a marca de teste ligada de propósito.
CREATE OR REPLACE FUNCTION public.premium_financial_active(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.premium_cycles c
     WHERE c.user_id = p_user
       AND c.financial_eligible
       AND c.starts_at <= now()
       AND now() < COALESCE(c.ended_early_at, c.ends_at)
  )
$$;$mp_34_46$;

    EXECUTE $mp_34_47$-- ---------------------------------------------------------------------------
-- Ciclo não se edita nem se apaga: o direito aos benefícios nasce dele. A
-- única mudança permitida é marcar o fim antecipado (estorno, contestação,
-- revogação), uma vez só.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_cycles_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ciclo do Premium não se apaga: encerre-o (ended_early_at).'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;

  IF NEW.user_id <> OLD.user_id
     OR NEW.number <> OLD.number
     OR NEW.source <> OLD.source
     OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
     OR NEW.starts_at <> OLD.starts_at
     OR NEW.ends_at <> OLD.ends_at
     OR NEW.financial_eligible <> OLD.financial_eligible THEN
    RAISE EXCEPTION 'Ciclo do Premium não se altera: só o fim antecipado pode ser marcado.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;

  IF OLD.ended_early_at IS NOT NULL AND NEW.ended_early_at IS DISTINCT FROM OLD.ended_early_at THEN
    RAISE EXCEPTION 'Este ciclo já foi encerrado antes do fim.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_47$;

    EXECUTE $mp_34_48$CREATE TRIGGER premium_cycles_immutable
  BEFORE UPDATE OR DELETE ON public.premium_cycles
  FOR EACH ROW EXECUTE FUNCTION public.premium_cycles_guard();$mp_34_48$;

    EXECUTE $mp_34_49$-- ---------------------------------------------------------------------------
-- Benefício do Premium (Destaque/Turbo) — saldo POR CICLO, garantido pelo
-- banco. O código confere antes (mensagem clara), mas é aqui que vale de
-- verdade: duas abas ativando ao mesmo tempo, ou uma chamada direta, não
-- passam do limite. O ciclo é travado (FOR UPDATE) durante a conta, então dois
-- inserts simultâneos entram em fila e o segundo já enxerga o primeiro.
-- Promoção cancelada CONTA: o benefício usado não volta. Limites vêm de
-- platform_settings (`premium.cycle_destaque_limit` / `premium.cycle_turbo_limit`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_premium_benefit_quota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cycle public.premium_cycles%ROWTYPE;
  v_limit integer;
  v_used integer;
BEGIN
  IF NEW.source <> 'premium_benefit' THEN
    RETURN NEW;
  END IF;

  IF NEW.premium_cycle_id IS NULL THEN
    RAISE EXCEPTION 'O benefício do Premium precisa estar ligado a um ciclo pago.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_needs_cycle';
  END IF;

  SELECT * INTO v_cycle FROM public.premium_cycles WHERE id = NEW.premium_cycle_id FOR UPDATE;
  IF NOT FOUND
     OR v_cycle.user_id <> NEW.owner_id
     OR v_cycle.starts_at > now()
     OR now() >= COALESCE(v_cycle.ended_early_at, v_cycle.ends_at) THEN
    RAISE EXCEPTION 'O ciclo do Premium não está vigente para esta pessoa.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_cycle_not_current';
  END IF;

  v_limit := public.platform_setting_int(
    'premium.cycle_' || NEW.type::text || '_limit',
    CASE WHEN NEW.type::text = 'turbo' THEN 1 ELSE 2 END
  );
  SELECT count(*) INTO v_used
    FROM public.promotions
   WHERE premium_cycle_id = NEW.premium_cycle_id AND type = NEW.type;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'Os benefícios deste ciclo do Premium já foram usados (limite %).', v_limit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_cycle_quota';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_49$;

    EXECUTE $mp_34_50$CREATE TRIGGER promotions_guard_premium_quota
  BEFORE INSERT ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit_quota();$mp_34_50$;

    EXECUTE $mp_34_51$-- ---------------------------------------------------------------------------
-- Varredura: arruma o ESTADO guardado para refletir o relógio. A correção não
-- depende dela (as consultas usam `premium_is_active`); ela existe para
-- avisar quem precisa saber e para o agendador cancelar a recorrência no
-- gateway do que acabou.
--   1. período pago acabou sem renovação confirmada → `expired` (ou `cancelled`,
--      se a pessoa tinha pedido para não renovar);
--   2. assinatura que nunca foi paga (abandonada há N dias) → `expired`.
-- Devolve quantas assinaturas mudaram. Idempotente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_premium_memberships()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_n integer;
BEGIN
  UPDATE public.premium_memberships pm
     SET status = CASE WHEN pm.cancel_at_period_end
                       THEN 'cancelled'::public.premium_membership_status
                       ELSE 'expired'::public.premium_membership_status END,
         cancelled_at = CASE WHEN pm.cancel_at_period_end THEN COALESCE(pm.cancelled_at, now()) ELSE pm.cancelled_at END,
         updated_at = now()
   WHERE pm.status::text = 'active'
     AND NOT public.premium_is_active(pm.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  UPDATE public.premium_memberships pm
     SET status = 'expired'::public.premium_membership_status,
         updated_at = now()
   WHERE pm.status::text = 'pending_payment'
     AND pm.updated_at < now() - make_interval(days => public.platform_setting_int('premium.pending_max_days', 3));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;$mp_34_51$;

    EXECUTE $mp_34_52$-- ---------------------------------------------------------------------------
-- O limite de alertas por plano passa a olhar o Premium VIGENTE (ciclo pago),
-- não a linha `status = 'active'`, que pode sobrar depois do fim do período.
-- (Mesma função da 0028 — só a pergunta "é Premium?" mudou.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_saved_search_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_premium boolean;
  v_limite integer;
  v_ativos integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW; -- já contava; editar critérios de um alerta ativo não muda a conta
  END IF;

  PERFORM 1 FROM profiles WHERE id = NEW.user_id FOR UPDATE;

  v_premium := public.premium_is_active(NEW.user_id);

  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM platform_settings
      WHERE key = CASE WHEN v_premium THEN 'alerts.saved_search_max_premium' ELSE 'alerts.saved_search_max_free' END),
    CASE WHEN v_premium THEN 20 ELSE 2 END
  ) INTO v_limite;

  SELECT count(*) INTO v_ativos
  FROM saved_searches
  WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

  IF v_ativos >= v_limite THEN
    RAISE EXCEPTION 'Limite de % alertas ativos atingido', v_limite
      USING ERRCODE = 'check_violation', CONSTRAINT = 'saved_searches_active_limit';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_52$;

    EXECUTE $mp_34_53$-- ---------------------------------------------------------------------------
-- Configuração (mudar é um UPDATE, sem deploy).
--   * Preço definitivo do Premium: R$ 119,90 por mês. O plano anual NÃO existe.
--   * Saldo do ciclo, continuidade entre ciclos, abandono de assinatura nunca
--     paga e o alcance ampliado no mapa.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.price_monthly_cents', '11990'::jsonb,
   'Preço do Premium (assinatura mensal recorrente no Asaas), em centavos. Quem já assinou mantém o preço combinado.', true)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();$mp_34_53$;

    EXECUTE $mp_34_54$DELETE FROM public.platform_settings WHERE key = 'premium.price_yearly_cents';$mp_34_54$;

    EXECUTE $mp_34_55$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.cycle_destaque_limit', '2'::jsonb,
   'Destaques gratuitos por ciclo pago do Premium. Não acumulam para o ciclo seguinte.', false),
  ('premium.cycle_turbo_limit', '1'::jsonb,
   'Turbos gratuitos por ciclo pago do Premium. Não acumulam para o ciclo seguinte.', false),
  ('premium.cycle_continuity_hours', '24'::jsonb,
   'Renovação confirmada até N horas depois do fim do ciclo anterior continua o ciclo (sem buraco no calendário); depois disso, o novo ciclo começa na confirmação.', false),
  ('premium.pending_max_days', '3'::jsonb,
   'Dias que uma assinatura nunca paga fica aguardando o primeiro pagamento antes de ser dada como expirada.', false),
  ('premium.expired_cancel_after_days', '3'::jsonb,
   'Dias entre o Premium expirar e a recorrência ser cancelada no Asaas. Nesse intervalo, um pagamento atrasado ainda reativa o Premium e a assinatura segue.', false),
  ('premium.map_extra_radius_m', '10000'::jsonb,
   'Alcance ampliado do Premium no mapa: metros ALÉM do raio normal em que os anúncios de assinantes podem aparecer.', false),
  ('premium.map_max_outside_pins', '5'::jsonb,
   'Máximo de anúncios Premium individuais mostrados fora do raio normal, além do que Destaque/Turbo já mostram.', false)
ON CONFLICT (key) DO NOTHING;$mp_34_55$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('52a8c8b227d07b52e5805d2e15ba0bb7b6264e40a0631bc8a0cafe5f49df5beb', 1791329586945);

    RAISE NOTICE 'Migracao 34 (0034_premium_assinatura_paga) aplicada.';
  END IF;
END
$mp_bloco_34$;


-- ----------------------------------------------------------------------------
-- Migracao 35: 0035_taxa_premium_proprietario  (3 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_35$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '4e1f15597806378d85f9f5a3af9f7b0f513459a4543d51b46ec37ce8ea7ade67'
  ) THEN
    RAISE NOTICE 'Migracao 35 (0035_taxa_premium_proprietario) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_35_0$-- ===========================================================================
-- 0035 — Taxa do proprietário no Premium (Etapa 2, Fase B).
--
-- Decisão do produto: o proprietário com Premium PAGO e vigente paga 2% de taxa
-- de serviço em vez de 3%, desde que o aluguel seja de R$ 50,00 ou mais. A taxa
-- do locatário NÃO muda (segue a regra normal, 3%).
--
-- Por que existe o piso de R$ 50: com 3% do locatário + 2% do proprietário, o
-- Pix (R$ 1,99 por recebimento) só se paga a partir de R$ 39,80 — abaixo disso
-- o líquido da cobrança fica MENOR que o repasse ao proprietário e o Asaas
-- rejeitaria o split. Abaixo do piso vale a taxa padrão (a conta fecha).
--
-- Quem decide é o servidor (`resolveBookingFees`, src/lib/bookings/fees.ts); o
-- banco confere. A taxa é decidida quando a locação nasce, é refeita e
-- CONGELADA no aceite, e dali em diante só muda se alguém mexer nas colunas de
-- taxa (o que o gatilho abaixo também confere). Um Premium que acaba depois do
-- aceite não altera uma locação já aceita; locações novas pagam a taxa padrão.
--
-- Premium concedido pela administração (modo teste/suporte) NÃO reduz a taxa,
-- a menos que a concessão tenha a marca de teste financeiro ligada de propósito
-- (`premium_financial_active`, migração 0034).
-- ===========================================================================

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('fees.owner_fee_bps_premium', '200'::jsonb,
   'Taxa de serviço do proprietário com Premium pago e vigente, em pontos-base (200 = 2%). Vale para aluguel a partir do piso abaixo.', true),
  ('fees.premium_min_rent_cents', '5000'::jsonb,
   'Aluguel mínimo, em centavos, para a taxa reduzida do Premium. Abaixo disso vale a taxa padrão (o gateway rejeitaria o repasse).', true)
ON CONFLICT (key) DO NOTHING;$mp_35_0$;

    EXECUTE $mp_35_1$-- ---------------------------------------------------------------------------
-- A taxa do proprietário numa locação só pode ser a padrão OU a reduzida — e a
-- reduzida só com Premium financeiro vigente e aluguel acima do piso. Também
-- confere que os centavos batem com os pontos-base (mesmo arredondamento do
-- servidor, meio para cima), porque são os centavos que movem o dinheiro.
-- Confere no nascimento da locação, no aceite (que congela a taxa) e quando
-- alguém muda as colunas de taxa. Mexidas que não tocam na taxa (pagamento,
-- encerramento…) passam direto: uma locação antiga não é reavaliada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_owner_fee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_padrao integer := public.platform_setting_int('fees.owner_fee_bps', 300);
  v_premium integer := public.platform_setting_int('fees.owner_fee_bps_premium', 200);
  v_piso integer := public.platform_setting_int('fees.premium_min_rent_cents', 5000);
BEGIN
  IF TG_OP = 'INSERT'
     OR (OLD.status = 'requested' AND NEW.status = 'approved')
     OR NEW.owner_fee_bps IS DISTINCT FROM OLD.owner_fee_bps
     OR NEW.owner_fee_cents IS DISTINCT FROM OLD.owner_fee_cents THEN

    IF NEW.owner_fee_cents <> round(NEW.monthly_rent_cents::numeric * NEW.owner_fee_bps / 10000) THEN
      RAISE EXCEPTION 'Taxa do proprietario em centavos nao confere com a porcentagem'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_owner_fee_matches_bps';
    END IF;

    IF NEW.owner_fee_bps = v_padrao THEN
      RETURN NEW;
    END IF;

    IF NEW.owner_fee_bps = v_premium
       AND v_premium < v_padrao
       AND NEW.monthly_rent_cents >= v_piso
       AND public.premium_financial_active(NEW.owner_id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Taxa do proprietario nao permitida para esta locacao'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_owner_fee_allowed';
  END IF;
  RETURN NEW;
END;
$$;$mp_35_1$;

    EXECUTE $mp_35_2$-- O nome faz o gatilho rodar DEPOIS de `bookings_guard_price` (ordem alfabética): preço adulterado
-- continua sendo recusado por `bookings_rent_matches_space`, a regra mais específica.
CREATE TRIGGER bookings_guard_price_fee
  BEFORE INSERT OR UPDATE OF status, owner_fee_bps, owner_fee_cents, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_owner_fee();$mp_35_2$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('4e1f15597806378d85f9f5a3af9f7b0f513459a4543d51b46ec37ce8ea7ade67', 1791331653515);

    RAISE NOTICE 'Migracao 35 (0035_taxa_premium_proprietario) aplicada.';
  END IF;
END
$mp_bloco_35$;


-- ----------------------------------------------------------------------------
-- Migracao 36: 0036_premium_beneficio_primeiro_mes  (29 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_36$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '6287b513025d94a8670a48433a6043e9567190861e5cbee786629a286feb0868'
  ) THEN
    RAISE NOTICE 'Migracao 36 (0036_premium_beneficio_primeiro_mes) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_36_0$CREATE TYPE "public"."platform_transfer_status" AS ENUM('queued', 'sent', 'confirmed', 'failed', 'cancelled');$mp_36_0$;

    EXECUTE $mp_36_1$CREATE TYPE "public"."premium_benefit_status" AS ENUM('reserved', 'consumed', 'cancelled');$mp_36_1$;

    EXECUTE $mp_36_2$ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'premium_benefit_funded' BEFORE 'deposit_charged';$mp_36_2$;

    EXECUTE $mp_36_3$CREATE TABLE "platform_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benefit_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"destination_wallet_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "platform_transfer_status" DEFAULT 'queued' NOT NULL,
	"provider_transfer_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "platform_transfers_amount_positive" CHECK ("platform_transfers"."amount_cents" > 0)
);$mp_36_3$;

    EXECUTE $mp_36_4$CREATE TABLE "premium_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_hash" text NOT NULL,
	"period_key" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "premium_benefit_status" DEFAULT 'reserved' NOT NULL,
	"max_cents" integer NOT NULL,
	"benefit_cents" integer NOT NULL,
	"charge_total_cents" integer NOT NULL,
	"payer_pays_cents" integer NOT NULL,
	"owner_payout_cents" integer NOT NULL,
	"provider_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "premium_benefits_amount_positive" CHECK ("premium_benefits"."benefit_cents" > 0),
	CONSTRAINT "premium_benefits_within_max" CHECK ("premium_benefits"."benefit_cents" <= "premium_benefits"."max_cents"),
	CONSTRAINT "premium_benefits_payer_pays" CHECK ("premium_benefits"."payer_pays_cents" = "premium_benefits"."charge_total_cents" - "premium_benefits"."benefit_cents" AND "premium_benefits"."payer_pays_cents" > 0),
	CONSTRAINT "premium_benefits_cancel_has_timestamp" CHECK ("premium_benefits"."status"::text <> 'cancelled' OR "premium_benefits"."cancelled_at" IS NOT NULL),
	CONSTRAINT "premium_benefits_consumed_has_timestamp" CHECK ("premium_benefits"."status"::text <> 'consumed' OR "premium_benefits"."consumed_at" IS NOT NULL)
);$mp_36_4$;

    EXECUTE $mp_36_5$ALTER TABLE "ledger_entries" ADD COLUMN "premium_benefit_id" uuid;$mp_36_5$;

    EXECUTE $mp_36_6$ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;$mp_36_6$;

    EXECUTE $mp_36_7$ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_36_7$;

    EXECUTE $mp_36_8$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;$mp_36_8$;

    EXECUTE $mp_36_9$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_36_9$;

    EXECUTE $mp_36_10$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_36_10$;

    EXECUTE $mp_36_11$CREATE UNIQUE INDEX "platform_transfers_benefit_key" ON "platform_transfers" USING btree ("benefit_id");$mp_36_11$;

    EXECUTE $mp_36_12$CREATE UNIQUE INDEX "platform_transfers_provider_key" ON "platform_transfers" USING btree ("provider_transfer_id") WHERE "platform_transfers"."provider_transfer_id" IS NOT NULL;$mp_36_12$;

    EXECUTE $mp_36_13$CREATE INDEX "platform_transfers_status_idx" ON "platform_transfers" USING btree ("status");$mp_36_13$;

    EXECUTE $mp_36_14$CREATE UNIQUE INDEX "premium_benefits_booking_key" ON "premium_benefits" USING btree ("booking_id");$mp_36_14$;

    EXECUTE $mp_36_15$CREATE UNIQUE INDEX "premium_benefits_cycle_live_key" ON "premium_benefits" USING btree ("cycle_id") WHERE "premium_benefits"."status" <> 'cancelled';$mp_36_15$;

    EXECUTE $mp_36_16$CREATE UNIQUE INDEX "premium_benefits_identity_period_live_key" ON "premium_benefits" USING btree ("identity_hash","period_key") WHERE "premium_benefits"."status" <> 'cancelled';$mp_36_16$;

    EXECUTE $mp_36_17$CREATE INDEX "premium_benefits_user_idx" ON "premium_benefits" USING btree ("user_id");$mp_36_17$;

    EXECUTE $mp_36_18$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("premium_benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;$mp_36_18$;

    EXECUTE $mp_36_19$CREATE INDEX "ledger_premium_benefit_idx" ON "ledger_entries" USING btree ("premium_benefit_id");$mp_36_19$;

    EXECUTE $mp_36_20$-- ===========================================================================
-- 0036 — Benefício do primeiro mês do Premium (Etapa 2, Fase C).
--
-- ATRÁS DE FEATURE FLAG, DESLIGADA (`premium.first_month_benefit_enabled` = 0):
-- nenhum dinheiro da plataforma se move enquanto o fluxo de transferência não
-- for validado no Asaas (sandbox e configuração real) — ver
-- docs/PREMIUM-BENEFICIO.md. O banco recusa criar benefício com a flag
-- desligada, então nem um bug no servidor libera o benefício financeiro.
-- ===========================================================================

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.first_month_benefit_enabled', '0'::jsonb,
   'FEATURE FLAG do benefício de primeiro mês (0 = desligado, 1 = ligado). NÃO ligar antes de validar a transferência no Asaas.', false),
  ('premium.first_month_benefit_max_cents', '10000'::jsonb,
   'Teto do benefício de primeiro mês por ciclo, em centavos (R$ 100,00). Nunca é ultrapassado.', true),
  ('premium.card_hold_days', '7'::jsonb,
   'Carência, em dias, do benefício financeiro quando o Premium foi pago no cartão (trava de risco, não garantia contra contestação). Pix libera na confirmação.', true),
  ('premium.benefit_min_charge_cents', '500'::jsonb,
   'Menor cobrança que o gateway aceita (R$ 5,00). Se o benefício deixaria a cobrança abaixo disso, ele não é aplicado — nunca se aumenta o benefício para completar.', true)
ON CONFLICT (key) DO NOTHING;$mp_36_20$;

    EXECUTE $mp_36_21$-- O ciclo que dá direito ao benefício AGORA: pago (ou teste financeiro explícito), vigente, e — no cartão —
-- fora da carência. Tudo pelo relógio do banco.
CREATE OR REPLACE FUNCTION public.premium_benefit_cycle_id(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
    FROM public.premium_cycles c
    LEFT JOIN public.premium_charges ch ON ch.id = c.charge_id
   WHERE c.user_id = p_user
     AND c.financial_eligible
     AND c.starts_at <= now()
     AND now() < COALESCE(c.ended_early_at, c.ends_at)
     AND (
           c.charge_id IS NULL                       -- teste financeiro explícito da administração
        OR ch.method::text = 'pix'
        OR (ch.paid_at IS NOT NULL
            AND ch.paid_at + make_interval(days => public.platform_setting_int('premium.card_hold_days', 7)) <= now())
     )
   ORDER BY c.starts_at DESC
   LIMIT 1
$$;$mp_36_21$;

    EXECUTE $mp_36_22$CREATE OR REPLACE FUNCTION public.guard_premium_benefit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer := public.platform_setting_int('premium.first_month_benefit_max_cents', 10000);
  v_min integer := public.platform_setting_int('premium.benefit_min_charge_cents', 500);
  v_cycle uuid;
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só o estado e seus carimbos mudam; o direito, os valores e a identidade não.
    IF NEW.cycle_id <> OLD.cycle_id OR NEW.user_id <> OLD.user_id OR NEW.identity_hash <> OLD.identity_hash
       OR NEW.period_key <> OLD.period_key OR NEW.booking_id <> OLD.booking_id OR NEW.max_cents <> OLD.max_cents
       OR NEW.benefit_cents <> OLD.benefit_cents OR NEW.charge_total_cents <> OLD.charge_total_cents
       OR NEW.payer_pays_cents <> OLD.payer_pays_cents OR NEW.owner_payout_cents <> OLD.owner_payout_cents THEN
      RAISE EXCEPTION 'Beneficio nao pode ser editado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    IF OLD.status::text <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Beneficio ja encerrado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF public.platform_setting_int('premium.first_month_benefit_enabled', 0) <> 1 THEN
    RAISE EXCEPTION 'Beneficio de primeiro mes desligado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_flag_off';
  END IF;

  v_cycle := public.premium_benefit_cycle_id(NEW.user_id);
  IF v_cycle IS NULL OR v_cycle <> NEW.cycle_id THEN
    RAISE EXCEPTION 'Ciclo sem direito ao beneficio' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_cycle_not_eligible';
  END IF;

  IF NEW.max_cents <> v_max THEN
    RAISE EXCEPTION 'Teto diferente do configurado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_max_setting';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND OR b.renter_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Beneficio so vale na propria locacao como locatario' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_not_renter';
  END IF;
  IF b.status::text NOT IN ('approved', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Beneficio so vale numa locacao aceita aguardando o primeiro pagamento' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status::text IN ('confirmed', 'received')) THEN
    RAISE EXCEPTION 'Beneficio so vale na primeira cobranca' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;

  IF NEW.charge_total_cents <> b.total_charged_cents OR NEW.owner_payout_cents <> b.owner_payout_cents
     OR NEW.benefit_cents > b.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valores do beneficio nao conferem com a locacao' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_matches_booking';
  END IF;
  IF NEW.payer_pays_cents < v_min THEN
    RAISE EXCEPTION 'Cobranca restante abaixo do minimo do gateway' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_min_charge';
  END IF;

  IF NEW.period_key <> to_char((SELECT starts_at FROM public.premium_cycles WHERE id = NEW.cycle_id) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') THEN
    RAISE EXCEPTION 'Periodo do beneficio invalido' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_period_key';
  END IF;
  RETURN NEW;
END;
$$;$mp_36_22$;

    EXECUTE $mp_36_23$CREATE TRIGGER premium_benefits_guard
  BEFORE INSERT OR UPDATE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit();$mp_36_23$;

    EXECUTE $mp_36_24$CREATE FUNCTION public.premium_benefits_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Beneficio nao se apaga' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
END;
$$;$mp_36_24$;

    EXECUTE $mp_36_25$CREATE TRIGGER premium_benefits_no_delete BEFORE DELETE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.premium_benefits_no_delete();$mp_36_25$;

    EXECUTE $mp_36_26$-- Exposição máxima teórica: Premium com direito financeiro vigente e SEM benefício vivo no ciclo × teto.
CREATE OR REPLACE FUNCTION public.premium_benefit_exposure()
RETURNS TABLE (eligible_cycles integer, unused_cycles integer, max_exposure_cents bigint, committed_cents bigint, pending_transfer_cents bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.premium_cycles c WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)),
    (SELECT count(*)::int FROM public.premium_cycles c
      WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)
        AND NOT EXISTS (SELECT 1 FROM public.premium_benefits pb WHERE pb.cycle_id = c.id AND pb.status::text <> 'cancelled')),
    ((SELECT count(*) FROM public.premium_cycles c
       WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)
         AND NOT EXISTS (SELECT 1 FROM public.premium_benefits pb WHERE pb.cycle_id = c.id AND pb.status::text <> 'cancelled'))
      * public.platform_setting_int('premium.first_month_benefit_max_cents', 10000))::bigint,
    COALESCE((SELECT sum(benefit_cents) FROM public.premium_benefits WHERE status::text IN ('reserved', 'consumed')), 0)::bigint,
    COALESCE((SELECT sum(amount_cents) FROM public.platform_transfers WHERE status::text IN ('queued', 'sent')), 0)::bigint
$$;$mp_36_26$;

    EXECUTE $mp_36_27$ALTER TABLE public.premium_benefits ENABLE ROW LEVEL SECURITY;$mp_36_27$;

    EXECUTE $mp_36_28$ALTER TABLE public.platform_transfers ENABLE ROW LEVEL SECURITY;$mp_36_28$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('6287b513025d94a8670a48433a6043e9567190861e5cbee786629a286feb0868', 1791460156786);

    RAISE NOTICE 'Migracao 36 (0036_premium_beneficio_primeiro_mes) aplicada.';
  END IF;
END
$mp_bloco_36$;


-- ----------------------------------------------------------------------------
-- Migracao 37: 0037_taxa_segue_premium_e_contas_vinculadas  (8 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_37$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '1f158cfae0e0b348a8ea08f1840824c7d8755725793b192261d4d9e8d52e004d'
  ) THEN
    RAISE NOTICE 'Migracao 37 (0037_taxa_segue_premium_e_contas_vinculadas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_37_0$ALTER TABLE "subscriptions" ADD COLUMN "gateway_owner_payout_cents" integer;;$mp_37_0$;

    EXECUTE $mp_37_1$-- ===========================================================================
-- 0037 — Decisões do produto de 08/10/2026:
--   1. A taxa do proprietário SEGUE o Premium: quando o Premium acaba, as próximas
--      mensalidades das locações dele voltam a 3% (e voltam a 2% se ele assinar de
--      novo). O split da recorrência no Asaas acompanha (`gateway_owner_payout_cents`
--      guarda o que está configurado lá; a manutenção atualiza quando difere).
--   2. Mais rigidez contra contas duplicadas/vinculadas: uma mesma pessoa não mantém
--      dois Premium vivos (mesmo e-mail normalizado ou mesmo telefone), e o benefício
--      financeiro não vale entre contas vinculadas.
-- ===========================================================================

UPDATE public.subscriptions s
   SET gateway_owner_payout_cents = b.owner_payout_cents
  FROM public.bookings b
 WHERE b.id = s.booking_id AND s.gateway_owner_payout_cents IS NULL;$mp_37_1$;

    EXECUTE $mp_37_2$-- E-mail canônico: minúsculas, sem "+etiqueta"; no Gmail, sem pontos e com gmail.com.
CREATE OR REPLACE FUNCTION public.canonical_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p IS NULL OR position('@' IN p) = 0 THEN NULL
           WHEN lower(split_part(p, '@', 2)) IN ('gmail.com', 'googlemail.com')
             THEN replace(split_part(lower(split_part(p, '@', 1)), '+', 1), '.', '') || '@gmail.com'
           ELSE split_part(lower(split_part(p, '@', 1)), '+', 1) || '@' || lower(split_part(p, '@', 2))
         END
$$;$mp_37_2$;

    EXECUTE $mp_37_3$-- Telefone canônico: só dígitos, os 11 últimos (DDD + número), ignorando +55.
CREATE OR REPLACE FUNCTION public.canonical_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(right(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), 11), '')
$$;$mp_37_3$;

    EXECUTE $mp_37_4$-- Por que duas contas parecem ser a mesma pessoa (NULL = nenhum sinal). Sinais:
-- mesmo e-mail canônico, mesmo telefone, mesmo documento, ou já houve locação PAGA
-- no sentido inverso (b alugou de a) — o "rodízio" entre as próprias contas.
CREATE OR REPLACE FUNCTION public.premium_accounts_linked(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_a = p_b THEN 'mesma conta'
    WHEN EXISTS (SELECT 1 FROM auth.users ua, auth.users ub
                  WHERE ua.id = p_a AND ub.id = p_b
                    AND public.canonical_email(ua.email) = public.canonical_email(ub.email)) THEN 'mesmo e-mail'
    WHEN EXISTS (SELECT 1 FROM profiles pa, profiles pb
                  WHERE pa.id = p_a AND pb.id = p_b
                    AND public.canonical_phone(pa.phone) IS NOT NULL
                    AND public.canonical_phone(pa.phone) = public.canonical_phone(pb.phone)) THEN 'mesmo telefone'
    WHEN EXISTS (SELECT 1 FROM profiles pa, profiles pb
                  WHERE pa.id = p_a AND pb.id = p_b AND pa.cpf_cnpj IS NOT NULL
                    AND regexp_replace(pa.cpf_cnpj, '\D', '', 'g') = regexp_replace(pb.cpf_cnpj, '\D', '', 'g')) THEN 'mesmo documento'
    WHEN EXISTS (SELECT 1 FROM bookings bk
                  WHERE bk.renter_id = p_b AND bk.owner_id = p_a AND bk.activated_at IS NOT NULL) THEN 'locação no sentido inverso'
    ELSE NULL
  END
$$;$mp_37_4$;

    EXECUTE $mp_37_5$CREATE OR REPLACE FUNCTION public.guard_premium_benefit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer := public.platform_setting_int('premium.first_month_benefit_max_cents', 10000);
  v_min integer := public.platform_setting_int('premium.benefit_min_charge_cents', 500);
  v_cycle uuid;
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só o estado e seus carimbos mudam; o direito, os valores e a identidade não.
    IF NEW.cycle_id <> OLD.cycle_id OR NEW.user_id <> OLD.user_id OR NEW.identity_hash <> OLD.identity_hash
       OR NEW.period_key <> OLD.period_key OR NEW.booking_id <> OLD.booking_id OR NEW.max_cents <> OLD.max_cents
       OR NEW.benefit_cents <> OLD.benefit_cents OR NEW.charge_total_cents <> OLD.charge_total_cents
       OR NEW.payer_pays_cents <> OLD.payer_pays_cents OR NEW.owner_payout_cents <> OLD.owner_payout_cents THEN
      RAISE EXCEPTION 'Beneficio nao pode ser editado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    IF OLD.status::text <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Beneficio ja encerrado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF public.platform_setting_int('premium.first_month_benefit_enabled', 0) <> 1 THEN
    RAISE EXCEPTION 'Beneficio de primeiro mes desligado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_flag_off';
  END IF;

  v_cycle := public.premium_benefit_cycle_id(NEW.user_id);
  IF v_cycle IS NULL OR v_cycle <> NEW.cycle_id THEN
    RAISE EXCEPTION 'Ciclo sem direito ao beneficio' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_cycle_not_eligible';
  END IF;

  IF NEW.max_cents <> v_max THEN
    RAISE EXCEPTION 'Teto diferente do configurado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_max_setting';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND OR b.renter_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Beneficio so vale na propria locacao como locatario' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_not_renter';
  END IF;
  -- Contas vinculadas (0037): o benefício não pode sair da plataforma para o "outro lado" da mesma pessoa.
  IF public.premium_accounts_linked(NEW.user_id, b.owner_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Locatario e proprietario parecem ser a mesma pessoa (%)', public.premium_accounts_linked(NEW.user_id, b.owner_id)
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_linked_accounts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.phone_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Beneficio exige telefone verificado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_phone_unverified';
  END IF;
  IF b.status::text NOT IN ('approved', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Beneficio so vale numa locacao aceita aguardando o primeiro pagamento' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status::text IN ('confirmed', 'received')) THEN
    RAISE EXCEPTION 'Beneficio so vale na primeira cobranca' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;

  IF NEW.charge_total_cents <> b.total_charged_cents OR NEW.owner_payout_cents <> b.owner_payout_cents
     OR NEW.benefit_cents > b.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valores do beneficio nao conferem com a locacao' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_matches_booking';
  END IF;
  IF NEW.payer_pays_cents < v_min THEN
    RAISE EXCEPTION 'Cobranca restante abaixo do minimo do gateway' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_min_charge';
  END IF;

  IF NEW.period_key <> to_char((SELECT starts_at FROM public.premium_cycles WHERE id = NEW.cycle_id) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') THEN
    RAISE EXCEPTION 'Periodo do beneficio invalido' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_period_key';
  END IF;
  RETURN NEW;
END;
$$;$mp_37_5$;

    EXECUTE $mp_37_6$-- Uma pessoa, um Premium vivo: outra conta com o mesmo e-mail canônico ou o mesmo
-- telefone não abre (nem mantém) uma segunda assinatura em paralelo.
CREATE OR REPLACE FUNCTION public.guard_premium_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_outra uuid;
BEGIN
  IF NEW.status::text NOT IN ('pending_payment', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text IN ('pending_payment', 'active') THEN
    RETURN NEW;  -- já estava viva: a trava vale na abertura
  END IF;
  SELECT pm.user_id INTO v_outra
    FROM premium_memberships pm
   WHERE pm.user_id <> NEW.user_id
     AND pm.status::text IN ('pending_payment', 'active')
     AND public.premium_accounts_linked(NEW.user_id, pm.user_id) IN ('mesmo e-mail', 'mesmo telefone', 'mesmo documento')
   LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe um Premium em outra conta desta pessoa'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_memberships_linked_account';
  END IF;
  RETURN NEW;
END;
$$;$mp_37_6$;

    EXECUTE $mp_37_7$CREATE TRIGGER premium_memberships_guard_identity
  BEFORE INSERT OR UPDATE OF status ON public.premium_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_membership_identity();$mp_37_7$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('1f158cfae0e0b348a8ea08f1840824c7d8755725793b192261d4d9e8d52e004d', 1791545573652);

    RAISE NOTICE 'Migracao 37 (0037_taxa_segue_premium_e_contas_vinculadas) aplicada.';
  END IF;
END
$mp_bloco_37$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 38 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 38
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa

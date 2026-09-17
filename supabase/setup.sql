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
-- Gerado por scripts/build-supabase-setup.ts a partir de 10 migracoes
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
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '14c3b2b2158cdb78097b9decda4544861cae1282754845701bb63a7c57d2d643'
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

ALTER TABLE "space_images" ADD CONSTRAINT "space_images_position_positive" CHECK ("space_images"."position" >= 0);$mp_9_0$;

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

  -- Bucket PRIVADO. O acesso a foto e sempre por URL assinada, com validade
  -- curta, gerada no servidor. Nao existe URL publica permanente.
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
END $mp_storage_pol$;$mp_9_10$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('14c3b2b2158cdb78097b9decda4544861cae1282754845701bb63a7c57d2d643', 1789677839915);

    RAISE NOTICE 'Migracao 9 (0009_fotos_e_storage) aplicada.';
  END IF;
END
$mp_bloco_9$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 10 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa

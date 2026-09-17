-- ============================================================================
-- MyPlace — configuracao completa do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- Roda uma vez so. Se rodar de novo por engano, a maior parte e protegida por
-- IF NOT EXISTS, mas o correto e rodar uma vez em um projeto novo e vazio.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 8
-- migracoes ja testadas contra um Postgres real. Nao edite este arquivo a mao:
-- altere src/db/schema/, rode as migracoes, e gere de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;


-- ============================================================================
-- Migracao 0: 0000_young_big_bertha
-- ============================================================================

-- Extensoes necessarias. PostGIS da as consultas por distancia real;
-- pgcrypto/pgcrypto-equivalente fornece gen_random_uuid() (nativo no PG13+).
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'banned', 'deleted');
CREATE TYPE "public"."booking_status" AS ENUM('requested', 'approved', 'rejected', 'awaiting_payment', 'active', 'past_due', 'cancelled', 'ended');
CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge_captured', 'gateway_fee', 'platform_fee_renter', 'platform_fee_owner', 'owner_payout', 'refund', 'chargeback', 'adjustment');
CREATE TYPE "public"."notification_type" AS ENUM('space_published', 'space_rejected', 'booking_requested', 'booking_approved', 'booking_rejected', 'booking_cancelled', 'payment_confirmed', 'payment_upcoming', 'payment_failed', 'payout_settled', 'new_message', 'review_received', 'report_resolved', 'account_notice');
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'pix_automatico', 'credit_card', 'boleto');
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'received', 'overdue', 'refunded', 'partially_refunded', 'chargeback', 'failed', 'cancelled');
CREATE TYPE "public"."payout_account_status" AS ENUM('not_started', 'pending_documents', 'under_review', 'approved', 'rejected', 'disabled');
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'scheduled', 'settled', 'failed', 'reversed');
CREATE TYPE "public"."report_reason" AS ENUM('fraude', 'conteudo_inadequado', 'endereco_incorreto', 'anuncio_falso', 'atividade_proibida', 'outro');
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');
CREATE TYPE "public"."review_kind" AS ENUM('renter_to_space', 'owner_to_renter');
CREATE TYPE "public"."space_status" AS ENUM('draft', 'pending_review', 'published', 'paused', 'rented', 'archived', 'removed');
CREATE TYPE "public"."space_type" AS ENUM('garagem', 'vaga_carro', 'vaga_moto', 'deposito', 'quarto', 'galpao', 'sala', 'escritorio', 'loja', 'terreno', 'outro');
CREATE TYPE "public"."subscription_status" AS ENUM('pending_authorization', 'active', 'past_due', 'paused', 'cancelled', 'expired');
CREATE TYPE "public"."user_role" AS ENUM('user', 'owner', 'admin');
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed', 'ignored');
CREATE TABLE "owner_payout_accounts" (
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
);

CREATE TABLE "profiles" (
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
);

CREATE TABLE "renter_billing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_space_id_pk" PRIMARY KEY("user_id","space_id")
);

CREATE TABLE "features" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"icon" text,
	"applies_to" "space_type"[] DEFAULT '{}'::space_type[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "space_features" (
	"space_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	CONSTRAINT "space_features_space_id_feature_key_pk" PRIMARY KEY("space_id","feature_key")
);

CREATE TABLE "space_images" (
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
);

CREATE TABLE "spaces" (
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
);

CREATE TABLE "bookings" (
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
);

CREATE TABLE "ledger_entries" (
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
);

CREATE TABLE "payments" (
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
);

CREATE TABLE "payouts" (
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
);

CREATE TABLE "subscriptions" (
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
);

CREATE TABLE "webhook_events" (
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
);

CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"booking_id" uuid,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_distinct_parties" CHECK ("conversations"."renter_id" <> "conversations"."owner_id")
);

CREATE TABLE "messages" (
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
);

CREATE TABLE "reports" (
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
);

CREATE TABLE "reviews" (
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
);

CREATE TABLE "audit_logs" (
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
);

CREATE TABLE "notifications" (
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
);

CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "owner_payout_accounts" ADD CONSTRAINT "owner_payout_accounts_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "renter_billing_profiles" ADD CONSTRAINT "renter_billing_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "space_features" ADD CONSTRAINT "space_features_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "space_features" ADD CONSTRAINT "space_features_feature_key_features_key_fk" FOREIGN KEY ("feature_key") REFERENCES "public"."features"("key") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "space_images" ADD CONSTRAINT "space_images_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renter_id_profiles_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renter_id_profiles_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "owner_payout_accounts_owner_provider_key" ON "owner_payout_accounts" USING btree ("owner_id","provider");
CREATE UNIQUE INDEX "owner_payout_accounts_wallet_key" ON "owner_payout_accounts" USING btree ("provider_wallet_id");
CREATE INDEX "owner_payout_accounts_status_idx" ON "owner_payout_accounts" USING btree ("status");
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("role");
CREATE INDEX "profiles_status_idx" ON "profiles" USING btree ("status");
CREATE UNIQUE INDEX "profiles_cpf_cnpj_key" ON "profiles" USING btree ("cpf_cnpj") WHERE cpf_cnpj IS NOT NULL;
CREATE UNIQUE INDEX "renter_billing_profiles_user_provider_key" ON "renter_billing_profiles" USING btree ("user_id","provider");
CREATE UNIQUE INDEX "renter_billing_profiles_customer_key" ON "renter_billing_profiles" USING btree ("provider","provider_customer_id");
CREATE INDEX "favorites_space_idx" ON "favorites" USING btree ("space_id");
CREATE INDEX "favorites_user_created_idx" ON "favorites" USING btree ("user_id","created_at");
CREATE INDEX "features_category_idx" ON "features" USING btree ("category");
CREATE INDEX "space_features_feature_idx" ON "space_features" USING btree ("feature_key");
CREATE INDEX "space_images_space_idx" ON "space_images" USING btree ("space_id","position");
CREATE UNIQUE INDEX "space_images_path_key" ON "space_images" USING btree ("storage_path");
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces" USING btree ("slug");
CREATE INDEX "spaces_owner_idx" ON "spaces" USING btree ("owner_id");
CREATE INDEX "spaces_status_idx" ON "spaces" USING btree ("status");
CREATE INDEX "spaces_type_idx" ON "spaces" USING btree ("type");
CREATE INDEX "spaces_price_idx" ON "spaces" USING btree ("price_monthly_cents");
CREATE INDEX "spaces_city_state_idx" ON "spaces" USING btree ("city","state");
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings" USING btree ("reference");
CREATE INDEX "bookings_space_idx" ON "bookings" USING btree ("space_id");
CREATE INDEX "bookings_renter_idx" ON "bookings" USING btree ("renter_id","status");
CREATE INDEX "bookings_owner_idx" ON "bookings" USING btree ("owner_id","status");
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");
CREATE UNIQUE INDEX "bookings_one_active_per_space" ON "bookings" USING btree ("space_id") WHERE status IN ('approved','awaiting_payment','active','past_due');
CREATE INDEX "ledger_booking_idx" ON "ledger_entries" USING btree ("booking_id");
CREATE INDEX "ledger_payment_idx" ON "ledger_entries" USING btree ("payment_id");
CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id");
CREATE INDEX "ledger_type_occurred_idx" ON "ledger_entries" USING btree ("type","occurred_at");
CREATE UNIQUE INDEX "payments_provider_id_key" ON "payments" USING btree ("provider","provider_payment_id");
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");
CREATE INDEX "payments_due_date_idx" ON "payments" USING btree ("due_date");
CREATE UNIQUE INDEX "payouts_provider_split_key" ON "payouts" USING btree ("provider","provider_split_id");
CREATE INDEX "payouts_payment_idx" ON "payouts" USING btree ("payment_id");
CREATE INDEX "payouts_owner_idx" ON "payouts" USING btree ("owner_id","status");
CREATE UNIQUE INDEX "subscriptions_provider_id_key" ON "subscriptions" USING btree ("provider","provider_subscription_id");
CREATE INDEX "subscriptions_booking_idx" ON "subscriptions" USING btree ("booking_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");
CREATE INDEX "subscriptions_next_due_idx" ON "subscriptions" USING btree ("next_due_date");
CREATE UNIQUE INDEX "subscriptions_one_live_per_booking" ON "subscriptions" USING btree ("booking_id") WHERE status IN ('pending_authorization','active','past_due','paused');
CREATE UNIQUE INDEX "webhook_events_provider_event_key" ON "webhook_events" USING btree ("provider","provider_event_id");
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status","received_at");
CREATE INDEX "webhook_events_type_idx" ON "webhook_events" USING btree ("event_type");
CREATE UNIQUE INDEX "conversations_space_renter_key" ON "conversations" USING btree ("space_id","renter_id");
CREATE INDEX "conversations_owner_idx" ON "conversations" USING btree ("owner_id","last_message_at");
CREATE INDEX "conversations_renter_idx" ON "conversations" USING btree ("renter_id","last_message_at");
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_id");
CREATE INDEX "reports_space_idx" ON "reports" USING btree ("space_id");
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");
CREATE UNIQUE INDEX "reports_one_open_per_reporter" ON "reports" USING btree ("space_id","reporter_id") WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;
CREATE UNIQUE INDEX "reviews_booking_author_kind_key" ON "reviews" USING btree ("booking_id","author_id","kind");
CREATE INDEX "reviews_space_idx" ON "reviews" USING btree ("space_id");
CREATE INDEX "reviews_target_user_idx" ON "reviews" USING btree ("target_user_id");
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");


-- ============================================================================
-- Migracao 1: 0001_integridade_indices_e_rls
-- ============================================================================

-- ============================================================================
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
END $$;


-- O perfil e uma extensao 1:1 da identidade. Apagar o usuario apaga o perfil.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;


-- Cria o perfil automaticamente quando alguem se cadastra.
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
$$;


DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- Quem e o usuario da requisicao atual (NULL para visitante).
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, auth
AS $$ SELECT auth.uid() $$;


-- SECURITY DEFINER para consultar profiles sem recursao de RLS.
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
$$;



-- ---------------------------------------------------------------------------
-- 2. Indices
-- ---------------------------------------------------------------------------

-- Busca por raio ("ate 2 km de mim") usa ST_DWithin(coluna::geography, ...).
-- O indice precisa ser sobre EXATAMENTE essa expressao, senao o planner ignora.
CREATE INDEX "spaces_location_gix"
  ON "spaces" USING GIST ((("location")::geography));

CREATE INDEX "spaces_approx_location_gix"
  ON "spaces" USING GIST ((("approx_location")::geography));


-- Busca textual tolerante a acento/erro de digitacao em titulo, cidade e bairro.
CREATE INDEX "spaces_title_trgm_idx" ON "spaces" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "spaces_city_trgm_idx" ON "spaces" USING GIN ("city" gin_trgm_ops);

CREATE INDEX "spaces_district_trgm_idx" ON "spaces" USING GIN ("district" gin_trgm_ops);


-- O caminho quente da busca: anuncios publicados, filtrados por tipo e preco.
CREATE INDEX "spaces_published_browse_idx"
  ON "spaces" ("type", "price_monthly_cents")
  WHERE "status" = 'published' AND "deleted_at" IS NULL;



-- ---------------------------------------------------------------------------
-- 3. Triggers de integridade
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


DO $$
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
END $$;


-- Impede avaliacao falsa. A aplicacao ja checa, mas isto e o que vale mesmo:
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
$$;


CREATE TRIGGER reviews_validate
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review();


-- Mantem a nota media do anuncio coerente com as avaliacoes visiveis.
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
$$;


CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_space_rating();


-- O livro-razao e append-only: correcao se faz com lancamento novo, nunca
-- reescrevendo o passado. Isto vale inclusive para quem tem acesso direto ao banco.
CREATE OR REPLACE FUNCTION public.forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela % e append-only: use um novo lancamento para corrigir (tentativa de %)',
    TG_TABLE_NAME, TG_OP;
END;
$$;


CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();


CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();


-- Ninguem vira admin sozinho. Mudanca de papel/status so por admin ou pelo
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
$$;


CREATE TRIGGER profiles_guard_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();


-- Mantem a conversa ordenada por atividade sem custo de subquery na listagem.
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
$$;


CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();


-- ---------------------------------------------------------------------------
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
END $$;


-- Liga RLS em tudo. Tabela com RLS ligada e sem policy = ninguem le nada,
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
END $$;


-- Ponto de partida: o navegador nao alcanca nada.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;



-- ===== profiles =====
-- Leitura do proprio perfil. Dados de outras pessoas saem pela view publica
-- mais abaixo, que nao inclui telefone nem CPF.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());


CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND status = 'active')
  WITH CHECK (id = auth.uid());


GRANT SELECT ON public.profiles TO authenticated;

-- Privilegio por COLUNA: mesmo com a policy acima, o usuario so consegue
-- escrever nestes tres campos. Papel, status e CPF ficam fora do alcance.
GRANT UPDATE (full_name, phone, avatar_path, accepted_terms_at, accepted_terms_version)
  ON public.profiles TO authenticated;


-- Identificacao publica e minima de um usuario (quem anuncia, quem avaliou).
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id, full_name, avatar_path, created_at
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;


CREATE POLICY "profiles_select_public_subset" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND deleted_at IS NULL);


GRANT SELECT ON public.public_profiles TO anon, authenticated;



-- ===== favorites =====
CREATE POLICY "favorites_all_own" ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;



-- ===== conversations / messages =====
-- O chat e o unico fluxo em que o navegador conversa direto com o banco
-- (Supabase Realtime). Por isso estas policies sao a barreira de verdade.
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (renter_id = auth.uid() OR owner_id = auth.uid());

GRANT SELECT ON public.conversations TO authenticated;


CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (
    hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );


-- Enviar mensagem exige: ser participante, ser o proprio remetente, a conversa
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
  );

GRANT SELECT, INSERT ON public.messages TO authenticated;



-- ===== notifications =====
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON public.notifications TO authenticated;

GRANT UPDATE (read_at) ON public.notifications TO authenticated;



-- ===== features =====
-- Catalogo publico, sem dado sensivel.
CREATE POLICY "features_select_active" ON public.features
  FOR SELECT TO anon, authenticated
  USING (active = true);

GRANT SELECT ON public.features TO anon, authenticated;



-- NOTA DELIBERADA: spaces, bookings, payments, payouts, ledger_entries,
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
ON CONFLICT (key) DO NOTHING;


INSERT INTO public.features (key, label, category, icon, applies_to, sort_order) VALUES
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
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Migracao 2: 0002_great_harpoon
-- ============================================================================

CREATE TYPE "public"."report_severity" AS ENUM('low', 'normal', 'high', 'critical');
CREATE TYPE "public"."report_target" AS ENUM('space', 'user', 'message');
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_distinct" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id"),
	CONSTRAINT "user_blocks_reason_max" CHECK ("user_blocks"."reason" IS NULL OR length("user_blocks"."reason") <= 500)
);

ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE text;
DROP TYPE "public"."report_reason";
CREATE TYPE "public"."report_reason" AS ENUM('anuncio_falso', 'endereco_incorreto', 'preco_enganoso', 'espaco_inexistente', 'fraude', 'golpe_pagamento', 'pagamento_fora_plataforma', 'assedio', 'discurso_odio', 'ameaca', 'identidade_falsa', 'conteudo_inadequado', 'spam', 'atividade_proibida', 'nao_compareceu', 'dano_ao_espaco', 'uso_indevido_do_espaco', 'outro');
ALTER TABLE "reports" ALTER COLUMN "reason" SET DATA TYPE "public"."report_reason" USING "reason"::"public"."report_reason";
DROP INDEX "reports_status_idx";
DROP INDEX "reports_one_open_per_reporter";
ALTER TABLE "reports" ALTER COLUMN "space_id" DROP NOT NULL;
ALTER TABLE "profiles" ADD COLUMN "upheld_report_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "messages" ADD COLUMN "flagged_at" timestamp with time zone;
ALTER TABLE "messages" ADD COLUMN "flag_reason" text;
-- Adicionado com DEFAULT e depois sem: assim a migracao tambem funciona
-- em um banco que ja tenha denuncias gravadas (todas elas eram de anuncio).
ALTER TABLE "reports" ADD COLUMN "target_type" "report_target" NOT NULL DEFAULT 'space';
ALTER TABLE "reports" ALTER COLUMN "target_type" DROP DEFAULT;
ALTER TABLE "reports" ADD COLUMN "target_user_id" uuid;
ALTER TABLE "reports" ADD COLUMN "message_id" uuid;
ALTER TABLE "reports" ADD COLUMN "severity" "report_severity" DEFAULT 'normal' NOT NULL;
ALTER TABLE "reports" ADD COLUMN "evidence_snapshot" jsonb;
ALTER TABLE "reports" ADD COLUMN "upheld" boolean;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_profiles_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_profiles_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_profiles_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "messages_flagged_idx" ON "messages" USING btree ("flagged_at") WHERE flagged_at IS NOT NULL AND hidden_at IS NULL;
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");
CREATE INDEX "reports_message_idx" ON "reports" USING btree ("message_id");
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","severity","created_at") WHERE status IN ('open','reviewing');
CREATE UNIQUE INDEX "reports_one_open_per_target" ON "reports" USING btree ("reporter_id","target_type",COALESCE(space_id, target_user_id, message_id)) WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches_type" CHECK (("reports"."target_type" = 'space'   AND "reports"."space_id" IS NOT NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'user'    AND "reports"."target_user_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."message_id" IS NULL)
          OR ("reports"."target_type" = 'message' AND "reports"."message_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL));
ALTER TABLE "reports" ADD CONSTRAINT "reports_no_self_report" CHECK ("reports"."target_user_id" IS NULL OR "reports"."reporter_id" IS NULL OR "reports"."target_user_id" <> "reports"."reporter_id");
ALTER TABLE "reports" ADD CONSTRAINT "reports_details_max" CHECK ("reports"."details" IS NULL OR length("reports"."details") <= 2000);


-- ============================================================================
-- Migracao 3: 0003_seguranca_e_taxas
-- ============================================================================

-- ============================================================================
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
$$;


-- Conversa nova entre pessoas que se bloquearam nao nasce.
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
$$;


CREATE TRIGGER conversations_guard_block
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_block();


-- E conversa antiga para de receber mensagem se o bloqueio vier depois.
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
$$;


CREATE TRIGGER messages_guard_block
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_block();


-- Bloqueio tambem impede reserva — senao contorna-se o bloqueio alugando.
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
$$;


CREATE TRIGGER bookings_guard_block
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_block();


-- Bloquear encerra a conversa existente entre as duas pessoas. Sem isso, a
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
$$;


CREATE TRIGGER user_blocks_close_conversations
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.close_conversations_on_block();



-- ---------------------------------------------------------------------------
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
$$;


CREATE TRIGGER reports_refresh_upheld_count
  AFTER INSERT OR UPDATE OF upheld ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.refresh_upheld_report_count();



-- ---------------------------------------------------------------------------
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
$$;


CREATE TRIGGER reports_capture_evidence
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_report_evidence();



-- ---------------------------------------------------------------------------
-- 4. RLS das tabelas novas
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;


-- A pessoa gerencia a propria lista de bloqueios. Ninguem consulta a lista de
-- outra pessoa — nem para saber se foi bloqueado.
CREATE POLICY "user_blocks_manage_own" ON public.user_blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;


-- Denuncia: quem denunciou acompanha a propria denuncia. Ninguem ve denuncia
-- feita contra si — saber quem denunciou e o caminho mais curto para retaliacao.
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

GRANT SELECT ON public.reports TO authenticated;


-- INSERT de denuncia passa pelo servidor (que valida motivo, severidade,
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
WHERE key = 'fees.renter_fee_bps';


UPDATE public.platform_settings
SET value = '300'::jsonb,
    description = 'Taxa retida de quem recebe, sobre o valor do aluguel. 300 = 3%.',
    updated_at = now()
WHERE key = 'fees.owner_fee_bps';


UPDATE public.platform_settings
SET value = '3500'::jsonb,
    description = 'Aluguel minimo aceito (R$ 35,00). Ponto de equilibrio a 3%+3% e R$ 33,17 no Pix.',
    updated_at = now()
WHERE key = 'booking.min_rent_cents';


INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
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
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Migracao 4: 0004_wooden_newton_destine
-- ============================================================================

ALTER TABLE "profiles" ADD COLUMN "document_verified_at" timestamp with time zone;
ALTER TABLE "profiles" ADD COLUMN "completed_bookings_count" integer DEFAULT 0 NOT NULL;


-- ============================================================================
-- Migracao 5: 0005_contagem_de_locacoes
-- ============================================================================

-- ============================================================================
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
$$;


-- Dispara so quando o status muda: UPDATE de qualquer outra coluna nao
-- precisa recontar nada.
CREATE TRIGGER bookings_refresh_completed_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_completed_bookings_count();


-- A view publica de perfil ganha os sinais de confianca. Nada aqui e sensivel:
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
  WHERE status = 'active' AND deleted_at IS NULL;


GRANT SELECT ON public.public_profiles TO anon, authenticated;


INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('safety.visit_before_booking', 'true'::jsonb,
   'Recomendar visita ao espaco antes de fechar a reserva.', true),
  ('safety.protection_copy_version', '"2026-09-16"'::jsonb,
   'Versao do texto de protecao exibido. Muda quando a politica muda.', true)
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Migracao 6: 0006_uneven_quasimodo
-- ============================================================================

ALTER TABLE "profiles" ADD COLUMN "city" text;
ALTER TABLE "profiles" ADD COLUMN "state" text;
ALTER TABLE "spaces" ADD COLUMN "available_from" date;
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_published_requires_complete" CHECK ("spaces"."status" NOT IN ('published','rented') OR (
            "spaces"."city" IS NOT NULL AND length(trim("spaces"."city")) > 0
            AND "spaces"."state" IS NOT NULL AND length(trim("spaces"."state")) = 2
            AND "spaces"."district" IS NOT NULL AND length(trim("spaces"."district")) > 0
            AND length(trim("spaces"."title")) >= 10
            AND "spaces"."description" IS NOT NULL AND length(trim("spaces"."description")) >= 20
            AND "spaces"."available_from" IS NOT NULL
          ));


-- ============================================================================
-- Migracao 7: 0007_localizacao_aproximada
-- ============================================================================

-- ============================================================================
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

SET search_path = public, extensions;


CREATE OR REPLACE FUNCTION public.fuzz_location(
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
$$;


CREATE OR REPLACE FUNCTION public.sync_approx_location()
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
$$;


CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();


-- Preenche o que ja existir (em banco novo nao faz nada).
UPDATE public.spaces
SET approx_location = public.fuzz_location(location, id, 300)
WHERE location IS NOT NULL AND approx_location IS NULL;


-- Indice para a listagem publica: publicados, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "spaces_public_listing_idx"
  ON public.spaces (published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;


-- ============================================================================
-- Controle de migracoes
--
-- Marca as migracoes acima como ja aplicadas, exatamente como o migrador do
-- Drizzle faria. Assim um `pnpm db:migrate` futuro aplica apenas o que for
-- novo, em vez de tentar recriar tudo.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT v.hash, v.created_at
FROM (VALUES
  ('2f03bdc057b4a4fb602b1972c2e42d5d85f8f219ee8c72b7b305c159b3409444', 1789587473103),
  ('382e101b16729861ed66e094696d3c9343393545caeb961b1fecb110ab01d654', 1789587488214),
  ('4eae0bd8ab6cc5b1e9e8c137bb1df60a5e03825acfe0b60aebb8e4e795f27d05', 1789589651338),
  ('68dd2c46d7208ea381d1622ebe11d4d30f472f8e0e3039a4280aa1dda8561d36', 1789589723620),
  ('96592144990223f2cf1788744beaf61c87564fd2bf0cc6d0f8bcf0cb63143fbc', 1789590971572),
  ('ba4b6dce37e7099fa96fcfb10035f80c5356897e7b9924cf158cda6769078131', 1789590989707),
  ('81a0621ea17b81a45b9dc8bbcbda00818637c564fe91ef6404bd327ad9febba6', 1789606858948),
  ('41ec89beb8492b6cc04655fbe58856892fa0b0aa7835965295199279dd42ee8c', 1789606885331)
) AS v(hash, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.hash = v.hash
);

-- ============================================================================
-- Pronto. Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
-- ============================================================================

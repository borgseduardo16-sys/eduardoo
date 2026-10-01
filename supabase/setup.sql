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
-- Gerado por scripts/build-supabase-setup.ts a partir de 31 migracoes
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


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 31 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 31
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa

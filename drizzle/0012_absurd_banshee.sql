CREATE TYPE "public"."premium_membership_source" AS ENUM('admin_grant', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."premium_membership_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_source" AS ENUM('premium_benefit', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."promotion_status" AS ENUM('scheduled', 'active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('destaque', 'turbo');--> statement-breakpoint
CREATE TABLE "premium_memberships" (
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
);
--> statement-breakpoint
CREATE TABLE "promotions" (
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
);
--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "premium_memberships_status_idx" ON "premium_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotions_space_idx" ON "promotions" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "promotions_owner_period_idx" ON "promotions" USING btree ("owner_id","type","source","created_at");--> statement-breakpoint
CREATE INDEX "promotions_status_expires_idx" ON "promotions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_one_active_per_space" ON "promotions" USING btree ("space_id") WHERE status IN ('scheduled','active');--> statement-breakpoint
-- Tabela nasceu depois do loop generico de RLS da migracao 0001 (que so
-- alcancou as tabelas que ja existiam naquela hora) — precisa ligar aqui.
-- Sem nenhuma policy de proposito: mesma categoria de bookings/payments,
-- so o servidor (conexao privilegiada) le. `ALTER DEFAULT PRIVILEGES` da
-- migracao 0001 ja revoga o acesso de anon/authenticated por padrao em
-- tabela nova; isto fecha a mesma porta pelo lado do RLS tambem.
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "premium_memberships" ENABLE ROW LEVEL SECURITY;
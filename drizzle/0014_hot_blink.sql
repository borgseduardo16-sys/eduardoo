CREATE TABLE "promotion_purchases" (
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
);
--> statement-breakpoint
ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_purchases" ADD CONSTRAINT "promotion_purchases_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_purchases_provider_id_key" ON "promotion_purchases" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "promotion_purchases_space_idx" ON "promotion_purchases" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "promotion_purchases_owner_idx" ON "promotion_purchases" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "promotion_purchases_status_idx" ON "promotion_purchases" USING btree ("status");--> statement-breakpoint
-- RLS: a migracao 0001 so ligou RLS nas tabelas que ja existiam naquele
-- momento (loop sobre pg_tables na hora de rodar) — toda tabela nova precisa
-- ligar a propria, mesmo padrao usado em 0012 (promotions/premium_memberships).
ALTER TABLE "promotion_purchases" ENABLE ROW LEVEL SECURITY;
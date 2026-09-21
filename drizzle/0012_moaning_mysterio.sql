CREATE TYPE "public"."prospect_lead_confidence" AS ENUM('sem_presenca', 'verificacao_recomendada');--> statement-breakpoint
CREATE TYPE "public"."prospect_lead_status" AS ENUM('valid', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."prospect_location_scope" AS ENUM('city', 'state', 'region', 'country');--> statement-breakpoint
CREATE TYPE "public"."prospect_saved_status" AS ENUM('novo', 'contato_realizado', 'em_negociacao', 'cliente', 'sem_interesse');--> statement-breakpoint
CREATE TYPE "public"."prospect_search_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."prospect_website_classification" AS ENUM('none', 'own_site', 'landing_page', 'builder_page', 'menu', 'catalog', 'scheduling', 'ecommerce', 'link_in_bio', 'whatsapp', 'instagram', 'facebook', 'social_other', 'unknown');--> statement-breakpoint
CREATE TABLE "prospect_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"google_place_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"rating" numeric(2, 1),
	"review_count" integer,
	"maps_url" text,
	"website_raw" text,
	"website_classification" "prospect_website_classification" DEFAULT 'none' NOT NULL,
	"classification_detail" text,
	"whatsapp_url" text,
	"instagram_url" text,
	"facebook_url" text,
	"lead_status" "prospect_lead_status" NOT NULL,
	"discard_reason" text,
	"confidence" "prospect_lead_confidence",
	"is_saved" boolean DEFAULT false NOT NULL,
	"saved_status" "prospect_saved_status",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_leads_rating_range" CHECK ("prospect_leads"."rating" IS NULL OR ("prospect_leads"."rating" >= 0 AND "prospect_leads"."rating" <= 5)),
	CONSTRAINT "prospect_leads_saved_status_requires_saved" CHECK (("prospect_leads"."is_saved" = true AND "prospect_leads"."saved_status" IS NOT NULL) OR ("prospect_leads"."is_saved" = false AND "prospect_leads"."saved_status" IS NULL)),
	CONSTRAINT "prospect_leads_confidence_requires_valid" CHECK (("prospect_leads"."lead_status" = 'valid' AND "prospect_leads"."confidence" IS NOT NULL) OR ("prospect_leads"."lead_status" <> 'valid' AND "prospect_leads"."confidence" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "prospect_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"niche" text NOT NULL,
	"niche_keyword" text NOT NULL,
	"location_label" text NOT NULL,
	"location_scope" "prospect_location_scope" NOT NULL,
	"min_reviews" integer DEFAULT 0 NOT NULL,
	"min_rating" numeric(2, 1),
	"requested_quantity" integer NOT NULL,
	"status" "prospect_search_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"companies_analyzed" integer DEFAULT 0 NOT NULL,
	"leads_found" integer DEFAULT 0 NOT NULL,
	"discarded_site" integer DEFAULT 0 NOT NULL,
	"discarded_menu" integer DEFAULT 0 NOT NULL,
	"discarded_catalog" integer DEFAULT 0 NOT NULL,
	"discarded_scheduling" integer DEFAULT 0 NOT NULL,
	"discarded_other" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "prospect_searches_quantity_positive" CHECK ("prospect_searches"."requested_quantity" > 0),
	CONSTRAINT "prospect_searches_min_reviews_non_negative" CHECK ("prospect_searches"."min_reviews" >= 0)
);
--> statement-breakpoint
ALTER TABLE "prospect_leads" ADD CONSTRAINT "prospect_leads_search_id_prospect_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."prospect_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_leads" ADD CONSTRAINT "prospect_leads_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_searches" ADD CONSTRAINT "prospect_searches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_leads_search_place_key" ON "prospect_leads" USING btree ("search_id","google_place_id");--> statement-breakpoint
CREATE INDEX "prospect_leads_user_status_idx" ON "prospect_leads" USING btree ("user_id","lead_status");--> statement-breakpoint
CREATE INDEX "prospect_leads_user_saved_idx" ON "prospect_leads" USING btree ("user_id","is_saved");--> statement-breakpoint
CREATE INDEX "prospect_leads_search_idx" ON "prospect_leads" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "prospect_searches_user_created_idx" ON "prospect_searches" USING btree ("user_id","created_at");
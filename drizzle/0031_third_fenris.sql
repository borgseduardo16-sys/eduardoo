CREATE TYPE "public"."booking_end_reason" AS ENUM('completed', 'cancelled_by_renter', 'cancelled_by_owner', 'payment_not_received', 'hold_expired');--> statement-breakpoint
CREATE TYPE "public"."operating_hours_mode" AS ENUM('always', 'daily');--> statement-breakpoint
CREATE TYPE "public"."rental_kind" AS ENUM('continuous', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."rental_time_unit" AS ENUM('hour', 'day', 'week');--> statement-breakpoint
CREATE TYPE "public"."temporary_pricing_mode" AS ENUM('per_period', 'packages');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'rental_ending_soon';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'payment_refunded';--> statement-breakpoint
ALTER TYPE "public"."space_type" ADD VALUE 'estacionamento';--> statement-breakpoint
ALTER TYPE "public"."space_type" ADD VALUE 'espaco_eventos';--> statement-breakpoint
ALTER TYPE "public"."space_type" ADD VALUE 'area_lazer';--> statement-breakpoint
ALTER TYPE "public"."space_type" ADD VALUE 'oficina';--> statement-breakpoint
CREATE TABLE "space_unit_groups" (
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
);
--> statement-breakpoint
CREATE TABLE "space_units" (
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
);
--> statement-breakpoint
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_positive";--> statement-breakpoint
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_sane";--> statement-breakpoint
DROP INDEX "bookings_one_active_per_space";--> statement-breakpoint
ALTER TABLE "spaces" ALTER COLUMN "price_monthly_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "temp_from_cents" integer;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "temp_from_units" integer;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "temp_from_unit" "rental_time_unit";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "kind" "rental_kind" DEFAULT 'continuous' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "occupied_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "duration_units" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "duration_unit" "rental_time_unit";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "renewal_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "renewed_from_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "hold_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_issue_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_issue_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "end_reason" "booking_end_reason";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pix_payload" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pix_qr_image" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "pix_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payer_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "delete_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "space_unit_groups" ADD CONSTRAINT "space_unit_groups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_units" ADD CONSTRAINT "space_units_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_units" ADD CONSTRAINT "space_units_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_unit_groups_space_idx" ON "space_unit_groups" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_unit_groups_space_name_key" ON "space_unit_groups" USING btree ("space_id",lower("name"));--> statement-breakpoint
CREATE INDEX "space_units_group_idx" ON "space_units" USING btree ("group_id","position");--> statement-breakpoint
CREATE INDEX "space_units_space_idx" ON "space_units" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_units_space_label_key" ON "space_units" USING btree ("space_id","label");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renewed_from_id_bookings_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_same_group_fk" FOREIGN KEY ("group_id","unit_id") REFERENCES "public"."space_units"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_unit_status_idx" ON "bookings" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX "bookings_group_idx" ON "bookings" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "bookings_hold_expires_idx" ON "bookings" USING btree ("hold_expires_at") WHERE status = 'awaiting_payment';--> statement-breakpoint
CREATE INDEX "bookings_payment_deadline_idx" ON "bookings" USING btree ("payment_issue_deadline_at") WHERE status = 'past_due';--> statement-breakpoint
CREATE INDEX "bookings_temporary_ending_idx" ON "bookings" USING btree ("occupied_until") WHERE kind = 'temporary' AND status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_renter_idempotency_key" ON "bookings" USING btree ("renter_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_live_renewal" ON "bookings" USING btree ("renewed_from_id") WHERE renewed_from_id IS NOT NULL AND status IN ('approved','awaiting_payment','active','past_due');--> statement-breakpoint
CREATE INDEX "payments_outbox_idx" ON "payments" USING btree ("updated_at") WHERE (refund_requested_at IS NOT NULL AND status NOT IN ('refunded','partially_refunded')) OR (delete_requested_at IS NOT NULL AND provider_deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "subscriptions_cancel_pending_idx" ON "subscriptions" USING btree ("cancelled_at") WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_temp_summary_complete" CHECK (("spaces"."temp_from_cents" IS NULL AND "spaces"."temp_from_units" IS NULL AND "spaces"."temp_from_unit" IS NULL)
          OR ("spaces"."temp_from_cents" > 0 AND "spaces"."temp_from_units" > 0 AND "spaces"."temp_from_unit" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_positive" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" > 0);--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_sane" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" <= 100000000);
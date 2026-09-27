CREATE TYPE "public"."deposit_release_status" AS ENUM('held', 'released', 'forfeited', 'partially_forfeited');--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_charged';--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_released';--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'deposit_forfeited_to_owner';--> statement-breakpoint
CREATE TABLE "booking_deposits" (
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
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deposit_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_deposits" ADD CONSTRAINT "booking_deposits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_deposits" ADD CONSTRAINT "booking_deposits_resolved_report_id_reports_id_fk" FOREIGN KEY ("resolved_report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_deposits_booking_key" ON "booking_deposits" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_deposits_provider_id_key" ON "booking_deposits" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "booking_deposits_status_idx" ON "booking_deposits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "booking_deposits_release_status_idx" ON "booking_deposits" USING btree ("release_status");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_booking_idx" ON "reports" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_non_negative" CHECK ("bookings"."deposit_cents" >= 0);
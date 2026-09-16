ALTER TABLE "profiles" ADD COLUMN "document_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "completed_bookings_count" integer DEFAULT 0 NOT NULL;
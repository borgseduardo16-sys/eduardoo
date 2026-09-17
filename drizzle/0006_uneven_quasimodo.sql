ALTER TABLE "profiles" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "available_from" date;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_published_requires_complete" CHECK ("spaces"."status" NOT IN ('published','rented') OR (
            "spaces"."city" IS NOT NULL AND length(trim("spaces"."city")) > 0
            AND "spaces"."state" IS NOT NULL AND length(trim("spaces"."state")) = 2
            AND "spaces"."district" IS NOT NULL AND length(trim("spaces"."district")) > 0
            AND length(trim("spaces"."title")) >= 10
            AND "spaces"."description" IS NOT NULL AND length(trim("spaces"."description")) >= 20
            AND "spaces"."available_from" IS NOT NULL
          ));
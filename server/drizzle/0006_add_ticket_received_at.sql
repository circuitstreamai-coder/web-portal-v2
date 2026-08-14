ALTER TABLE "ticket"."tickets" ADD COLUMN IF NOT EXISTS "received_at" timestamp;
--> statement-breakpoint
UPDATE "ticket"."tickets"
SET "received_at" = COALESCE("updated_at", "created_at")
WHERE "received_at" IS NULL
  AND "status" IN ('accepted', 'in_progress', 'on_hold', 'resolved', 'pending_validation', 'closed');

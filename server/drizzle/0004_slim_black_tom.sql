CREATE TABLE "ticket"."engineer_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"engineer_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"notes" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "ticket"."engineer_availability" ADD CONSTRAINT "engineer_availability_engineer_id_users_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "portal"."users"("id") ON DELETE cascade ON UPDATE cascade;
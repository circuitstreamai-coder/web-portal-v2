CREATE TABLE "ticket"."rcas" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"root_cause" text NOT NULL,
	"action_taken" text NOT NULL,
	"prevention_measure" text,
	"documented_by" text NOT NULL,
	"documented_by_name" text,
	"documented_at" timestamp (3) DEFAULT now() NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
ALTER TABLE "portal"."user_roles" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "ticket"."rcas" ADD CONSTRAINT "rcas_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE cascade ON UPDATE cascade;
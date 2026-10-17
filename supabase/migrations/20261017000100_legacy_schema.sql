-- Consolidated legacy schema for the initial Supabase cutover.
-- Generated from server/drizzle/0000-0008; keep those migrations read-only.
create extension if not exists "pgcrypto";
create schema if not exists "portal";
create schema if not exists "ticket";
create schema if not exists "inventory";

-- Source: server/drizzle/0000_charming_speedball.sql
CREATE TABLE "portal"."roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "portal"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"password" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp (3),
	"author" text,
	"avatar_file_id" integer,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portal"."user_roles" (
	"user_id" text,
	"role_id" text,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "portal"."notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket"."customers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text,
	"contact_person_name" text,
	"email" text,
	"phone" text,
	"secondary_contact_name" text,
	"secondary_contact_email" text,
	"secondary_contact_phone" text,
	"address_state" text,
	"address_city" text,
	"address_pincode" text,
	"reference_id" text,
	"user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp (3),
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "customers_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
CREATE TABLE "ticket"."engineer_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reference_id" text,
	"address_state" text,
	"address_city" text,
	"address_pincode" text,
	"assigned_state" text,
	"profile_photo_url" text,
	"aadhaar_front_url" text,
	"aadhaar_back_url" text,
	"pan_card_url" text,
	"dl_front_url" text,
	"dl_back_url" text,
	"documents_status" text DEFAULT 'pending' NOT NULL,
	"bank_account_number" text,
	"ifsc_code" text,
	"account_holder_name" text,
	"cancel_cheque_url" text,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "engineer_profiles_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
CREATE TABLE "ticket"."file_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket"."files" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"alt_name" varchar(255) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"ext" varchar(10) NOT NULL,
	"size" integer NOT NULL,
	"chunk_count" integer NOT NULL,
	"storage_path" varchar(255) NOT NULL,
	"width" integer,
	"height" integer,
	"exif" json DEFAULT '{}'::json,
	"tags" json DEFAULT '{}'::json,
	"usage_type" varchar(255) DEFAULT 'general',
	"is_deleted" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket"."projects" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"project_head_id" text,
	"name" text,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ticket"."tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_number" text,
	"project_id" text,
	"category_id" text,
	"title" text,
	"description" text,
	"priority" text,
	"status" text,
	"state" text,
	"city" text,
	"pincode" text,
	"address" text,
	"assigned_engineer_id" text,
	"assigned_state_planner_id" text,
	"escalation_level" text,
	"replacement_requested" boolean DEFAULT false NOT NULL,
	"replacement_status" text,
	"payout_amount" integer,
	"sla_deadline" timestamp,
	"closed_at" timestamp,
	"author" text,
	"source" text,
	"message_id" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number"),
	CONSTRAINT "tickets_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "ticket"."ticket_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"default_payout" integer,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ticket"."ticket_history" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"action" text,
	"status" text,
	"remarks" text,
	"author_id" text,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ticket"."attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"type" text,
	"file_url" text,
	"uploaded_at" timestamp DEFAULT now(),
	"uploaded_by" text,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "ticket"."routing_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"location" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku"),
	CONSTRAINT "quantity_non_negative" CHECK ("inventory"."inventory_items"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"ticket_id" text,
	"user_id" text NOT NULL,
	"remarks" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."ticket_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"used_by" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "portal"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "portal"."user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "portal"."roles"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "portal"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."engineer_profiles" ADD CONSTRAINT "engineer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "portal"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."file_chunks" ADD CONSTRAINT "file_chunks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "ticket"."files"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticket"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."projects" ADD CONSTRAINT "projects_project_head_id_users_id_fk" FOREIGN KEY ("project_head_id") REFERENCES "portal"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "ticket"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."tickets" ADD CONSTRAINT "tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "ticket"."ticket_categories"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."attachments" ADD CONSTRAINT "attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."ticket_inventory" ADD CONSTRAINT "ticket_inventory_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."ticket_inventory" ADD CONSTRAINT "ticket_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."ticket_inventory" ADD CONSTRAINT "ticket_inventory_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;

-- Source: server/drizzle/0001_add_rcas_table.sql
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
	"updated_at" timestamp (3),
	CONSTRAINT "rcas_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Source: server/drizzle/0002_loud_killmonger.sql
ALTER TABLE "portal"."user_roles" ADD COLUMN "state" text;

-- Source: server/drizzle/0003_funny_hulk.sql
CREATE TABLE "ticket"."email_allowlist" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"domain" text,
	"email" text,
	"created_by" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket"."email_quota_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"monthly_cap" integer DEFAULT 500 NOT NULL,
	"daily_rate_limit_per_sender" integer DEFAULT 50 NOT NULL,
	"emails_this_month" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp (3) DEFAULT now() NOT NULL,
	"alert_80_sent" boolean DEFAULT false NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp (3),
	"suspended_reason" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "email_quota_configs_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_location_history" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"previous_location" text,
	"new_location" text NOT NULL,
	"changed_by" text NOT NULL,
	"remarks" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_maintenance" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"reason" text NOT NULL,
	"start_date" timestamp (3) NOT NULL,
	"expected_return_date" timestamp (3),
	"completed_date" timestamp (3),
	"technician_notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_external_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"client_name" text NOT NULL,
	"site_location" text,
	"deployed_by" text NOT NULL,
	"deployed_at" timestamp (3) NOT NULL,
	"expected_return_date" timestamp (3),
	"returned_at" timestamp (3),
	"notes" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "inventory"."inventory_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"action" text NOT NULL,
	"field" text,
	"old_value" text,
	"new_value" text,
	"changed_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "asset_type" text DEFAULT 'hardware' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "serial_number" text;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "purchase_date" timestamp (3);--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "warranty_expiry" timestamp (3);--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "expiry_date" timestamp (3);--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "ownership_type" text DEFAULT 'innoserve' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "status" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "replaced_by_item_id" text;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD COLUMN "updated_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "ticket"."email_allowlist" ADD CONSTRAINT "email_allowlist_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticket"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."email_allowlist" ADD CONSTRAINT "email_allowlist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "portal"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket"."email_quota_configs" ADD CONSTRAINT "email_quota_configs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticket"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_location_history" ADD CONSTRAINT "inventory_location_history_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_location_history" ADD CONSTRAINT "inventory_location_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_maintenance" ADD CONSTRAINT "inventory_maintenance_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_maintenance" ADD CONSTRAINT "inventory_maintenance_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_external_deployments" ADD CONSTRAINT "inventory_external_deployments_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_external_deployments" ADD CONSTRAINT "inventory_external_deployments_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_audit_log" ADD CONSTRAINT "inventory_audit_log_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventory"."inventory_items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_audit_log" ADD CONSTRAINT "inventory_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "portal"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inventory"."inventory_items" ADD CONSTRAINT "inventory_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "ticket"."customers"("id") ON DELETE set null ON UPDATE cascade;

-- Source: server/drizzle/0004_slim_black_tom.sql
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

-- Source: server/drizzle/0005_right_shadow_king.sql
CREATE TABLE "portal"."email_otp_challenges" (
	"email" text PRIMARY KEY NOT NULL,
	"otp_digest" text NOT NULL,
	"flow" text NOT NULL,
	"attempts_remaining" integer NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);

-- Source: server/drizzle/0006_add_ticket_received_at.sql
ALTER TABLE "ticket"."tickets" ADD COLUMN IF NOT EXISTS "received_at" timestamp;
--> statement-breakpoint
UPDATE "ticket"."tickets"
SET "received_at" = COALESCE("updated_at", "created_at")
WHERE "received_at" IS NULL
  AND "status" IN ('accepted', 'in_progress', 'on_hold', 'resolved', 'pending_validation', 'closed');

-- Source: server/drizzle/0007_add_inventory_purchase_orders.sql
CREATE TABLE IF NOT EXISTS "inventory"."purchase_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "po_number" text NOT NULL UNIQUE,
  "supplier_name" text NOT NULL,
  "order_date" timestamp NOT NULL,
  "expected_delivery" timestamp,
  "status" text DEFAULT 'pending' NOT NULL,
  "total_amount" double precision,
  "notes" text,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attachment_file_id" integer NOT NULL,
  "created_by" text,
  "deleted" boolean DEFAULT false NOT NULL,
  "created_at" timestamp (3) DEFAULT now() NOT NULL,
  "updated_at" timestamp (3),
  CONSTRAINT "purchase_orders_attachment_file_id_files_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "ticket"."files"("id") ON DELETE restrict ON UPDATE cascade,
  CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "portal"."users"("id") ON DELETE set null ON UPDATE cascade
);

-- Source: server/drizzle/0008_backfill_customer_projects.sql
INSERT INTO "ticket"."projects" ("id", "customer_id", "name", "author", "deleted", "created_at")
SELECT
  gen_random_uuid()::text,
  customer."id",
  COALESCE(NULLIF(BTRIM(customer."company_name"), ''), 'Customer') || ' - General Support',
  'migration',
  false,
  now()
FROM "ticket"."customers" AS customer
WHERE customer."deleted" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "ticket"."projects" AS project
    WHERE project."customer_id" = customer."id"
      AND project."deleted" = false
  );


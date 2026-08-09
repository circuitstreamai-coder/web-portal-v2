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
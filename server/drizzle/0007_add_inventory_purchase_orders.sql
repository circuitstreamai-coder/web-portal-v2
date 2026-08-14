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
  CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE cascade
);

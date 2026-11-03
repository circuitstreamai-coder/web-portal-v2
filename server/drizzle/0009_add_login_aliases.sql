CREATE TABLE IF NOT EXISTS "portal"."login_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"author" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3),
	CONSTRAINT "login_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "portal"."users"("id") ON DELETE cascade ON UPDATE cascade,
	CONSTRAINT "login_aliases_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "portal"."roles"("id") ON DELETE cascade ON UPDATE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "login_aliases_username_lower_unique"
	ON "portal"."login_aliases" (lower("username"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_aliases_user_id_idx"
	ON "portal"."login_aliases" ("user_id");

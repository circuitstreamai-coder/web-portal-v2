CREATE TABLE "portal"."email_otp_challenges" (
	"email" text PRIMARY KEY NOT NULL,
	"otp_digest" text NOT NULL,
	"flow" text NOT NULL,
	"attempts_remaining" integer NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);

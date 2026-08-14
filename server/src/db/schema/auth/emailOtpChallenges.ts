import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { authSchema } from "../auth";

export const emailOtpChallenges = authSchema.table("email_otp_challenges", {
  email: text("email").primaryKey(),
  otpDigest: text("otp_digest").notNull(),
  flow: text("flow").notNull(),
  attemptsRemaining: integer("attempts_remaining").notNull(),
  expiresAt: timestamp("expires_at", { precision: 3, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
});

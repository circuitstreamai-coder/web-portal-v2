import { text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { customers } from "./customers";
import { uuidv7 } from "uuidv7";

// Per-customer email processing quota, billing cap, and suspension state.
export const emailQuotaConfig = ticketSchema.table("email_quota_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  customerId: text("customer_id")
    .notNull()
    .unique()
    .references(() => customers.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  // Monthly cap — default 500, client can extend
  monthlyCap: integer("monthly_cap").default(500).notNull(),
  // Per-sender daily rate limit — configurable per client
  dailyRateLimitPerSender: integer("daily_rate_limit_per_sender").default(50).notNull(),
  // Rolling month counter
  emailsThisMonth: integer("emails_this_month").default(0).notNull(),
  periodStart: timestamp("period_start", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  // Set to true once the 80% alert email has been sent this period (reset each period)
  alert80Sent: boolean("alert_80_sent").default(false).notNull(),
  // Suspension state — only platform support staff (super_admin) can resume
  suspended: boolean("suspended").default(false).notNull(),
  suspendedAt: timestamp("suspended_at", { precision: 3, mode: "date" }),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

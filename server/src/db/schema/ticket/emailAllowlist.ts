import { text, timestamp } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { customers } from "./customers";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// Stores per-customer allowed sender domains and/or specific email addresses.
// If domain is set (e.g. "clientcompany.com"), all emails from that domain are allowed.
// If email is set, only that exact address is allowed.
export const emailAllowlist = ticketSchema.table("email_allowlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  domain: text("domain"),
  email: text("email"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
});

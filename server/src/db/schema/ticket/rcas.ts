import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { tickets } from "./tickets";
import { uuidv7 } from "uuidv7";

export const rcas = ticketSchema.table("rcas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade", onUpdate: "cascade" }),
  rootCause: text("root_cause").notNull(),
  actionTaken: text("action_taken").notNull(),
  preventionMeasure: text("prevention_measure"),
  documentedBy: text("documented_by").notNull(),
  documentedByName: text("documented_by_name"),
  documentedAt: timestamp("documented_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

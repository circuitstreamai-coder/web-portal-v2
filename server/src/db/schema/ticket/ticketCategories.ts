import { text, uuid, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { uuidv7 } from "uuidv7";

export const ticketCategories = ticketSchema.table("ticket_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name"),
  defaultPayout: integer("default_payout"),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

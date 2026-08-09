import { text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { tickets } from "./tickets";
import { uuidv7 } from "uuidv7";

export const ticketHistory = ticketSchema.table("ticket_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ticketId: text("ticket_id").references(() => tickets.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  action: text("action"),
  status: text("status"),
  remarks: text("remarks"),
  authorId: text("author_id"),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

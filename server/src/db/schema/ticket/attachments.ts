import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { tickets } from "./tickets";
import { uuidv7 } from "uuidv7";

export const attachments = ticketSchema.table("attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ticketId: text("ticket_id").references(() => tickets.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  type: text("type"),
  fileUrl: text("file_url"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  uploadedBy: text("uploaded_by"),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { customers } from "./customers";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

export const projects = ticketSchema.table("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  customerId: text("customer_id").references(() => customers.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  projectHeadId: text("project_head_id").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  name: text("name"),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

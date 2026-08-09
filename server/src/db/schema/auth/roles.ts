import { text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { authSchema } from "../auth";
import { uuidv7 } from "uuidv7";

export const roles = authSchema.table("roles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

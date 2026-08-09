import { text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { authSchema } from "../auth";
import { uuidv7 } from "uuidv7";

// status: pending | active | inactive | rejected
export const users = authSchema.table("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name"),
  email: text("email").unique(),
  phone: text("phone"),
  password: text("password"),
  status: text("status").default("pending").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { precision: 3, mode: "date" }),
  author: text("author"),
  avatarFileId: integer("avatar_file_id"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

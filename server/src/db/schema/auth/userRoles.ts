import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { authSchema } from "../auth";
import { users } from "./users";
import { roles } from "./roles";

export const userRoles = authSchema.table("user_roles", {
  userId: text("user_id").references(() => users.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  roleId: text("role_id").references(() => roles.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  author: text("author"),
  state: text("state"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

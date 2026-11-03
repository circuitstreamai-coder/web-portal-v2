import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { authSchema } from "../auth";
import { roles } from "./roles";
import { users } from "./users";

/**
 * A role-specific username for a canonical email-based user.
 *
 * Several operational accounts intentionally share one mailbox. Keeping the
 * person in portal.users avoids duplicate identities, while an alias selects
 * the role to use for a particular login.
 */
export const loginAliases = authSchema.table("login_aliases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  username: text("username").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

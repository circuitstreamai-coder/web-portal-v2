import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { authSchema } from "../auth";
import { uuidv7 } from "uuidv7";

export const notifications = authSchema.table("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // info | success | warning | error
  title: text("title").notNull(),
  message: text("message"),
  href: text("href"),
  read: boolean("read").default(false).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
});

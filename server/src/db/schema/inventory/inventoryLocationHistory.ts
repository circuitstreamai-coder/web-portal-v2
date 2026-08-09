import { text, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

export const inventoryLocationHistory = inventorySchema.table(
  "inventory_location_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    previousLocation: text("previous_location"),
    newLocation: text("new_location").notNull(),
    changedBy: text("changed_by")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
);

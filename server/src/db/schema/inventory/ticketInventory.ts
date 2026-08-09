import { text, integer, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { tickets } from "../ticket/tickets";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

export const ticketInventory = inventorySchema.table("ticket_inventory", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => tickets.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  quantity: integer("quantity").notNull(),
  usedBy: text("used_by")
    .notNull()
    .references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
});

import { text, integer, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { tickets } from "../ticket/tickets";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

export const inventoryTransactions = inventorySchema.table(
  "inventory_transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    itemId: text("item_id")
      .notNull()
      .references(() => inventoryItems.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    type: text("type").notNull(), // "IN" | "OUT"
    quantity: integer("quantity").notNull(),
    ticketId: text("ticket_id").references(() => tickets.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    userId: text("user_id")
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

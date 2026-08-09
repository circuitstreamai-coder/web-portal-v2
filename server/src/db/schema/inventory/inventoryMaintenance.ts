import { text, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// status: "scheduled" | "in_repair" | "out_of_service" | "completed"
export const inventoryMaintenance = inventorySchema.table(
  "inventory_maintenance",
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
    status: text("status").notNull().default("scheduled"),
    reason: text("reason").notNull(),
    startDate: timestamp("start_date", { precision: 3, mode: "date" }).notNull(),
    expectedReturnDate: timestamp("expected_return_date", { precision: 3, mode: "date" }),
    completedDate: timestamp("completed_date", { precision: 3, mode: "date" }),
    technicianNotes: text("technician_notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
      () => new Date(),
    ),
  },
);

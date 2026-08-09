import { text, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// action: "created" | "status_changed" | "location_changed" | "ownership_changed"
//       | "replaced" | "maintenance_started" | "maintenance_completed"
//       | "deployed_externally" | "returned_from_deployment"
export const inventoryAuditLog = inventorySchema.table("inventory_audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by")
    .notNull()
    .references(() => users.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
});

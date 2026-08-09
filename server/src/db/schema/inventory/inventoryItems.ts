import { text, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { inventorySchema } from "../inventory";
import { customers } from "../ticket/customers";
import { uuidv7 } from "uuidv7";

// assetType: "hardware" | "software_license" | "network_equipment" | "tool" | "other"
// ownershipType: "innoserve" | "customer"
// status: "available" | "in_use" | "under_maintenance" | "retired" | "replaced" | "deployed_externally"
export const inventoryItems = inventorySchema.table(
  "inventory_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    sku: text("sku").unique(),
    quantity: integer("quantity").default(0).notNull(),
    location: text("location"),

    // Asset classification
    assetType: text("asset_type").notNull().default("hardware"),
    serialNumber: text("serial_number"),
    purchaseDate: timestamp("purchase_date", { precision: 3, mode: "date" }),
    warrantyExpiry: timestamp("warranty_expiry", { precision: 3, mode: "date" }),
    // Used for software licenses or other items with a renewal/expiry date
    expiryDate: timestamp("expiry_date", { precision: 3, mode: "date" }),

    // Ownership — Innoserve or a specific customer
    ownershipType: text("ownership_type").notNull().default("innoserve"),
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),

    // Lifecycle status
    status: text("status").notNull().default("available"),

    // When this item has been replaced, link to the replacement item id
    replacedByItemId: text("replaced_by_item_id"),

    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
      () => new Date(),
    ),
  },
  (t) => [check("quantity_non_negative", sql`${t.quantity} >= 0`)],
);

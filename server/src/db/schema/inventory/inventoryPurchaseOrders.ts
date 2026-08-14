import { boolean, doublePrecision, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { inventorySchema } from "../inventory";
import { users } from "../auth/users";
import { files } from "../ticket/files";

export const inventoryPurchaseOrders = inventorySchema.table("purchase_orders", {
  id: text("id").primaryKey().$defaultFn(() => uuidv7()),
  poNumber: text("po_number").notNull().unique(),
  supplierName: text("supplier_name").notNull(),
  orderDate: timestamp("order_date", { precision: 3, mode: "date" }).notNull(),
  expectedDelivery: timestamp("expected_delivery", { precision: 3, mode: "date" }),
  status: text("status").notNull().default("pending"),
  totalAmount: doublePrecision("total_amount"),
  notes: text("notes"),
  items: jsonb("items").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  attachmentFileId: integer("attachment_file_id").notNull().references(() => files.id, {
    onDelete: "restrict",
    onUpdate: "cascade",
  }),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(() => new Date()),
});

import { text, timestamp } from "drizzle-orm/pg-core";
import { inventorySchema } from "../inventory";
import { inventoryItems } from "./inventoryItems";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

export const inventoryExternalDeployment = inventorySchema.table(
  "inventory_external_deployments",
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
    clientName: text("client_name").notNull(),
    siteLocation: text("site_location"),
    deployedBy: text("deployed_by")
      .notNull()
      .references(() => users.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    deployedAt: timestamp("deployed_at", { precision: 3, mode: "date" }).notNull(),
    expectedReturnDate: timestamp("expected_return_date", { precision: 3, mode: "date" }),
    returnedAt: timestamp("returned_at", { precision: 3, mode: "date" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
      () => new Date(),
    ),
  },
);

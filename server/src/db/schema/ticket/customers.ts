import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// status: pending | active | inactive | rejected
export const customers = ticketSchema.table("customers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  // Company details
  companyName: text("company_name"),
  // Primary contact
  contactPersonName: text("contact_person_name"),
  email: text("email"),
  phone: text("phone"),
  // Secondary contact (optional)
  secondaryContactName: text("secondary_contact_name"),
  secondaryContactEmail: text("secondary_contact_email"),
  secondaryContactPhone: text("secondary_contact_phone"),
  // Address
  addressState: text("address_state"),
  addressCity: text("address_city"),
  addressPincode: text("address_pincode"),
  referenceId: text("reference_id").unique(),
  // Login account for this customer
  userId: text("user_id").references(() => users.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  // Approval workflow
  status: text("status").default("pending").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { precision: 3, mode: "date" }),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

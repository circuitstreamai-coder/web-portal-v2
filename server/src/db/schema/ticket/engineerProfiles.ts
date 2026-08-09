import { text, timestamp, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// documentsStatus: pending | approved | rejected | reupload
export const engineerProfiles = ticketSchema.table("engineer_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  referenceId: text("reference_id").unique(),
  // Address
  addressState: text("address_state"),
  addressCity: text("address_city"),
  addressPincode: text("address_pincode"),
  assignedState: text("assigned_state"),
  // Profile photo
  profilePhotoUrl: text("profile_photo_url"),
  // KYC documents
  aadhaarFrontUrl: text("aadhaar_front_url"),
  aadhaarBackUrl: text("aadhaar_back_url"),
  panCardUrl: text("pan_card_url"),
  dlFrontUrl: text("dl_front_url"),
  dlBackUrl: text("dl_back_url"),
  // Document review status: pending | approved | rejected | reupload
  documentsStatus: text("documents_status").default("pending").notNull(),
  // Bank details
  bankAccountNumber: text("bank_account_number"),
  ifscCode: text("ifsc_code"),
  accountHolderName: text("account_holder_name"),
  cancelChequeUrl: text("cancel_cheque_url"),
  author: text("author"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

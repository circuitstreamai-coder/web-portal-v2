import { text, timestamp, time, date, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { users } from "../auth/users";
import { uuidv7 } from "uuidv7";

// A single date + time-range slot an engineer has marked themselves available for.
export const engineerAvailability = ticketSchema.table("engineer_availability", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  engineerId: text("engineer_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  date: date("date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  notes: text("notes"),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

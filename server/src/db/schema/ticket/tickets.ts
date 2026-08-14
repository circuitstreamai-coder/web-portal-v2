import { text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";
import { projects } from "./projects";
import { ticketCategories } from "./ticketCategories";
import { uuidv7 } from "uuidv7";

export const tickets = ticketSchema.table("tickets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  ticketNumber: text("ticket_number").unique(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  categoryId: text("category_id").references(() => ticketCategories.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  title: text("title"),
  description: text("description"),
  priority: text("priority"),
  status: text("status"),
  state: text("state"),
  city: text("city"),
  pincode: text("pincode"),
  address: text("address"),
  assignedEngineerId: text("assigned_engineer_id"),
  assignedStatePlannerId: text("assigned_state_planner_id"),
  escalationLevel: text("escalation_level"),
  replacementRequested: boolean("replacement_requested")
    .default(false)
    .notNull(),
  replacementStatus: text("replacement_status"),
  payoutAmount: integer("payout_amount"),
  slaDeadline: timestamp("sla_deadline"),
  receivedAt: timestamp("received_at"),
  closedAt: timestamp("closed_at"),
  author: text("author"),
  source: text("source"),
  messageId: text("message_id").unique(),
  deleted: boolean("deleted").default(false).notNull(),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

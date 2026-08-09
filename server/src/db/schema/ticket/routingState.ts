import { text, timestamp } from "drizzle-orm/pg-core";
import { ticketSchema } from "../ticket";

export const routingState = ticketSchema.table("routing_state", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).$onUpdate(
    () => new Date(),
  ),
});

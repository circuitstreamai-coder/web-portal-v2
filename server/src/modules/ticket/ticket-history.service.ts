//src/modules/ticket/ticket-history.service.ts
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/db.js";
import { ticketHistory } from "../../db/schema/index.js";

export async function listTicketHistory() {
  return db
    .select()
    .from(ticketHistory)
    .where(eq(ticketHistory.deleted, false));
}

export async function listTicketHistoryByTicket(ticketId: string) {
  return db
    .select()
    .from(ticketHistory)
    .where(eq(ticketHistory.ticketId, ticketId))
    .orderBy(asc(ticketHistory.createdAt));
}

export async function createTicketHistoryEntry(input: {
  ticketId: string;
  action?: string;
  status?: string;
  remarks?: string;
  author?: string;
}) {
  const [entry] = await db.insert(ticketHistory).values(input).returning();
  return entry;
}

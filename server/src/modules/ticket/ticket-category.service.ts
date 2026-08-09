//src/modules/ticket/ticket-category.service.ts
import { eq } from "drizzle-orm";
import { db } from "../../db/db.js";
import { ticketCategories } from "../../db/schema/index.js";

export async function listPayoutRates() {
  return db
    .select({
      categoryId: ticketCategories.id,
      categoryName: ticketCategories.name,
      callType: ticketCategories.name,
      amount: ticketCategories.defaultPayout,
      updatedAt: ticketCategories.updatedAt,
    })
    .from(ticketCategories)
    .where(eq(ticketCategories.deleted, false))
    .then((rows) => rows.map((row) => ({ ...row, currency: "INR" as const })));
}

export async function listTicketCategories() {
  return db
    .select()
    .from(ticketCategories)
    .where(eq(ticketCategories.deleted, false));
}

export async function createTicketCategory(input: {
  name?: string;
  defaultPayout?: number;
  author?: string;
}) {
  const [category] = await db
    .insert(ticketCategories)
    .values(input)
    .returning();
  return category;
}

export async function updatePayoutRate(categoryId: string, amount: number) {
  const [category] = await db
    .update(ticketCategories)
    .set({ defaultPayout: amount })
    .where(eq(ticketCategories.id, categoryId))
    .returning();
  if (!category) throw { statusCode: 404, message: "Ticket category not found" };
  return {
    categoryId: category.id,
    categoryName: category.name,
    callType: category.name,
    amount: category.defaultPayout,
    currency: "INR" as const,
    updatedAt: category.updatedAt,
  };
}

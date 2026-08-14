//src/modules/ticket/ticket-category.service.ts
import { and, eq } from "drizzle-orm";
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
  if (!input.name?.trim()) {
    throw { statusCode: 400, message: "name is required" };
  }
  if (input.defaultPayout !== undefined && input.defaultPayout < 0) {
    throw { statusCode: 400, message: "defaultPayout must be zero or greater" };
  }
  const [category] = await db
    .insert(ticketCategories)
    .values({ ...input, name: input.name.trim() })
    .returning();
  return category;
}

export async function updateTicketCategory(
  id: string,
  input: { name?: string; defaultPayout?: number },
) {
  const updates: { name?: string; defaultPayout?: number } = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) throw { statusCode: 400, message: "name is required" };
    updates.name = input.name.trim();
  }
  if (input.defaultPayout !== undefined) {
    if (!Number.isFinite(input.defaultPayout) || input.defaultPayout < 0) {
      throw { statusCode: 400, message: "defaultPayout must be zero or greater" };
    }
    updates.defaultPayout = input.defaultPayout;
  }
  if (Object.keys(updates).length === 0) {
    throw { statusCode: 400, message: "No fields to update" };
  }

  const [category] = await db
    .update(ticketCategories)
    .set(updates)
    .where(and(eq(ticketCategories.id, id), eq(ticketCategories.deleted, false)))
    .returning();
  if (!category) throw { statusCode: 404, message: "Ticket category not found" };
  return category;
}

export async function deleteTicketCategory(id: string) {
  const [category] = await db
    .update(ticketCategories)
    .set({ deleted: true })
    .where(and(eq(ticketCategories.id, id), eq(ticketCategories.deleted, false)))
    .returning();
  if (!category) throw { statusCode: 404, message: "Ticket category not found" };
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

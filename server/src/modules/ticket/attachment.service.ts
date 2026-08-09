//src/modules/ticket/attachment.service.ts
import { and, eq } from "drizzle-orm";
import { db } from "../../db/db.js";
import { attachments, tickets } from "../../db/schema/index.js";
import type { CreateAttachmentBody } from "./ticket.schema.js";

function toIso(row: typeof attachments.$inferSelect) {
  return { ...row, uploadedAt: row.uploadedAt?.toISOString() ?? null };
}

export async function listAttachments() {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.deleted, false));
  return rows.map(toIso);
}

export async function listAttachmentsByTicket(ticketId: string) {
  const rows = await db
    .select()
    .from(attachments)
    .where(
      and(eq(attachments.ticketId, ticketId), eq(attachments.deleted, false)),
    );
  return rows.map(toIso);
}

export async function createAttachment(
  ticketId: string,
  input: CreateAttachmentBody,
  uploadedBy: string,
) {
  if (!input.fileUrl) {
    throw { statusCode: 400, message: "fileUrl is required" };
  }

  if (!["ir_report", "site_image"].includes(input.type)) {
    throw { statusCode: 400, message: "type must be one of: ir_report, site_image" };
  }

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.deleted, false)));

  if (!ticket) {
    throw { statusCode: 404, message: "Ticket not found" };
  }

  const [attachment] = await db
    .insert(attachments)
    .values({
      ticketId,
      fileUrl: input.fileUrl,
      type: input.type,
      uploadedBy,
      author: uploadedBy,
      createdAt: new Date(),
    })
    .returning();

  return toIso(attachment);
}

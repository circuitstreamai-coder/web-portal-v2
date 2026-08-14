import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/db.js";
import { files, inventoryPurchaseOrders } from "../../db/schema/index.js";

const STATUSES = new Set(["pending", "partial", "received", "cancelled"]);

export interface PurchaseOrderInput {
  poNumber?: string;
  supplierName?: string;
  orderDate?: string;
  expectedDelivery?: string | null;
  status?: string;
  totalAmount?: number | null;
  notes?: string | null;
  items?: Array<Record<string, unknown>>;
  attachmentFileId?: number;
}

async function validateAttachment(fileId: number | undefined) {
  if (!Number.isInteger(fileId)) throw { statusCode: 400, message: "Purchase order document is required" };
  const [file] = await db
    .select({ id: files.id, mimeType: files.mimeType })
    .from(files)
    .where(and(eq(files.id, fileId!), eq(files.isDeleted, false)))
    .limit(1);
  if (!file) throw { statusCode: 400, message: "Uploaded purchase order document was not found" };
  if (!(file.mimeType === "application/pdf" || file.mimeType.startsWith("image/"))) {
    throw { statusCode: 400, message: "Purchase order must be a PDF or image" };
  }
}

function values(input: PurchaseOrderInput) {
  if (input.status && !STATUSES.has(input.status)) {
    throw { statusCode: 400, message: "Invalid purchase order status" };
  }
  return {
    ...(input.poNumber !== undefined && { poNumber: input.poNumber.trim() }),
    ...(input.supplierName !== undefined && { supplierName: input.supplierName.trim() }),
    ...(input.orderDate !== undefined && { orderDate: new Date(input.orderDate) }),
    ...(input.expectedDelivery !== undefined && { expectedDelivery: input.expectedDelivery ? new Date(input.expectedDelivery) : null }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.totalAmount !== undefined && { totalAmount: input.totalAmount }),
    ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
    ...(input.items !== undefined && { items: input.items }),
    ...(input.attachmentFileId !== undefined && { attachmentFileId: input.attachmentFileId }),
  };
}

export async function listPurchaseOrders() {
  return db.select().from(inventoryPurchaseOrders)
    .where(eq(inventoryPurchaseOrders.deleted, false))
    .orderBy(desc(inventoryPurchaseOrders.createdAt));
}

export async function createPurchaseOrder(input: PurchaseOrderInput, userId: string) {
  if (!input.poNumber?.trim() || !input.supplierName?.trim() || !input.orderDate) {
    throw { statusCode: 400, message: "PO number, supplier, and order date are required" };
  }
  await validateAttachment(input.attachmentFileId);
  const [created] = await db.insert(inventoryPurchaseOrders).values({
    ...values(input) as any,
    poNumber: input.poNumber.trim(),
    supplierName: input.supplierName.trim(),
    orderDate: new Date(input.orderDate),
    attachmentFileId: input.attachmentFileId!,
    createdBy: userId,
  }).returning();
  return created;
}

export async function updatePurchaseOrder(id: string, input: PurchaseOrderInput) {
  if (input.attachmentFileId !== undefined) await validateAttachment(input.attachmentFileId);
  const [updated] = await db.update(inventoryPurchaseOrders)
    .set(values(input))
    .where(and(eq(inventoryPurchaseOrders.id, id), eq(inventoryPurchaseOrders.deleted, false)))
    .returning();
  if (!updated) throw { statusCode: 404, message: "Purchase order not found" };
  return updated;
}

export async function deletePurchaseOrder(id: string) {
  const [deleted] = await db.update(inventoryPurchaseOrders)
    .set({ deleted: true })
    .where(and(eq(inventoryPurchaseOrders.id, id), eq(inventoryPurchaseOrders.deleted, false)))
    .returning({ id: inventoryPurchaseOrders.id });
  if (!deleted) throw { statusCode: 404, message: "Purchase order not found" };
  return { ok: true };
}

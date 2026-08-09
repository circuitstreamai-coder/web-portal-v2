import { eq, sql, desc } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  inventoryItems,
  inventoryTransactions,
  inventoryLocationHistory,
  inventoryMaintenance,
  inventoryExternalDeployment,
  inventoryAuditLog,
  ticketInventory,
  tickets,
} from "../../db/schema/index.js";
import type {
  CreateInventoryItemBody,
  UpdateInventoryItemBody,
  AddStockBody,
  UseItemBody,
  CreateMaintenanceBody,
  CompleteMaintenanceBody,
  CreateExternalDeploymentBody,
  ReturnExternalDeploymentBody,
  ReplaceItemBody,
} from "./inventory.schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeAudit(
  tx: typeof db,
  itemId: string,
  action: string,
  changedBy: string,
  opts?: { field?: string; oldValue?: string; newValue?: string; notes?: string },
) {
  await tx.insert(inventoryAuditLog).values({
    itemId,
    action,
    field: opts?.field,
    oldValue: opts?.oldValue,
    newValue: opts?.newValue,
    changedBy,
    notes: opts?.notes,
  });
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

export async function listInventoryItems() {
  return db.select().from(inventoryItems);
}

export async function createInventoryItem(
  body: CreateInventoryItemBody,
  userId: string,
) {
  const [item] = await db
    .insert(inventoryItems)
    .values({
      name: body.name,
      sku: body.sku,
      quantity: body.quantity ?? 0,
      location: body.location,
      assetType: body.assetType ?? "hardware",
      serialNumber: body.serialNumber,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
      warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : undefined,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      ownershipType: body.ownershipType ?? "innoserve",
      customerId: body.customerId,
      status: "available",
    })
    .returning();

  await writeAudit(db, item.id, "created", userId, {
    notes: `Asset created: ${item.name} (${item.assetType})`,
  });

  return item;
}

export async function updateInventoryItem(
  itemId: string,
  body: UpdateInventoryItemBody,
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));

  if (!existing) {
    throw { statusCode: 404, message: "Inventory item not found" };
  }

  const updates: Partial<typeof inventoryItems.$inferInsert> = {};
  const auditFields: Array<{ field: string; oldValue: string; newValue: string }> = [];

  const trackField = <K extends keyof typeof updates>(
    key: K,
    value: typeof updates[K],
    oldVal: string | null | undefined,
    newVal: string | null | undefined,
  ) => {
    if (value !== undefined) {
      updates[key] = value;
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        auditFields.push({ field: key as string, oldValue: String(oldVal ?? ""), newValue: String(newVal ?? "") });
      }
    }
  };

  trackField("name", body.name, existing.name, body.name);
  trackField("sku", body.sku, existing.sku, body.sku);
  trackField("assetType", body.assetType, existing.assetType, body.assetType);
  trackField("serialNumber", body.serialNumber, existing.serialNumber, body.serialNumber);
  trackField("ownershipType", body.ownershipType, existing.ownershipType, body.ownershipType);
  trackField("customerId", body.customerId, existing.customerId, body.customerId);
  trackField("status", body.status, existing.status, body.status);

  if (body.purchaseDate !== undefined) {
    const d = body.purchaseDate ? new Date(body.purchaseDate) : null;
    updates.purchaseDate = d ?? undefined;
    auditFields.push({ field: "purchaseDate", oldValue: existing.purchaseDate?.toISOString() ?? "", newValue: d?.toISOString() ?? "" });
  }
  if (body.warrantyExpiry !== undefined) {
    const d = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null;
    updates.warrantyExpiry = d ?? undefined;
    auditFields.push({ field: "warrantyExpiry", oldValue: existing.warrantyExpiry?.toISOString() ?? "", newValue: d?.toISOString() ?? "" });
  }
  if (body.expiryDate !== undefined) {
    const d = body.expiryDate ? new Date(body.expiryDate) : null;
    updates.expiryDate = d ?? undefined;
    auditFields.push({ field: "expiryDate", oldValue: existing.expiryDate?.toISOString() ?? "", newValue: d?.toISOString() ?? "" });
  }

  // Location change — log to location history separately
  if (body.location !== undefined && body.location !== existing.location) {
    updates.location = body.location;
    await db.insert(inventoryLocationHistory).values({
      itemId,
      previousLocation: existing.location ?? undefined,
      newLocation: body.location,
      changedBy: userId,
    });
    auditFields.push({ field: "location", oldValue: existing.location ?? "", newValue: body.location });
  }

  if (Object.keys(updates).length === 0) {
    throw { statusCode: 400, message: "No fields to update" };
  }

  const [item] = await db
    .update(inventoryItems)
    .set(updates)
    .where(eq(inventoryItems.id, itemId))
    .returning();

  if (!item) throw { statusCode: 404, message: "Inventory item not found" };

  for (const af of auditFields) {
    await writeAudit(db, itemId, "field_updated", userId, af);
  }

  return item;
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export async function addStock(itemId: string, body: AddStockBody, userId: string) {
  if (body.quantity <= 0) {
    throw { statusCode: 400, message: "Quantity must be greater than 0" };
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId))
      .for("update");

    if (!item) throw { statusCode: 404, message: "Inventory item not found" };

    await tx
      .update(inventoryItems)
      .set({ quantity: sql`${inventoryItems.quantity} + ${body.quantity}` })
      .where(eq(inventoryItems.id, itemId));

    await tx.insert(inventoryTransactions).values({
      itemId,
      type: "IN",
      quantity: body.quantity,
      userId,
      remarks: body.remarks,
    });

    await writeAudit(tx as unknown as typeof db, itemId, "stock_added", userId, {
      field: "quantity",
      oldValue: String(item.quantity),
      newValue: String(item.quantity + body.quantity),
      notes: body.remarks,
    });

    const [updated] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    return updated;
  });
}

// ── Ticket Usage ──────────────────────────────────────────────────────────────

export async function listTicketItems(ticketId: string) {
  return db
    .select({
      id: ticketInventory.id,
      ticketId: ticketInventory.ticketId,
      quantity: ticketInventory.quantity,
      usedBy: ticketInventory.usedBy,
      createdAt: ticketInventory.createdAt,
      item: {
        id: inventoryItems.id,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        location: inventoryItems.location,
        assetType: inventoryItems.assetType,
        status: inventoryItems.status,
      },
    })
    .from(ticketInventory)
    .innerJoin(inventoryItems, eq(ticketInventory.itemId, inventoryItems.id))
    .where(eq(ticketInventory.ticketId, ticketId));
}

export async function useItem(ticketId: string, body: UseItemBody, userId: string) {
  if (body.quantity <= 0) {
    throw { statusCode: 400, message: "Quantity must be greater than 0" };
  }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  if (!ticket) throw { statusCode: 404, message: "Ticket not found" };
  if (ticket.assignedEngineerId !== userId) {
    throw { statusCode: 403, message: "Ticket is not assigned to you" };
  }

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, body.itemId))
      .for("update");

    if (!item) throw { statusCode: 404, message: "Inventory item not found" };
    if (item.status !== "available") {
      throw { statusCode: 400, message: `Item is not available (current status: ${item.status})` };
    }
    if (item.quantity < body.quantity) {
      throw { statusCode: 400, message: "Insufficient stock" };
    }

    await tx
      .update(inventoryItems)
      .set({
        quantity: sql`${inventoryItems.quantity} - ${body.quantity}`,
        status: item.quantity - body.quantity === 0 ? "in_use" : item.status,
      })
      .where(eq(inventoryItems.id, body.itemId));

    await tx.insert(inventoryTransactions).values({
      itemId: body.itemId,
      type: "OUT",
      quantity: body.quantity,
      ticketId,
      userId,
    });

    await tx.insert(ticketInventory).values({
      ticketId,
      itemId: body.itemId,
      quantity: body.quantity,
      usedBy: userId,
    });

    await writeAudit(tx as unknown as typeof db, body.itemId, "used_on_ticket", userId, {
      notes: `Used ${body.quantity} unit(s) on ticket ${ticketId}`,
    });

    return { success: true };
  });
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export async function createMaintenance(
  itemId: string,
  body: CreateMaintenanceBody,
  userId: string,
) {
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw { statusCode: 404, message: "Inventory item not found" };
  if (item.status === "retired" || item.status === "replaced") {
    throw { statusCode: 400, message: `Cannot start maintenance on a ${item.status} item` };
  }

  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(inventoryMaintenance)
      .values({
        itemId,
        status: "scheduled",
        reason: body.reason,
        startDate: new Date(body.startDate),
        expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : undefined,
        technicianNotes: body.technicianNotes,
        createdBy: userId,
      })
      .returning();

    await tx
      .update(inventoryItems)
      .set({ status: "under_maintenance" })
      .where(eq(inventoryItems.id, itemId));

    await writeAudit(tx as unknown as typeof db, itemId, "maintenance_started", userId, {
      field: "status",
      oldValue: item.status,
      newValue: "under_maintenance",
      notes: body.reason,
    });

    return record;
  });
}

export async function completeMaintenance(
  maintenanceId: string,
  body: CompleteMaintenanceBody,
  userId: string,
) {
  const [record] = await db
    .select()
    .from(inventoryMaintenance)
    .where(eq(inventoryMaintenance.id, maintenanceId));

  if (!record) throw { statusCode: 404, message: "Maintenance record not found" };
  if (record.status === "completed") {
    throw { statusCode: 400, message: "Maintenance already completed" };
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(inventoryMaintenance)
      .set({
        status: "completed",
        completedDate: body.completedDate ? new Date(body.completedDate) : new Date(),
        technicianNotes: body.technicianNotes ?? record.technicianNotes,
      })
      .where(eq(inventoryMaintenance.id, maintenanceId))
      .returning();

    await tx
      .update(inventoryItems)
      .set({ status: "available" })
      .where(eq(inventoryItems.id, record.itemId));

    await writeAudit(tx as unknown as typeof db, record.itemId, "maintenance_completed", userId, {
      field: "status",
      oldValue: "under_maintenance",
      newValue: "available",
      notes: body.technicianNotes,
    });

    return updated;
  });
}

export async function listItemMaintenance(itemId: string) {
  return db
    .select()
    .from(inventoryMaintenance)
    .where(eq(inventoryMaintenance.itemId, itemId))
    .orderBy(desc(inventoryMaintenance.createdAt));
}

// ── External Deployment ───────────────────────────────────────────────────────

export async function createExternalDeployment(
  body: CreateExternalDeploymentBody,
  userId: string,
) {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, body.itemId));

  if (!item) throw { statusCode: 404, message: "Inventory item not found" };
  if (item.status !== "available") {
    throw { statusCode: 400, message: `Item is not available (current status: ${item.status})` };
  }

  return db.transaction(async (tx) => {
    const [deployment] = await tx
      .insert(inventoryExternalDeployment)
      .values({
        itemId: body.itemId,
        clientName: body.clientName,
        siteLocation: body.siteLocation,
        deployedBy: userId,
        deployedAt: new Date(body.deployedAt),
        expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : undefined,
        notes: body.notes,
      })
      .returning();

    await tx
      .update(inventoryItems)
      .set({ status: "deployed_externally" })
      .where(eq(inventoryItems.id, body.itemId));

    await writeAudit(tx as unknown as typeof db, body.itemId, "deployed_externally", userId, {
      field: "status",
      oldValue: "available",
      newValue: "deployed_externally",
      notes: `Client: ${body.clientName}, Site: ${body.siteLocation ?? "N/A"}`,
    });

    return deployment;
  });
}

export async function returnExternalDeployment(
  deploymentId: string,
  body: ReturnExternalDeploymentBody,
  userId: string,
) {
  const [deployment] = await db
    .select()
    .from(inventoryExternalDeployment)
    .where(eq(inventoryExternalDeployment.id, deploymentId));

  if (!deployment) throw { statusCode: 404, message: "Deployment record not found" };
  if (deployment.returnedAt) {
    throw { statusCode: 400, message: "Item has already been returned" };
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(inventoryExternalDeployment)
      .set({
        returnedAt: body.returnedAt ? new Date(body.returnedAt) : new Date(),
        notes: body.notes ?? deployment.notes,
      })
      .where(eq(inventoryExternalDeployment.id, deploymentId))
      .returning();

    await tx
      .update(inventoryItems)
      .set({ status: "available" })
      .where(eq(inventoryItems.id, deployment.itemId));

    await writeAudit(tx as unknown as typeof db, deployment.itemId, "returned_from_deployment", userId, {
      field: "status",
      oldValue: "deployed_externally",
      newValue: "available",
      notes: body.notes,
    });

    return updated;
  });
}

export async function listItemExternalDeployments(itemId: string) {
  return db
    .select()
    .from(inventoryExternalDeployment)
    .where(eq(inventoryExternalDeployment.itemId, itemId))
    .orderBy(desc(inventoryExternalDeployment.createdAt));
}

// ── Replacement ───────────────────────────────────────────────────────────────

export async function replaceItem(
  itemId: string,
  body: ReplaceItemBody,
  userId: string,
) {
  if (itemId === body.replacementItemId) {
    throw { statusCode: 400, message: "An item cannot replace itself" };
  }

  const [oldItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!oldItem) throw { statusCode: 404, message: "Original item not found" };

  const [newItem] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, body.replacementItemId));
  if (!newItem) throw { statusCode: 404, message: "Replacement item not found" };

  return db.transaction(async (tx) => {
    await tx
      .update(inventoryItems)
      .set({ status: "replaced", replacedByItemId: body.replacementItemId })
      .where(eq(inventoryItems.id, itemId));

    await writeAudit(tx as unknown as typeof db, itemId, "replaced", userId, {
      field: "status",
      oldValue: oldItem.status,
      newValue: "replaced",
      notes: `Replaced by item ${body.replacementItemId}. ${body.notes ?? ""}`.trim(),
    });

    await writeAudit(tx as unknown as typeof db, body.replacementItemId, "used_as_replacement", userId, {
      notes: `Replaced item ${itemId}. ${body.notes ?? ""}`.trim(),
    });

    return { replacedItemId: itemId, replacementItemId: body.replacementItemId };
  });
}

// ── Audit & Location History ──────────────────────────────────────────────────

export async function getItemAuditLog(itemId: string) {
  return db
    .select()
    .from(inventoryAuditLog)
    .where(eq(inventoryAuditLog.itemId, itemId))
    .orderBy(desc(inventoryAuditLog.createdAt));
}

export async function getItemLocationHistory(itemId: string) {
  return db
    .select()
    .from(inventoryLocationHistory)
    .where(eq(inventoryLocationHistory.itemId, itemId))
    .orderBy(desc(inventoryLocationHistory.createdAt));
}

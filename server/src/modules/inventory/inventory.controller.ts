import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  addStock,
  useItem,
  listTicketItems,
  createMaintenance,
  completeMaintenance,
  listItemMaintenance,
  createExternalDeployment,
  returnExternalDeployment,
  listItemExternalDeployments,
  replaceItem,
  getItemAuditLog,
  getItemLocationHistory,
} from "./inventory.service.js";
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

function send(reply: FastifyReply, fn: () => Promise<unknown>) {
  return fn()
    .then((data) => reply.send(data))
    .catch((err: any) => reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" }));
}

export async function listInventoryHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => listInventoryItems());
}

export async function createInventoryItemHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, async () => {
    const item = await createInventoryItem(req.body as CreateInventoryItemBody, req.user.id);
    reply.code(201);
    return item;
  });
}

export async function updateInventoryItemHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return updateInventoryItem(id, req.body as UpdateInventoryItemBody, req.user.id);
  });
}

export async function addStockHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return addStock(id, req.body as AddStockBody, req.user.id);
  });
}

export async function useItemHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return useItem(id, req.body as UseItemBody, req.user.id);
  });
}

export async function listTicketItemsHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return listTicketItems(id);
  });
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export async function createMaintenanceHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, async () => {
    const { id } = req.params as { id: string };
    const record = await createMaintenance(id, req.body as CreateMaintenanceBody, req.user.id);
    reply.code(201);
    return record;
  });
}

export async function completeMaintenanceHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { maintenanceId } = req.params as { maintenanceId: string };
    return completeMaintenance(maintenanceId, req.body as CompleteMaintenanceBody, req.user.id);
  });
}

export async function listItemMaintenanceHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return listItemMaintenance(id);
  });
}

// ── External Deployment ───────────────────────────────────────────────────────

export async function createExternalDeploymentHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, async () => {
    const deployment = await createExternalDeployment(
      req.body as CreateExternalDeploymentBody,
      req.user.id,
    );
    reply.code(201);
    return deployment;
  });
}

export async function returnExternalDeploymentHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { deploymentId } = req.params as { deploymentId: string };
    return returnExternalDeployment(deploymentId, req.body as ReturnExternalDeploymentBody, req.user.id);
  });
}

export async function listItemExternalDeploymentsHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return listItemExternalDeployments(id);
  });
}

// ── Replacement ───────────────────────────────────────────────────────────────

export async function replaceItemHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return replaceItem(id, req.body as ReplaceItemBody, req.user.id);
  });
}

// ── History ───────────────────────────────────────────────────────────────────

export async function getItemAuditLogHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return getItemAuditLog(id);
  });
}

export async function getItemLocationHistoryHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { id } = req.params as { id: string };
    return getItemLocationHistory(id);
  });
}

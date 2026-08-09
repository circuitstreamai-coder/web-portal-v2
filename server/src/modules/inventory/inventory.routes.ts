import type { FastifyInstance } from "fastify";
import { authenticate, authorize, onlyAssetManager } from "../../plugins/authMiddleware.js";
import {
  listInventoryHandler,
  createInventoryItemHandler,
  updateInventoryItemHandler,
  addStockHandler,
  useItemHandler,
  listTicketItemsHandler,
  createMaintenanceHandler,
  completeMaintenanceHandler,
  listItemMaintenanceHandler,
  createExternalDeploymentHandler,
  returnExternalDeploymentHandler,
  listItemExternalDeploymentsHandler,
  replaceItemHandler,
  getItemAuditLogHandler,
  getItemLocationHistoryHandler,
} from "./inventory.controller.js";

export async function inventoryRoutes(app: FastifyInstance) {
  // ── Core CRUD ─────────────────────────────────────────────────────────────

  app.get(
    "/api/inventory",
    { preHandler: [authenticate] },
    listInventoryHandler,
  );

  // Only Lead Asset Manager (asset_manager) or super_admin may create/update assets
  app.post(
    "/api/inventory",
    { preHandler: [authenticate, onlyAssetManager] },
    createInventoryItemHandler,
  );

  app.patch(
    "/api/inventory/:id",
    { preHandler: [authenticate, onlyAssetManager] },
    updateInventoryItemHandler,
  );

  app.post(
    "/api/inventory/:id/add",
    { preHandler: [authenticate, onlyAssetManager] },
    addStockHandler,
  );

  // ── Ticket Usage ──────────────────────────────────────────────────────────

  app.post(
    "/api/tickets/:id/use-item",
    { preHandler: [authenticate, authorize(["engineer", "l2_engineer", "l3_engineer"])] },
    useItemHandler,
  );

  app.get(
    "/api/tickets/:id/items",
    { preHandler: [authenticate] },
    listTicketItemsHandler,
  );

  // ── Maintenance ───────────────────────────────────────────────────────────

  app.post(
    "/api/inventory/:id/maintenance",
    { preHandler: [authenticate, onlyAssetManager] },
    createMaintenanceHandler,
  );

  app.patch(
    "/api/inventory/maintenance/:maintenanceId/complete",
    { preHandler: [authenticate, onlyAssetManager] },
    completeMaintenanceHandler,
  );

  app.get(
    "/api/inventory/:id/maintenance",
    { preHandler: [authenticate] },
    listItemMaintenanceHandler,
  );

  // ── External Deployment ───────────────────────────────────────────────────

  app.post(
    "/api/inventory/external-deployments",
    { preHandler: [authenticate, onlyAssetManager] },
    createExternalDeploymentHandler,
  );

  app.patch(
    "/api/inventory/external-deployments/:deploymentId/return",
    { preHandler: [authenticate, onlyAssetManager] },
    returnExternalDeploymentHandler,
  );

  app.get(
    "/api/inventory/:id/external-deployments",
    { preHandler: [authenticate] },
    listItemExternalDeploymentsHandler,
  );

  // ── Replacement ───────────────────────────────────────────────────────────

  app.post(
    "/api/inventory/:id/replace",
    { preHandler: [authenticate, onlyAssetManager] },
    replaceItemHandler,
  );

  // ── History & Audit ───────────────────────────────────────────────────────

  app.get(
    "/api/inventory/:id/audit",
    { preHandler: [authenticate] },
    getItemAuditLogHandler,
  );

  app.get(
    "/api/inventory/:id/location-history",
    { preHandler: [authenticate] },
    getItemLocationHistoryHandler,
  );
}

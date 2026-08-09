import type { FastifyInstance } from "fastify";
import {
  authenticate,
  onlySuperAdmin,
} from "../../plugins/authMiddleware.js";
import { getAdminDashboardHandler } from "./admin.controller.js";

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/dashboard",
    { preHandler: [authenticate, onlySuperAdmin] },
    getAdminDashboardHandler,
  );
}

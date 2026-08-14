import type { FastifyInstance } from "fastify";
import {
  authenticate,
  authorize,
  onlySuperAdmin,
} from "../../plugins/authMiddleware.js";
import {
  createCustomerHandler,
  approveCustomerHandler,
  rejectCustomerHandler,
  deleteCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
  updateCustomerStatusHandler,
} from "./customer.controller.js";

export async function customerRoutes(app: FastifyInstance) {
  // Public / optionally-authenticated: admin → active, unauthenticated → pending
  app.post("/api/customers", createCustomerHandler);

  // super_admin and national_head
  app.patch(
    "/api/customers/:id/approve",
    { preHandler: [authenticate, authorize(["super_admin", "national_head"])] },
    approveCustomerHandler,
  );

  app.patch(
    "/api/customers/:id/reject",
    { preHandler: [authenticate, authorize(["super_admin", "national_head"])] },
    rejectCustomerHandler,
  );

  app.patch(
    "/api/customers/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    updateCustomerHandler,
  );

  app.delete(
    "/api/customers/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    deleteCustomerHandler,
  );

  app.patch(
    "/api/customers/:id/status",
    { preHandler: [authenticate, onlySuperAdmin] },
    updateCustomerStatusHandler,
  );

  // Authenticated, role-filtered
  app.get(
    "/api/customers",
    { preHandler: [authenticate] },
    listCustomersHandler,
  );
}

//src/modules/ticket/ticket.routes.ts
import type { FastifyInstance } from "fastify";
import {
  authenticate,
  authorize,
  onlyEngineer,
  onlySuperAdmin,
} from "../../plugins/authMiddleware.js";
import {
  createTicketHandler,
  listTicketsHandler,
  listPayoutsHandler,
  listReplacementsHandler,
  assignTicketHandler,
  updateTicketStatusHandler,
  escalateTicketHandler,
  declineTicketHandler,
  validateTicketHandler,
  getTicketClosureEligibilityHandler,
  createTicketAttachmentHandler,
  createTicketHistoryHandler,
  getTicketHistoryHandler,
  requestTicketReplacementHandler,
  approveTicketReplacementHandler,
  rejectTicketReplacementHandler,
  dispatchTicketReplacementHandler,
  getRcaHandler,
  createRcaHandler,
  updateRcaHandler,
  createTicketCategoryHandler,
  updatePayoutRateHandler,
  exportPayoutsHandler,
  emailInboundHandler,
  deleteTicketHandler,
  updateTicketCategoryHandler,
  deleteTicketCategoryHandler,
  getTicketReplacementHandler,
  listPayoutRatesHandler,
} from "./ticket.controller.js";

export async function ticketRoutes(app: FastifyInstance) {
  // No auth — CloudMailin webhook
  app.post("/api/email/inbound", emailInboundHandler);

  app.post(
    "/api/ticket-categories",
    { preHandler: [authenticate, onlySuperAdmin] },
    createTicketCategoryHandler,
  );

  app.patch(
    "/api/ticket-categories/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    updateTicketCategoryHandler,
  );

  app.delete(
    "/api/ticket-categories/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    deleteTicketCategoryHandler,
  );

  app.put(
    "/api/payout-rates/:categoryId",
    { preHandler: [authenticate, onlySuperAdmin] },
    updatePayoutRateHandler,
  );

  app.get(
    "/api/payout-rates",
    { preHandler: [authenticate] },
    listPayoutRatesHandler,
  );

  // Any authenticated user can create a ticket
  app.post("/api/tickets", { preHandler: [authenticate] }, createTicketHandler);

  // Authenticated, results filtered by role
  app.get("/api/tickets", { preHandler: [authenticate] }, listTicketsHandler);

  app.delete(
    "/api/tickets/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    deleteTicketHandler,
  );

  app.get("/api/payouts", { preHandler: [authenticate] }, listPayoutsHandler);

  app.get("/api/payouts/export", { preHandler: [authenticate] }, exportPayoutsHandler);

  app.get("/api/replacements", { preHandler: [authenticate] }, listReplacementsHandler);

  app.get("/api/replacements/my", { preHandler: [authenticate] }, listReplacementsHandler);

  app.get(
    "/api/tickets/:id/replacement",
    { preHandler: [authenticate] },
    getTicketReplacementHandler,
  );

  // Assign: super_admin, noc, state_planner only
  app.patch(
    "/api/tickets/:id/assign",
    { preHandler: [authenticate, authorize(["super_admin", "national_head", "noc", "state_planner"])] },
    assignTicketHandler,
  );

  // Authenticated — role + transition guards enforced in service
  app.patch(
    "/api/tickets/:id/status",
    { preHandler: [authenticate] },
    updateTicketStatusHandler,
  );

  // Engineer or staff — escalation level update
  app.patch(
    "/api/tickets/:id/escalate",
    { preHandler: [authenticate, authorize(["super_admin", "national_head", "noc", "state_planner", "project_head", "engineer", "l2_engineer", "l3_engineer"])] },
    escalateTicketHandler,
  );

  // Engineer only — decline an assigned/accepted ticket, returns it to the open pool
  app.post(
    "/api/tickets/:id/decline",
    { preHandler: [authenticate, onlyEngineer] },
    declineTicketHandler,
  );

  app.post(
    "/api/tickets/:id/validate",
    {
      preHandler: [authenticate, authorize(["noc", "project_head"])],
    },
    validateTicketHandler,
  );
  app.get(
    "/api/tickets/:id/closure-eligibility",
    { preHandler: [authenticate] },
    getTicketClosureEligibilityHandler,
  );
  app.post(
    "/api/tickets/:id/attachments",
    { preHandler: [authenticate] },
    createTicketAttachmentHandler,
  );
  app.get(
    "/api/tickets/:id/history",
    { preHandler: [authenticate] },
    getTicketHistoryHandler,
  );
  app.post(
    "/api/tickets/:id/history",
    { preHandler: [authenticate] },
    createTicketHistoryHandler,
  );
  app.post(
    "/api/tickets/:id/replacement-request",
    { preHandler: [authenticate, onlyEngineer] },
    requestTicketReplacementHandler,
  );
  app.post(
    "/api/replacements/:id/approve",
    { preHandler: [authenticate, authorize(["noc"])] },
    approveTicketReplacementHandler,
  );
  app.post(
    "/api/replacements/:id/reject",
    { preHandler: [authenticate, authorize(["noc"])] },
    rejectTicketReplacementHandler,
  );

  app.patch(
    "/api/replacements/:id/dispatch",
    { preHandler: [authenticate, authorize(["noc", "super_admin"])] },
    dispatchTicketReplacementHandler,
  );

  app.get(
    "/api/tickets/:id/rca",
    { preHandler: [authenticate] },
    getRcaHandler,
  );

  app.post(
    "/api/tickets/:id/rca",
    { preHandler: [authenticate] },
    createRcaHandler,
  );

  app.patch(
    "/api/tickets/:id/rca",
    { preHandler: [authenticate] },
    updateRcaHandler,
  );
}

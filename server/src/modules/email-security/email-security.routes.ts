import type { FastifyInstance } from "fastify";
import { authenticate, onlySuperAdmin } from "../../plugins/authMiddleware.js";
import {
  listAllowlistHandler,
  addAllowlistEntryHandler,
  removeAllowlistEntryHandler,
  getQuotaConfigHandler,
  updateQuotaConfigHandler,
  resumeEmailProcessingHandler,
} from "./email-security.controller.js";

export async function emailSecurityRoutes(app: FastifyInstance) {
  // ── Allowlist management (super_admin only) ───────────────────────────────

  app.get(
    "/api/customers/:customerId/email-allowlist",
    { preHandler: [authenticate, onlySuperAdmin] },
    listAllowlistHandler,
  );

  app.post(
    "/api/customers/:customerId/email-allowlist",
    { preHandler: [authenticate, onlySuperAdmin] },
    addAllowlistEntryHandler,
  );

  app.delete(
    "/api/customers/:customerId/email-allowlist/:entryId",
    { preHandler: [authenticate, onlySuperAdmin] },
    removeAllowlistEntryHandler,
  );

  // ── Quota config management (super_admin only) ────────────────────────────

  app.get(
    "/api/customers/:customerId/email-quota",
    { preHandler: [authenticate, onlySuperAdmin] },
    getQuotaConfigHandler,
  );

  app.patch(
    "/api/customers/:customerId/email-quota",
    { preHandler: [authenticate, onlySuperAdmin] },
    updateQuotaConfigHandler,
  );

  // Only platform support staff (super_admin) may resume a suspended customer
  app.post(
    "/api/customers/:customerId/email-quota/resume",
    { preHandler: [authenticate, onlySuperAdmin] },
    resumeEmailProcessingHandler,
  );
}

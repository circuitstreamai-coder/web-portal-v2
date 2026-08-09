import type { FastifyInstance } from "fastify";
import {
  authenticate,
  authorize,
  onlyStaff,
} from "../../plugins/authMiddleware.js";
import {
  listEngineerProfilesHandler,
  getEngineerProfileHandler,
  updateEngineerProfileHandler,
  updateDocumentsStatusHandler,
  updateAccountStatusHandler,
  deleteEngineerProfileHandler,
} from "./engineer-profile.controller.js";

const onlyApprovers = authorize(["super_admin", "national_head"]);

export async function engineerProfileRoutes(app: FastifyInstance) {
  // Authenticated — role-filtered (engineer sees own, staff sees all)
  app.get(
    "/api/engineer-profiles",
    { preHandler: [authenticate] },
    listEngineerProfilesHandler,
  );

  // Authenticated — get single profile
  app.get(
    "/api/engineer-profiles/:id",
    { preHandler: [authenticate] },
    getEngineerProfileHandler,
  );

  // Authenticated — update profile fields (own profile for engineers, any for staff)
  app.patch(
    "/api/engineer-profiles/:id",
    { preHandler: [authenticate] },
    updateEngineerProfileHandler,
  );

  // Staff only — review engineer KYC documents
  app.patch(
    "/api/engineer-profiles/:id/documents-status",
    { preHandler: [authenticate, onlyStaff] },
    updateDocumentsStatusHandler,
  );

  // super_admin / national_head — suspend or reactivate an engineer's portal access
  app.patch(
    "/api/engineer-profiles/:id/account-status",
    { preHandler: [authenticate, onlyApprovers] },
    updateAccountStatusHandler,
  );

  // super_admin / national_head — soft-delete an engineer profile
  app.delete(
    "/api/engineer-profiles/:id",
    { preHandler: [authenticate, onlyApprovers] },
    deleteEngineerProfileHandler,
  );
}

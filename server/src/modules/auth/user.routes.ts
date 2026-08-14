import type { FastifyInstance } from "fastify";
import { authenticate, onlySuperAdmin } from "../../plugins/authMiddleware.js";
import { createStaffUserHandler, listUsersHandler, updateMeHandler } from "./user.controller.js";

export async function userRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { role?: string } }>(
    "/api/users",
    { preHandler: [authenticate] },
    listUsersHandler,
  );

  app.patch(
    "/api/users/me",
    { preHandler: [authenticate] },
    updateMeHandler,
  );

  app.post(
    "/api/users/staff",
    { preHandler: [authenticate, onlySuperAdmin] },
    createStaffUserHandler,
  );
}

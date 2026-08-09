import type { FastifyInstance } from "fastify";
import { authenticate } from "../../plugins/authMiddleware.js";
import { listUsersHandler, updateMeHandler } from "./user.controller.js";

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
}

import type { FastifyInstance } from "fastify";
import {
  authenticate,
  onlySuperAdmin,
} from "../../plugins/authMiddleware.js";
import {
  createProjectHandler,
  listProjectsHandler,
  assignHeadHandler,
  updateProjectHandler,
} from "./project.controller.js";

export async function projectRoutes(app: FastifyInstance) {
  // super_admin only
  app.post(
    "/api/projects",
    { preHandler: [authenticate, onlySuperAdmin] },
    createProjectHandler,
  );

  // Authenticated, role-filtered (super_admin | customer | project_head)
  app.get(
    "/api/projects",
    { preHandler: [authenticate] },
    listProjectsHandler,
  );

  // super_admin only
  app.patch(
    "/api/projects/:id",
    { preHandler: [authenticate, onlySuperAdmin] },
    updateProjectHandler,
  );

  // super_admin only
  app.patch(
    "/api/projects/:id/assign-head",
    { preHandler: [authenticate, onlySuperAdmin] },
    assignHeadHandler,
  );
}

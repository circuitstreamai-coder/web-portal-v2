import type { FastifyInstance } from "fastify";
import { authenticate, onlyEngineer } from "../../plugins/authMiddleware.js";
import {
  listAvailabilityHandler,
  createAvailabilityHandler,
  deleteAvailabilityHandler,
} from "./engineer-availability.controller.js";

export async function engineerAvailabilityRoutes(app: FastifyInstance) {
  // Authenticated — engineer sees own upcoming slots, staff can pass ?engineerId= to view any
  app.get(
    "/api/availability",
    { preHandler: [authenticate] },
    listAvailabilityHandler,
  );

  // Engineer only — mark a new availability slot for themselves
  app.post(
    "/api/availability",
    { preHandler: [authenticate, onlyEngineer] },
    createAvailabilityHandler,
  );

  // Authenticated — engineer deletes own slot, staff can delete any
  app.delete(
    "/api/availability/:id",
    { preHandler: [authenticate] },
    deleteAvailabilityHandler,
  );
}

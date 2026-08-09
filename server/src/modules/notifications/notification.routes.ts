import type { FastifyInstance } from "fastify";
import { authenticate } from "../../plugins/authMiddleware.js";
import type { JwtPayload } from "../auth/auth.schema.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notification.service.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as JwtPayload;
    const items = await listNotifications(user.id);
    return reply.send(items);
  });

  app.patch(
    "/api/notifications/:id/read",
    { preHandler: [authenticate] },
    async (req, reply) => {
      const user = req.user as JwtPayload;
      const { id } = req.params as { id: string };
      try {
        await markNotificationRead(id, user.id);
        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message });
      }
    },
  );

  app.patch(
    "/api/notifications/read-all",
    { preHandler: [authenticate] },
    async (req, reply) => {
      const user = req.user as JwtPayload;
      await markAllNotificationsRead(user.id);
      return reply.send({ ok: true });
    },
  );
}

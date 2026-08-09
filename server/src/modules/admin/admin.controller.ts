import type { FastifyReply, FastifyRequest } from "fastify";
import { getAdminDashboardData } from "./admin.service.js";

export async function getAdminDashboardHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await getAdminDashboardData();
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

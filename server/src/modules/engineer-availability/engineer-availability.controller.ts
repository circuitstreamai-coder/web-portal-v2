import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listAvailability,
  createAvailability,
  deleteAvailability,
} from "./engineer-availability.service.js";
import type { CreateAvailabilityBody } from "./engineer-availability.schema.js";

export async function listAvailabilityHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { engineerId } = req.query as { engineerId?: string };
    const result = await listAvailability(req.user.role, req.user.id, engineerId);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function createAvailabilityHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const body = req.body as CreateAvailabilityBody;
    const slot = await createAvailability(req.user.id, body);
    return reply.code(201).send(slot);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function deleteAvailabilityHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    await deleteAvailability(id, req.user.role, req.user.id);
    return reply.code(204).send();
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

import type { FastifyRequest, FastifyReply } from "fastify";
import {
  listAllowlist,
  addAllowlistEntry,
  removeAllowlistEntry,
  getQuotaConfig,
  updateQuotaConfig,
  resumeEmailProcessing,
} from "./email-security.service.js";

function send(reply: FastifyReply, fn: () => Promise<unknown>) {
  return fn()
    .then((data) => reply.send(data))
    .catch((err: any) =>
      reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" }),
    );
}

export async function listAllowlistHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { customerId } = req.params as { customerId: string };
    return listAllowlist(customerId);
  });
}

export async function addAllowlistEntryHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, async () => {
    const { customerId } = req.params as { customerId: string };
    const body = req.body as { domain?: string; email?: string };
    const entry = await addAllowlistEntry(customerId, body, req.user.id);
    reply.code(201);
    return entry;
  });
}

export async function removeAllowlistEntryHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { customerId, entryId } = req.params as { customerId: string; entryId: string };
    return removeAllowlistEntry(customerId, entryId);
  });
}

export async function getQuotaConfigHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { customerId } = req.params as { customerId: string };
    return getQuotaConfig(customerId);
  });
}

export async function updateQuotaConfigHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { customerId } = req.params as { customerId: string };
    const body = req.body as { monthlyCap?: number; dailyRateLimitPerSender?: number };
    return updateQuotaConfig(customerId, body);
  });
}

export async function resumeEmailProcessingHandler(req: FastifyRequest, reply: FastifyReply) {
  return send(reply, () => {
    const { customerId } = req.params as { customerId: string };
    return resumeEmailProcessing(customerId);
  });
}

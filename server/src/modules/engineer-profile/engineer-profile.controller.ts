import type { FastifyRequest, FastifyReply } from "fastify";
import {
  getEngineerProfile,
  listEngineerProfiles,
  updateDocumentsStatus,
  updateEngineerProfile,
  updateAccountStatus,
  deleteEngineerProfile,
} from "./engineer-profile.service.js";
import type {
  UpdateDocumentsStatusBody,
  UpdateEngineerProfileBody,
  UpdateAccountStatusBody,
} from "./engineer-profile.schema.js";

export async function listEngineerProfilesHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await listEngineerProfiles(req.user.role, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getEngineerProfileHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const profile = await getEngineerProfile(id);
    return reply.send(profile);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateEngineerProfileHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as UpdateEngineerProfileBody;
    const profile = await updateEngineerProfile(id, body);
    return reply.send(profile);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateAccountStatusHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { accountStatus } = req.body as UpdateAccountStatusBody;

    const VALID_STATUSES = ["active", "suspended"];
    if (!accountStatus || !VALID_STATUSES.includes(accountStatus)) {
      return reply
        .code(400)
        .send({ error: `accountStatus must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const profile = await updateAccountStatus(id, accountStatus);
    return reply.send(profile);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function deleteEngineerProfileHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    await deleteEngineerProfile(id);
    return reply.code(204).send();
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateDocumentsStatusHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { documentsStatus } = req.body as UpdateDocumentsStatusBody;

    if (!documentsStatus) {
      return reply.code(400).send({ error: "documentsStatus is required" });
    }

    const VALID_STATUSES = ["pending", "approved", "rejected", "reupload"];
    if (!VALID_STATUSES.includes(documentsStatus)) {
      return reply
        .code(400)
        .send({ error: `documentsStatus must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const profile = await updateDocumentsStatus(id, documentsStatus);
    return reply.send(profile);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

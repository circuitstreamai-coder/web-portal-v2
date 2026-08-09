import type { FastifyRequest, FastifyReply } from "fastify";
import { listUsers, updateUserProfile } from "./user.service.js";
import { uploadFile } from "../files/file.service.js";

export async function updateMeHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const contentType = req.headers["content-type"] ?? "";
    const fields: { name?: string; email?: string } = {};
    let avatarFileId: number | undefined;

    if (contentType.includes("multipart/form-data")) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "avatar") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const data = Buffer.concat(chunks);
          const { fileId } = await uploadFile({
            filename: part.filename,
            mimetype: part.mimetype,
            data,
          });
          avatarFileId = fileId;
        } else if (part.type === "field") {
          if (part.fieldname === "name") fields.name = part.value as string;
          if (part.fieldname === "email") fields.email = part.value as string;
        }
      }
    } else {
      const body = req.body as { name?: string; email?: string };
      if (body.name !== undefined) fields.name = body.name;
      if (body.email !== undefined) fields.email = body.email;
    }

    const user = await updateUserProfile(req.user.id, { ...fields, avatarFileId });
    return reply.send({ user });
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function listUsersHandler(
  req: FastifyRequest<{ Querystring: { role?: string } }>,
  reply: FastifyReply,
) {
  try {
    const users = await listUsers(req.query.role);
    return reply.send(users);
  } catch (err: any) {
    return reply.status(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

import type { FastifyRequest, FastifyReply } from "fastify";
import {
  createProject,
  listProjects,
  assignProjectHead,
  updateProject,
} from "./project.service.js";
import type { CreateProjectBody, AssignHeadBody, UpdateProjectBody } from "./project.schema.js";

export async function createProjectHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const project = await createProject(req.body as CreateProjectBody);
    return reply.code(201).send(project);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function listProjectsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await listProjects(req.user.role, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateProjectHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const project = await updateProject(id, req.body as UpdateProjectBody);
    return reply.send(project);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function assignHeadHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { projectHeadId } = req.body as AssignHeadBody;
    const project = await assignProjectHead(id, projectHeadId);
    return reply.send(project);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

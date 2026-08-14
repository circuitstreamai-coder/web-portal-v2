import type { FastifyRequest, FastifyReply } from "fastify";
import {
  createCustomer,
  approveCustomer,
  rejectCustomer,
  deleteCustomer,
  listCustomers,
  setCustomerStatus,
  updateCustomer,
  provisionCustomerAccess,
} from "./customer.service.js";
import type {
  CreateCustomerBody,
  UpdateCustomerBody,
  UpdateCustomerStatusBody,
} from "./customer.schema.js";
import { roleCookieName, type JwtPayload } from "../auth/auth.schema.js";

export async function createCustomerHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  // Optionally authenticated: admin-created → active, self-registration → pending
  let isAdmin = false;
  try {
    const requestedRole = typeof req.headers["x-portal-role"] === "string" ? req.headers["x-portal-role"] : undefined;
    if (requestedRole) {
      const token = req.cookies[roleCookieName(requestedRole)];
      if (!token) throw new Error("Role session not found");
      req.user = req.server.jwt.verify<JwtPayload>(token);
    } else {
      await req.jwtVerify({ onlyCookie: true });
    }
    isAdmin = req.user.role === "super_admin";
  } catch {
    // unauthenticated self-registration — status will be pending
  }

  try {
    const body = req.body as CreateCustomerBody;
    const customer = await createCustomer(body, isAdmin, isAdmin ? req.user.id : undefined);
    return reply.code(201).send(customer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function approveCustomerHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const customer = await approveCustomer(id, req.user.id);
    return reply.send(customer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function provisionCustomerAccessHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    return reply.send(await provisionCustomerAccess(id, req.user.id));
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function rejectCustomerHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const customer = await rejectCustomer(id, req.user.id);
    return reply.send(customer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function deleteCustomerHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    await deleteCustomer(id);
    return reply.code(204).send();
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateCustomerHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const customer = await updateCustomer(id, req.body as UpdateCustomerBody);
    return reply.send(customer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function listCustomersHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await listCustomers(req.user.role, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateCustomerStatusHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as UpdateCustomerStatusBody;

    if (!status) {
      return reply.code(400).send({ error: "status is required" });
    }

    const validStatuses = ["pending", "pending_approval", "active", "inactive", "rejected"];
    if (!validStatuses.includes(status)) {
      return reply
        .code(400)
        .send({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    const customer = await setCustomerStatus(id, status, req.user.id);
    return reply.send(customer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

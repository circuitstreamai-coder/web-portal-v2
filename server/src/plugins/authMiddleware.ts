import type { FastifyRequest, FastifyReply } from "fastify";
import type { UserRole } from "../modules/auth/auth.schema.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { users } from "../db/schema/index.js";
import { roleCookieName, type JwtPayload } from "../modules/auth/auth.schema.js";

/**
 * Verifies JWT from cookie and attaches decoded payload to request.user.
 * Use as a preHandler on any route that requires authentication.
 */
export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const headerRole = typeof req.headers["x-portal-role"] === "string"
      ? req.headers["x-portal-role"]
      : undefined;
    const queryRole = typeof (req.query as Record<string, unknown> | undefined)?.portalRole === "string"
      ? String((req.query as Record<string, unknown>).portalRole)
      : undefined;
    const requestedRole = headerRole ?? queryRole;
    if (requestedRole) {
      const token = req.cookies[roleCookieName(requestedRole)];
      if (!token) throw new Error("Role session not found");
      const payload = req.server.jwt.verify<JwtPayload>(token);
      const engineerRoleMatch = requestedRole === "engineer" && ["engineer", "l2_engineer", "l3_engineer"].includes(payload.role);
      if (payload.role !== requestedRole && !engineerRoleMatch) throw new Error("Role session mismatch");
      req.user = payload;
    } else {
      await req.jwtVerify({ onlyCookie: true });
    }
    const [account] = await db
      .select({ status: users.status })
      .from(users)
      .where(and(eq(users.id, req.user.id), eq(users.deleted, false)))
      .limit(1);

    if (!account || account.status !== "active") {
      reply.code(401).send({ error: "Account is not active" });
    }
  } catch {
    if (!reply.sent) reply.code(401).send({ error: "Unauthorized" });
  }
}

/**
 * Returns a preHandler that checks the authenticated user's role.
 * Must be used AFTER `authenticate` in the preHandler array.
 *
 * @example
 * { preHandler: [authenticate, authorize(["super_admin"])] }
 */
export function authorize(allowed: UserRole[]) {
  return async function (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!allowed.includes(req.user.role as UserRole)) {
      reply.code(403).send({ error: "Forbidden" });
    }
  };
}

// ── Convenience guards ────────────────────────────────────────────────────────

export const onlySuperAdmin = authorize(["super_admin"]);
export const onlyEngineer = authorize(["engineer", "l2_engineer", "l3_engineer"]);
export const onlyCustomer = authorize(["customer"]);
export const onlyNoc = authorize(["noc"]);
export const onlyStatePlanner = authorize(["state_planner"]);
export const onlyProjectHead = authorize(["project_head"]);
export const onlyNationalHead = authorize(["national_head"]);

/** Allows multiple roles — e.g. admin + noc can both manage tickets */
export const onlyStaff = authorize([
  "super_admin",
  "noc",
  "state_planner",
  "project_head",
  "national_head",
]);

export const onlyAssetManager = authorize(["super_admin", "asset_manager"]);

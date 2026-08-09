import type { FastifyInstance } from "fastify";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../db/db.js";
import { customers, engineerProfiles, users } from "../../db/schema/index.js";

type Flow = "customer" | "engineer";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function emailExistsForCustomer(email: string, excludeEmail?: string): Promise<boolean> {
  const normalized = normalize(email);
  const rows = await db
    .select({ email: customers.email, secondaryContactEmail: customers.secondaryContactEmail })
    .from(customers);

  return rows.some((c) => {
    const primary = normalize(c.email ?? "");
    const secondary = normalize(c.secondaryContactEmail ?? "");
    if (excludeEmail && primary === normalize(excludeEmail)) return false;
    return primary === normalized || secondary === normalized;
  });
}

async function emailExistsForEngineer(email: string): Promise<boolean> {
  const normalized = normalize(email);
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(engineerProfiles, eq(engineerProfiles.userId, users.id))
    .where(and(eq(users.deleted, false)));

  return rows.some((r) => normalize(r.email ?? "") === normalized);
}

export async function checkEmailRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; flow?: Flow; excludeEmail?: string } }>(
    "/api/check-email",
    async (req, reply) => {
      const { email, flow, excludeEmail } = req.body ?? {};

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.send({ exists: false });
      }

      if (flow !== "customer" && flow !== "engineer") {
        return reply.code(400).send({ error: "Invalid flow" });
      }

      try {
        const exists =
          flow === "customer"
            ? await emailExistsForCustomer(email, excludeEmail)
            : await emailExistsForEngineer(email);
        return reply.send({ exists });
      } catch {
        return reply.code(500).send({ error: "Check failed" });
      }
    },
  );
}

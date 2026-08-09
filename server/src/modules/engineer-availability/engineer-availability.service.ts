import { eq, and, gte } from "drizzle-orm";
import { db } from "../../db/db.js";
import { engineerAvailability } from "../../db/schema/index.js";
import type { CreateAvailabilityBody } from "./engineer-availability.schema.js";

const ENGINEER_ROLES = ["engineer", "l2_engineer", "l3_engineer"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listAvailability(
  role: string,
  userId: string,
  engineerId?: string,
) {
  const targetEngineerId = ENGINEER_ROLES.includes(role) ? userId : engineerId;

  const conditions = [
    eq(engineerAvailability.deleted, false),
    gte(engineerAvailability.date, todayIso()),
  ];
  if (targetEngineerId) {
    conditions.push(eq(engineerAvailability.engineerId, targetEngineerId));
  }

  return db
    .select()
    .from(engineerAvailability)
    .where(and(...conditions))
    .orderBy(engineerAvailability.date, engineerAvailability.startTime);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createAvailability(
  engineerId: string,
  body: CreateAvailabilityBody,
) {
  if (!body.date || !body.startTime || !body.endTime) {
    throw { statusCode: 400, message: "date, startTime and endTime are required" };
  }
  if (body.startTime >= body.endTime) {
    throw { statusCode: 400, message: "startTime must be before endTime" };
  }
  if (body.date < todayIso()) {
    throw { statusCode: 400, message: "date cannot be in the past" };
  }

  const [slot] = await db
    .insert(engineerAvailability)
    .values({
      engineerId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      notes: body.notes ?? null,
    })
    .returning();

  return slot;
}

export async function deleteAvailability(
  id: string,
  role: string,
  userId: string,
) {
  const [existing] = await db
    .select()
    .from(engineerAvailability)
    .where(
      and(eq(engineerAvailability.id, id), eq(engineerAvailability.deleted, false)),
    );

  if (!existing) {
    throw { statusCode: 404, message: "Availability slot not found" };
  }

  if (ENGINEER_ROLES.includes(role) && existing.engineerId !== userId) {
    throw { statusCode: 403, message: "Cannot delete another engineer's availability" };
  }

  const [slot] = await db
    .update(engineerAvailability)
    .set({ deleted: true })
    .where(eq(engineerAvailability.id, id))
    .returning();

  return slot;
}

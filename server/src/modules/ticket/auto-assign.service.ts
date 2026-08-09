// src/modules/ticket/auto-assign.service.ts
import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  tickets,
  ticketHistory,
  users,
  userRoles,
  roles,
  engineerProfiles,
  routingState,
} from "../../db/schema/index.js";
import {
  sendEmail,
  engineerTicketAssignedEmail,
} from "../../services/email.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ROUTING_KEY = "engineer_round_robin";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Engineer = {
  id: string;
  email: string | null;
  name: string | null;
  assignedState: string | null;
  addressCity: string | null;
};

async function fetchActiveEngineers(): Promise<Engineer[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      assignedState: engineerProfiles.assignedState,
      addressCity: engineerProfiles.addressCity,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(engineerProfiles, eq(engineerProfiles.userId, users.id))
    .where(
      and(
        eq(roles.name, "engineer"),
        eq(roles.deleted, false),
        eq(userRoles.deleted, false),
        eq(users.deleted, false),
        eq(users.status, "active"),
      ),
    );
}

function filterByLocation(
  engineers: Engineer[],
  state: string | null | undefined,
  city: string | null | undefined,
): Engineer[] {
  if (!state && !city) return engineers;

  const filtered = engineers.filter((eng) => {
    const stateMatch = state ? eng.assignedState === state : true;
    const cityMatch = city ? eng.addressCity === city : true;
    return stateMatch && cityMatch;
  });

  // Fallback to all engineers if no location match found
  return filtered.length > 0 ? filtered : engineers;
}

async function getLastAssignedEngineerId(): Promise<string | null> {
  const [row] = await db
    .select({ value: routingState.value })
    .from(routingState)
    .where(eq(routingState.key, ROUTING_KEY))
    .limit(1);
  return row?.value ?? null;
}

async function setLastAssignedEngineerId(engineerId: string): Promise<void> {
  await db
    .insert(routingState)
    .values({ key: ROUTING_KEY, value: engineerId })
    .onConflictDoUpdate({
      target: routingState.key,
      set: { value: engineerId, updatedAt: new Date() },
    });
}

function pickNext(engineers: Engineer[], lastId: string | null): Engineer | null {
  if (engineers.length === 0) return null;

  if (!lastId) return engineers[0];

  const lastIdx = engineers.findIndex((e) => e.id === lastId);
  const nextIdx = (lastIdx + 1) % engineers.length;
  return engineers[nextIdx];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Attempt to auto-assign a newly created ticket to an active engineer via
 * round-robin. Safe to call fire-and-forget — all errors are caught internally.
 *
 * Rules:
 * - Only runs when ticket.status === "open"
 * - Skips if ticket already has an assignedEngineerId (manual assignment)
 */
export async function autoAssignTicket(ticketId: string): Promise<void> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.deleted, false)))
    .limit(1);

  if (!ticket) return;
  if (ticket.status !== "open") return;
  if (ticket.assignedEngineerId) return; // manual assignment already set

  const allEngineers = await fetchActiveEngineers();
  const pool = filterByLocation(allEngineers, ticket.state, ticket.city);

  const lastId = await getLastAssignedEngineerId();
  const selected = pickNext(pool, lastId);

  if (!selected) {
    console.warn("[auto-assign] No active engineers available", { ticketId });
    return;
  }

  await setLastAssignedEngineerId(selected.id);

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({ assignedEngineerId: selected.id, status: "assigned" })
      .where(and(eq(tickets.id, ticketId), eq(tickets.deleted, false)));

    await tx.insert(ticketHistory).values({
      ticketId,
      action: "auto_assigned",
      status: "assigned",
      author: selected.id,
      remarks: "Assigned via auto routing",
    });
  });

  if (selected.email) {
    sendEmail({
      to: selected.email,
      ...engineerTicketAssignedEmail({
        engineerName: selected.name ?? selected.email,
        ticketNumber: ticket.ticketNumber ?? ticket.id,
        ticketTitle: ticket.title ?? "Untitled ticket",
        priority: ticket.priority,
        state: ticket.state,
        city: ticket.city,
        address: ticket.address,
      }),
    }).catch((err) =>
      console.error("[auto-assign] engineer email failed", {
        ticketId,
        engineerId: selected.id,
        error: err,
      }),
    );
  }
}

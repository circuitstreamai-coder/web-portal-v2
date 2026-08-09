import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { tickets, projects, customers, users, userRoles, roles } from "../../db/schema/index.js";
import { createNotification } from "../notifications/notification.service.js";

export type EventType =
  | "ticket_created"
  | "ticket_assigned"
  | "status_updated";

export interface EventPayload {
  ticketId?: string;
  authorId?: string;
  engineerId?: string;
  statePlannerId?: string;
  projectId?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Emit a domain event and create in-app notifications for relevant users.
 * Fire-and-forget — never throws.
 */
export function emitEvent(eventType: EventType, payload: EventPayload): void {
  console.log(`[event] ${eventType}`, payload);
  dispatchNotifications(eventType, payload).catch((err) =>
    console.error("[event] notification dispatch failed", { eventType, error: err }),
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUsersByRole(roleName: string): Promise<{ id: string }[]> {
  return db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(roles.name, roleName),
        eq(roles.deleted, false),
        eq(userRoles.deleted, false),
        eq(users.deleted, false),
      ),
    );
}

async function getTicketStakeholderIds(ticketId: string): Promise<string[]> {
  const [ticket] = await db
    .select({
      author: tickets.author,
      assignedEngineerId: tickets.assignedEngineerId,
      assignedStatePlannerId: tickets.assignedStatePlannerId,
      projectId: tickets.projectId,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId));

  if (!ticket) return [];

  const ids = new Set<string>();
  if (ticket.author) ids.add(ticket.author);
  if (ticket.assignedEngineerId) ids.add(ticket.assignedEngineerId);
  if (ticket.assignedStatePlannerId) ids.add(ticket.assignedStatePlannerId);

  if (ticket.projectId) {
    const [proj] = await db
      .select({ projectHeadId: projects.projectHeadId, customerUserId: customers.userId })
      .from(projects)
      .leftJoin(customers, eq(customers.id, projects.customerId))
      .where(and(eq(projects.id, ticket.projectId), eq(projects.deleted, false)));

    if (proj?.projectHeadId) ids.add(proj.projectHeadId);
    if (proj?.customerUserId) ids.add(proj.customerUserId);
  }

  return [...ids];
}

async function notifyUsers(userIds: string[], type: "info" | "success" | "warning" | "error", title: string, message?: string, href?: string) {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.allSettled(
    unique.map((uid) => createNotification(uid, type, title, message, href)),
  );
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

async function dispatchNotifications(eventType: EventType, payload: EventPayload) {
  switch (eventType) {
    case "ticket_created": {
      if (!payload.ticketId) return;

      const [ticket] = await db
        .select({ ticketNumber: tickets.ticketNumber, title: tickets.title })
        .from(tickets)
        .where(eq(tickets.id, payload.ticketId));

      const label = ticket?.ticketNumber ?? payload.ticketId;
      const title = `New ticket: ${label}`;
      const message = ticket?.title ?? undefined;
      const href = `/tickets/${payload.ticketId}`;

      // Notify NOC users
      const nocUsers = await getUsersByRole("noc");
      const recipientIds = nocUsers.map((u) => u.id);
      if (payload.authorId) recipientIds.push(payload.authorId as string);

      await notifyUsers(recipientIds, "info", title, message, href);
      break;
    }

    case "ticket_assigned": {
      if (!payload.ticketId) return;

      const [ticket] = await db
        .select({ ticketNumber: tickets.ticketNumber, title: tickets.title })
        .from(tickets)
        .where(eq(tickets.id, payload.ticketId));

      const label = ticket?.ticketNumber ?? payload.ticketId;
      const href = `/tickets/${payload.ticketId}`;

      if (payload.engineerId) {
        await createNotification(
          payload.engineerId as string,
          "info",
          `You have been assigned ticket ${label}`,
          ticket?.title ?? undefined,
          href,
        );
      }
      if (payload.statePlannerId) {
        await createNotification(
          payload.statePlannerId as string,
          "info",
          `You have been assigned as state planner on ticket ${label}`,
          ticket?.title ?? undefined,
          href,
        );
      }
      break;
    }

    case "status_updated": {
      if (!payload.ticketId) return;

      const [ticket] = await db
        .select({ ticketNumber: tickets.ticketNumber, title: tickets.title })
        .from(tickets)
        .where(eq(tickets.id, payload.ticketId));

      const label = ticket?.ticketNumber ?? payload.ticketId;
      const href = `/tickets/${payload.ticketId}`;
      const status = payload.status ?? "updated";

      const stakeholderIds = await getTicketStakeholderIds(payload.ticketId);
      // Exclude the actor who triggered the update
      const recipients = payload.authorId
        ? stakeholderIds.filter((id) => id !== payload.authorId)
        : stakeholderIds;

      await notifyUsers(
        recipients,
        "info",
        `Ticket ${label} status changed to ${status}`,
        ticket?.title ?? undefined,
        href,
      );
      break;
    }
  }
}

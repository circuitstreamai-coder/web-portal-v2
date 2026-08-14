//src/modules/ticket/ticket.service.ts
import { eq, and, inArray, ilike, gte, count, isNotNull } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  tickets,
  ticketHistory,
  ticketCategories,
  projects,
  customers,
  attachments,
  rcas,
  roles,
  userRoles,
  users,
  emailAllowlist,
  emailQuotaConfig,
} from "../../db/schema/index.js";
import { checkRateLimit } from "../../utils/request-limiter.js";
import {
  VALID_STATUSES,
  STATUS_TRANSITIONS,
  ROLE_ALLOWED_STATUSES,
  VALID_ESCALATION_LEVELS,
  type CreateTicketBody,
  type AssignTicketBody,
  type TicketStatus,
  type EscalationLevel,
} from "./ticket.schema.js";
import { emitEvent } from "../events/event.service.js";
import {
  sendEmail,
  engineerTicketAssignedEmail,
  ticketFlowNotificationEmail,
  emailQuota80Alert,
  emailQuota100Alert,
  emailAnomalySuspendAlert,
} from "../../services/email.js";
import { autoAssignTicket } from "./auto-assign.service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateTicketNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TKT-${date}-${rand}`;
}

async function fetchTicket(id: string) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.deleted, false)));
  if (!ticket) throw { statusCode: 404, message: "Ticket not found" };
  return ticket;
}

type TicketRecord = Awaited<ReturnType<typeof fetchTicket>>;

interface NotificationRecipient {
  email: string;
  name: string | null;
}

async function listUsersByIds(userIds: string[]) {
  if (userIds.length === 0) return [];

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(
      and(
        inArray(users.id, userIds),
        eq(users.deleted, false),
      ),
    );
}

async function listUsersByRole(roleName: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
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

async function getTicketNotificationRecipients(ticket: TicketRecord) {
  const recipientMap = new Map<string, NotificationRecipient>();

  const project = ticket.projectId
    ? await db
      .select({
        projectHeadId: projects.projectHeadId,
        customerUserId: customers.userId,
      })
      .from(projects)
      .leftJoin(customers, eq(customers.id, projects.customerId))
      .where(and(eq(projects.id, ticket.projectId), eq(projects.deleted, false)))
      .limit(1)
      .then(([row]) => row)
    : null;

  const stakeholderIds = [
    ticket.author,
    ticket.assignedEngineerId,
    ticket.assignedStatePlannerId,
    project?.projectHeadId,
    project?.customerUserId,
  ].filter((value): value is string => Boolean(value));

  const [namedStakeholders, nocUsers] = await Promise.all([
    listUsersByIds(stakeholderIds),
    listUsersByRole("noc"),
  ]);

  for (const user of [...namedStakeholders, ...nocUsers]) {
    if (!user.email) continue;
    recipientMap.set(user.email, {
      email: user.email,
      name: user.name,
    });
  }

  return [...recipientMap.values()];
}

function notifyTicketStakeholders(
  ticket: TicketRecord,
  input: {
    subjectLine: string;
    heading: string;
    remarks?: string;
  },
) {
  getTicketNotificationRecipients(ticket)
    .then((recipients) =>
      Promise.allSettled(
        recipients.map((recipient) =>
          sendEmail({
            to: recipient.email,
            ...ticketFlowNotificationEmail({
              recipientName: recipient.name ?? recipient.email,
              subjectLine: input.subjectLine,
              heading: input.heading,
              ticketNumber: ticket.ticketNumber ?? ticket.id,
              ticketTitle: ticket.title ?? "Untitled ticket",
              status: ticket.status,
              priority: ticket.priority,
              state: ticket.state,
              city: ticket.city,
              address: ticket.address,
              remarks: input.remarks ?? null,
            }),
          }),
        ),
      ),
    )
    .catch((err) =>
      console.error("[ticket] stakeholder notification failed", {
        ticketId: ticket.id,
        subjectLine: input.subjectLine,
        error: err,
      }),
    );
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createTicket(
  data: CreateTicketBody,
  authorId: string,
  role?: string,
  userId?: string,
) {
  if (!data.projectId)
    throw { statusCode: 400, message: "projectId is required" };
  if (!data.categoryId)
    throw { statusCode: 400, message: "categoryId is required" };
  if (!data.title) throw { statusCode: 400, message: "title is required" };

  // Validate project exists
  const [project] = await db
    .select({ id: projects.id, customerId: projects.customerId })
    .from(projects)
    .where(and(eq(projects.id, data.projectId), eq(projects.deleted, false)));

  if (!project) throw { statusCode: 400, message: "Invalid projectId" };

  // If customer, verify the project belongs to them
  if (role === "customer" && userId) {
    const [linked] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, project.customerId!),
          eq(customers.userId, userId),
          eq(customers.deleted, false),
        ),
      );

    if (!linked) throw { statusCode: 403, message: "Invalid project access" };
  }

  const ticketNumber = generateTicketNumber();
  const slaDeadline = data.slaDeadline ? new Date(data.slaDeadline) : undefined;

  const ticket = await db.transaction(async (tx) => {
    const [category] = await tx
      .select({ defaultPayout: ticketCategories.defaultPayout })
      .from(ticketCategories)
      .where(
        and(
          eq(ticketCategories.id, data.categoryId),
          eq(ticketCategories.deleted, false),
        ),
      );

    if (!category) throw { statusCode: 400, message: "Invalid categoryId" };

    const [inserted] = await tx
      .insert(tickets)
      .values({
        ...data,
        ticketNumber,
        status: "open",
        payoutAmount: category.defaultPayout ?? undefined,
        slaDeadline,
        author: authorId,
      })
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: inserted.id,
      status: "open",
      author: authorId,
      remarks: "Ticket created",
    });

    return inserted;
  });

  emitEvent("ticket_created", {
    ticketId: ticket.id,
    authorId,
    projectId: data.projectId,
  });

  // super_admin explicitly opts out via autoAssign: false; all other roles always auto-assign
  const shouldAutoAssign = role === "super_admin" ? data.autoAssign !== false : true;
  if (shouldAutoAssign) {
    autoAssignTicket(ticket.id).catch((err) =>
      console.error("[auto-assign] failed for createTicket", {
        ticketId: ticket.id,
        error: err,
      }),
    );
  }

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Created",
    heading: "A new ticket has been created in the system.",
  });

  return ticket;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listTickets(role: string, userId: string) {
  if (role === "super_admin") {
    return db.select().from(tickets).where(eq(tickets.deleted, false));
  }

  if (["engineer", "l2_engineer", "l3_engineer"].includes(role)) {
    return db
      .select()
      .from(tickets)
      .where(
        and(eq(tickets.assignedEngineerId, userId), eq(tickets.deleted, false)),
      );
  }

  if (role === "customer") {
    return db
      .select({
        id: tickets.id,
        ticketNumber: tickets.ticketNumber,
        projectId: tickets.projectId,
        categoryId: tickets.categoryId,
        title: tickets.title,
        description: tickets.description,
        priority: tickets.priority,
        status: tickets.status,
        state: tickets.state,
        city: tickets.city,
        pincode: tickets.pincode,
        address: tickets.address,
        assignedEngineerId: tickets.assignedEngineerId,
        assignedStatePlannerId: tickets.assignedStatePlannerId,
        escalationLevel: tickets.escalationLevel,
        payoutAmount: tickets.payoutAmount,
        slaDeadline: tickets.slaDeadline,
        closedAt: tickets.closedAt,
        author: tickets.author,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .where(
        and(
          eq(customers.userId, userId),
          eq(tickets.deleted, false),
          eq(projects.deleted, false),
          eq(customers.deleted, false),
        ),
      );
  }

  if (role === "project_head") {
    return db
      .select()
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .where(
        and(
          eq(projects.projectHeadId, userId),
          eq(tickets.deleted, false),
          eq(projects.deleted, false),
        ),
      )
      .then((rows) => rows.map(({ tickets }) => tickets));
  }

  if (["noc", "state_planner", "national_head"].includes(role)) {
    return db.select().from(tickets).where(eq(tickets.deleted, false));
  }

  throw { statusCode: 403, message: "Forbidden" };
}

export async function deleteTicket(id: string) {
  const [ticket] = await db
    .update(tickets)
    .set({ deleted: true })
    .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
    .returning();

  if (!ticket) {
    throw { statusCode: 404, message: "Ticket not found" };
  }

  return ticket;
}

export async function listPayouts(role: string, userId: string) {
  const payoutQuery = db
    .select({
      id: tickets.id,
      ticketId: tickets.id,
      ticketNumber: tickets.ticketNumber,
      engineerId: tickets.assignedEngineerId,
      engineerName: users.name,
      callType: ticketCategories.name,
      payoutAmount: tickets.payoutAmount,
      createdAt: tickets.closedAt,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.assignedEngineerId, users.id))
    .leftJoin(ticketCategories, eq(tickets.categoryId, ticketCategories.id));

  const formatRows = (rows: Awaited<ReturnType<typeof payoutQuery.where>>) =>
    rows.map((row) => ({
      ...row,
      engineerId: row.engineerId ?? "",
      callType: row.callType ?? "Uncategorised",
      payoutAmount: row.payoutAmount ?? 0,
      amount: row.payoutAmount ?? 0,
      currency: "INR",
      status: "credited" as const,
      creditedAt: row.createdAt,
    }));

  if (["engineer", "l2_engineer", "l3_engineer"].includes(role)) {
    return payoutQuery.where(
      and(
        eq(tickets.assignedEngineerId, userId),
        eq(tickets.status, "closed"),
        eq(tickets.deleted, false),
      ),
    ).then(formatRows);
  }

  if (["super_admin", "noc", "project_head", "state_planner", "national_head"].includes(role)) {
    return payoutQuery.where(
      and(eq(tickets.status, "closed"), eq(tickets.deleted, false)),
    ).then(formatRows);
  }

  throw { statusCode: 403, message: "Forbidden" };
}

// ── Assign ────────────────────────────────────────────────────────────────────

export async function assignTicket(
  id: string,
  body: AssignTicketBody,
  authorId: string,
) {
  if (!body.assignedEngineerId && !body.statePlannerId) {
    throw {
      statusCode: 400,
      message: "At least one of assignedEngineerId or statePlannerId is required",
    };
  }

  // Validate engineer exists if provided
  if (body.assignedEngineerId) {
    const [engineer] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, body.assignedEngineerId), eq(users.deleted, false)))
      .limit(1);
    if (!engineer) {
      throw { statusCode: 400, message: "Engineer not found" };
    }
  }

  // Read current state before entering the transaction for guard validation
  const current = await fetchTicket(id);

  const ASSIGNABLE_STATUSES = ["open", "assigned", "in_progress"];
  if (!ASSIGNABLE_STATUSES.includes(current.status ?? "")) {
    throw {
      statusCode: 400,
      message: `Cannot assign a ticket with status '${current.status}'`,
    };
  }

  // Detect reassign: engineer slot already filled
  const isReassign =
    !!body.assignedEngineerId && !!current.assignedEngineerId;

  const updates: Record<string, unknown> = {};
  if (body.assignedEngineerId) updates.assignedEngineerId = body.assignedEngineerId;
  if (body.statePlannerId) updates.assignedStatePlannerId = body.statePlannerId;
  if (current.status === "open") updates.status = "assigned";

  const parts: string[] = [];
  if (body.assignedEngineerId) parts.push(`engineer ${body.assignedEngineerId}`);
  if (body.statePlannerId) parts.push(`state planner ${body.statePlannerId}`);

  const historyAction = isReassign ? "reassigned" : "assigned";

  const ticket = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tickets)
      .set(updates)
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: historyAction,
      status: updated.status!,
      author: authorId,
      remarks: `Assigned to ${parts.join(" and ")}`,
    });

    return updated;
  });

  emitEvent("ticket_assigned", {
    ticketId: id,
    engineerId: body.assignedEngineerId,
    statePlannerId: body.statePlannerId,
    authorId,
  });

  if (body.assignedEngineerId) {
    db.select({
      email: users.email,
      name: users.name,
    })
      .from(users)
      .where(and(eq(users.id, body.assignedEngineerId), eq(users.deleted, false)))
      .limit(1)
      .then(([engineer]) => {
        if (!engineer?.email) return;

        return sendEmail({
          to: engineer.email,
          ...engineerTicketAssignedEmail({
            engineerName: engineer.name ?? engineer.email,
            ticketNumber: ticket.ticketNumber ?? ticket.id,
            ticketTitle: ticket.title ?? "Untitled ticket",
            priority: ticket.priority,
            state: ticket.state,
            city: ticket.city,
            address: ticket.address,
          }),
        });
      })
      .catch((err) =>
        console.error("[ticket] engineer assignment email failed", {
          ticketId: id,
          engineerId: body.assignedEngineerId,
          error: err,
        }),
      );
  }

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Assigned",
    heading: "A ticket assignment has been updated.",
    remarks: `Assigned to ${parts.join(" and ")}`,
  });

  return ticket;
}

// ── Status update (with role guard + transition engine) ───────────────────────

export async function updateTicketStatus(
  id: string,
  requestedStatus: string,
  authorId: string,
  role: string,
  remarks?: string,
) {
  // 1. Customers cannot update status
  if (role === "customer") {
    throw { statusCode: 403, message: "Customers cannot update ticket status" };
  }

  // 2. Validate the requested status value
  if (!VALID_STATUSES.includes(requestedStatus as TicketStatus)) {
    throw {
      statusCode: 400,
      message: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}`,
    };
  }

  // 3. Role permission check
  const allowed = ROLE_ALLOWED_STATUSES[role] ?? [];
  if (!allowed.includes(requestedStatus as TicketStatus)) {
    throw {
      statusCode: 403,
      message: `Role '${role}' is not allowed to set status '${requestedStatus}'`,
    };
  }

  // 4. Read current state before entering the transaction for transition validation
  const current = await fetchTicket(id);

  const currentStatus = current.status ?? "open";

  // in_progress: only the assigned engineer may start work, and they must have accepted first
  const isEngineerRole = ["engineer", "l2_engineer", "l3_engineer"].includes(role);
  if (requestedStatus === "in_progress" && isEngineerRole) {
    if (currentStatus !== "accepted") {
      throw { statusCode: 400, message: "Ticket must be accepted before starting work" };
    }
    if (current.assignedEngineerId !== authorId) {
      throw { statusCode: 403, message: "Not your ticket" };
    }
  } else if (isEngineerRole && current.assignedEngineerId !== authorId) {
    // All other engineer status updates also require ticket ownership
    throw { statusCode: 403, message: "Not your ticket" };
  }

  // 4a. Reject no-op updates
  if (requestedStatus === currentStatus) {
    throw { statusCode: 400, message: "No status change" };
  }

  // 4b. Enforce strict transition table
  const validNext = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!validNext.includes(requestedStatus as TicketStatus)) {
    throw {
      statusCode: 400,
      message: `Invalid transition: '${currentStatus}' → '${requestedStatus}'. Allowed next states: [${validNext.join(", ") || "none"}]`,
    };
  }

  // 4c. Require at least one attachment before moving to pending_validation
  if (requestedStatus === "pending_validation") {
    const [proof] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.ticketId, id), eq(attachments.deleted, false)))
      .limit(1);

    if (!proof) {
      throw { statusCode: 400, message: "Proof required before validation" };
    }
  }

  // 5. Execute update + history atomically
  const updates: Record<string, unknown> = { status: requestedStatus };
  if (requestedStatus === "closed") updates.closedAt = new Date();

  const ticket = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tickets)
      .set(updates)
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: id,
      status: requestedStatus,
      author: authorId,
      remarks,
    });

    return updated;
  });

  emitEvent("status_updated", {
    ticketId: id,
    status: requestedStatus,
    authorId,
  });

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Status Updated",
    heading: `Ticket status changed to ${requestedStatus}.`,
    remarks,
  });

  return ticket;
}

export async function validateTicket(
  id: string,
  authorId: string,
  remarks?: string,
) {
  const current = await fetchTicket(id);

  if (!["resolved", "pending_validation"].includes(current.status ?? "")) {
    throw {
      statusCode: 400,
      message:
        "Ticket can only be validated when status is resolved or pending_validation",
    };
  }

  const closedAt = new Date();

  const ticket = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tickets)
      .set({ status: "closed", closedAt })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: id,
      status: "closed",
      author: authorId,
      remarks,
      createdAt: closedAt,
    });

    return updated;
  });

  emitEvent("status_updated", {
    ticketId: id,
    status: "closed",
    authorId,
  });

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Closed",
    heading: "The ticket has been validated and closed.",
    remarks,
  });

  return ticket;
}

export async function getTicketClosureEligibility(id: string) {
  const ticket = await fetchTicket(id);

  const [ticketAttachments, rca] = await Promise.all([
    db
      .select({ type: attachments.type })
      .from(attachments)
      .where(and(eq(attachments.ticketId, id), eq(attachments.deleted, false))),
    getRca(id),
  ]);

  const attachmentTypes = new Set(ticketAttachments.map((a) => a.type));

  const checks = {
    correct_status: ["resolved", "pending_validation"].includes(ticket.status ?? ""),
    ir_uploaded: attachmentTypes.has("ir_report"),
    site_image_uploaded: attachmentTypes.has("site_image"),
    rca_complete: rca !== null,
  };

  const reasons: string[] = [];
  if (!checks.correct_status) reasons.push("Ticket status must be resolved or pending_validation");
  if (!checks.ir_uploaded) reasons.push("IR report attachment is required");
  if (!checks.site_image_uploaded) reasons.push("Site image attachment is required");
  if (!checks.rca_complete) reasons.push("RCA documentation is required");

  return {
    eligible: reasons.length === 0,
    checks,
    reasons,
  };
}

function toReplacementRecord(ticket: typeof tickets.$inferSelect) {
  return {
    id: ticket.id,
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    engineerId: ticket.assignedEngineerId ?? "",
    deviceType: ticket.title ?? "Replacement item",
    reason: ticket.description ?? "Replacement requested",
    status: ticket.replacementStatus ?? "pending",
    requestedAt: (ticket.updatedAt ?? ticket.createdAt).toISOString(),
    updatedAt: ticket.updatedAt?.toISOString() ?? null,
  };
}

export async function listReplacements(role: string, userId: string) {
  let rows: (typeof tickets.$inferSelect)[];
  if (["engineer", "l2_engineer", "l3_engineer"].includes(role)) {
    rows = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.assignedEngineerId, userId),
          isNotNull(tickets.replacementStatus),
          eq(tickets.deleted, false),
        ),
      );
  } else if (role === "customer") {
    rows = await db
      .select()
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .where(
        and(
          eq(customers.userId, userId),
          isNotNull(tickets.replacementStatus),
          eq(tickets.deleted, false),
          eq(projects.deleted, false),
          eq(customers.deleted, false),
        ),
      )
      .then((joined) => joined.map((row) => row.tickets));
  } else if (["super_admin", "noc", "state_planner", "project_head", "national_head"].includes(role)) {
    rows = await db
      .select()
      .from(tickets)
      .where(and(isNotNull(tickets.replacementStatus), eq(tickets.deleted, false)));
  } else {
    throw { statusCode: 403, message: "Forbidden" };
  }

  return rows.map(toReplacementRecord);
}

export async function getTicketReplacement(id: string, role: string, userId: string) {
  const replacements = await listReplacements(role, userId);
  const replacement = replacements.find((item) => item.ticketId === id);
  if (!replacement) throw { statusCode: 404, message: "Replacement request not found" };
  return replacement;
}

export async function requestTicketReplacement(id: string, authorId: string) {
  const current = await fetchTicket(id);

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        replacementRequested: true,
        replacementStatus: "pending",
      })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)));

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: "replacement_requested",
      authorId,
      author: authorId,
    });
  });

  const updatedTicket = {
    ...current,
    replacementRequested: true,
    replacementStatus: "pending",
  };

  notifyTicketStakeholders(updatedTicket, {
    subjectLine: "Replacement Requested",
    heading: "A replacement has been requested for this ticket.",
  });

  return toReplacementRecord(updatedTicket);
}

export async function approveTicketReplacement(id: string, authorId: string) {
  const current = await fetchTicket(id);

  if (!current.replacementRequested) {
    throw {
      statusCode: 400,
      message: "Replacement has not been requested for this ticket",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        replacementRequested: false,
        replacementStatus: "approved",
        status: "open",
      })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)));

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: "replacement_approved",
      authorId,
      author: authorId,
      remarks: "Replacement request approved",
    });
  });

  const updatedTicket = {
    ...current,
    replacementRequested: false,
    replacementStatus: "approved",
    status: "open",
  };

  notifyTicketStakeholders(updatedTicket, {
    subjectLine: "Replacement Approved",
    heading: "The replacement request has been approved.",
  });

  return toReplacementRecord(updatedTicket);
}

export async function rejectTicketReplacement(id: string, authorId: string) {
  const current = await fetchTicket(id);

  if (!current.replacementRequested) {
    throw {
      statusCode: 400,
      message: "Replacement has not been requested for this ticket",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        replacementRequested: false,
        replacementStatus: "rejected",
      })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)));

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: "replacement_rejected",
      authorId,
      author: authorId,
      remarks: "Replacement request rejected",
    });
  });

  const updatedTicket = {
    ...current,
    replacementRequested: false,
    replacementStatus: "rejected",
  };

  notifyTicketStakeholders(updatedTicket, {
    subjectLine: "Replacement Rejected",
    heading: "The replacement request has been rejected.",
  });

  return toReplacementRecord(updatedTicket);
}

export async function dispatchTicketReplacement(id: string, authorId: string) {
  const current = await fetchTicket(id);

  if (current.replacementStatus !== "approved") {
    throw {
      statusCode: 400,
      message: "Replacement must be approved before it can be dispatched",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({ replacementStatus: "dispatched" })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)));

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: "replacement_dispatched",
      authorId,
      author: authorId,
      remarks: "Replacement dispatched",
    });
  });

  const updatedTicket = { ...current, replacementStatus: "dispatched" };
  notifyTicketStakeholders(updatedTicket, {
    subjectLine: "Replacement Dispatched",
    heading: "The replacement part has been dispatched.",
  });

  return toReplacementRecord(updatedTicket);
}

// ── RCA ───────────────────────────────────────────────────────────────────────

export interface RcaInput {
  rootCause: string;
  actionTaken: string;
  preventionMeasure?: string;
}

export async function getRca(ticketId: string) {
  const [rca] = await db
    .select()
    .from(rcas)
    .where(and(eq(rcas.ticketId, ticketId), eq(rcas.deleted, false)))
    .limit(1);
  return rca ?? null;
}

export async function createRca(
  ticketId: string,
  input: RcaInput,
  authorId: string,
  authorName: string,
) {
  const existing = await getRca(ticketId);
  if (existing) {
    throw { statusCode: 409, message: "RCA already exists for this ticket. Use PATCH to update." };
  }

  const [rca] = await db
    .insert(rcas)
    .values({
      ticketId,
      rootCause: input.rootCause,
      actionTaken: input.actionTaken,
      preventionMeasure: input.preventionMeasure ?? null,
      documentedBy: authorId,
      documentedByName: authorName,
    })
    .returning();

  await db.insert(ticketHistory).values({
    ticketId,
    action: "rca_submitted",
    authorId,
    author: authorId,
    remarks: "RCA documented",
  });

  return rca;
}

export async function updateRca(
  ticketId: string,
  input: RcaInput,
  authorId: string,
) {
  const existing = await getRca(ticketId);
  if (!existing) {
    throw { statusCode: 404, message: "No RCA found for this ticket. Use POST to create one." };
  }

  const updates: Partial<typeof rcas.$inferInsert> = {
    rootCause: input.rootCause,
    actionTaken: input.actionTaken,
    preventionMeasure: input.preventionMeasure ?? null,
  };

  const [rca] = await db
    .update(rcas)
    .set(updates)
    .where(and(eq(rcas.ticketId, ticketId), eq(rcas.deleted, false)))
    .returning();

  await db.insert(ticketHistory).values({
    ticketId,
    action: "rca_updated",
    authorId,
    author: authorId,
    remarks: "RCA updated",
  });

  return rca;
}

// ── Payout Export ─────────────────────────────────────────────────────────────

export async function exportPayouts(role: string, userId: string) {
  const rows = await listPayouts(role, userId);

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  const sheet = workbook.addWorksheet("Payouts");

  sheet.columns = [
    { header: "Ticket ID", key: "ticketId", width: 38 },
    { header: "Status", key: "status", width: 14 },
    { header: "Payout Amount", key: "payoutAmount", width: 16 },
  ];

  for (const row of rows) {
    sheet.addRow(row);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Escalation ────────────────────────────────────────────────────────────────

export async function escalateTicket(
  id: string,
  escalationLevel: EscalationLevel,
  authorId: string,
  remarks?: string,
) {
  if (!VALID_ESCALATION_LEVELS.includes(escalationLevel)) {
    throw {
      statusCode: 400,
      message: `escalationLevel must be one of: ${VALID_ESCALATION_LEVELS.join(", ")}`,
    };
  }

  const current = await fetchTicket(id);

  if (["pending_validation", "closed"].includes(current.status ?? "")) {
    throw {
      statusCode: 400,
      message: `Cannot escalate a ticket with status '${current.status}'`,
    };
  }

  if (current.escalationLevel === escalationLevel) {
    throw {
      statusCode: 400,
      message: `Ticket is already at escalation level ${escalationLevel}`,
    };
  }

  const [ticket] = await db
    .update(tickets)
    .set({ escalationLevel })
    .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
    .returning();

  await db.insert(ticketHistory).values({
    ticketId: id,
    action: "escalated",
    status: ticket.status!,
    author: authorId,
    remarks: remarks ?? `Escalation level updated to ${escalationLevel}`,
  });

  return ticket;
}

// ── Decline ───────────────────────────────────────────────────────────────────

/**
 * Lets the assigned engineer decline a ticket before starting work. Returns it
 * to the open pool (clearing the assignment) for staff to reassign — unlike a
 * plain status update, this also clears assignedEngineerId.
 */
export async function declineTicket(
  id: string,
  authorId: string,
  role: string,
  remarks?: string,
) {
  const isEngineerRole = ["engineer", "l2_engineer", "l3_engineer"].includes(role);
  if (!isEngineerRole) {
    throw { statusCode: 403, message: "Only engineers can decline a ticket" };
  }

  const current = await fetchTicket(id);

  if (current.assignedEngineerId !== authorId) {
    throw { statusCode: 403, message: "Not your ticket" };
  }

  if (!["assigned", "accepted"].includes(current.status ?? "")) {
    throw {
      statusCode: 400,
      message: `Cannot decline a ticket with status '${current.status}'`,
    };
  }

  const ticket = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tickets)
      .set({ status: "open", assignedEngineerId: null })
      .where(and(eq(tickets.id, id), eq(tickets.deleted, false)))
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: id,
      action: "declined",
      status: "open",
      author: authorId,
      remarks: remarks ?? "Engineer declined the assignment",
    });

    return updated;
  });

  emitEvent("status_updated", { ticketId: id, status: "open", authorId });

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Declined",
    heading: "An engineer has declined this ticket assignment. It is now unassigned and needs reassignment.",
    remarks,
  });

  return ticket;
}

// ── Email inbound ─────────────────────────────────────────────────────────────

/**
 * The category applied to all email-originated tickets.
 * Update this to a valid ticket_categories.id from your database.
 */
export const DEFAULT_CATEGORY_ID = process.env.DEFAULT_EMAIL_CATEGORY_ID ?? "";

/**
 * Parse `Project-Name="<value>"` from anywhere in the email body or subject.
 * Returns the extracted name, or null if not present.
 */
function parseProjectName(text: string): string | null {
  const match = text.match(/Project-Name\s*=\s*"([^"]+)"/i);
  return match ? match[1].trim() : null;
}

// ── Email Security Helpers ────────────────────────────────────────────────────

function isSenderAllowlisted(
  senderEmail: string,
  entries: Array<{ domain: string | null; email: string | null }>,
): boolean {
  if (entries.length === 0) return true; // No allowlist configured → allow all

  const lowerSender = senderEmail.toLowerCase();
  const senderDomain = lowerSender.split("@")[1] ?? "";

  return entries.some((e) => {
    if (e.email && e.email.toLowerCase() === lowerSender) return true;
    if (e.domain && e.domain.toLowerCase() === senderDomain) return true;
    return false;
  });
}

function isSpam(title: string, description: string): boolean {
  // No subject and no meaningful body
  if (!title.trim() && !description.trim()) return true;

  // Body too short to be a real support request
  if (description.trim().length < 10) return true;

  // Detect repeated word spam (e.g. "buy buy buy buy buy")
  const words = description.trim().toLowerCase().split(/\s+/);
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.25) return true;
  }

  return false;
}

async function getOrCreateQuotaConfig(customerId: string) {
  const [existing] = await db
    .select()
    .from(emailQuotaConfig)
    .where(eq(emailQuotaConfig.customerId, customerId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(emailQuotaConfig)
    .values({ customerId })
    .returning();

  return created;
}

async function resetQuotaPeriodIfNeeded(config: typeof emailQuotaConfig.$inferSelect) {
  const now = new Date();
  const periodStart = new Date(config.periodStart);
  const daysSincePeriodStart = (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSincePeriodStart >= 30) {
    const [reset] = await db
      .update(emailQuotaConfig)
      .set({
        emailsThisMonth: 0,
        periodStart: now,
        alert80Sent: false,
        suspended: false,
        suspendedAt: null,
        suspendedReason: null,
      })
      .where(eq(emailQuotaConfig.id, config.id))
      .returning();
    return reset;
  }

  return config;
}

async function notifyQuotaAlert(
  customerName: string,
  customerEmail: string | null,
  used: number,
  cap: number,
  type: "80" | "100",
) {
  const template = type === "80"
    ? emailQuota80Alert(customerName, used, cap)
    : emailQuota100Alert(customerName, used, cap);

  // Notify customer admin
  if (customerEmail) {
    sendEmail({ to: customerEmail, ...template }).catch((err) =>
      console.error("[email-quota] failed to notify customer", err),
    );
  }

  // Notify platform super_admins
  const admins = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.name, "super_admin"), eq(users.deleted, false)))
    .limit(10);

  for (const admin of admins) {
    if (!admin.email) continue;
    sendEmail({ to: admin.email, ...template }).catch(() => {});
  }
}

// ── createTicketFromEmail (with 5-layer security) ─────────────────────────────

export async function createTicketFromEmail(input: {
  from: string;
  title: string;
  description: string;
  messageId: string;
}) {
  // 1. Deduplication — return existing ticket if messageId already processed
  const [existing] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.messageId, input.messageId), eq(tickets.deleted, false)))
    .limit(1);

  if (existing) return existing;

  // ── Layer 4: Spam signature detection ──────────────────────────────────────
  if (isSpam(input.title, input.description)) {
    console.warn("[email-security] spam detected, dropping:", input.from, input.title);
    return null;
  }

  // 2. Resolve user
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.email, input.from), eq(users.deleted, false)))
    .limit(1);

  if (!user) {
    console.warn("[email-security] unknown sender, dropping:", input.from);
    return null; // Silently drop — no 422, no API cost
  }

  // 3. Resolve customer linked to user
  const [customerRow] = await db
    .select({
      id: customers.id,
      companyName: customers.companyName,
      email: customers.email,
    })
    .from(customers)
    .where(and(eq(customers.userId, user.id), eq(customers.deleted, false)))
    .limit(1);

  if (!customerRow) {
    console.warn("[email-security] no customer linked, dropping:", input.from);
    return null;
  }

  // ── Layer 1: Allowlist / domain whitelist ───────────────────────────────────
  const allowlistEntries = await db
    .select({ domain: emailAllowlist.domain, email: emailAllowlist.email })
    .from(emailAllowlist)
    .where(eq(emailAllowlist.customerId, customerRow.id));

  if (!isSenderAllowlisted(input.from, allowlistEntries)) {
    console.warn("[email-security] sender not in allowlist, dropping:", input.from);
    return null;
  }

  // ── Layer 2: Per-sender daily rate limit ────────────────────────────────────
  const quotaCfg = await getOrCreateQuotaConfig(customerRow.id);
  const currentQuota = await resetQuotaPeriodIfNeeded(quotaCfg);

  const rateKey = `email:sender:${input.from.toLowerCase()}`;
  const rateResult = checkRateLimit(rateKey, {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxHits: currentQuota.dailyRateLimitPerSender,
  });

  if (!rateResult.allowed) {
    console.warn("[email-security] sender rate limit exceeded:", input.from);
    return null;
  }

  // ── Layer 3: Monthly billing cap ────────────────────────────────────────────
  if (currentQuota.suspended) {
    console.warn("[email-security] processing suspended for customer:", customerRow.id);
    return null;
  }

  const newCount = currentQuota.emailsThisMonth + 1;

  if (newCount > currentQuota.monthlyCap) {
    // Auto-suspend at 100%
    await db
      .update(emailQuotaConfig)
      .set({
        suspended: true,
        suspendedAt: new Date(),
        suspendedReason: "Monthly cap reached — auto-suspended",
      })
      .where(eq(emailQuotaConfig.id, currentQuota.id));

    notifyQuotaAlert(
      customerRow.companyName ?? customerRow.email ?? customerRow.id,
      customerRow.email,
      currentQuota.emailsThisMonth,
      currentQuota.monthlyCap,
      "100",
    ).catch(() => {});

    console.warn("[email-security] monthly cap reached, auto-suspended:", customerRow.id);
    return null;
  }

  // Send 80% alert (once per period)
  const threshold80 = Math.floor(currentQuota.monthlyCap * 0.8);
  if (!currentQuota.alert80Sent && newCount >= threshold80) {
    await db
      .update(emailQuotaConfig)
      .set({ alert80Sent: true })
      .where(eq(emailQuotaConfig.id, currentQuota.id));

    notifyQuotaAlert(
      customerRow.companyName ?? customerRow.email ?? customerRow.id,
      customerRow.email,
      newCount,
      currentQuota.monthlyCap,
      "80",
    ).catch(() => {});
  }

  // Increment monthly counter
  await db
    .update(emailQuotaConfig)
    .set({ emailsThisMonth: newCount })
    .where(eq(emailQuotaConfig.id, currentQuota.id));

  // ── Layer 5: Anomaly detection — volume spike ───────────────────────────────
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const [recentRow] = await db
    .select({ cnt: count() })
    .from(tickets)
    .where(
      and(
        eq(tickets.source, "email"),
        eq(tickets.author, user.id),
        gte(tickets.createdAt, fifteenMinutesAgo),
        eq(tickets.deleted, false),
      ),
    );

  const recentCount = Number(recentRow?.cnt ?? 0);
  // Daily average per 15-min window: monthlyCap / 30 days / 96 fifteen-min slots
  const expected15MinAvg = Math.max(1, currentQuota.monthlyCap / 30 / 96);

  if (recentCount >= Math.ceil(expected15MinAvg * 5)) {
    // 5× spike in a 15-min window → auto-suspend
    await db
      .update(emailQuotaConfig)
      .set({
        suspended: true,
        suspendedAt: new Date(),
        suspendedReason: `Anomaly detected: ${recentCount} emails in 15 minutes`,
      })
      .where(eq(emailQuotaConfig.id, currentQuota.id));

    const anomalyTemplate = emailAnomalySuspendAlert(
      customerRow.companyName ?? customerRow.id,
      recentCount,
    );

    if (customerRow.email) {
      sendEmail({ to: customerRow.email, ...anomalyTemplate }).catch(() => {});
    }

    const notifyAdmins = await db
      .select({ email: users.email })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.name, "super_admin"), eq(users.deleted, false)))
      .limit(10);

    for (const admin of notifyAdmins) {
      if (!admin.email) continue;
      sendEmail({ to: admin.email, ...anomalyTemplate }).catch(() => {});
    }

    console.warn("[email-security] anomaly spike, auto-suspended:", customerRow.id, { recentCount });
    return null;
  }

  // ── All security layers passed — create the ticket ──────────────────────────

  // 4. Resolve project — prefer one named in the email, fall back to first.
  const projectNameHint =
    parseProjectName(input.title) ?? parseProjectName(input.description);

  let project: { id: string } | undefined;

  if (projectNameHint) {
    [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.customerId, customerRow.id),
          ilike(projects.name, projectNameHint),
          eq(projects.deleted, false),
        ),
      )
      .limit(1);
  }

  if (!project) {
    [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.customerId, customerRow.id), eq(projects.deleted, false)))
      .limit(1);
  }

  // 5. Resolve default category if configured.
  let category: { id: string; defaultPayout: number | null } | undefined;

  if (DEFAULT_CATEGORY_ID) {
    [category] = await db
      .select({ id: ticketCategories.id, defaultPayout: ticketCategories.defaultPayout })
      .from(ticketCategories)
      .where(
        and(
          eq(ticketCategories.id, DEFAULT_CATEGORY_ID),
          eq(ticketCategories.deleted, false),
        ),
      )
      .limit(1);
  }

  // 6. Create ticket + history atomically
  const ticketNumber = generateTicketNumber();

  const ticket = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(tickets)
      .values({
        ticketNumber,
        projectId: project?.id ?? null,
        categoryId: category?.id ?? null,
        title: input.title,
        description: input.description,
        status: "open",
        source: "email",
        author: user.id,
        messageId: input.messageId,
        payoutAmount: category?.defaultPayout ?? undefined,
      })
      .returning();

    await tx.insert(ticketHistory).values({
      ticketId: inserted.id,
      action: "created_from_email",
      status: "open",
      authorId: user.id,
      author: user.id,
    });

    return inserted;
  });

  // 7. Events + notifications (fire-and-forget)
  emitEvent("ticket_created", {
    ticketId: ticket.id,
    authorId: user.id,
    projectId: project?.id,
    source: "email",
  });

  autoAssignTicket(ticket.id).catch((err) =>
    console.error("[auto-assign] failed for createTicketFromEmail", {
      ticketId: ticket.id,
      error: err,
    }),
  );

  notifyTicketStakeholders(ticket, {
    subjectLine: "Ticket Created via Email",
    heading: "A new ticket has been created from an inbound email.",
  });

  return ticket;
}

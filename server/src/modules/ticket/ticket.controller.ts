//src/modules/ticket/ticket.controller.ts
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  createTicket,
  listTickets,
  listPayouts,
  exportPayouts,
  listReplacements,
  assignTicket,
  updateTicketStatus,
  escalateTicket,
  declineTicket,
  validateTicket,
  getTicketClosureEligibility,
  requestTicketReplacement,
  approveTicketReplacement,
  rejectTicketReplacement,
  dispatchTicketReplacement,
  getRca,
  createRca,
  updateRca,
  createTicketFromEmail,
  deleteTicket,
  getTicketReplacement,
} from "./ticket.service.js";
import { createAttachment } from "./attachment.service.js";
import { createTicketHistoryEntry, listTicketHistoryByTicket } from "./ticket-history.service.js";
import {
  createTicketCategory,
  deleteTicketCategory,
  listPayoutRates,
  updatePayoutRate,
  updateTicketCategory,
} from "./ticket-category.service.js";
import type {
  CreateTicketBody,
  AssignTicketBody,
  UpdateTicketStatusBody,
  EscalateTicketBody,
  EscalationLevel,
  DeclineTicketBody,
  ValidateTicketBody,
  CreateAttachmentBody,
  CreateTicketHistoryBody,
} from "./ticket.schema.js";

export async function createTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const ticket = await createTicket(
      req.body as CreateTicketBody,
      req.user.id,
      req.user.role,
      req.user.id,
    );
    return reply.code(201).send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function deleteTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    await deleteTicket(id);
    return reply.code(204).send();
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function listTicketsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await listTickets(req.user.role, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function listPayoutsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const result = await listPayouts(req.user.role, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function exportPayoutsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const buffer = await exportPayouts(req.user.role, req.user.id);
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=\"payouts.xlsx\"")
      .send(buffer);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function assignTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const ticket = await assignTicket(
      id,
      req.body as AssignTicketBody,
      req.user.id,
    );
    return reply.send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateTicketStatusHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { status, remarks } = req.body as UpdateTicketStatusBody;
    const ticket = await updateTicketStatus(
      id,
      status,
      req.user.id,
      req.user.role,
      remarks,
    );
    return reply.send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function escalateTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { escalationLevel, remarks } = req.body as EscalateTicketBody;
    const ticket = await escalateTicket(
      id,
      escalationLevel as EscalationLevel,
      req.user.id,
      remarks,
    );
    return reply.send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function declineTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { remarks } = (req.body ?? {}) as DeclineTicketBody;
    const ticket = await declineTicket(id, req.user.id, req.user.role, remarks);
    return reply.send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function validateTicketHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { remarks } = (req.body ?? {}) as ValidateTicketBody;
    const ticket = await validateTicket(id, req.user.id, remarks);
    return reply.send(ticket);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getTicketClosureEligibilityHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const result = await getTicketClosureEligibility(id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function createTicketAttachmentHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const attachment = await createAttachment(
      id,
      req.body as CreateAttachmentBody,
      req.user.id,
    );
    return reply.code(201).send(attachment);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getTicketHistoryHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const history = await listTicketHistoryByTicket(id);
    return reply.send(history);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function createTicketHistoryHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const { status, remarks } = req.body as CreateTicketHistoryBody;
    const entry = await createTicketHistoryEntry({
      ticketId: id,
      status,
      remarks,
      author: req.user.id,
    });
    return reply.code(201).send(entry);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function listReplacementsHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    let result = await listReplacements(req.user.role, req.user.id);
    const { status } = req.query as { status?: string };
    if (status) result = result.filter((item) => item.status === status);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getTicketReplacementHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    return reply.send(await getTicketReplacement(id, req.user.role, req.user.id));
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function requestTicketReplacementHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const result = await requestTicketReplacement(id, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function approveTicketReplacementHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const result = await approveTicketReplacement(id, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function rejectTicketReplacementHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const result = await rejectTicketReplacement(id, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getRcaHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const rca = await getRca(id);
    if (!rca) return reply.code(404).send({ error: "No RCA found for this ticket" });
    return reply.send(rca);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function createRcaHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as { rootCause: string; actionTaken: string; preventionMeasure?: string };
    const rca = await createRca(id, body, req.user.id, req.user.email ?? req.user.id);
    return reply.code(201).send(rca);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateRcaHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as { rootCause: string; actionTaken: string; preventionMeasure?: string };
    const rca = await updateRca(id, body, req.user.id);
    return reply.send(rca);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function dispatchTicketReplacementHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const result = await dispatchTicketReplacement(id, req.user.id);
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function createTicketCategoryHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const category = await createTicketCategory(req.body as { name?: string; defaultPayout?: number; author?: string });
    return reply.code(201).send(category);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function updateTicketCategoryHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    const category = await updateTicketCategory(
      id,
      req.body as { name?: string; defaultPayout?: number },
    );
    return reply.send(category);
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function deleteTicketCategoryHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id } = req.params as { id: string };
    await deleteTicketCategory(id);
    return reply.code(204).send();
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function updatePayoutRateHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { categoryId } = req.params as { categoryId: string };
    const { amount } = req.body as { amount: string | number };
    const result = await updatePayoutRate(categoryId, Number(amount));
    return reply.send(result);
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function listPayoutRatesHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    return reply.send(await listPayoutRates());
  } catch (err: any) {
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal server error" });
  }
}

export async function emailInboundHandler(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const body: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === "field") {
        body[part.fieldname] = part.value as string;
      } else {
        await part.toBuffer();
      }
    }

    console.log("EMAIL INBOUND:", body);

    const from =
      body["from"] || body["sender"] || body["envelope[from]"] || "";
    const subject = body["subject"];
    const text = body["text"];
    const html = body["html"];
    const messageId =
      body["Message-Id"] ||
      body["message-id"] ||
      body["messageId"] ||
      body["headers.message-id"] ||
      `${from}:${subject || "Email Ticket"}:${body["date"] || ""}`;

    const title = subject || "Email Ticket";
    const description = text || html || "No content";

    if (!from) return reply.code(200).send({ ok: true });

    await createTicketFromEmail({ from, title, description, messageId });

    return reply.code(200).send({ ok: true });
  } catch (err) {
    console.error("[email-inbound] error:", err);
    return reply.code(200).send({ ok: true });
  }
}

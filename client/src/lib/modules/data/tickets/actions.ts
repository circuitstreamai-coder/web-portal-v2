import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";
import { uploadFile, fileUrl } from "$lib/api/upload";
import type { Ticket, TicketHistory, Attachment, TicketCategory } from "./queries";
import {
  assignTicket as assignTicketRequest,
  escalateTicket as escalateTicketRequest,
  updateTicketStatus,
  type EscalateTicketInput as ApiEscalateTicketInput,
} from "$lib/api/tickets";
import type { TicketStatus } from "$lib/config/roles";

// ── Input Types ─────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  ticketNumber?: string;
  projectId?: string;
  categoryId?: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  assignedEngineerId?: string;
  statePlannerId?: string;
  escalationLevel?: string;
  payoutAmount?: number;
  slaDeadline?: string;
  author?: string;
  autoAssign?: boolean;
}

export interface UpdateTicketInput {
  id: string;
  status?: TicketStatus;
  assignedEngineerId?: string;
  statePlannerId?: string;
}

export interface CreateTicketHistoryInput {
  ticketId: string;
  status?: string;
  remarks?: string;
  author?: string;
}

export interface CreateAttachmentInput {
  ticketId: string;
  type: "ir_report" | "site_image";
  fileUrl: string;
  author?: string;
}

export interface TicketValidation {
  id: string;
  ticketId: string;
  validatedBy: string;
  role: string;
  remarks?: string | null;
  notes?: string | null;
  validatedAt?: string;
}

export interface UploadTicketAttachmentInput {
  ticketId: string;
  file: File;
  type: "ir_report" | "site_image";
  author?: string;
}

export interface ReplacementRequest {
  id: string;
  ticketId: string;
  ticketNumber?: string;
  engineerId: string;
  engineerName?: string;
  deviceType: string;
  reason: string;
  status: "pending" | "approved" | "dispatched" | "replaced" | "rejected";
  poNumber?: string;
  requestedAt: string;
  updatedAt?: string;
}

export interface CreateTicketCategoryInput {
  name: string;
  defaultPayout?: number;
  author?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const result = await restRequest<Ticket>('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  invalidate('tickets');
  return result;
}

export async function updateTicket(input: UpdateTicketInput): Promise<Ticket> {
  const { id, status, assignedEngineerId, statePlannerId } = input;

  if (status) {
    return updateTicketStatus(id, status);
  }

  return assignTicketRequest(id, {
    engineerId: assignedEngineerId,
    statePlannerId,
  });
}

export async function createTicketHistory(input: CreateTicketHistoryInput): Promise<TicketHistory> {
  const { ticketId, ...body } = input;
  return restRequest<TicketHistory>(`/api/tickets/${ticketId}/history`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createAttachment(input: CreateAttachmentInput): Promise<Attachment> {
  const result = await restRequest<Attachment>(`/api/tickets/${input.ticketId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({
      fileUrl: input.fileUrl,
      type: input.type,
      ...(input.author ? { author: input.author } : {}),
    }),
  });
  invalidate('tickets');
  return result;
}

export async function createTicketCategory(
  input: CreateTicketCategoryInput,
): Promise<TicketCategory> {
  return restRequest<TicketCategory>('/api/ticket-categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface EscalateTicketInput {
  id: string;
  escalationLevel: ApiEscalateTicketInput['level'];
  reason?: string;
  engineerId?: string;
}

export async function escalateTicket(input: EscalateTicketInput): Promise<Ticket> {
  return escalateTicketRequest(input.id, {
    level: input.escalationLevel,
    reason: input.reason ?? `Support requested: ${input.escalationLevel}`,
    engineerId: input.engineerId,
  });
}

export async function validateTicket(
  ticketId: string,
  remarks?: string,
): Promise<TicketValidation> {
  const result = await restRequest<TicketValidation>(`/api/tickets/${ticketId}/validate`, {
    method: "POST",
    body: JSON.stringify(remarks?.trim() ? { remarks: remarks.trim() } : {}),
  });
  invalidate("tickets");
  return result;
}

export async function uploadTicketAttachment(
  input: UploadTicketAttachmentInput,
): Promise<{ fileUrl: string }> {
  const uploadedFileId = await uploadFile(input.file);
  const uploadedFileUrl = fileUrl(uploadedFileId);
  const created = await createAttachment({
    ticketId: input.ticketId,
    fileUrl: uploadedFileUrl,
    type: input.type,
    author: input.author,
  });
  return { fileUrl: created.fileUrl ?? uploadedFileUrl };
}

export async function requestReplacement(ticketId: string): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(
    `/api/tickets/${ticketId}/replacement-request`,
    { method: "POST" },
  );
  invalidate("tickets");
  return result;
}

export async function deleteTicket(ticketId: string): Promise<void> {
  await restRequest<void>(`/api/tickets/${ticketId}`, { method: "DELETE" });
  invalidate("tickets");
}

import { invalidate } from '$lib/stores/query';
import { restRequest, ApiError } from '$lib/api/rest';
import type { Ticket } from '$lib/modules/data/tickets/queries';
import type { TicketStatus } from '$lib/config/roles';
import { uploadFile, fileUrl } from '$lib/api/upload';

export type TicketEscalationLevel = 'L1' | 'L2' | 'L3';

export interface AssignTicketInput {
  engineerId?: string;
  statePlannerId?: string;
}

export interface EscalateTicketInput {
  level: TicketEscalationLevel;
  reason: string;
  engineerId?: string;
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
  type: 'ir_report' | 'site_image';
  author?: string;
}

export interface CreateTicketAttachmentInput {
  ticketId: string;
  fileUrl: string;
  type: 'ir_report' | 'site_image';
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  remarks?: string,
): Promise<Ticket> {
  const result = await restRequest<Ticket>(`/api/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      ...(remarks ? { remarks } : {}),
    }),
  });
  invalidate('tickets');
  return result;
}

export async function acceptTicket(ticketId: string): Promise<Ticket> {
  return updateTicketStatus(ticketId, 'accepted');
}

export async function declineTicket(
  ticketId: string,
  remarks?: string,
): Promise<Ticket> {
  const result = await restRequest<Ticket>(`/api/tickets/${ticketId}/decline`, {
    method: 'POST',
    body: JSON.stringify(remarks?.trim() ? { remarks: remarks.trim() } : {}),
  });
  invalidate('tickets');
  return result;
}

export async function assignTicket(
  ticketId: string,
  data: AssignTicketInput,
): Promise<Ticket> {
  const result = await restRequest<Ticket>(`/api/tickets/${ticketId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(data.engineerId ? { assignedEngineerId: data.engineerId } : {}),
      ...(data.statePlannerId ? { statePlannerId: data.statePlannerId } : {}),
    }),
  });
  invalidate('tickets');
  return result;
}

export async function escalateTicket(
  ticketId: string,
  data: EscalateTicketInput,
): Promise<Ticket> {
  const escalationLevel = data.level.toUpperCase();
  if (!['L1', 'L2', 'L3'].includes(escalationLevel)) {
    throw new Error('Invalid escalation level');
  }
  try {
    const result = await restRequest<Ticket>(`/api/tickets/${ticketId}/escalate`, {
      method: 'PATCH',
      body: JSON.stringify({
        escalationLevel,
        remarks: data.reason,
        ...(data.engineerId ? { engineerId: data.engineerId } : {}),
      }),
    });
    invalidate('tickets');
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      throw new Error('Invalid escalation level');
    }
    throw err;
  }
}

export async function validateTicket(
  ticketId: string,
  remarks?: string,
): Promise<TicketValidation> {
  const result = await restRequest<TicketValidation>(`/api/tickets/${ticketId}/validate`, {
    method: 'POST',
    body: JSON.stringify(remarks?.trim() ? { remarks: remarks.trim() } : {}),
  });
  invalidate('tickets');
  return result;
}

export async function createAttachment(
  ticketId: string,
  fileUrl: string,
  type: 'ir_report' | 'site_image',
): Promise<{ fileUrl?: string }> {
  const result = await restRequest<{ fileUrl?: string }>(`/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ fileUrl, type }),
  });
  invalidate('tickets');
  return result;
}

export async function uploadTicketAttachment(
  input: UploadTicketAttachmentInput,
): Promise<{ fileUrl: string }> {
  const uploadedFileId = await uploadFile(input.file);
  const uploadedFileUrl = fileUrl(uploadedFileId);
  const created = await createAttachment(input.ticketId, uploadedFileUrl, input.type);
  return { fileUrl: created.fileUrl ?? uploadedFileUrl };
}

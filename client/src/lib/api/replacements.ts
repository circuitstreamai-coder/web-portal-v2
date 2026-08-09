import { restRequest } from '$lib/api/rest';
import { invalidate } from '$lib/stores/query';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReplacementRequest {
  id: string;
  ticketId: string;
  ticketNumber?: string;
  engineerId: string;
  engineerName?: string;
  deviceType: string;
  reason: string;
  status: 'pending' | 'approved' | 'dispatched' | 'replaced' | 'rejected';
  poNumber?: string;
  requestedAt: string;
  updatedAt?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function requestReplacement(ticketId: string): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(
    `/api/tickets/${ticketId}/replacement-request`,
    { method: 'POST' },
  );
  invalidate('tickets');
  return result;
}

export async function fetchTicketReplacement(
  ticketId: string,
): Promise<ReplacementRequest | null> {
  try {
    return await restRequest<ReplacementRequest>(`/api/tickets/${ticketId}/replacement`);
  } catch {
    return null;
  }
}

export async function fetchReplacements(
  status?: string,
): Promise<ReplacementRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return restRequest<ReplacementRequest[]>(`/api/replacements${qs}`);
}

export async function approveReplacement(
  id: string,
): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(`/api/replacements/${id}/approve`, {
    method: 'POST',
  });
  invalidate('tickets');
  return result;
}

export async function dispatchReplacement(id: string): Promise<ReplacementRequest> {
  return restRequest<ReplacementRequest>(`/api/replacements/${id}/dispatch`, {
    method: 'PATCH',
  });
}

export async function rejectReplacement(id: string): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(`/api/replacements/${id}/reject`, {
    method: 'POST',
  });
  invalidate('tickets');
  return result;
}

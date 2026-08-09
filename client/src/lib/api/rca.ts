import { ApiError, restRequest } from '$lib/api/rest';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RcaRecord {
  id: string;
  ticketId: string;
  rootCause: string;
  actionTaken: string;
  preventionMeasure?: string;
  documentedBy: string;
  documentedByName?: string;
  documentedAt: string;
}

export interface RcaInput {
  rootCause: string;
  actionTaken: string;
  preventionMeasure?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function fetchRca(ticketId: string): Promise<RcaRecord | null> {
  try {
    return await restRequest<RcaRecord>(`/api/tickets/${ticketId}/rca`);
  } catch (err) {
    if (err instanceof ApiError && [404, 204].includes(err.status)) return null;
    throw err;
  }
}

export async function submitRca(
  ticketId: string,
  input: RcaInput,
): Promise<RcaRecord> {
  return restRequest<RcaRecord>(`/api/tickets/${ticketId}/rca`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRca(
  ticketId: string,
  input: RcaInput,
): Promise<RcaRecord> {
  return restRequest<RcaRecord>(`/api/tickets/${ticketId}/rca`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

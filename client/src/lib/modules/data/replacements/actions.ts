import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";

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

export async function approveReplacement(id: string): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(`/api/replacements/${id}/approve`, {
    method: "POST",
  });
  invalidate("tickets");
  return result;
}

export async function rejectReplacement(id: string): Promise<ReplacementRequest> {
  const result = await restRequest<ReplacementRequest>(`/api/replacements/${id}/reject`, {
    method: "POST",
  });
  invalidate("tickets");
  return result;
}

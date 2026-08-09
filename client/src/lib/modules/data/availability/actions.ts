import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";
import type { AvailabilitySlot } from "./queries";

// ── Input Types ─────────────────────────────────────────────────────────────

export interface CreateAvailabilityInput {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  notes?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function createAvailabilitySlot(
  input: CreateAvailabilityInput,
): Promise<AvailabilitySlot> {
  const result = await restRequest<AvailabilitySlot>('/api/availability', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  invalidate('availability');
  return result;
}

export async function deleteAvailabilitySlot(id: string): Promise<void> {
  await restRequest<void>(`/api/availability/${id}`, { method: 'DELETE' });
  invalidate('availability');
}

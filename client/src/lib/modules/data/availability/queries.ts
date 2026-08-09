import { restRequest } from "$lib/api/rest";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  id: string;
  engineerId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  notes: string | null;
  createdAt: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

/** Fetches the current engineer's own upcoming availability slots. */
export async function fetchAvailability(): Promise<AvailabilitySlot[]> {
  return restRequest<AvailabilitySlot[]>('/api/availability');
}

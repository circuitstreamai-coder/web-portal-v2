export interface CreateAvailabilityBody {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  notes?: string;
}

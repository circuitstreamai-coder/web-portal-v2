//src/modules/ticket/ticket.schema.ts
export interface CreateTicketBody {
  projectId: string;
  categoryId: string;
  title: string;
  description?: string;
  priority?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  slaDeadline?: string;
  author?: string;
  /**
   * Super-admin only. When true (default), the ticket is auto-assigned to an
   * engineer via round-robin immediately after creation. When false, the ticket
   * stays in "open" status and must be assigned manually.
   * Ignored for all other roles — auto-assign always runs.
   */
  autoAssign?: boolean;
}

export interface AssignTicketBody {
  assignedEngineerId?: string;
  statePlannerId?: string;
}

export interface UpdateTicketStatusBody {
  status: string;
  remarks?: string;
}

export interface ValidateTicketBody {
  remarks?: string;
}

export interface CreateTicketHistoryBody {
  status?: string;
  remarks?: string;
}

export interface CreateAttachmentBody {
  fileUrl: string;
  type: "ir_report" | "site_image";
}

export const VALID_ESCALATION_LEVELS = ["L1", "L2", "L3"] as const;
export type EscalationLevel = (typeof VALID_ESCALATION_LEVELS)[number];

export interface EscalateTicketBody {
  escalationLevel: EscalationLevel;
  remarks?: string;
}

export interface DeclineTicketBody {
  remarks?: string;
}

// ── Status definitions ────────────────────────────────────────────────────────

export const VALID_STATUSES = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "on_hold",
  "resolved",
  "pending_validation",
  "closed",
  "reopened",
] as const;

export type TicketStatus = (typeof VALID_STATUSES)[number];

/**
 * Valid forward/back transitions for each status.
 * The assign endpoint handles open → assigned separately.
 * The decline endpoint handles assigned/accepted → open separately (it also
 * clears assignedEngineerId, which a plain status PATCH cannot do).
 */
export const STATUS_TRANSITIONS: Record<string, readonly TicketStatus[]> = {
  open: [],
  assigned: ["accepted", "in_progress", "open", "on_hold"],
  accepted: ["in_progress", "open", "on_hold"],
  in_progress: ["resolved", "on_hold"],
  on_hold: ["in_progress", "assigned", "accepted"],
  resolved: ["pending_validation"],
  pending_validation: ["closed", "in_progress"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress"],
};

/**
 * Which statuses each role may request via PATCH /tickets/:id/status.
 * super_admin can request any valid status (transitions still enforced).
 * customer cannot update status at all.
 */
export const ROLE_ALLOWED_STATUSES: Record<string, readonly TicketStatus[]> = {
  super_admin: [...VALID_STATUSES],
  national_head: [...VALID_STATUSES],
  engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  l2_engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  l3_engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  noc: ["pending_validation", "closed", "in_progress"],
  project_head: ["pending_validation", "closed", "in_progress"],
  state_planner: ["pending_validation", "in_progress"],
  customer: [],
};

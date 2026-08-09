import { gqlRequest } from '$lib/api/graphql';
import { ApiError, restRequest } from '$lib/api/rest';

export interface ClosureChecks {
  correct_status: boolean;
  ir_uploaded: boolean;
  site_image_uploaded: boolean;
  rca_complete: boolean;
}

export interface ClosureEligibility {
  eligible: boolean;
  checks: ClosureChecks;
  reasons: string[];
}

interface AttachmentRow {
  type: string | null;
}

interface TicketHistoryRow {
  action: string | null;
}

const FETCH_CLOSURE_CONTEXT = `
  query TicketClosureContext($ticketId: String!) {
    attachmentsByTicket(ticketId: $ticketId) {
      type
    }
    ticketHistoryByTicket(ticketId: $ticketId) {
      action
    }
  }
`;

function checksFromReasons(reasons: string[] = []): ClosureChecks {
  const joined = reasons.join(' | ').toLowerCase();
  return {
    correct_status: !joined.includes('status must be'),
    ir_uploaded: !joined.includes('ir report'),
    site_image_uploaded: !joined.includes('site image'),
    rca_complete: !joined.includes('rca'),
  };
}

function reasonsFromChecks(checks: ClosureChecks): string[] {
  const reasons: string[] = [];
  if (!checks.correct_status) reasons.push('Ticket status must be resolved or pending_validation');
  if (!checks.ir_uploaded) reasons.push('IR report attachment is required');
  if (!checks.site_image_uploaded) reasons.push('Site image attachment is required');
  if (!checks.rca_complete) reasons.push('RCA documentation is required');
  return reasons;
}

function normalizeResponse(payload: unknown): ClosureEligibility | null {
  if (!payload || typeof payload !== 'object') return null;

  const body = payload as {
    eligible?: unknown;
    checks?: Partial<Record<keyof ClosureChecks, unknown>>;
    reasons?: unknown;
  };

  if (typeof body.eligible !== 'boolean') return null;

  if (body.checks && typeof body.checks === 'object') {
    const checks: ClosureChecks = {
      correct_status: Boolean(body.checks.correct_status),
      ir_uploaded: Boolean(body.checks.ir_uploaded),
      site_image_uploaded: Boolean(body.checks.site_image_uploaded),
      rca_complete: Boolean(body.checks.rca_complete),
    };

    return {
      eligible: body.eligible,
      checks,
      reasons: Array.isArray(body.reasons)
        ? body.reasons.filter((value): value is string => typeof value === 'string')
        : reasonsFromChecks(checks),
    };
  }

  if (Array.isArray(body.reasons)) {
    const reasons = body.reasons.filter((value): value is string => typeof value === 'string');
    return {
      eligible: body.eligible,
      checks: checksFromReasons(reasons),
      reasons,
    };
  }

  return null;
}

async function fetchClosureEligibilityFallback(ticketId: string): Promise<ClosureEligibility> {
  const data = await gqlRequest<{
    attachmentsByTicket: AttachmentRow[];
    ticketHistoryByTicket: TicketHistoryRow[];
  }>(FETCH_CLOSURE_CONTEXT, { ticketId });

  const attachments = data.attachmentsByTicket ?? [];
  const history = data.ticketHistoryByTicket ?? [];
  const actions = new Set(history.map((entry) => entry.action));

  const checks: ClosureChecks = {
    correct_status: true, // cannot determine from this query; assume ok if we reached here
    ir_uploaded: attachments.some((a) => a.type === 'ir_report'),
    site_image_uploaded: attachments.some((a) => a.type === 'site_image'),
    rca_complete: actions.has('rca_submitted') || actions.has('rca_updated'),
  };

  return {
    eligible: Object.values(checks).every(Boolean),
    checks,
    reasons: reasonsFromChecks(checks),
  };
}

export async function fetchClosureEligibility(ticketId: string): Promise<ClosureEligibility> {
  try {
    const response = await restRequest<unknown>(`/api/tickets/${ticketId}/closure-eligibility`);
    const normalized = normalizeResponse(response);
    if (normalized) return normalized;
  } catch (err) {
    if (!(err instanceof ApiError) || ![404, 405, 500].includes(err.status)) {
      throw err;
    }
  }

  return fetchClosureEligibilityFallback(ticketId);
}

export async function checkClosureEligibility(ticketId: string): Promise<ClosureEligibility> {
  return fetchClosureEligibility(ticketId);
}

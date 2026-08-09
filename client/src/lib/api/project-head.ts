import { gqlRequest } from '$lib/api/graphql';
import { restRequest } from '$lib/api/rest';
import { invalidate } from '$lib/stores/query';
import {
  fetchTickets,
  fetchUsersByRole,
  type Attachment,
  type Ticket,
  type TicketHistory,
  type User,
} from '$lib/modules/data/tickets/queries';
import { fetchEngineerProfiles, type EngineerProfile } from '$lib/modules/data/engineers/queries';
import { fetchCustomers, type Customer } from '$lib/modules/data/customers/queries';

export interface ProjectHeadProject {
  id: string;
  name: string;
  customerId: string;
  projectHeadId?: string | null;
  author?: string | null;
  createdAt: string;
  customerName?: string | null;
  projectHeadName?: string | null;
}

export interface ProjectHeadSummary {
  totalTickets: number;
  openTickets: number;
  slaAtRisk: number;
  resolvedThisWeek: number;
}

export interface ProjectHeadCustomerRow {
  id: string;
  companyName: string;
  email: string;
  phone: string;
  status: string;
  projectNames: string[];
}

export interface ProjectHeadPlannerRow {
  id: string;
  name: string;
  email: string;
  ticketCount: number;
}

export interface ProjectHeadEngineerRow {
  id: string;
  name: string;
  email: string;
  state: string;
  ticketCount: number;
}

export interface ProjectHeadEngineerGroup {
  state: string;
  engineers: ProjectHeadEngineerRow[];
}

export interface ProjectHeadTeam {
  planners: ProjectHeadPlannerRow[];
  engineersByState: ProjectHeadEngineerGroup[];
}

export interface ProjectHeadSlaData {
  compliancePercent: number;
  monitoredTickets: number;
  atRiskTickets: Ticket[];
  breachedTickets: Ticket[];
}

export interface TicketResolutionContext {
  attachments: Attachment[];
  history: TicketHistory[];
}

export interface TicketValidationRecord {
  id: string;
  ticketId: string;
  validatedBy: string;
  role: string;
  remarks?: string | null;
  notes?: string | null;
  validatedAt: string;
}

const FETCH_ALL_TICKET_HISTORY = `
  query {
    ticketHistory {
      id ticketId status remarks author createdAt
    }
  }
`;

const FETCH_TICKET_RESOLUTION_CONTEXT = `
  query TicketResolutionContext($ticketId: String!) {
    attachmentsByTicket(ticketId: $ticketId) {
      id ticketId type fileUrl uploadedAt author createdAt
    }
    ticketHistoryByTicket(ticketId: $ticketId) {
      id ticketId status remarks author createdAt
    }
  }
`;

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isResolvedStatus(status: string | null | undefined): boolean {
  const value = normalizeStatus(status);
  return value === 'resolved' || value === 'closed';
}

function isOpenStatus(status: string | null | undefined): boolean {
  return !isResolvedStatus(status);
}

function isWithinNextDay(date: string | null | undefined): boolean {
  if (!date) return false;
  const deadline = new Date(date).getTime();
  const now = Date.now();
  return deadline > now && deadline - now <= 24 * 60 * 60 * 1000;
}

function isBreached(date: string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date).getTime() < Date.now();
}

function filterTicketsForProjects(
  tickets: Ticket[],
  projects: ProjectHeadProject[],
): Ticket[] {
  const projectIds = new Set(projects.map((project) => project.id));
  return tickets.filter((ticket) => projectIds.has(ticket.projectId));
}

function latestResolutionTimestamp(
  ticketId: string,
  history: TicketHistory[],
): number | null {
  const matches = history
    .filter((entry) => entry.ticketId === ticketId && isResolvedStatus(entry.status))
    .map((entry) => new Date(entry.createdAt).getTime())
    .filter((value) => Number.isFinite(value));

  if (matches.length === 0) return null;
  return Math.max(...matches);
}

export async function fetchProjectHeadProjects(): Promise<ProjectHeadProject[]> {
  return restRequest<ProjectHeadProject[]>('/api/projects');
}

export async function fetchProjectHeadTickets(): Promise<Ticket[]> {
  const [projects, tickets] = await Promise.all([
    fetchProjectHeadProjects(),
    fetchTickets(),
  ]);

  return filterTicketsForProjects(tickets, projects);
}

export async function fetchProjectHeadTicketHistory(): Promise<TicketHistory[]> {
  const data = await gqlRequest<{ ticketHistory: TicketHistory[] }>(FETCH_ALL_TICKET_HISTORY);
  return data.ticketHistory;
}

export async function fetchProjectHeadDashboardData(): Promise<{
  projects: ProjectHeadProject[];
  tickets: Ticket[];
  summary: ProjectHeadSummary;
  atRiskTickets: Ticket[];
}> {
  const [projects, allTickets, history] = await Promise.all([
    fetchProjectHeadProjects(),
    fetchTickets(),
    fetchProjectHeadTicketHistory().catch(() => [] as TicketHistory[]),
  ]);

  const tickets = filterTicketsForProjects(allTickets, projects);
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const resolvedThisWeek = new Set(
    history
      .filter(
        (entry) =>
          isResolvedStatus(entry.status) &&
          new Date(entry.createdAt).getTime() >= oneWeekAgo,
      )
      .map((entry) => entry.ticketId)
      .filter((ticketId) => tickets.some((ticket) => ticket.id === ticketId)),
  );

  const atRiskTickets = tickets.filter(
    (ticket) => isOpenStatus(ticket.status) && isWithinNextDay(ticket.slaDeadline),
  );

  return {
    projects,
    tickets,
    summary: {
      totalTickets: tickets.length,
      openTickets: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
      slaAtRisk: atRiskTickets.length,
      resolvedThisWeek: resolvedThisWeek.size,
    },
    atRiskTickets,
  };
}

export async function fetchProjectHeadTeam(): Promise<{
  projects: ProjectHeadProject[];
  tickets: Ticket[];
  team: ProjectHeadTeam;
}> {
  const [projects, allTickets, planners, engineers] = await Promise.all([
    fetchProjectHeadProjects(),
    fetchTickets(),
    fetchUsersByRole('state_planner').catch(() => [] as User[]),
    fetchEngineerProfiles().catch(() => [] as EngineerProfile[]),
  ]);

  const tickets = filterTicketsForProjects(allTickets, projects);

  const plannerIds = new Set(tickets.map((ticket) => ticket.statePlannerId).filter(Boolean));
  const plannersInScope = planners
    .filter((planner) => plannerIds.has(planner.id))
    .map((planner) => ({
      id: planner.id,
      name: planner.name ?? planner.id,
      email: planner.email ?? '—',
      ticketCount: tickets.filter((ticket) => ticket.statePlannerId === planner.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const engineerIds = new Set(
    tickets.flatMap((ticket) => [ticket.assignedEngineerId]).filter(Boolean),
  );
  const engineersInScope = engineers
    .filter((engineer) => engineerIds.has(engineer.userId) || engineerIds.has(engineer.id))
    .map((engineer) => {
      const id = engineer.userId || engineer.id;
      return {
        id,
        name: engineer.userName ?? engineer.referenceId ?? id,
        email: engineer.userEmail ?? '—',
        state: engineer.assignedState ?? engineer.addressState ?? 'Unassigned',
        ticketCount: tickets.filter(
          (ticket) => ticket.assignedEngineerId === engineer.userId || ticket.assignedEngineerId === engineer.id,
        ).length,
      };
    });

  const groups = new Map<string, ProjectHeadEngineerRow[]>();
  for (const engineer of engineersInScope) {
    const list = groups.get(engineer.state) ?? [];
    list.push(engineer);
    groups.set(engineer.state, list);
  }

  const engineersByState = Array.from(groups.entries())
    .map(([state, rows]) => ({
      state,
      engineers: rows.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));

  return {
    projects,
    tickets,
    team: {
      planners: plannersInScope,
      engineersByState,
    },
  };
}

export async function fetchProjectHeadCustomers(): Promise<{
  projects: ProjectHeadProject[];
  customers: ProjectHeadCustomerRow[];
}> {
  const projects = await fetchProjectHeadProjects();
  let customers: Customer[] = [];

  try {
    customers = await fetchCustomers();
  } catch {
    customers = [];
  }

  const grouped = new Map<string, ProjectHeadCustomerRow>();
  for (const project of projects) {
    const existing = grouped.get(project.customerId);
    const customer = customers.find((row) => row.id === project.customerId);

    if (existing) {
      existing.projectNames.push(project.name);
      continue;
    }

    grouped.set(project.customerId, {
      id: project.customerId,
      companyName: customer?.companyName ?? project.customerName ?? project.customerId,
      email: customer?.email ?? '—',
      phone: customer?.phone ?? '—',
      status: customer?.status ?? 'active',
      projectNames: [project.name],
    });
  }

  return {
    projects,
    customers: Array.from(grouped.values()).sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    ),
  };
}

export async function fetchProjectHeadSlaData(): Promise<{
  projects: ProjectHeadProject[];
  tickets: Ticket[];
  sla: ProjectHeadSlaData;
}> {
  const [projects, tickets, history] = await Promise.all([
    fetchProjectHeadProjects(),
    fetchProjectHeadTickets(),
    fetchProjectHeadTicketHistory().catch(() => [] as TicketHistory[]),
  ]);

  const monitoredTickets = tickets.filter((ticket) => !!ticket.slaDeadline);
  const atRiskTickets = monitoredTickets.filter(
    (ticket) => isOpenStatus(ticket.status) && isWithinNextDay(ticket.slaDeadline),
  );
  const breachedTickets = monitoredTickets.filter(
    (ticket) => isOpenStatus(ticket.status) && isBreached(ticket.slaDeadline),
  );

  const compliantTickets = monitoredTickets.filter((ticket) => {
    const deadline = ticket.slaDeadline ? new Date(ticket.slaDeadline).getTime() : null;
    if (!deadline) return false;

    const resolvedAt = latestResolutionTimestamp(ticket.id, history);
    if (resolvedAt !== null) return resolvedAt <= deadline;
    return deadline >= Date.now();
  }).length;

  const compliancePercent = monitoredTickets.length
    ? Math.round((compliantTickets / monitoredTickets.length) * 100)
    : 100;

  return {
    projects,
    tickets,
    sla: {
      compliancePercent,
      monitoredTickets: monitoredTickets.length,
      atRiskTickets,
      breachedTickets,
    },
  };
}

export async function fetchTicketResolutionContext(
  ticketId: string,
): Promise<TicketResolutionContext> {
  const data = await gqlRequest<{
    attachmentsByTicket: Attachment[];
    ticketHistoryByTicket: TicketHistory[];
  }>(FETCH_TICKET_RESOLUTION_CONTEXT, { ticketId });

  return {
    attachments: data.attachmentsByTicket ?? [],
    history: data.ticketHistoryByTicket ?? [],
  };
}

export async function validateProjectHeadTicket(
  ticketId: string,
  remarks?: string,
): Promise<TicketValidationRecord> {
  const result = await restRequest<TicketValidationRecord>(`/api/tickets/${ticketId}/validate`, {
    method: 'POST',
    body: JSON.stringify(remarks?.trim() ? { remarks: remarks.trim() } : {}),
  });

  invalidate('tickets');
  return result;
}

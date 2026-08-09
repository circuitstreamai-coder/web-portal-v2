// Central role configuration — import from here, never hardcode role strings.

// ── Types ──────────────────────────────────────────────────────────────────

export type Role =
  | 'super_admin'
  | 'national_head'
  | 'customer'
  | 'engineer'
  | 'l2_engineer'
  | 'l3_engineer'
  | 'noc'
  | 'state_planner'
  | 'project_head'
  | 'vendor';

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'on_hold'
  | 'pending_replacement'
  | 'escalated_l2'
  | 'escalated_l3'
  | 'pending_validation'
  | 'resolved'
  | 'closed'
  | 'reopened';

export type CustomerStatus = 'pending' | 'active' | 'rejected' | 'inactive';

export type EngineerDocStatus = 'pending' | 'approved' | 'rejected' | 'reupload';

// ── Display labels ─────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  super_admin:  'Super Admin',
  national_head:'National Head',
  engineer:     'Engineer (L1)',
  l2_engineer:  'Engineer (L2)',
  l3_engineer:  'Engineer (L3)',
  customer:     'Customer',
  noc:          'NOC',
  state_planner:'State Planner',
  project_head: 'Project Head',
  vendor:       'Vendor Support',
};

export const ROLE_BADGE_COLORS: Record<Role, string> = {
  super_admin:  'bg-[#0B182A] text-white',
  national_head:'bg-slate-700 text-white',
  engineer:     'bg-blue-700 text-white',
  l2_engineer:  'bg-blue-500 text-white',
  l3_engineer:  'bg-blue-400 text-white',
  customer:     'bg-emerald-700 text-white',
  noc:          'bg-purple-700 text-white',
  state_planner:'bg-amber-600 text-white',
  project_head: 'bg-rose-700 text-white',
  vendor:       'bg-teal-600 text-white',
};

// ── Routing ────────────────────────────────────────────────────────────────

export const ROLE_REDIRECTS: Record<Role, string> = {
  super_admin:  '/admin',
  national_head:'/national-head/dashboard',
  engineer:     '/engineer',
  l2_engineer:  '/engineer',
  l3_engineer:  '/engineer',
  customer:     '/customer',
  noc:          '/noc',
  state_planner:'/planner',
  project_head: '/project-head/dashboard',
  vendor:       '/vendor',
};

export const ALL_TICKET_STATUSES: TicketStatus[] = [
  'open',
  'assigned',
  'accepted',
  'in_progress',
  'on_hold',
  'pending_replacement',
  'escalated_l2',
  'escalated_l3',
  'resolved',
  'pending_validation',
  'closed',
  'reopened',
];

// ── Ticket status options per role ─────────────────────────────────────────
// Controls which statuses are visible in TicketForm dropdowns.

export const ROLE_STATUS_OPTIONS: Record<Role, TicketStatus[]> = {
  super_admin:  ['open', 'assigned', 'accepted', 'in_progress', 'on_hold', 'resolved', 'pending_validation', 'closed', 'reopened'],
  national_head:['open', 'assigned', 'accepted', 'in_progress', 'on_hold', 'resolved', 'pending_validation', 'closed', 'reopened'],
  state_planner:['assigned'],
  noc:          ['open', 'assigned', 'pending_validation', 'closed'],
  project_head: ['pending_validation', 'closed'],
  engineer:     ['accepted', 'in_progress', 'resolved'],
  l2_engineer:  ['accepted', 'in_progress', 'resolved'],
  l3_engineer:  ['accepted', 'in_progress', 'resolved'],
  customer:     ['open'],
  vendor:       ['in_progress', 'resolved'],
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open:               'Open',
  assigned:           'Assigned',
  accepted:           'Accepted',
  in_progress:        'In Progress',
  on_hold:            'On Hold',
  pending_replacement:'Pending Replacement',
  escalated_l2:       'Escalated L2',
  escalated_l3:       'Escalated L3',
  pending_validation: 'Pending Validation',
  resolved:           'Resolved',
  closed:             'Closed',
  reopened:           'Reopened',
};

// ── Customer status options ────────────────────────────────────────────────

export const CUSTOMER_STATUS_OPTIONS: CustomerStatus[] = [
  'pending', 'active', 'rejected', 'inactive',
];

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  pending:  'Pending',
  active:   'Active',
  rejected: 'Rejected',
  inactive: 'Inactive',
};

// ── Engineer document status options ───────────────────────────────────────

export const ENGINEER_DOC_STATUS_OPTIONS: EngineerDocStatus[] = [
  'pending', 'approved', 'rejected', 'reupload',
];

export const ENGINEER_DOC_STATUS_LABELS: Record<EngineerDocStatus, string> = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  reupload: 'Re-upload Required',
};

// ── Permissions ────────────────────────────────────────────────────────────

export interface RolePermissions {
  canApproveCustomers:  boolean;
  canApproveEngineers:  boolean;
  canCreateTickets:     boolean;
  canAssignEngineers:   boolean;
  canViewAllTickets:    boolean;
  canManageProjects:    boolean;
  canViewReports:       boolean;
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  super_admin: {
    canApproveCustomers: true,
    canApproveEngineers: true,
    canCreateTickets:    true,
    canAssignEngineers:  true,
    canViewAllTickets:   true,
    canManageProjects:   true,
    canViewReports:      true,
  },
  national_head: {
    canApproveCustomers: true,
    canApproveEngineers: true,
    canCreateTickets:    true,
    canAssignEngineers:  true,
    canViewAllTickets:   true,
    canManageProjects:   true,
    canViewReports:      true,
  },
  noc: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    true,
    canAssignEngineers:  true,
    canViewAllTickets:   true,
    canManageProjects:   false,
    canViewReports:      true,
  },
  state_planner: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    true,
    canAssignEngineers:  true,
    canViewAllTickets:   true,
    canManageProjects:   false,
    canViewReports:      true,
  },
  project_head: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    true,
    canAssignEngineers:  false,
    canViewAllTickets:   true,
    canManageProjects:   true,
    canViewReports:      true,
  },
  engineer: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    false,
    canAssignEngineers:  false,
    canViewAllTickets:   false,
    canManageProjects:   false,
    canViewReports:      false,
  },
  l2_engineer: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    false,
    canAssignEngineers:  false,
    canViewAllTickets:   false,
    canManageProjects:   false,
    canViewReports:      false,
  },
  l3_engineer: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    false,
    canAssignEngineers:  false,
    canViewAllTickets:   false,
    canManageProjects:   false,
    canViewReports:      false,
  },
  customer: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    true,
    canAssignEngineers:  false,
    canViewAllTickets:   false,
    canManageProjects:   false,
    canViewReports:      false,
  },
  vendor: {
    canApproveCustomers: false,
    canApproveEngineers: false,
    canCreateTickets:    false,
    canAssignEngineers:  false,
    canViewAllTickets:   false,
    canManageProjects:   false,
    canViewReports:      false,
  },
};

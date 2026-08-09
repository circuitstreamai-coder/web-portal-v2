import type { UserRole } from "../modules/auth/auth.schema.js";

/**
 * Centralized role permission map.
 * Use this as the single source of truth for what each role may do.
 * Route-level guards (onlyStaff, onlySuperAdmin…) live in authMiddleware and
 * reference the UserRole type; high-level feature permissions live here.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  super_admin: ["*"],
  engineer: [
    "view_assigned_tickets",
    "update_ticket_status",
    "view_own_profile",
  ],
  l2_engineer: [
    "view_assigned_tickets",
    "update_ticket_status",
    "view_own_profile",
  ],
  l3_engineer: [
    "view_assigned_tickets",
    "update_ticket_status",
    "view_own_profile",
  ],
  noc: [
    "view_all_tickets",
    "update_ticket_status",
    "close_ticket",
    "assign_ticket",
    "view_customers",
    "view_engineer_profiles",
  ],
  state_planner: [
    "view_all_tickets",
    "update_ticket_status",
    "assign_ticket",
  ],
  project_head: [
    "view_assigned_projects",
    "view_all_tickets",
    "update_ticket_status",
    "assign_ticket",
    "view_engineer_profiles",
  ],
  customer: [
    "view_own_tickets",
    "create_ticket",
    "view_own_customers",
    "view_own_projects",
  ],
  national_head: [
    "view_all_tickets",
    "update_ticket_status",
    "assign_ticket",
    "close_ticket",
    "view_customers",
    "view_engineer_profiles",
  ],
  asset_manager: [
    "create_inventory",
    "update_inventory",
    "view_inventory",
    "manage_inventory_maintenance",
    "manage_external_deployments",
    "view_inventory_audit",
  ],
};

/** Roles that may perform staff operations (assign, escalate, close tickets). */
export const STAFF_ROLES: readonly UserRole[] = [
  "super_admin",
  "noc",
  "state_planner",
  "project_head",
  "national_head",
];

/** Returns true when a role has the given permission (or the wildcard "*"). */
export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes("*") || perms.includes(permission);
}

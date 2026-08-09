import { and, eq } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  customers,
  engineerProfiles,
  projects,
  roles,
  tickets,
  userRoles,
  users,
} from "../../db/schema/index.js";

export interface AdminDashboardSummary {
  totalTickets: number;
  activeEngineers: number;
  openProjects: number;
  customers: number;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  generatedAt: string;
}

export async function getAdminDashboardData(): Promise<AdminDashboardResponse> {
  const [allTickets, allProjects, allCustomers, activeEngineerRows] =
    await Promise.all([
      db.select({ id: tickets.id }).from(tickets).where(eq(tickets.deleted, false)),
      db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.deleted, false)),
      db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.deleted, false)),
      db
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          userRoles,
          and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)),
        )
        .innerJoin(
          roles,
          and(eq(roles.id, userRoles.roleId), eq(roles.deleted, false)),
        )
        .innerJoin(
          engineerProfiles,
          and(
            eq(engineerProfiles.userId, users.id),
            eq(engineerProfiles.deleted, false),
          ),
        )
        .where(
          and(
            eq(users.deleted, false),
            eq(users.status, "active"),
            eq(roles.name, "engineer"),
          ),
        ),
    ]);

  return {
    summary: {
      totalTickets: allTickets.length,
      activeEngineers: activeEngineerRows.length,
      openProjects: allProjects.length,
      customers: allCustomers.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

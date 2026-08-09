import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { projects, customers } from "../../db/schema/index.js";
import type { CreateProjectBody, UpdateProjectBody } from "./project.schema.js";

export async function createProject(data: CreateProjectBody) {
  if (!data.customerId) {
    throw { statusCode: 400, message: "customerId is required" };
  }
  if (!data.name) {
    throw { statusCode: 400, message: "name is required" };
  }

  const [project] = await db.insert(projects).values(data).returning();
  return project;
}

export async function listProjects(role: string, userId: string) {
  if (role === "super_admin") {
    return db.select().from(projects).where(eq(projects.deleted, false));
  }

  if (role === "customer") {
    // return projects for customers linked to this user
    return db
      .select({
        id: projects.id,
        customerId: projects.customerId,
        projectHeadId: projects.projectHeadId,
        name: projects.name,
        author: projects.author,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .innerJoin(customers, eq(projects.customerId, customers.id))
      .where(
        and(
          eq(customers.userId, userId),
          eq(projects.deleted, false),
          eq(customers.deleted, false),
        ),
      );
  }

  if (role === "project_head") {
    return db
      .select()
      .from(projects)
      .where(
        and(eq(projects.projectHeadId, userId), eq(projects.deleted, false)),
      );
  }

  if (["noc", "national_head", "state_planner", "engineer"].includes(role)) {
    return db.select().from(projects).where(eq(projects.deleted, false));
  }

  return [];
}

export async function updateProject(id: string, data: UpdateProjectBody) {
  const updates: Record<string, unknown> = {};
  if (data.name) updates.name = data.name;
  if (data.projectHeadId) updates.projectHeadId = data.projectHeadId;

  if (Object.keys(updates).length === 0) {
    throw { statusCode: 400, message: "No fields to update" };
  }

  const [project] = await db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, id), eq(projects.deleted, false)))
    .returning();

  if (!project) {
    throw { statusCode: 404, message: "Project not found" };
  }

  return project;
}

export async function assignProjectHead(
  id: string,
  projectHeadId: string,
) {
  if (!projectHeadId) {
    throw { statusCode: 400, message: "projectHeadId is required" };
  }

  const [project] = await db
    .update(projects)
    .set({ projectHeadId })
    .where(and(eq(projects.id, id), eq(projects.deleted, false)))
    .returning();

  if (!project) {
    throw { statusCode: 404, message: "Project not found" };
  }

  return project;
}

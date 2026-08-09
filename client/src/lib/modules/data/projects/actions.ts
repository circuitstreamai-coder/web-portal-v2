import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";
import type { Project } from "./queries";

// ── Input Types ─────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  customerId: string;
  name: string;
  projectHeadId?: string;
  author?: string;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  projectHeadId?: string | null;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const result = await restRequest<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  invalidate('projects');
  return result;
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const { id, ...body } = input;
  const result = await restRequest<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  invalidate('projects');
  return result;
}

export async function deleteProject(id: string): Promise<void> {
  await restRequest<void>(`/api/projects/${id}`, { method: 'DELETE' });
  invalidate('projects');
}

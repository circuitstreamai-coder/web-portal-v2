import { gqlRequest } from "$lib/api/graphql";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  customerId: string;
  projectHeadId?: string | null;
  name: string;
  createdAt?: string;
}

// ── Queries ────────────────────────────────────────────────────────────────

const FETCH_PROJECTS = `
  query {
    projects {
      id customerId projectHeadId name
    }
  }
`;

// ── Functions ──────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const data = await gqlRequest<{ projects: Project[] }>(FETCH_PROJECTS);
  return data.projects;
}

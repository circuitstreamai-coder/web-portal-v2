// ARCHITECTURE NOTE
// -----------------
// Rule: GraphQL → queries only; REST → actions only.
// createRole / createUserRole are write operations (violations of the rule).
// They remain as GraphQL mutations because the backend has no REST endpoints
// for role management yet. Migrate once the backend exposes REST routes.

import { gqlRequest } from "./graphql";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CreateRoleInput {
  name: string;
  author?: string;
}

export interface Role {
  id: string;
  name: string;
  author: string;
  createdAt: string;
}

export interface CreateUserRoleInput {
  userId: string;
  roleId: string;
  author?: string;
  state?: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  author: string;
  state?: string;
  createdAt: string;
}

// ── Queries ────────────────────────────────────────────────────────────────

const FETCH_ROLES = `
  query {
    roles {
      id name author createdAt
    }
  }
`;

const FETCH_USER_ROLES = `
  query {
    userRoles {
      userId roleId author state createdAt
    }
  }
`;

export async function fetchRoles(): Promise<Role[]> {
  const data = await gqlRequest<{ roles: Role[] }>(FETCH_ROLES);
  return data.roles;
}

export async function fetchUserRoles(): Promise<UserRole[]> {
  const data = await gqlRequest<{ userRoles: UserRole[] }>(FETCH_USER_ROLES);
  return data.userRoles;
}

// ── Mutations ──────────────────────────────────────────────────────────────

const CREATE_ROLE = `
  mutation CreateRole($input: CreateRoleInput!) {
    createRole(input: $input) {
      id name author createdAt
    }
  }
`;

const CREATE_USER_ROLE = `
  mutation CreateUserRole($input: CreateUserRoleInput!) {
    createUserRole(input: $input) {
      userId roleId author state createdAt
    }
  }
`;

// ── Functions ──────────────────────────────────────────────────────────────

export async function createRole(input: CreateRoleInput): Promise<Role> {
  const data = await gqlRequest<{ createRole: Role }>(CREATE_ROLE, { input });
  return data.createRole;
}

export async function createUserRole(input: CreateUserRoleInput): Promise<UserRole> {
  const data = await gqlRequest<{ createUserRole: UserRole }>(CREATE_USER_ROLE, { input });
  return data.createUserRole;
}

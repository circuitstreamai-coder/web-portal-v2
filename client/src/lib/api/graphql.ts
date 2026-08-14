import { portalRoleHeaders } from "$lib/utils/portal-session";

interface GqlResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("/graphql", {
    method: "POST",
    credentials: "include",
    headers: portalRoleHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json: GqlResponse<T> = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}

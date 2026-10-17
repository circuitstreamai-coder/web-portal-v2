import { portalRoleHeaders } from "$lib/utils/portal-session";
import {
  isSupabaseConfigured,
  supabaseAuthHeaders,
  supabaseFunctionUrl,
} from "$lib/supabase/client";

interface GqlResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let headers: HeadersInit = portalRoleHeaders({ "Content-Type": "application/json" });
  let endpoint = "/graphql";
  if (isSupabaseConfigured()) {
    headers = await supabaseAuthHeaders(headers);
    endpoint = supabaseFunctionUrl("graphql");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers,
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

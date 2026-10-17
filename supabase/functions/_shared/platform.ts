import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type PortalAuth = {
  authUserId: string;
  user: Record<string, unknown> & { id: string; email?: string; status?: string };
  role: string;
  roles: string[];
  state: string | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function corsHeaders(request: Request): Record<string, string> {
  const configured = (Deno.env.get("FRONTEND_URL") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = configured.includes(origin) || origin.startsWith("http://localhost:")
    ? origin
    : configured[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-portal-role",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function json(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

export function fail(request: Request, status: number, message: string): Response {
  return json(request, { message }, status);
}

export function edgePath(request: Request, functionName: string): string {
  const pathname = new URL(request.url).pathname;
  const marker = `/functions/v1/${functionName}`;
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex >= 0) return pathname.slice(markerIndex + marker.length) || "/";
  return pathname;
}

export async function authenticate(request: Request): Promise<PortalAuth> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw { status: 401, message: "Authentication required" };

  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) {
    throw { status: 401, message: "Invalid or expired session" };
  }

  const { data: portalUser, error: userError } = await service
    .schema("portal")
    .from("users")
    .select("*")
    .eq("auth_user_id", authData.user.id)
    .eq("deleted", false)
    .maybeSingle();
  if (userError || !portalUser) {
    throw { status: 403, message: "Portal profile is not linked to this account" };
  }
  if (!["active", "approved"].includes(String(portalUser.status ?? ""))) {
    throw { status: 403, message: "Account is not active" };
  }

  const { data: assignments, error: roleError } = await service
    .schema("portal")
    .from("user_roles")
    .select("role_id,state")
    .eq("user_id", portalUser.id)
    .eq("deleted", false);
  if (roleError) throw { status: 500, message: roleError.message };

  const roleIds = (assignments ?? []).map((row) => row.role_id).filter(Boolean);
  const { data: roleRows, error: rolesError } = roleIds.length
    ? await service.schema("portal").from("roles").select("id,name").in("id", roleIds).eq("deleted", false)
    : { data: [], error: null };
  if (rolesError) throw { status: 500, message: rolesError.message };

  const roles = (roleRows ?? []).map((row) => row.name);
  const requestedRole = request.headers.get("x-portal-role")?.trim();
  const role = requestedRole && roles.includes(requestedRole) ? requestedRole : roles[0];
  if (!role) throw { status: 403, message: "No active portal role is assigned" };

  const roleRow = (roleRows ?? []).find((row) => row.name === role);
  const assignment = (assignments ?? []).find((row) => row.role_id === roleRow?.id);

  return {
    authUserId: authData.user.id,
    user: portalUser,
    role,
    roles,
    state: assignment?.state ?? null,
  };
}

export function requireRoles(auth: PortalAuth, allowed: string[]): void {
  if (!allowed.includes(auth.role)) {
    throw { status: 403, message: "Insufficient permissions" };
  }
}

export function camelKey(value: string): string {
  if (value === "assigned_state_planner_id") return "statePlannerId";
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function snakeKey(value: string): string {
  if (value === "statePlannerId") return "assigned_state_planner_id";
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => toCamel(item)) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        camelKey(key),
        toCamel(item),
      ]),
    ) as T;
  }
  return value as T;
}

export function toSnake(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [snakeKey(key), item]),
  );
}

export function newId(): string {
  return crypto.randomUUID();
}

export function ticketNumber(): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase();
  return `TKT-${date}-${suffix}`;
}

export async function requestBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function errorResponse(request: Request, error: unknown): Response {
  console.error(error);
  const candidate = error as { status?: number; statusCode?: number; message?: string };
  return fail(
    request,
    candidate.status ?? candidate.statusCode ?? 500,
    candidate.message ?? "Unexpected server error",
  );
}

export type DatabaseClient = SupabaseClient;

import { corsHeaders, errorResponse, fail, json, newId, service } from "../_shared/platform.ts";

function assertDb(error: { message: string } | null): void {
  if (error) throw { status: 500, message: error.message };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    if (request.method !== "POST") return fail(request, 405, "Method not allowed");
    const expected = Deno.env.get("BOOTSTRAP_SECRET") ?? "";
    if (!expected || request.headers.get("x-bootstrap-secret") !== expected) {
      return fail(request, 401, "Invalid bootstrap secret");
    }

    const { data: role, error: roleError } = await service.schema("portal").from("roles")
      .select("id").eq("name", "super_admin").eq("deleted", false).single();
    assertDb(roleError);
    const { count, error: countError } = await service.schema("portal").from("user_roles")
      .select("user_id", { count: "exact", head: true }).eq("role_id", role!.id).eq("deleted", false);
    assertDb(countError);
    if ((count ?? 0) > 0) return fail(request, 409, "A super administrator already exists");

    const body = await request.json() as { email?: string; password?: string; name?: string; phone?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(request, 400, "A valid email is required");
    if (!body.password || body.password.length < 12) return fail(request, 400, "Password must be at least 12 characters");

    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: { name: body.name ?? email.split("@")[0] },
      app_metadata: { role: "super_admin" },
    });
    if (authError || !authData.user) throw { status: 400, message: authError?.message ?? "Unable to create Auth user" };

    let { data: portalUser, error: portalError } = await service.schema("portal").from("users")
      .select("*").eq("auth_user_id", authData.user.id).maybeSingle();
    assertDb(portalError);
    if (!portalUser) {
      const result = await service.schema("portal").from("users").insert({
        id: newId(), auth_user_id: authData.user.id, name: body.name ?? email.split("@")[0],
        email, phone: body.phone ?? null, status: "active", author: "bootstrap",
      }).select("*").single();
      assertDb(result.error); portalUser = result.data;
    }
    const { data: assignment, error: lookupError } = await service.schema("portal").from("user_roles")
      .select("user_id").eq("user_id", portalUser!.id).eq("role_id", role!.id).eq("deleted", false).maybeSingle();
    assertDb(lookupError);
    if (!assignment) {
      const { error: assignmentError } = await service.schema("portal").from("user_roles").insert({
        user_id: portalUser!.id, role_id: role!.id, author: "bootstrap", deleted: false,
      });
      assertDb(assignmentError);
    }

    return json(request, { id: portalUser!.id, email, role: "super_admin" }, 201);
  } catch (error) {
    return errorResponse(request, error);
  }
});

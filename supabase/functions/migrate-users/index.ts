import { errorResponse, fail, json, service } from "../_shared/platform.ts";

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return fail(request, 405, "Method not allowed");
    const expected = Deno.env.get("BOOTSTRAP_SECRET") ?? "";
    if (!expected || request.headers.get("x-bootstrap-secret") !== expected) return fail(request, 401, "Invalid bootstrap secret");

    const frontend = (Deno.env.get("FRONTEND_URL") ?? "").split(",")[0].trim().replace(/\/$/, "");
    const { data: users, error } = await service.schema("portal").from("users")
      .select("id,email").is("auth_user_id", null).eq("deleted", false).in("status", ["active", "approved"]);
    if (error) throw { status: 500, message: error.message };
    const invited: string[] = [];
    const failed: Array<{ email: string; reason: string }> = [];
    for (const user of users ?? []) {
      if (!user.email) continue;
      const { data, error: inviteError } = await service.auth.admin.inviteUserByEmail(user.email, {
        data: { portal_user_id: user.id },
        ...(frontend ? { redirectTo: `${frontend}/reset-password` } : {}),
      });
      if (inviteError || !data.user) {
        failed.push({ email: user.email, reason: inviteError?.message ?? "Invite failed" });
        continue;
      }
      const { error: linkError } = await service.schema("portal").from("users")
        .update({ auth_user_id: data.user.id }).eq("id", user.id);
      if (linkError) failed.push({ email: user.email, reason: linkError.message });
      else invited.push(user.email);
    }
    return json(request, { invited, failed });
  } catch (error) {
    return errorResponse(request, error);
  }
});


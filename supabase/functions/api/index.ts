import {
  authenticate,
  corsHeaders,
  edgePath,
  errorResponse,
  fail,
  json,
  newId,
  requestBody,
  requireRoles,
  service,
  ticketNumber,
  toCamel,
  toSnake,
  type PortalAuth,
} from "../_shared/platform.ts";
import { digestOtp, issueVerificationProof, verifyVerificationProof } from "../_shared/verification.ts";

const STAFF_ROLES = ["super_admin", "national_head", "noc", "state_planner", "project_head"];
const ENGINEER_ROLES = ["engineer", "l2_engineer", "l3_engineer"];
const ASSIGN_ROLES = ["super_admin", "national_head", "noc", "state_planner"];
const ASSET_ROLES = ["super_admin", "asset_manager"];

const ROLE_ALLOWED_STATUSES: Record<string, string[]> = {
  super_admin: ["open", "assigned", "accepted", "in_progress", "on_hold", "resolved", "pending_validation", "closed", "reopened", "cancelled"],
  national_head: ["assigned", "in_progress", "on_hold", "pending_validation", "closed", "reopened"],
  noc: ["pending_validation", "closed", "in_progress"],
  project_head: ["pending_validation", "closed", "in_progress"],
  state_planner: ["assigned", "in_progress", "pending_validation"],
  engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  l2_engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  l3_engineer: ["accepted", "in_progress", "resolved", "pending_validation"],
  vendor: ["in_progress", "resolved"],
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "cancelled"],
  assigned: ["accepted", "open", "cancelled"],
  accepted: ["in_progress", "open"],
  in_progress: ["on_hold", "resolved"],
  on_hold: ["in_progress", "cancelled"],
  resolved: ["pending_validation", "in_progress", "closed"],
  pending_validation: ["closed", "in_progress"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress"],
};

function assertDb(error: { message: string } | null): void {
  if (error) throw { status: 500, message: error.message };
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function emailExists(email: string, flow: unknown, excludeEmail?: unknown): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (flow === "customer") {
    const { data, error } = await service.schema("ticket").from("customers")
      .select("email,secondary_contact_email").eq("deleted", false);
    assertDb(error);
    const excluded = typeof excludeEmail === "string" ? excludeEmail.trim().toLowerCase() : "";
    return (data ?? []).some((row) => {
      const primary = String(row.email ?? "").trim().toLowerCase();
      const secondary = String(row.secondary_contact_email ?? "").trim().toLowerCase();
      if (excluded && primary === excluded) return secondary === normalized;
      return primary === normalized || secondary === normalized;
    });
  }
  if (flow === "engineer") {
    const { data, error } = await service.schema("portal").from("users")
      .select("email").eq("deleted", false).ilike("email", normalized);
    assertDb(error);
    return Boolean(data?.length);
  }
  throw { status: 400, message: "Invalid flow" };
}

async function sendOtp(request: Request): Promise<Response> {
  const body = await requestBody(request);
  if (!validEmail(body.email) || !["customer", "engineer"].includes(String(body.flow))) {
    return fail(request, 400, "Invalid OTP request.");
  }
  const email = body.email.trim().toLowerCase();
  if (await emailExists(email, body.flow)) return fail(request, 409, "Email ID already exists.");

  const { data: previous, error: previousError } = await service.schema("portal")
    .from("email_otp_challenges").select("created_at").eq("email", email).maybeSingle();
  assertDb(previousError);
  if (previous && Date.now() - new Date(previous.created_at).getTime() < 30_000) {
    return fail(request, 429, "Please wait before requesting another OTP.");
  }

  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const otp = String(100000 + (random % 900000));
  const challenge = {
    email,
    otp_digest: await digestOtp(email, otp),
    flow: body.flow,
    attempts_remaining: 5,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_at: new Date().toISOString(),
  };
  const { error: saveError } = await service.schema("portal").from("email_otp_challenges")
    .upsert(challenge, { onConflict: "email" });
  assertDb(saveError);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("SMTP_FROM");
  if (!resendKey || !from) throw { status: 500, message: "Email provider is not configured" };
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Innoserve verification code",
      html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes.</p>`,
    }),
  });
  if (!delivery.ok) {
    await service.schema("portal").from("email_otp_challenges").delete().eq("email", email);
    throw { status: 502, message: "Failed to send OTP email. Please try again." };
  }
  return json(request, { message: "OTP sent." });
}

async function verifyOtp(request: Request): Promise<Response> {
  const body = await requestBody(request);
  if (!validEmail(body.email) || typeof body.otp !== "string") {
    return fail(request, 400, "Email and OTP are required.");
  }
  const email = body.email.trim().toLowerCase();
  const { data: challenge, error } = await service.schema("portal").from("email_otp_challenges")
    .select("*").eq("email", email).maybeSingle();
  assertDb(error);
  const valid = challenge && challenge.attempts_remaining > 0 &&
    new Date(challenge.expires_at).getTime() > Date.now() &&
    challenge.otp_digest === await digestOtp(email, body.otp);
  if (!valid) {
    if (challenge) {
      await service.schema("portal").from("email_otp_challenges")
        .update({ attempts_remaining: Math.max(0, challenge.attempts_remaining - 1) }).eq("email", email);
    }
    return fail(request, 400, "Invalid or expired OTP.");
  }
  await service.schema("portal").from("email_otp_challenges").delete().eq("email", email);
  return json(request, {
    message: "Verified.",
    verificationToken: await issueVerificationProof(email, challenge.flow),
  });
}

async function findTicket(id: string) {
  const { data, error } = await service.schema("ticket").from("tickets")
    .select("*").eq("id", id).eq("deleted", false).maybeSingle();
  assertDb(error);
  if (!data) throw { status: 404, message: "Ticket not found" };
  return data;
}

async function addHistory(
  ticketId: string,
  auth: PortalAuth,
  status: string,
  remarks?: string,
  action?: string,
) {
  const { error } = await service.schema("ticket").from("ticket_history").insert({
    id: newId(),
    ticket_id: ticketId,
    action: action ?? null,
    status,
    remarks: remarks ?? null,
    author_id: auth.user.id,
    author: auth.user.id,
  });
  assertDb(error);
}

async function scopedTickets(auth: PortalAuth) {
  let ids: string[] | null = null;
  if (ENGINEER_ROLES.includes(auth.role)) {
    const { data, error } = await service.schema("ticket").from("tickets")
      .select("*").eq("assigned_engineer_id", auth.user.id).eq("deleted", false);
    assertDb(error);
    return data ?? [];
  }
  if (auth.role === "vendor") {
    const { data, error } = await service.schema("ticket").from("tickets")
      .select("*").eq("deleted", false)
      .or(`assigned_engineer_id.eq.${auth.user.id},escalation_level.eq.L3`)
      .order("created_at", { ascending: false });
    assertDb(error);
    return data ?? [];
  }
  if (auth.role === "customer") {
    const { data: customers, error: customerError } = await service.schema("ticket").from("customers")
      .select("id").eq("user_id", auth.user.id).eq("deleted", false);
    assertDb(customerError);
    const customerIds = (customers ?? []).map((row) => row.id);
    if (!customerIds.length) return [];
    const { data: projects, error: projectError } = await service.schema("ticket").from("projects")
      .select("id").in("customer_id", customerIds).eq("deleted", false);
    assertDb(projectError);
    ids = (projects ?? []).map((row) => row.id);
  } else if (auth.role === "project_head") {
    const { data: projects, error } = await service.schema("ticket").from("projects")
      .select("id").eq("project_head_id", auth.user.id).eq("deleted", false);
    assertDb(error);
    ids = (projects ?? []).map((row) => row.id);
  } else if (!STAFF_ROLES.includes(auth.role)) {
    return [];
  }
  if (ids && !ids.length) return [];

  let query = service.schema("ticket").from("tickets").select("*").eq("deleted", false);
  if (ids) query = query.in("project_id", ids);
  if (auth.role === "noc" && auth.state) query = query.eq("state", auth.state);
  const { data, error } = await query.order("created_at", { ascending: false });
  assertDb(error);
  return data ?? [];
}

async function assertTicketAccess(auth: PortalAuth, ticketId: string): Promise<void> {
  if (!(await scopedTickets(auth)).some((ticket) => ticket.id === ticketId)) {
    throw { status: 403, message: "Ticket access denied" };
  }
}

async function autoAssignTicket(ticket: Record<string, unknown>): Promise<Record<string, unknown>> {
  const state = String(ticket.state ?? "").trim();
  if (!state) return ticket;
  const { data: profiles, error } = await service.schema("ticket").from("engineer_profiles")
    .select("user_id").ilike("assigned_state", state).eq("documents_status", "approved").eq("deleted", false);
  assertDb(error);
  const ids = (profiles ?? []).map((row) => row.user_id).filter(Boolean).sort();
  if (!ids.length) return ticket;
  const { data: active, error: activeError } = await service.schema("portal").from("users")
    .select("id").in("id", ids).eq("status", "active").eq("deleted", false);
  assertDb(activeError);
  const available = (active ?? []).map((row) => row.id).sort();
  if (!available.length) return ticket;
  const key = `engineer:${state.toLowerCase()}`;
  const { data: cursor, error: cursorError } = await service.schema("ticket").from("routing_state")
    .select("value").eq("key", key).maybeSingle();
  assertDb(cursorError);
  const lastIndex = cursor?.value ? available.indexOf(cursor.value) : -1;
  const selected = available[(lastIndex + 1) % available.length];
  const { data, error: updateError } = await service.schema("ticket").from("tickets")
    .update({ assigned_engineer_id: selected, status: "assigned", updated_at: new Date().toISOString() })
    .eq("id", ticket.id).select("*").single();
  assertDb(updateError);
  const { error: stateError } = await service.schema("ticket").from("routing_state")
    .upsert({ key, value: selected, updated_at: new Date().toISOString() });
  assertDb(stateError);
  return data!;
}

async function listUsers(role?: string, state?: string | null) {
  if (!role) {
    const { data, error } = await service.schema("portal").from("users")
      .select("id,name,email,phone,status,created_at").eq("deleted", false);
    assertDb(error);
    return data ?? [];
  }
  const { data: roles, error: roleError } = await service.schema("portal").from("roles")
    .select("id").eq("name", role).eq("deleted", false);
  assertDb(roleError);
  const roleIds = (roles ?? []).map((row) => row.id);
  if (!roleIds.length) return [];
  let assignmentQuery = service.schema("portal").from("user_roles")
    .select("user_id,state").in("role_id", roleIds).eq("deleted", false);
  if (state) assignmentQuery = assignmentQuery.eq("state", state);
  const { data: assignments, error: assignmentError } = await assignmentQuery;
  assertDb(assignmentError);
  const userIds = (assignments ?? []).map((row) => row.user_id);
  if (!userIds.length) return [];
  const { data, error } = await service.schema("portal").from("users")
    .select("id,name,email,phone,status,created_at").in("id", userIds).eq("deleted", false);
  assertDb(error);
  return (data ?? []).map((row) => ({
    ...row,
    role,
    state: (assignments ?? []).find((assignment) => assignment.user_id === row.id)?.state ?? null,
  }));
}

async function getRoleId(name: string): Promise<string> {
  const { data, error } = await service.schema("portal").from("roles")
    .select("id").eq("name", name).eq("deleted", false).maybeSingle();
  assertDb(error);
  if (!data) throw { status: 500, message: `${name} role is not configured` };
  return data.id;
}

async function userHasAnyRole(userId: string, names: string[]): Promise<boolean> {
  const { data: roles, error } = await service.schema("portal").from("roles")
    .select("id").in("name", names).eq("deleted", false);
  assertDb(error);
  const roleIds = (roles ?? []).map((role) => role.id);
  if (!roleIds.length) return false;
  const { data, error: assignmentError } = await service.schema("portal").from("user_roles")
    .select("user_id").eq("user_id", userId).in("role_id", roleIds).eq("deleted", false).limit(1).maybeSingle();
  assertDb(assignmentError); return Boolean(data);
}

async function provisionAuthUser(portalUser: Record<string, unknown>, role: string): Promise<void> {
  if (portalUser.auth_user_id) return;
  const email = String(portalUser.email ?? "").trim().toLowerCase();
  if (!email) throw { status: 400, message: "A login email is required" };
  const frontend = (Deno.env.get("FRONTEND_URL") ?? "").split(",")[0].trim().replace(/\/$/, "");
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: { portal_role: role, portal_user_id: portalUser.id },
    ...(frontend ? { redirectTo: `${frontend}/reset-password` } : {}),
  });
  if (error || !data.user) throw { status: 502, message: error?.message ?? "Unable to create Supabase Auth user" };
  const { error: linkError } = await service.schema("portal").from("users")
    .update({ auth_user_id: data.user.id, status: "active", approved_at: new Date().toISOString() })
    .eq("id", portalUser.id);
  assertDb(linkError);
}

async function createPortalUser(
  input: Record<string, unknown>,
  role: string,
  author: string,
  status = "active",
): Promise<Record<string, unknown>> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!validEmail(email)) throw { status: 400, message: "A valid email is required" };
  const { data: existing, error: existingError } = await service.schema("portal").from("users")
    .select("id").ilike("email", email).eq("deleted", false).maybeSingle();
  assertDb(existingError);
  if (existing) throw { status: 409, message: "Email is already in use" };
  const { data: user, error } = await service.schema("portal").from("users").insert({
    id: newId(), name: input.name ?? input.contactPersonName ?? input.fullName,
    email, phone: input.phone ?? null, status, author,
  }).select("*").single();
  assertDb(error);
  const { error: assignmentError } = await service.schema("portal").from("user_roles").insert({
    user_id: user!.id, role_id: await getRoleId(role), author,
  });
  assertDb(assignmentError);
  return user!;
}

async function payoutRows(auth: PortalAuth) {
  let query = service.schema("ticket").from("tickets").select("*")
    .eq("status", "closed").eq("deleted", false);
  if (ENGINEER_ROLES.includes(auth.role)) query = query.eq("assigned_engineer_id", auth.user.id);
  else requireRoles(auth, STAFF_ROLES);
  const { data: tickets, error } = await query.order("closed_at", { ascending: false });
  assertDb(error);
  const engineerIds = [...new Set((tickets ?? []).map((row) => row.assigned_engineer_id).filter(Boolean))];
  const categoryIds = [...new Set((tickets ?? []).map((row) => row.category_id).filter(Boolean))];
  const [{ data: engineers, error: engineerError }, { data: categories, error: categoryError }] = await Promise.all([
    engineerIds.length
      ? service.schema("portal").from("users").select("id,name").in("id", engineerIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? service.schema("ticket").from("ticket_categories").select("id,name").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  assertDb(engineerError); assertDb(categoryError);
  return (tickets ?? []).map((ticket) => ({
    id: ticket.id, ticketId: ticket.id, ticketNumber: ticket.ticket_number,
    engineerId: ticket.assigned_engineer_id ?? "",
    engineerName: engineers?.find((row) => row.id === ticket.assigned_engineer_id)?.name ?? null,
    callType: categories?.find((row) => row.id === ticket.category_id)?.name ?? "Uncategorised",
    payoutAmount: ticket.payout_amount ?? 0, amount: ticket.payout_amount ?? 0,
    currency: "INR", status: "credited", creditedAt: ticket.closed_at, createdAt: ticket.closed_at,
  }));
}

function replacementRecord(ticket: Record<string, unknown>) {
  return {
    id: ticket.id,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    engineerId: ticket.assigned_engineer_id ?? "",
    deviceType: ticket.title ?? "Replacement item",
    reason: ticket.description ?? "Replacement requested",
    status: ticket.replacement_status ?? "pending",
    requestedAt: ticket.updated_at ?? ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

async function handleUpload(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(request, 400, "No file provided");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowed.has(file.type)) return fail(request, 415, "Unsupported file type");
  if (file.size > 10 * 1024 * 1024) return fail(request, 413, "File exceeds 10 MB limit");

  let owner: string | null = null;
  try {
    owner = (await authenticate(request)).user.id;
  } catch {
    const proof = form.get("verificationToken");
    const email = form.get("email");
    const flow = form.get("flow");
    if (typeof email !== "string" || typeof flow !== "string" ||
      !await verifyVerificationProof(proof, email, flow)) {
      return fail(request, 401, "Authentication or a valid onboarding verification is required");
    }
  }
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin";
  const objectPath = `${owner ?? "onboarding"}/${newId()}.${extension}`;
  const { error: uploadError } = await service.storage.from("portal-files")
    .upload(objectPath, file, { contentType: file.type, upsert: false });
  assertDb(uploadError);
  const { data, error } = await service.schema("portal").from("storage_files").insert({
    object_path: objectPath,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    owner_user_id: owner,
  }).select("id").single();
  assertDb(error);
  return json(request, { fileId: data!.id }, 201);
}

async function handleFile(request: Request, fileId: string): Promise<Response> {
  const auth = await authenticate(request);
  const { data: file, error } = await service.schema("portal").from("storage_files")
    .select("object_path,owner_user_id").eq("id", fileId).eq("deleted", false).maybeSingle();
  assertDb(error);
  if (!file) return fail(request, 404, "File not found");
  let allowed = file.owner_user_id === auth.user.id ||
    [...STAFF_ROLES, "asset_manager"].includes(auth.role);
  if (!allowed) {
    const reference = `/file/${fileId}`;
    if (ENGINEER_ROLES.includes(auth.role)) {
      const { data: profile, error: profileError } = await service.schema("ticket").from("engineer_profiles")
        .select("id").eq("user_id", auth.user.id).or([
          "profile_photo_url", "aadhaar_front_url", "aadhaar_back_url", "pan_card_url",
          "dl_front_url", "dl_back_url", "cancel_cheque_url",
        ].map((column) => `${column}.eq.${reference}`).join(",")).maybeSingle();
      assertDb(profileError); allowed = Boolean(profile);
    }
    if (!allowed) {
      const { data: attachment, error: attachmentError } = await service.schema("ticket").from("attachments")
        .select("ticket_id").eq("file_url", reference).eq("deleted", false).maybeSingle();
      assertDb(attachmentError);
      if (attachment) allowed = (await scopedTickets(auth)).some((ticket) => ticket.id === attachment.ticket_id);
    }
  }
  if (!allowed) return fail(request, 403, "You do not have access to this file");
  const { data, error: signedError } = await service.storage.from("portal-files")
    .createSignedUrl(file.object_path, 60);
  assertDb(signedError);
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders(request), Location: data!.signedUrl },
  });
}

async function route(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const path = edgePath(request, "api");

  if (path === "/upload" && request.method === "POST") return handleUpload(request);
  if (path === "/api/otp/send" && request.method === "POST") return sendOtp(request);
  if (path === "/api/otp/verify" && request.method === "POST") return verifyOtp(request);
  if (path === "/api/check-email" && request.method === "POST") {
    const body = await requestBody(request);
    if (!validEmail(body.email)) return json(request, { exists: false });
    return json(request, { exists: await emailExists(body.email, body.flow, body.excludeEmail) });
  }
  const fileMatch = path.match(/^\/file\/(\d+)$/);
  if (fileMatch && request.method === "GET") return handleFile(request, fileMatch[1]);

  const auth = await authenticate(request);

  if (path === "/api/auth/me" && request.method === "GET") {
    return json(request, toCamel({ ...auth.user, role: auth.role, roles: auth.roles }));
  }
  if (path === "/api/auth/logout" && request.method === "POST") return json(request, {}, 204);

  if (path === "/api/users" && request.method === "GET") {
    requireRoles(auth, [...STAFF_ROLES, ...ENGINEER_ROLES, "asset_manager"]);
    return json(request, toCamel(await listUsers(url.searchParams.get("role") ?? undefined, url.searchParams.get("stateId") || null)));
  }
  if (path === "/api/users/staff" && request.method === "POST") {
    requireRoles(auth, ["super_admin"]);
    const body = await requestBody(request);
    const role = String(body.role ?? "");
    if (!["noc", "state_planner", "project_head", "national_head", "asset_manager", "vendor"].includes(role)) {
      return fail(request, 400, "Invalid staff role");
    }
    const user = await createPortalUser(body, role, auth.user.id);
    if (body.state) {
      const { error } = await service.schema("portal").from("user_roles")
        .update({ state: body.state }).eq("user_id", user.id).eq("role_id", await getRoleId(role));
      assertDb(error);
    }
    await provisionAuthUser(user, role);
    return json(request, toCamel({ ...user, role, state: body.state ?? null }), 201);
  }
  if (path === "/api/users/me" && request.method === "PATCH") {
    let name: unknown;
    let email: unknown;
    let avatarFileId: number | null = null;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      name = form.get("name"); email = form.get("email");
      const avatar = form.get("avatar");
      if (avatar instanceof File) {
        if (!avatar.type.startsWith("image/") || avatar.size > 5 * 1024 * 1024) {
          return fail(request, 400, "Avatar must be an image smaller than 5 MB");
        }
        const extension = avatar.name.split(".").pop()?.toLowerCase() ?? "bin";
        const objectPath = `${auth.user.id}/avatar-${newId()}.${extension}`;
        const { error: uploadError } = await service.storage.from("portal-files")
          .upload(objectPath, avatar, { contentType: avatar.type });
        assertDb(uploadError);
        const { data: stored, error: storeError } = await service.schema("portal").from("storage_files").insert({
          object_path: objectPath, original_name: avatar.name, mime_type: avatar.type,
          size_bytes: avatar.size, owner_user_id: auth.user.id,
        }).select("id").single();
        assertDb(storeError); avatarFileId = stored!.id;
      }
    } else {
      const body = await requestBody(request); name = body.name; email = body.email;
    }
    if (!validEmail(email) || typeof name !== "string" || !name.trim()) return fail(request, 400, "Valid name and email are required");
    const normalizedEmail = email.trim().toLowerCase();
    const { data: duplicate, error: duplicateError } = await service.schema("portal").from("users")
      .select("id").ilike("email", normalizedEmail).neq("id", auth.user.id).eq("deleted", false).maybeSingle();
    assertDb(duplicateError); if (duplicate) return fail(request, 409, "Email already in use");
    const { error: authError } = await service.auth.admin.updateUserById(auth.authUserId, { email: normalizedEmail });
    if (authError) throw { status: 400, message: authError.message };
    const { data, error } = await service.schema("portal").from("users").update({
      name: name.trim(), email: normalizedEmail,
      ...(avatarFileId ? { avatar_file_id: avatarFileId } : {}), updated_at: new Date().toISOString(),
    }).eq("id", auth.user.id).select("*").single();
    assertDb(error);
    return json(request, { user: toCamel({ ...data, role: auth.role, roles: auth.roles }) });
  }

  if (path === "/api/tickets" && request.method === "GET") {
    return json(request, toCamel(await scopedTickets(auth)));
  }
  if (path === "/api/paginated/tickets" && request.method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 15)));
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
    let rows = await scopedTickets(auth);
    if (search) {
      rows = rows.filter((row) => [row.ticket_number, row.title, row.description, row.state, row.city, row.status]
        .some((value) => String(value ?? "").toLowerCase().includes(search)));
    }
    const total = rows.length;
    return json(request, {
      items: toCamel(rows.slice((page - 1) * limit, page * limit)),
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  if (path === "/api/tickets" && request.method === "POST") {
    requireRoles(auth, ["super_admin", "national_head", "noc", "state_planner", "project_head", "customer"]);
    const body = await requestBody(request);
    if (!body.projectId || !body.categoryId || !body.title) {
      return fail(request, 400, "projectId, categoryId, and title are required");
    }
    const { data: project, error: projectError } = await service.schema("ticket").from("projects")
      .select("id,customer_id,project_head_id").eq("id", body.projectId).eq("deleted", false).maybeSingle();
    assertDb(projectError);
    if (!project) return fail(request, 400, "Invalid projectId");
    if (auth.role === "customer") {
      const { data: customer, error: customerError } = await service.schema("ticket").from("customers")
        .select("id").eq("id", project.customer_id).eq("user_id", auth.user.id).eq("deleted", false).maybeSingle();
      assertDb(customerError); if (!customer) return fail(request, 403, "Invalid project access");
    }
    if (auth.role === "project_head" && project.project_head_id !== auth.user.id) return fail(request, 403, "Invalid project access");
    if (auth.role === "noc" && auth.state && String(body.state ?? "").toLowerCase() !== auth.state.toLowerCase()) {
      return fail(request, 403, "Ticket state is outside your assigned NOC state");
    }
    const { data: category, error: categoryError } = await service.schema("ticket")
      .from("ticket_categories").select("default_payout").eq("id", body.categoryId).eq("deleted", false).maybeSingle();
    assertDb(categoryError);
    if (!category) return fail(request, 400, "Invalid categoryId");
    const record: Record<string, unknown> = {
      ...toSnake(body),
      id: newId(),
      ticket_number: ticketNumber(),
      status: "open",
      payout_amount: category.default_payout,
      author: auth.user.id,
      deleted: false,
    };
    delete record.auto_assign;
    const { data, error } = await service.schema("ticket").from("tickets")
      .insert(record).select("*").single();
    assertDb(error);
    await addHistory(data!.id, auth, "open", "Ticket created", "created");
    const shouldAutoAssign = auth.role === "super_admin" ? body.autoAssign !== false : true;
    const created = shouldAutoAssign ? await autoAssignTicket(data!) : data!;
    if (created.status === "assigned") await addHistory(created.id, auth, "assigned", "Ticket auto-assigned", "assigned");
    return json(request, toCamel(created), 201);
  }

  const deleteTicketMatch = path.match(/^\/api\/tickets\/([^/]+)$/);
  if (deleteTicketMatch && request.method === "DELETE") {
    requireRoles(auth, ["super_admin"]);
    const { error } = await service.schema("ticket").from("tickets")
      .update({ deleted: true, updated_at: new Date().toISOString() }).eq("id", deleteTicketMatch[1]);
    assertDb(error);
    return json(request, {}, 204);
  }

  const assignMatch = path.match(/^\/api\/tickets\/([^/]+)\/assign$/);
  if (assignMatch && request.method === "PATCH") {
    requireRoles(auth, ASSIGN_ROLES);
    await assertTicketAccess(auth, assignMatch[1]);
    const current = await findTicket(assignMatch[1]);
    if (!["open", "assigned", "in_progress"].includes(current.status)) return fail(request, 400, `Cannot assign a ticket with status '${current.status}'`);
    const body = await requestBody(request);
    const engineerId = body.assignedEngineerId ?? body.engineerId;
    const plannerId = body.statePlannerId;
    if (!engineerId && !plannerId) return fail(request, 400, "Select at least one assignee");
    if (engineerId && !await userHasAnyRole(String(engineerId), ENGINEER_ROLES)) return fail(request, 400, "Selected engineer is invalid");
    if (plannerId && !await userHasAnyRole(String(plannerId), ["state_planner"])) return fail(request, 400, "Selected state planner is invalid");
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (engineerId) updates.assigned_engineer_id = engineerId;
    if (plannerId) updates.assigned_state_planner_id = plannerId;
    if (current.status === "open") updates.status = "assigned";
    const { data, error } = await service.schema("ticket").from("tickets")
      .update(updates).eq("id", assignMatch[1]).select("*").single();
    assertDb(error);
    await addHistory(data!.id, auth, data!.status, "Ticket assignment updated", current.assigned_engineer_id ? "reassigned" : "assigned");
    return json(request, toCamel(data));
  }

  const statusMatch = path.match(/^\/api\/tickets\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    await assertTicketAccess(auth, statusMatch[1]);
    const current = await findTicket(statusMatch[1]);
    const body = await requestBody(request);
    const next = String(body.status ?? "").toLowerCase().replaceAll(" ", "_");
    if (!(ROLE_ALLOWED_STATUSES[auth.role] ?? []).includes(next)) return fail(request, 403, `Role '${auth.role}' cannot set status '${next}'`);
    if (!(STATUS_TRANSITIONS[current.status] ?? []).includes(next)) return fail(request, 400, `Invalid transition: '${current.status}' → '${next}'`);
    if (ENGINEER_ROLES.includes(auth.role) && current.assigned_engineer_id !== auth.user.id) return fail(request, 403, "Not your ticket");
    if (next === "pending_validation") {
      const { count } = await service.schema("ticket").from("attachments")
        .select("id", { count: "exact", head: true }).eq("ticket_id", current.id).eq("deleted", false);
      if (!count) return fail(request, 400, "Proof required before validation");
    }
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: next, updated_at: now };
    if (next === "accepted" && !current.received_at) updates.received_at = now;
    if (next === "closed") updates.closed_at = now;
    const { data, error } = await service.schema("ticket").from("tickets")
      .update(updates).eq("id", current.id).select("*").single();
    assertDb(error);
    await addHistory(current.id, auth, next, body.remarks as string | undefined, "status_updated");
    return json(request, toCamel(data));
  }

  const declineMatch = path.match(/^\/api\/tickets\/([^/]+)\/decline$/);
  if (declineMatch && request.method === "POST") {
    requireRoles(auth, ENGINEER_ROLES);
    const current = await findTicket(declineMatch[1]);
    if (current.assigned_engineer_id !== auth.user.id) return fail(request, 403, "Not your ticket");
    const body = await requestBody(request);
    const { data, error } = await service.schema("ticket").from("tickets")
      .update({ status: "open", assigned_engineer_id: null, updated_at: new Date().toISOString() })
      .eq("id", current.id).select("*").single();
    assertDb(error);
    await addHistory(current.id, auth, "open", body.remarks as string | undefined, "declined");
    return json(request, toCamel(data));
  }

  const escalateMatch = path.match(/^\/api\/tickets\/([^/]+)\/escalate$/);
  if (escalateMatch && request.method === "PATCH") {
    requireRoles(auth, [...STAFF_ROLES, ...ENGINEER_ROLES]);
    await assertTicketAccess(auth, escalateMatch[1]);
    const body = await requestBody(request);
    const level = String(body.escalationLevel ?? body.level ?? "").toUpperCase();
    if (!["L1", "L2", "L3"].includes(level)) return fail(request, 400, "Invalid escalation level");
    const updates: Record<string, unknown> = { escalation_level: level, updated_at: new Date().toISOString() };
    if (body.engineerId) updates.assigned_engineer_id = body.engineerId;
    const { data, error } = await service.schema("ticket").from("tickets")
      .update(updates).eq("id", escalateMatch[1]).eq("deleted", false).select("*").single();
    assertDb(error);
    await addHistory(data!.id, auth, data!.status, (body.remarks ?? body.reason) as string | undefined, "escalated");
    return json(request, toCamel(data));
  }

  const historyMatch = path.match(/^\/api\/tickets\/([^/]+)\/history$/);
  if (historyMatch && request.method === "GET") {
    await assertTicketAccess(auth, historyMatch[1]);
    const { data, error } = await service.schema("ticket").from("ticket_history")
      .select("*").eq("ticket_id", historyMatch[1]).eq("deleted", false).order("created_at");
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (historyMatch && request.method === "POST") {
    await assertTicketAccess(auth, historyMatch[1]);
    const body = await requestBody(request);
    await addHistory(historyMatch[1], auth, String(body.status ?? ""), body.remarks as string | undefined, body.action as string | undefined);
    const { data, error } = await service.schema("ticket").from("ticket_history")
      .select("*").eq("ticket_id", historyMatch[1]).order("created_at", { ascending: false }).limit(1).single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }

  const attachmentMatch = path.match(/^\/api\/tickets\/([^/]+)\/attachments$/);
  if (attachmentMatch && request.method === "POST") {
    await assertTicketAccess(auth, attachmentMatch[1]);
    const body = await requestBody(request);
    const { data, error } = await service.schema("ticket").from("attachments").insert({
      id: newId(), ticket_id: attachmentMatch[1], type: body.type, file_url: body.fileUrl,
      uploaded_by: auth.user.id, author: body.author ?? auth.user.id,
    }).select("*").single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }

  const closureMatch = path.match(/^\/api\/tickets\/([^/]+)\/closure-eligibility$/);
  if (closureMatch && request.method === "GET") {
    await assertTicketAccess(auth, closureMatch[1]);
    const ticket = await findTicket(closureMatch[1]);
    const [{ data: attachments, error: attachmentError }, { data: rca, error: rcaError }] = await Promise.all([
      service.schema("ticket").from("attachments").select("type").eq("ticket_id", ticket.id).eq("deleted", false),
      service.schema("ticket").from("rcas").select("id").eq("ticket_id", ticket.id).eq("deleted", false).maybeSingle(),
    ]);
    assertDb(attachmentError); assertDb(rcaError);
    const types = new Set((attachments ?? []).map((item) => item.type));
    const checks = {
      correct_status: ["resolved", "pending_validation"].includes(ticket.status),
      ir_uploaded: types.has("ir_report"), site_image_uploaded: types.has("site_image"), rca_complete: Boolean(rca),
    };
    const reasons: string[] = [];
    if (!checks.correct_status) reasons.push("Ticket status must be resolved or pending_validation");
    if (!checks.ir_uploaded) reasons.push("IR report attachment is required");
    if (!checks.site_image_uploaded) reasons.push("Site image attachment is required");
    if (!checks.rca_complete) reasons.push("RCA documentation is required");
    return json(request, { eligible: reasons.length === 0, checks, reasons });
  }

  const validateMatch = path.match(/^\/api\/tickets\/([^/]+)\/validate$/);
  if (validateMatch && request.method === "POST") {
    requireRoles(auth, ["noc", "project_head"]);
    await assertTicketAccess(auth, validateMatch[1]);
    const ticket = await findTicket(validateMatch[1]);
    if (!["resolved", "pending_validation"].includes(ticket.status)) return fail(request, 400, "Ticket is not ready for validation");
    const body = await requestBody(request);
    const now = new Date().toISOString();
    const { error } = await service.schema("ticket").from("tickets")
      .update({ status: "closed", closed_at: now, updated_at: now }).eq("id", ticket.id);
    assertDb(error);
    await addHistory(ticket.id, auth, "closed", body.remarks as string | undefined, "validated");
    return json(request, { id: newId(), ticketId: ticket.id, validatedBy: auth.user.id, role: auth.role, remarks: body.remarks ?? null, validatedAt: now });
  }

  const rcaMatch = path.match(/^\/api\/tickets\/([^/]+)\/rca$/);
  if (rcaMatch && request.method === "GET") {
    await assertTicketAccess(auth, rcaMatch[1]);
    const { data, error } = await service.schema("ticket").from("rcas")
      .select("*").eq("ticket_id", rcaMatch[1]).eq("deleted", false).maybeSingle();
    assertDb(error);
    return data ? json(request, toCamel(data)) : json(request, {}, 204);
  }
  if (rcaMatch && ["POST", "PATCH"].includes(request.method)) {
    await assertTicketAccess(auth, rcaMatch[1]);
    const body = await requestBody(request);
    const record = {
      root_cause: body.rootCause, action_taken: body.actionTaken,
      prevention_measure: body.preventionMeasure ?? null, documented_by: auth.user.id,
      documented_by_name: auth.user.name ?? auth.user.email, updated_at: new Date().toISOString(),
    };
    const query = request.method === "POST"
      ? service.schema("ticket").from("rcas").insert({ ...record, id: newId(), ticket_id: rcaMatch[1] })
      : service.schema("ticket").from("rcas").update(record).eq("ticket_id", rcaMatch[1]).eq("deleted", false);
    const { data, error } = await query.select("*").single();
    assertDb(error);
    return json(request, toCamel(data), request.method === "POST" ? 201 : 200);
  }

  const replacementRequestMatch = path.match(/^\/api\/tickets\/([^/]+)\/replacement-request$/);
  if (replacementRequestMatch && request.method === "POST") {
    requireRoles(auth, ENGINEER_ROLES);
    await assertTicketAccess(auth, replacementRequestMatch[1]);
    const ticket = await findTicket(replacementRequestMatch[1]);
    const { data, error } = await service.schema("ticket").from("tickets")
      .update({ replacement_requested: true, replacement_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", ticket.id).select("*").single();
    assertDb(error);
    await addHistory(ticket.id, auth, ticket.status, "Replacement requested", "replacement_requested");
    return json(request, replacementRecord(data!));
  }

  const ticketReplacementMatch = path.match(/^\/api\/tickets\/([^/]+)\/replacement$/);
  if (ticketReplacementMatch && request.method === "GET") {
    await assertTicketAccess(auth, ticketReplacementMatch[1]);
    const ticket = await findTicket(ticketReplacementMatch[1]);
    if (!ticket.replacement_status) return fail(request, 404, "Replacement request not found");
    return json(request, replacementRecord(ticket));
  }

  if (["/api/replacements", "/api/replacements/my"].includes(path) && request.method === "GET") {
    const tickets = await scopedTickets(auth);
    let rows = tickets.filter((ticket) => ticket.replacement_status);
    const status = url.searchParams.get("status");
    if (status) rows = rows.filter((ticket) => ticket.replacement_status === status);
    return json(request, rows.map(replacementRecord));
  }

  const replacementActionMatch = path.match(/^\/api\/replacements\/([^/]+)\/(approve|reject|dispatch)$/);
  if (replacementActionMatch && ["POST", "PATCH"].includes(request.method)) {
    requireRoles(auth, replacementActionMatch[2] === "dispatch" ? ["noc", "super_admin"] : ["noc"]);
    const status = replacementActionMatch[2] === "approve" ? "approved" : replacementActionMatch[2] === "reject" ? "rejected" : "dispatched";
    const { data, error } = await service.schema("ticket").from("tickets")
      .update({ replacement_requested: false, replacement_status: status, updated_at: new Date().toISOString() })
      .eq("id", replacementActionMatch[1]).select("*").single();
    assertDb(error);
    await addHistory(data!.id, auth, data!.status, `Replacement ${status}`, `replacement_${status}`);
    return json(request, replacementRecord(data!));
  }

  if (path === "/api/projects" && request.method === "GET") {
    let query = service.schema("ticket").from("projects").select("*").eq("deleted", false);
    if (auth.role === "project_head") query = query.eq("project_head_id", auth.user.id);
    if (auth.role === "customer") {
      const { data: customer } = await service.schema("ticket").from("customers").select("id").eq("user_id", auth.user.id).eq("deleted", false).maybeSingle();
      if (!customer) return json(request, []);
      query = query.eq("customer_id", customer.id);
    } else if ([...ENGINEER_ROLES, "vendor"].includes(auth.role)) {
      const projectIds = [...new Set((await scopedTickets(auth)).map((ticket) => ticket.project_id).filter(Boolean))];
      if (!projectIds.length) return json(request, []);
      query = query.in("id", projectIds);
    } else if (!STAFF_ROLES.includes(auth.role)) {
      return json(request, []);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (path === "/api/projects" && request.method === "POST") {
    requireRoles(auth, ["super_admin", "national_head"]);
    const body = await requestBody(request);
    const { data, error } = await service.schema("ticket").from("projects")
      .insert({ ...toSnake(body), id: newId(), author: auth.user.id }).select("*").single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }
  const assignHeadMatch = path.match(/^\/api\/projects\/([^/]+)\/assign-head$/);
  if (assignHeadMatch && request.method === "PATCH") {
    requireRoles(auth, ["super_admin"]);
    const body = await requestBody(request);
    const { data, error } = await service.schema("ticket").from("projects")
      .update({ project_head_id: body.projectHeadId ?? null, updated_at: new Date().toISOString() })
      .eq("id", assignHeadMatch[1]).eq("deleted", false).select("*").single();
    assertDb(error); return json(request, toCamel(data));
  }
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && ["PATCH", "DELETE"].includes(request.method)) {
    requireRoles(auth, ["super_admin", "national_head"]);
    const updates = request.method === "DELETE" ? { deleted: true } : toSnake(await requestBody(request));
    const { data, error } = await service.schema("ticket").from("projects")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", projectMatch[1]).select("*").single();
    assertDb(error);
    return request.method === "DELETE" ? json(request, {}, 204) : json(request, toCamel(data));
  }

  if (path === "/api/customers" && request.method === "GET") {
    let query = service.schema("ticket").from("customers").select("*").eq("deleted", false);
    if (auth.role === "customer") query = query.eq("user_id", auth.user.id);
    else requireRoles(auth, [...STAFF_ROLES, ...ENGINEER_ROLES]);
    const { data, error } = await query.order("created_at", { ascending: false });
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (path === "/api/customers" && request.method === "POST") {
    requireRoles(auth, ["super_admin"]);
    const body = await requestBody(request);
    const user = await createPortalUser(body, "customer", auth.user.id);
    await provisionAuthUser(user, "customer");
    const referenceId = `CUST-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const { data, error } = await service.schema("ticket").from("customers").insert({
      ...toSnake(body), id: newId(), user_id: user.id, email: user.email,
      reference_id: referenceId, status: "active", approved_by: auth.user.id,
      approved_at: new Date().toISOString(), author: auth.user.id,
    }).select("*").single();
    assertDb(error);
    const { error: projectError } = await service.schema("ticket").from("projects").insert({
      id: newId(), customer_id: data!.id,
      name: `${String(body.companyName ?? "Customer").trim()} - General Support`, author: auth.user.id,
    });
    assertDb(projectError);
    return json(request, toCamel(data), 201);
  }
  const customerActionMatch = path.match(/^\/api\/customers\/([^/]+)\/(approve|reject|provision-access|status)$/);
  if (customerActionMatch && ["PATCH", "POST"].includes(request.method)) {
    requireRoles(auth, customerActionMatch[2] === "provision-access" || customerActionMatch[2] === "status"
      ? ["super_admin"] : ["super_admin", "national_head"]);
    const { data: customer, error } = await service.schema("ticket").from("customers")
      .select("*").eq("id", customerActionMatch[1]).eq("deleted", false).maybeSingle();
    assertDb(error);
    if (!customer) return fail(request, 404, "Customer not found");
    let user: Record<string, unknown> | null = null;
    if (customer.user_id) {
      const result = await service.schema("portal").from("users").select("*").eq("id", customer.user_id).maybeSingle();
      assertDb(result.error); user = result.data;
    }
    if (!user && customerActionMatch[2] === "provision-access") {
      user = await createPortalUser({
        email: customer.email, phone: customer.phone, name: customer.contact_person_name,
      }, "customer", auth.user.id);
    }
    const body = await requestBody(request);
    const status = customerActionMatch[2] === "reject" ? "rejected"
      : customerActionMatch[2] === "status" ? String(body.status ?? "") : "active";
    if (!status) return fail(request, 400, "status is required");
    if (user && status === "active") await provisionAuthUser(user, "customer");
    if (user) {
      const { error: userError } = await service.schema("portal").from("users")
        .update({ status: status === "active" ? "active" : status }).eq("id", user.id);
      assertDb(userError);
    }
    const { data, error: updateError } = await service.schema("ticket").from("customers").update({
      user_id: user?.id ?? customer.user_id, status, approved_by: auth.user.id,
      approved_at: status === "active" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", customer.id).select("*").single();
    assertDb(updateError);
    return json(request, toCamel(data));
  }
  const customerMatch = path.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && ["PATCH", "DELETE"].includes(request.method)) {
    requireRoles(auth, ["super_admin"]);
    const updates = request.method === "DELETE"
      ? { deleted: true, status: "inactive" }
      : toSnake(await requestBody(request));
    const { data, error } = await service.schema("ticket").from("customers")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", customerMatch[1])
      .eq("deleted", false).select("*").single();
    assertDb(error);
    if (request.method === "DELETE" && data?.user_id) {
      await service.schema("portal").from("users").update({ deleted: true, status: "inactive" }).eq("id", data.user_id);
    }
    return request.method === "DELETE" ? json(request, {}, 204) : json(request, toCamel(data));
  }

  const allowlistMatch = path.match(/^\/api\/customers\/([^/]+)\/email-allowlist$/);
  if (allowlistMatch && ["GET", "POST"].includes(request.method)) {
    requireRoles(auth, ["super_admin"]);
    if (request.method === "GET") {
      const { data, error } = await service.schema("ticket").from("email_allowlist")
        .select("*").eq("customer_id", allowlistMatch[1]).order("created_at");
      assertDb(error); return json(request, toCamel(data));
    }
    const body = await requestBody(request);
    if ((!body.domain && !body.email) || (body.domain && body.email)) return fail(request, 400, "Provide either domain or email");
    const { data, error } = await service.schema("ticket").from("email_allowlist").insert({
      id: newId(), customer_id: allowlistMatch[1], domain: body.domain ?? null,
      email: body.email ?? null, created_by: auth.user.id,
    }).select("*").single();
    assertDb(error); return json(request, toCamel(data), 201);
  }
  const allowlistEntryMatch = path.match(/^\/api\/customers\/([^/]+)\/email-allowlist\/([^/]+)$/);
  if (allowlistEntryMatch && request.method === "DELETE") {
    requireRoles(auth, ["super_admin"]);
    const { error } = await service.schema("ticket").from("email_allowlist").delete()
      .eq("id", allowlistEntryMatch[2]).eq("customer_id", allowlistEntryMatch[1]);
    assertDb(error); return json(request, { deleted: true });
  }
  const quotaMatch = path.match(/^\/api\/customers\/([^/]+)\/email-quota$/);
  if (quotaMatch && ["GET", "PATCH"].includes(request.method)) {
    requireRoles(auth, ["super_admin"]);
    const { data: existing, error } = await service.schema("ticket").from("email_quota_configs")
      .select("*").eq("customer_id", quotaMatch[1]).maybeSingle();
    assertDb(error);
    if (request.method === "GET") {
      return json(request, toCamel(existing ?? {
        customer_id: quotaMatch[1], monthly_cap: 500, daily_rate_limit_per_sender: 50,
        emails_this_month: 0, suspended: false,
      }));
    }
    const body = await requestBody(request);
    if (body.monthlyCap !== undefined && Number(body.monthlyCap) < 1) return fail(request, 400, "Monthly cap must be at least 1");
    if (body.dailyRateLimitPerSender !== undefined && Number(body.dailyRateLimitPerSender) < 1) return fail(request, 400, "Daily rate limit must be at least 1");
    const record = {
      monthly_cap: Number(body.monthlyCap ?? existing?.monthly_cap ?? 500),
      daily_rate_limit_per_sender: Number(body.dailyRateLimitPerSender ?? existing?.daily_rate_limit_per_sender ?? 50),
      updated_at: new Date().toISOString(),
    };
    const result = existing
      ? await service.schema("ticket").from("email_quota_configs").update(record).eq("id", existing.id).select("*").single()
      : await service.schema("ticket").from("email_quota_configs").insert({ ...record, id: newId(), customer_id: quotaMatch[1] }).select("*").single();
    assertDb(result.error); return json(request, toCamel(result.data));
  }
  const quotaResumeMatch = path.match(/^\/api\/customers\/([^/]+)\/email-quota\/resume$/);
  if (quotaResumeMatch && request.method === "POST") {
    requireRoles(auth, ["super_admin"]);
    const { data, error } = await service.schema("ticket").from("email_quota_configs").update({
      suspended: false, suspended_at: null, suspended_reason: null, updated_at: new Date().toISOString(),
    }).eq("customer_id", quotaResumeMatch[1]).select("*").single();
    assertDb(error); return json(request, toCamel(data));
  }

  if (path === "/api/engineer-profiles" && request.method === "GET") {
    let query = service.schema("ticket").from("engineer_profiles").select("*").eq("deleted", false);
    if (ENGINEER_ROLES.includes(auth.role)) query = query.eq("user_id", auth.user.id);
    else requireRoles(auth, STAFF_ROLES);
    const { data, error } = await query.order("created_at", { ascending: false });
    assertDb(error); return json(request, toCamel(data));
  }
  const engineerActionMatch = path.match(/^\/api\/engineer-profiles\/([^/]+)\/(documents-status|account-status)$/);
  if (engineerActionMatch && request.method === "PATCH") {
    requireRoles(auth, ["super_admin", "national_head"]);
    const body = await requestBody(request);
    const { data: profile, error } = await service.schema("ticket").from("engineer_profiles")
      .select("*").eq("id", engineerActionMatch[1]).eq("deleted", false).maybeSingle();
    assertDb(error); if (!profile) return fail(request, 404, "Engineer profile not found");
    if (engineerActionMatch[2] === "documents-status") {
      const status = String(body.documentsStatus ?? "");
      if (!["pending", "approved", "rejected", "reupload"].includes(status)) return fail(request, 400, "Invalid documentsStatus");
      if (status === "approved") {
        const required = [profile.aadhaar_front_url, profile.aadhaar_back_url, profile.pan_card_url, profile.dl_front_url, profile.dl_back_url, profile.cancel_cheque_url];
        if (!required.every(Boolean)) return fail(request, 400, "All required documents must be uploaded before approval");
      }
      const { data: user, error: userError } = await service.schema("portal").from("users").select("*").eq("id", profile.user_id).single();
      assertDb(userError);
      if (status === "approved") await provisionAuthUser(user!, "engineer");
      await service.schema("portal").from("users").update({ status: status === "approved" ? "active" : status === "rejected" ? "rejected" : "pending" }).eq("id", profile.user_id);
      const { data, error: updateError } = await service.schema("ticket").from("engineer_profiles")
        .update({ documents_status: status, updated_at: new Date().toISOString() }).eq("id", profile.id).select("*").single();
      assertDb(updateError); return json(request, toCamel(data));
    }
    const accountStatus = String(body.accountStatus ?? "");
    if (!["active", "suspended"].includes(accountStatus)) return fail(request, 400, "Invalid accountStatus");
    const { error: userError } = await service.schema("portal").from("users")
      .update({ status: accountStatus === "active" ? "active" : "inactive" }).eq("id", profile.user_id);
    assertDb(userError); return json(request, toCamel({ ...profile, account_status: accountStatus }));
  }
  const engineerMatch = path.match(/^\/api\/engineer-profiles\/([^/]+)$/);
  if (engineerMatch && ["GET", "PATCH", "DELETE"].includes(request.method)) {
    const { data: profile, error } = await service.schema("ticket").from("engineer_profiles")
      .select("*").eq("id", engineerMatch[1]).eq("deleted", false).maybeSingle();
    assertDb(error); if (!profile) return fail(request, 404, "Engineer profile not found");
    const own = profile.user_id === auth.user.id;
    if (!own && !["super_admin", "national_head", "noc", "state_planner", "project_head"].includes(auth.role)) {
      return fail(request, 403, "Insufficient permissions");
    }
    if (request.method === "GET") return json(request, toCamel(profile));
    if (request.method === "DELETE") {
      requireRoles(auth, ["super_admin", "national_head"]);
      await service.schema("ticket").from("engineer_profiles").update({ deleted: true }).eq("id", profile.id);
      await service.schema("portal").from("users").update({ deleted: true, status: "inactive" }).eq("id", profile.user_id);
      return json(request, {}, 204);
    }
    if (!own) requireRoles(auth, ["super_admin", "national_head"]);
    const body = await requestBody(request);
    const { userName, userPhone, ...profileBody } = body;
    if (userName !== undefined || userPhone !== undefined) {
      const { error: userError } = await service.schema("portal").from("users")
        .update({ ...(userName !== undefined ? { name: userName } : {}), ...(userPhone !== undefined ? { phone: userPhone } : {}) })
        .eq("id", profile.user_id);
      assertDb(userError);
    }
    const { data, error: updateError } = await service.schema("ticket").from("engineer_profiles")
      .update({ ...toSnake(profileBody), updated_at: new Date().toISOString() }).eq("id", profile.id).select("*").single();
    assertDb(updateError); return json(request, toCamel(data));
  }

  if (path === "/api/ticket-categories" && request.method === "GET") {
    const { data, error } = await service.schema("ticket").from("ticket_categories").select("*").eq("deleted", false);
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (path === "/api/ticket-categories" && request.method === "POST") {
    requireRoles(auth, ["super_admin"]);
    const { data, error } = await service.schema("ticket").from("ticket_categories")
      .insert({ ...toSnake(await requestBody(request)), id: newId(), author: auth.user.id }).select("*").single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }
  const categoryMatch = path.match(/^\/api\/ticket-categories\/([^/]+)$/);
  if (categoryMatch && ["PATCH", "DELETE"].includes(request.method)) {
    requireRoles(auth, ["super_admin"]);
    const updates = request.method === "DELETE" ? { deleted: true } : toSnake(await requestBody(request));
    const { data, error } = await service.schema("ticket").from("ticket_categories")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", categoryMatch[1]).select("*").single();
    assertDb(error);
    return request.method === "DELETE" ? json(request, {}, 204) : json(request, toCamel(data));
  }

  if (path === "/api/notifications" && request.method === "GET") {
    const { data, error } = await service.schema("portal").from("notifications").select("*")
      .eq("user_id", auth.user.id).eq("deleted", false).order("created_at", { ascending: false }).limit(100);
    assertDb(error);
    return json(request, toCamel(data));
  }
  const notificationReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notificationReadMatch && request.method === "PATCH") {
    const { error } = await service.schema("portal").from("notifications").update({ read: true })
      .eq("id", notificationReadMatch[1]).eq("user_id", auth.user.id);
    assertDb(error);
    return json(request, {}, 204);
  }
  if (path === "/api/notifications/read-all" && request.method === "PATCH") {
    const { error } = await service.schema("portal").from("notifications").update({ read: true })
      .eq("user_id", auth.user.id).eq("deleted", false);
    assertDb(error);
    return json(request, {}, 204);
  }

  if (path === "/api/availability" && request.method === "GET") {
    const { data, error } = await service.schema("ticket").from("engineer_availability").select("*")
      .eq("engineer_id", auth.user.id).eq("deleted", false).gte("date", new Date().toISOString().slice(0, 10)).order("date");
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (path === "/api/availability" && request.method === "POST") {
    requireRoles(auth, ENGINEER_ROLES);
    const { data, error } = await service.schema("ticket").from("engineer_availability")
      .insert({ ...toSnake(await requestBody(request)), id: newId(), engineer_id: auth.user.id }).select("*").single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }
  const availabilityMatch = path.match(/^\/api\/availability\/([^/]+)$/);
  if (availabilityMatch && request.method === "DELETE") {
    requireRoles(auth, ENGINEER_ROLES);
    const { error } = await service.schema("ticket").from("engineer_availability")
      .update({ deleted: true }).eq("id", availabilityMatch[1]).eq("engineer_id", auth.user.id);
    assertDb(error); return json(request, {}, 204);
  }

  if (path === "/api/inventory" && request.method === "GET") {
    const { data, error } = await service.schema("inventory").from("inventory_items").select("*").order("created_at", { ascending: false });
    assertDb(error);
    return json(request, toCamel(data));
  }
  if (path === "/api/inventory" && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("inventory_items")
      .insert({ ...toSnake(await requestBody(request)), id: newId() }).select("*").single();
    assertDb(error);
    return json(request, toCamel(data), 201);
  }
  const inventoryAddMatch = path.match(/^\/api\/inventory\/([^/]+)\/add$/);
  if (inventoryAddMatch && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    const quantity = Number(body.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) return fail(request, 400, "Quantity must be greater than 0");
    const { data, error } = await service.schema("inventory").rpc("add_stock", {
      p_item_id: inventoryAddMatch[1], p_quantity: quantity, p_user_id: auth.user.id,
      p_remarks: body.remarks ?? null,
    });
    assertDb(error); return json(request, toCamel(data));
  }
  const inventoryMatch = path.match(/^\/api\/inventory\/([^/]+)$/);
  if (inventoryMatch && request.method === "PATCH") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("inventory_items")
      .update({ ...toSnake(await requestBody(request)), updated_at: new Date().toISOString() })
      .eq("id", inventoryMatch[1]).select("*").single();
    assertDb(error); return json(request, toCamel(data));
  }

  if (path === "/api/inventory/purchase-orders" && request.method === "GET") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("purchase_orders")
      .select("*").eq("deleted", false).order("created_at", { ascending: false });
    assertDb(error); return json(request, toCamel(data));
  }
  if (path === "/api/inventory/purchase-orders" && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("purchase_orders").insert({
      ...toSnake(await requestBody(request)), id: newId(), created_by: auth.user.id,
    }).select("*").single();
    assertDb(error); return json(request, toCamel(data), 201);
  }
  const purchaseOrderMatch = path.match(/^\/api\/inventory\/purchase-orders\/([^/]+)$/);
  if (purchaseOrderMatch && ["PATCH", "DELETE"].includes(request.method)) {
    requireRoles(auth, ASSET_ROLES);
    const updates = request.method === "DELETE" ? { deleted: true } : toSnake(await requestBody(request));
    const { data, error } = await service.schema("inventory").from("purchase_orders")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", purchaseOrderMatch[1]).select("*").single();
    assertDb(error); return request.method === "DELETE" ? json(request, {}, 204) : json(request, toCamel(data));
  }

  if (path === "/api/inventory/config-records" && request.method === "GET") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("config_records")
      .select("*").eq("deleted", false).order("last_updated", { ascending: false });
    assertDb(error); return json(request, toCamel(data));
  }
  if (path === "/api/inventory/config-records" && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const { data, error } = await service.schema("inventory").from("config_records").insert({
      ...toSnake(await requestBody(request)), id: newId(), created_by: auth.user.id,
    }).select("*").single();
    assertDb(error); return json(request, toCamel(data), 201);
  }
  const configRecordMatch = path.match(/^\/api\/inventory\/config-records\/([^/]+)$/);
  if (configRecordMatch && ["PATCH", "DELETE"].includes(request.method)) {
    requireRoles(auth, ASSET_ROLES);
    const updates = request.method === "DELETE" ? { deleted: true } : toSnake(await requestBody(request));
    const { data, error } = await service.schema("inventory").from("config_records")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", configRecordMatch[1]).select("*").single();
    assertDb(error); return request.method === "DELETE" ? json(request, {}, 204) : json(request, toCamel(data));
  }

  const maintenanceMatch = path.match(/^\/api\/inventory\/([^/]+)\/maintenance$/);
  if (maintenanceMatch && ["GET", "POST"].includes(request.method)) {
    if (request.method === "GET") {
      const { data, error } = await service.schema("inventory").from("inventory_maintenance")
        .select("*").eq("item_id", maintenanceMatch[1]).order("created_at", { ascending: false });
      assertDb(error); return json(request, toCamel(data));
    }
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    if (!body.reason || !body.startDate) return fail(request, 400, "reason and startDate are required");
    const { data, error } = await service.schema("inventory").from("inventory_maintenance").insert({
      id: newId(), item_id: maintenanceMatch[1], status: "scheduled", reason: body.reason,
      start_date: body.startDate, expected_return_date: body.expectedReturnDate ?? null,
      technician_notes: body.technicianNotes ?? null, created_by: auth.user.id,
    }).select("*").single();
    assertDb(error);
    await service.schema("inventory").from("inventory_items")
      .update({ status: "under_maintenance", updated_at: new Date().toISOString() }).eq("id", maintenanceMatch[1]);
    return json(request, toCamel(data), 201);
  }
  const completeMaintenanceMatch = path.match(/^\/api\/inventory\/maintenance\/([^/]+)\/complete$/);
  if (completeMaintenanceMatch && request.method === "PATCH") {
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    const { data: existing, error } = await service.schema("inventory").from("inventory_maintenance")
      .select("*").eq("id", completeMaintenanceMatch[1]).maybeSingle();
    assertDb(error); if (!existing) return fail(request, 404, "Maintenance record not found");
    if (existing.status === "completed") return fail(request, 400, "Maintenance already completed");
    const { data, error: updateError } = await service.schema("inventory").from("inventory_maintenance").update({
      status: "completed", completed_date: body.completedDate ?? new Date().toISOString(),
      technician_notes: body.technicianNotes ?? existing.technician_notes, updated_at: new Date().toISOString(),
    }).eq("id", existing.id).select("*").single();
    assertDb(updateError);
    await service.schema("inventory").from("inventory_items")
      .update({ status: "available", updated_at: new Date().toISOString() }).eq("id", existing.item_id);
    return json(request, toCamel(data));
  }

  if (path === "/api/inventory/external-deployments" && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    if (!body.itemId || !body.clientName || !body.deployedAt) return fail(request, 400, "itemId, clientName, and deployedAt are required");
    const { data, error } = await service.schema("inventory").from("inventory_external_deployments").insert({
      id: newId(), item_id: body.itemId, client_name: body.clientName, site_location: body.siteLocation ?? null,
      deployed_by: auth.user.id, deployed_at: body.deployedAt,
      expected_return_date: body.expectedReturnDate ?? null, notes: body.notes ?? null,
    }).select("*").single();
    assertDb(error);
    await service.schema("inventory").from("inventory_items")
      .update({ status: "deployed_externally", updated_at: new Date().toISOString() }).eq("id", body.itemId);
    return json(request, toCamel(data), 201);
  }
  const returnDeploymentMatch = path.match(/^\/api\/inventory\/external-deployments\/([^/]+)\/return$/);
  if (returnDeploymentMatch && request.method === "PATCH") {
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    const { data: existing, error } = await service.schema("inventory").from("inventory_external_deployments")
      .select("*").eq("id", returnDeploymentMatch[1]).maybeSingle();
    assertDb(error); if (!existing) return fail(request, 404, "Deployment record not found");
    if (existing.returned_at) return fail(request, 400, "Item has already been returned");
    const { data, error: updateError } = await service.schema("inventory").from("inventory_external_deployments").update({
      returned_at: body.returnedAt ?? new Date().toISOString(), notes: body.notes ?? existing.notes,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id).select("*").single();
    assertDb(updateError);
    await service.schema("inventory").from("inventory_items")
      .update({ status: "available", updated_at: new Date().toISOString() }).eq("id", existing.item_id);
    return json(request, toCamel(data));
  }
  const itemDeploymentsMatch = path.match(/^\/api\/inventory\/([^/]+)\/external-deployments$/);
  if (itemDeploymentsMatch && request.method === "GET") {
    const { data, error } = await service.schema("inventory").from("inventory_external_deployments")
      .select("*").eq("item_id", itemDeploymentsMatch[1]).order("created_at", { ascending: false });
    assertDb(error); return json(request, toCamel(data));
  }
  const replaceItemMatch = path.match(/^\/api\/inventory\/([^/]+)\/replace$/);
  if (replaceItemMatch && request.method === "POST") {
    requireRoles(auth, ASSET_ROLES);
    const body = await requestBody(request);
    if (!body.replacementItemId || body.replacementItemId === replaceItemMatch[1]) return fail(request, 400, "A different replacementItemId is required");
    const { data: replacement, error: replacementError } = await service.schema("inventory").from("inventory_items")
      .select("id").eq("id", body.replacementItemId).maybeSingle();
    assertDb(replacementError); if (!replacement) return fail(request, 404, "Replacement item not found");
    const { error } = await service.schema("inventory").from("inventory_items")
      .update({ status: "replaced", replaced_by_item_id: body.replacementItemId, updated_at: new Date().toISOString() })
      .eq("id", replaceItemMatch[1]);
    assertDb(error); return json(request, { replacedItemId: replaceItemMatch[1], replacementItemId: body.replacementItemId });
  }
  const inventoryHistoryMatch = path.match(/^\/api\/inventory\/([^/]+)\/(audit|location-history)$/);
  if (inventoryHistoryMatch && request.method === "GET") {
    const table = inventoryHistoryMatch[2] === "audit" ? "inventory_audit_log" : "inventory_location_history";
    const { data, error } = await service.schema("inventory").from(table)
      .select("*").eq("item_id", inventoryHistoryMatch[1]).order("created_at", { ascending: false });
    assertDb(error); return json(request, toCamel(data));
  }

  const ticketItemsMatch = path.match(/^\/api\/tickets\/([^/]+)\/items$/);
  if (ticketItemsMatch && request.method === "GET") {
    await assertTicketAccess(auth, ticketItemsMatch[1]);
    const { data: usage, error } = await service.schema("inventory").from("ticket_inventory")
      .select("item_id,quantity").eq("ticket_id", ticketItemsMatch[1]);
    assertDb(error);
    const itemIds = (usage ?? []).map((row) => row.item_id);
    if (!itemIds.length) return json(request, []);
    const { data: items, error: itemError } = await service.schema("inventory").from("inventory_items").select("id,name").in("id", itemIds);
    assertDb(itemError);
    return json(request, (usage ?? []).map((row) => ({ name: items?.find((item) => item.id === row.item_id)?.name ?? row.item_id, quantity: row.quantity })));
  }

  const useItemMatch = path.match(/^\/api\/tickets\/([^/]+)\/use-item$/);
  if (useItemMatch && request.method === "POST") {
    requireRoles(auth, ENGINEER_ROLES);
    const body = await requestBody(request);
    const quantity = Number(body.quantity ?? 0);
    if (!body.itemId || !Number.isInteger(quantity) || quantity <= 0) return fail(request, 400, "Valid itemId and quantity are required");
    const { error } = await service.schema("inventory").rpc("use_ticket_item", {
      p_ticket_id: useItemMatch[1], p_item_id: body.itemId, p_quantity: quantity, p_user_id: auth.user.id,
    });
    assertDb(error);
    return json(request, { success: true }, 201);
  }

  if (path === "/api/payouts" && request.method === "GET") {
    let rows = await payoutRows(auth);
    const engineerId = url.searchParams.get("engineerId");
    const engineerName = url.searchParams.get("engineerName")?.toLowerCase();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (engineerId) rows = rows.filter((row) => row.engineerId === engineerId);
    if (engineerName) rows = rows.filter((row) => String(row.engineerName ?? "").toLowerCase().includes(engineerName));
    if (from) rows = rows.filter((row) => row.createdAt && new Date(row.createdAt) >= new Date(from));
    if (to) rows = rows.filter((row) => row.createdAt && new Date(row.createdAt) <= new Date(`${to}T23:59:59.999Z`));
    return json(request, rows);
  }
  if (path === "/api/payouts/export" && request.method === "GET") {
    const rows = await payoutRows(auth);
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Ticket ID", "Ticket Number", "Engineer", "Call Type", "Payout Amount", "Status", "Credited At"],
      ...rows.map((row) => [row.ticketId, row.ticketNumber, row.engineerName, row.callType, row.payoutAmount, row.status, row.creditedAt]),
    ].map((line) => line.map(escape).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        ...corsHeaders(request),
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="payouts.csv"',
      },
    });
  }

  if (path === "/api/payout-rates" && request.method === "GET") {
    const { data, error } = await service.schema("ticket").from("ticket_categories").select("id,name,default_payout,updated_at").eq("deleted", false);
    assertDb(error);
    return json(request, (data ?? []).map((row) => ({ categoryId: row.id, categoryName: row.name, callType: row.name, amount: row.default_payout ?? 0, currency: "INR", updatedAt: row.updated_at })));
  }
  const payoutRateMatch = path.match(/^\/api\/payout-rates\/([^/]+)$/);
  if (payoutRateMatch && request.method === "PUT") {
    requireRoles(auth, ["super_admin"]);
    const body = await requestBody(request);
    const { data, error } = await service.schema("ticket").from("ticket_categories")
      .update({ default_payout: Number(body.amount), updated_at: new Date().toISOString() }).eq("id", payoutRateMatch[1]).select("*").single();
    assertDb(error);
    return json(request, { categoryId: data!.id, categoryName: data!.name, callType: data!.name, amount: data!.default_payout, currency: body.currency ?? "INR", updatedBy: auth.user.id, updatedAt: data!.updated_at });
  }

  if (path === "/api/admin/dashboard" && request.method === "GET") {
    requireRoles(auth, ["super_admin", "national_head"]);
    const [tickets, engineers, projects, customers] = await Promise.all([
      service.schema("ticket").from("tickets").select("id", { count: "exact", head: true }).eq("deleted", false),
      listUsers("engineer"),
      service.schema("ticket").from("projects").select("id", { count: "exact", head: true }).eq("deleted", false),
      service.schema("ticket").from("customers").select("id", { count: "exact", head: true }).eq("deleted", false),
    ]);
    return json(request, { summary: { totalTickets: tickets.count ?? 0, activeEngineers: engineers.length, openProjects: projects.count ?? 0, customers: customers.count ?? 0 }, generatedAt: new Date().toISOString() });
  }

  return fail(request, 404, `Supabase route not implemented: ${request.method} ${path}`);
}

Deno.serve(async (request) => {
  try {
    return await route(request);
  } catch (error) {
    return errorResponse(request, error);
  }
});

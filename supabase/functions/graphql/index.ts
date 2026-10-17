import {
  authenticate,
  corsHeaders,
  errorResponse,
  json,
  newId,
  requireRoles,
  service,
  toCamel,
  type PortalAuth,
} from "../_shared/platform.ts";
import { verifyVerificationProof } from "../_shared/verification.ts";

type GraphqlBody = { query?: string; variables?: Record<string, unknown> };

function assertDb(error: { message: string } | null): void {
  if (error) throw { status: 500, message: error.message };
}

async function optionalAuth(request: Request): Promise<PortalAuth | null> {
  try {
    return await authenticate(request);
  } catch {
    return null;
  }
}

async function roleId(name: string): Promise<string> {
  const { data, error } = await service.schema("portal").from("roles")
    .select("id").eq("name", name).eq("deleted", false).maybeSingle();
  assertDb(error);
  if (data) return data.id;
  const id = newId();
  const { error: insertError } = await service.schema("portal").from("roles")
    .insert({ id, name, author: "supabase" });
  assertDb(insertError);
  return id;
}

async function scopedTickets(auth: PortalAuth) {
  if (["engineer", "l2_engineer", "l3_engineer"].includes(auth.role)) {
    const { data, error } = await service.schema("ticket").from("tickets").select("*")
      .eq("assigned_engineer_id", auth.user.id).eq("deleted", false);
    assertDb(error); return data ?? [];
  }
  if (auth.role === "vendor") {
    const { data, error } = await service.schema("ticket").from("tickets").select("*")
      .eq("deleted", false)
      .or(`assigned_engineer_id.eq.${auth.user.id},escalation_level.eq.L3`);
    assertDb(error); return data ?? [];
  }
  if (auth.role === "customer") {
    const { data: customer, error: customerError } = await service.schema("ticket").from("customers")
      .select("id").eq("user_id", auth.user.id).eq("deleted", false).maybeSingle();
    assertDb(customerError); if (!customer) return [];
    const { data: projects, error: projectError } = await service.schema("ticket").from("projects")
      .select("id").eq("customer_id", customer.id).eq("deleted", false);
    assertDb(projectError); const ids = (projects ?? []).map((row) => row.id); if (!ids.length) return [];
    const { data, error } = await service.schema("ticket").from("tickets").select("*")
      .in("project_id", ids).eq("deleted", false);
    assertDb(error); return data ?? [];
  }
  if (auth.role === "project_head") {
    const { data: projects, error: projectError } = await service.schema("ticket").from("projects")
      .select("id").eq("project_head_id", auth.user.id).eq("deleted", false);
    assertDb(projectError); const ids = (projects ?? []).map((row) => row.id); if (!ids.length) return [];
    const { data, error } = await service.schema("ticket").from("tickets").select("*")
      .in("project_id", ids).eq("deleted", false);
    assertDb(error); return data ?? [];
  }
  if (!["super_admin", "national_head", "noc", "state_planner"].includes(auth.role)) return [];
  let query = service.schema("ticket").from("tickets").select("*").eq("deleted", false);
  if (auth.role === "noc" && auth.state) query = query.eq("state", auth.state);
  const { data, error } = await query.order("created_at", { ascending: false });
  assertDb(error); return data ?? [];
}

async function usersByRole(name: string) {
  const { data: role, error: roleError } = await service.schema("portal").from("roles")
    .select("id").eq("name", name).eq("deleted", false).maybeSingle();
  assertDb(roleError); if (!role) return [];
  const { data: assignments, error: assignmentError } = await service.schema("portal").from("user_roles")
    .select("user_id,state").eq("role_id", role.id).eq("deleted", false);
  assertDb(assignmentError); const ids = (assignments ?? []).map((row) => row.user_id); if (!ids.length) return [];
  const { data, error } = await service.schema("portal").from("users")
    .select("id,name,email,phone,status,created_at").in("id", ids).eq("deleted", false);
  assertDb(error); return (data ?? []).map((row) => ({
    ...row, role: name,
    state: (assignments ?? []).find((assignment) => assignment.user_id === row.id)?.state ?? null,
  }));
}

async function engineerProfiles(auth: PortalAuth) {
  let query = service.schema("ticket").from("engineer_profiles").select("*").eq("deleted", false);
  if (["engineer", "l2_engineer", "l3_engineer"].includes(auth.role)) query = query.eq("user_id", auth.user.id);
  else requireRoles(auth, ["super_admin", "national_head", "noc", "state_planner", "project_head"]);
  const { data: profiles, error } = await query.order("created_at", { ascending: false });
  assertDb(error);
  const ids = (profiles ?? []).map((row) => row.user_id);
  const { data: users, error: userError } = ids.length
    ? await service.schema("portal").from("users").select("id,name,email,phone,status").in("id", ids)
    : { data: [], error: null };
  assertDb(userError);
  return (profiles ?? []).map((profile) => {
    const user = (users ?? []).find((candidate) => candidate.id === profile.user_id);
    return { ...profile, user_name: user?.name, user_email: user?.email, user_phone: user?.phone, account_status: user?.status };
  });
}

async function nextReference(table: "customers" | "engineer_profiles", prefix: string): Promise<string> {
  const { count, error } = await service.schema("ticket").from(table).select("id", { count: "exact", head: true });
  assertDb(error);
  return `${prefix}-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

async function createPendingUser(input: Record<string, unknown>, roleName: string) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const { data: existing, error: existingError } = await service.schema("portal").from("users")
    .select("id").ilike("email", email).eq("deleted", false).maybeSingle();
  assertDb(existingError);
  if (existing) throw { status: 409, message: "Email already exists" };
  const id = newId();
  const { data: user, error } = await service.schema("portal").from("users").insert({
    id, name: input.fullName ?? input.customerName, email, phone: input.phone,
    status: "pending", author: "supabase_onboarding",
  }).select("*").single();
  assertDb(error);
  const assignedRoleId = await roleId(roleName);
  const { error: assignmentError } = await service.schema("portal").from("user_roles")
    .insert({ user_id: id, role_id: assignedRoleId, author: "supabase_onboarding" });
  assertDb(assignmentError);
  return user!;
}

async function customerOnboarding(input: Record<string, unknown>) {
  if (!await verifyVerificationProof(input.verificationToken, String(input.email), "customer")) {
    throw { status: 403, message: "Email verification is required or has expired" };
  }
  const user = await createPendingUser(input, "customer");
  const referenceId = await nextReference("customers", "CUST");
  const { data, error } = await service.schema("ticket").from("customers").insert({
    id: newId(), company_name: input.companyName, contact_person_name: input.contactPersonName,
    email: user.email, phone: input.phone, address_state: input.state, address_city: input.city,
    address_pincode: input.pincode, secondary_contact_name: input.secondaryName ?? null,
    secondary_contact_email: input.secondaryEmail ?? null, secondary_contact_phone: input.secondaryPhone ?? null,
    user_id: user.id, reference_id: referenceId, status: "pending", author: "supabase_onboarding",
  }).select("*").single();
  assertDb(error);
  return { id: data!.id, referenceId, status: data!.status, createdAt: data!.created_at };
}

async function fileUrl(id: unknown): Promise<string | null> {
  if (id === undefined || id === null) return null;
  const { data, error } = await service.schema("portal").from("storage_files").select("id").eq("id", id).eq("deleted", false).maybeSingle();
  assertDb(error);
  if (!data) throw { status: 400, message: `Uploaded file ${id} was not found` };
  return `/file/${data.id}`;
}

async function engineerOnboarding(input: Record<string, unknown>, auth: PortalAuth | null) {
  const staffCreation = auth && ["super_admin", "national_head"].includes(auth.role);
  if (!staffCreation && !await verifyVerificationProof(input.verificationToken, String(input.email), "engineer")) {
    throw { status: 403, message: "Email verification is required or has expired" };
  }
  const user = await createPendingUser(input, "engineer");
  const referenceId = await nextReference("engineer_profiles", "ENG");
  const [profilePhotoUrl, aadhaarFrontUrl, aadhaarBackUrl, panCardUrl, dlFrontUrl, dlBackUrl, cancelChequeUrl] = await Promise.all([
    fileUrl(input.profilePhotoId), fileUrl(input.aadhaarFrontId), fileUrl(input.aadhaarBackId),
    fileUrl(input.panFileId), fileUrl(input.dlFrontId), fileUrl(input.dlBackId), fileUrl(input.cancelChequeFileId),
  ]);
  const { data, error } = await service.schema("ticket").from("engineer_profiles").insert({
    id: newId(), user_id: user.id, reference_id: referenceId, address_state: input.state,
    address_city: input.city, address_pincode: input.pincode, profile_photo_url: profilePhotoUrl,
    aadhaar_front_url: aadhaarFrontUrl, aadhaar_back_url: aadhaarBackUrl, pan_card_url: panCardUrl,
    dl_front_url: dlFrontUrl, dl_back_url: dlBackUrl, cancel_cheque_url: cancelChequeUrl,
    account_holder_name: input.accountHolderName, bank_account_number: input.accountNumber,
    ifsc_code: input.ifsc, documents_status: "pending", author: auth?.user.id ?? "supabase_onboarding",
  }).select("*").single();
  assertDb(error);
  const uploadedIds = [input.profilePhotoId, input.aadhaarFrontId, input.aadhaarBackId, input.panFileId,
    input.dlFrontId, input.dlBackId, input.cancelChequeFileId].filter((value) => value !== undefined && value !== null);
  if (uploadedIds.length) {
    const { error: ownershipError } = await service.schema("portal").from("storage_files")
      .update({ owner_user_id: user.id, usage_type: "engineer_kyc" }).in("id", uploadedIds);
    assertDb(ownershipError);
  }
  return { id: data!.id, referenceId, status: "pending", createdAt: data!.created_at };
}

async function execute(request: Request, body: GraphqlBody): Promise<Record<string, unknown>> {
  const query = body.query ?? "";
  const variables = body.variables ?? {};
  const auth = await optionalAuth(request);

  if (query.includes("submitCustomerOnboarding")) {
    return { submitCustomerOnboarding: await customerOnboarding(variables.input as Record<string, unknown>) };
  }
  if (query.includes("submitEngineerOnboarding")) {
    return { submitEngineerOnboarding: await engineerOnboarding(variables.input as Record<string, unknown>, auth) };
  }
  if (!auth) throw { status: 401, message: "Authentication required" };

  if (query.includes("bulkCreateEngineers")) {
    requireRoles(auth, ["super_admin", "national_head"]);
    const success: unknown[] = []; const failed: unknown[] = [];
    const engineers = (variables.engineers as Array<Record<string, unknown>>) ?? [];
    for (let index = 0; index < engineers.length; index++) {
      try {
        const result = await engineerOnboarding(engineers[index], auth);
        success.push({ id: result.id, referenceId: result.referenceId, email: engineers[index].email });
      } catch (error) {
        failed.push({ row: index + 1, email: engineers[index].email ?? null, reason: (error as Error).message ?? "Unable to create engineer" });
      }
    }
    return { bulkCreateEngineers: { success, failed } };
  }
  if (query.includes("updateEngineerDocuments")) {
    requireRoles(auth, ["super_admin", "national_head"]);
    const input = variables.input as Record<string, unknown>;
    const { id, ...updates } = input;
    const snakeUpdates = Object.fromEntries(Object.entries(updates).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]));
    const { data, error } = await service.schema("ticket").from("engineer_profiles")
      .update({ ...snakeUpdates, documents_status: "pending", updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    assertDb(error);
    const fileIds = Object.values(updates).flatMap((value) => {
      const match = typeof value === "string" ? value.match(/\/file\/(\d+)/) : null;
      return match ? [Number(match[1])] : [];
    });
    if (fileIds.length && data?.user_id) {
      const { error: ownershipError } = await service.schema("portal").from("storage_files")
        .update({ owner_user_id: data.user_id, usage_type: "engineer_kyc" }).in("id", fileIds);
      assertDb(ownershipError);
    }
    return { updateEngineerDocuments: toCamel(data) };
  }
  if (query.includes("createUserRole")) {
    requireRoles(auth, ["super_admin"]);
    const input = variables.input as Record<string, unknown>;
    const { data, error } = await service.schema("portal").from("user_roles").insert({
      user_id: input.userId, role_id: input.roleId, author: input.author ?? auth.user.id, state: input.state ?? null,
    }).select("*").single();
    assertDb(error); return { createUserRole: toCamel(data) };
  }
  if (query.includes("createRole")) {
    requireRoles(auth, ["super_admin"]);
    const input = variables.input as Record<string, unknown>;
    const { data, error } = await service.schema("portal").from("roles")
      .insert({ id: newId(), name: input.name, author: input.author ?? auth.user.id }).select("*").single();
    assertDb(error); return { createRole: toCamel(data) };
  }

  const result: Record<string, unknown> = {};
  if (/\btickets\s*\{/.test(query)) result.tickets = toCamel(await scopedTickets(auth));
  if (/\busers\s*\(/.test(query)) {
    requireRoles(auth, ["super_admin", "national_head", "noc", "state_planner", "project_head"]);
    result.users = toCamel(await usersByRole(String(variables.role ?? "")));
  }
  if (/\bticketCategories\s*\{/.test(query)) {
    const { data, error } = await service.schema("ticket").from("ticket_categories").select("*").eq("deleted", false);
    assertDb(error); result.ticketCategories = toCamel(data);
  }
  if (/\bprojects\s*\{/.test(query)) {
    let projectQuery = service.schema("ticket").from("projects").select("*").eq("deleted", false);
    if (auth.role === "project_head") projectQuery = projectQuery.eq("project_head_id", auth.user.id);
    if (auth.role === "customer") {
      const { data: customer, error: customerError } = await service.schema("ticket").from("customers")
        .select("id").eq("user_id", auth.user.id).eq("deleted", false).maybeSingle();
      assertDb(customerError);
      if (!customer) result.projects = [];
      else projectQuery = projectQuery.eq("customer_id", customer.id);
    } else if (["engineer", "l2_engineer", "l3_engineer", "vendor"].includes(auth.role)) {
      const projectIds = [...new Set((await scopedTickets(auth)).map((ticket) => ticket.project_id).filter(Boolean))];
      if (!projectIds.length) result.projects = [];
      else projectQuery = projectQuery.in("id", projectIds);
    } else if (!["super_admin", "national_head", "noc", "state_planner", "project_head"].includes(auth.role)) {
      result.projects = [];
    }
    if (!("projects" in result)) {
      const { data, error } = await projectQuery; assertDb(error); result.projects = toCamel(data);
    }
  }
  if (/\bcustomers\s*\{/.test(query)) {
    requireRoles(auth, ["super_admin", "national_head", "noc", "state_planner", "project_head"]);
    const { data, error } = await service.schema("ticket").from("customers").select("*").eq("deleted", false);
    assertDb(error); result.customers = toCamel(data);
  }
  if (/\bengineerProfiles\s*\{/.test(query)) result.engineerProfiles = toCamel(await engineerProfiles(auth));
  if (/\broles\s*\{/.test(query)) {
    requireRoles(auth, ["super_admin"]);
    const { data, error } = await service.schema("portal").from("roles").select("*").eq("deleted", false);
    assertDb(error); result.roles = toCamel(data);
  }
  if (/\buserRoles\s*\{/.test(query)) {
    requireRoles(auth, ["super_admin"]);
    const { data, error } = await service.schema("portal").from("user_roles").select("*").eq("deleted", false);
    assertDb(error); result.userRoles = toCamel(data);
  }
  if (/\bticketHistory\s*\{/.test(query)) {
    const ticketIds = (await scopedTickets(auth)).map((ticket) => ticket.id);
    if (!ticketIds.length) { result.ticketHistory = []; }
    else {
    const { data, error } = await service.schema("ticket").from("ticket_history").select("*").in("ticket_id", ticketIds).eq("deleted", false).order("created_at");
    assertDb(error); result.ticketHistory = toCamel(data);
    }
  }
  if (query.includes("attachmentsByTicket")) {
    const allowed = (await scopedTickets(auth)).some((ticket) => ticket.id === variables.ticketId);
    if (!allowed) throw { status: 403, message: "Ticket access denied" };
    const { data, error } = await service.schema("ticket").from("attachments").select("*")
      .eq("ticket_id", variables.ticketId).eq("deleted", false).order("created_at");
    assertDb(error); result.attachmentsByTicket = toCamel(data);
  }
  if (query.includes("ticketHistoryByTicket")) {
    const allowed = (await scopedTickets(auth)).some((ticket) => ticket.id === variables.ticketId);
    if (!allowed) throw { status: 403, message: "Ticket access denied" };
    const { data, error } = await service.schema("ticket").from("ticket_history").select("*")
      .eq("ticket_id", variables.ticketId).eq("deleted", false).order("created_at");
    assertDb(error); result.ticketHistoryByTicket = toCamel(data);
  }
  if (!Object.keys(result).length) throw { status: 400, message: "Unsupported GraphQL operation" };
  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    const body = await request.json() as GraphqlBody;
    return json(request, { data: await execute(request, body) });
  } catch (error) {
    const response = errorResponse(request, error);
    const payload = await response.json().catch(() => ({ message: "Unexpected server error" }));
    return json(request, { data: null, errors: [{ message: payload.message }] }, response.status);
  }
});

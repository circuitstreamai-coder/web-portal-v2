import { errorResponse, fail, json, newId, service, ticketNumber } from "../_shared/platform.ts";

function assertDb(error: { message: string } | null): void {
  if (error) throw { status: 500, message: error.message };
}

function senderAddress(value: string): string {
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

async function bodyFields(request: Request): Promise<Record<string, string>> {
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const value = await request.json() as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return fail(request, 405, "Method not allowed");
    const secret = Deno.env.get("INBOUND_EMAIL_SECRET") ?? "";
    const supplied = request.headers.get("x-inbound-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
    if (!secret || supplied !== secret) return fail(request, 401, "Invalid webhook secret");

    const body = await bodyFields(request);
    const from = senderAddress(body.from || body.sender || body["envelope[from]"] || "");
    const title = body.subject?.trim() || "Email Ticket";
    const description = body.text?.trim() || body.html?.trim() || "No content";
    const messageId = body["Message-Id"] || body["message-id"] || body.messageId ||
      `${from}:${title}:${body.date || ""}`;
    if (!from || description.length < 10) return json(request, { ok: true });

    const { data: duplicate, error: duplicateError } = await service.schema("ticket").from("tickets")
      .select("id").eq("message_id", messageId).eq("deleted", false).maybeSingle();
    assertDb(duplicateError); if (duplicate) return json(request, { ok: true, duplicate: true });
    const { data: user, error: userError } = await service.schema("portal").from("users")
      .select("id").ilike("email", from).eq("deleted", false).maybeSingle();
    assertDb(userError); if (!user) return json(request, { ok: true, ignored: true });
    const { data: customer, error: customerError } = await service.schema("ticket").from("customers")
      .select("*").eq("user_id", user.id).eq("deleted", false).maybeSingle();
    assertDb(customerError); if (!customer) return json(request, { ok: true, ignored: true });

    const { data: allowlist, error: allowError } = await service.schema("ticket").from("email_allowlist")
      .select("email,domain").eq("customer_id", customer.id);
    assertDb(allowError);
    const domain = from.split("@")[1] ?? "";
    if ((allowlist ?? []).length && !(allowlist ?? []).some((entry) =>
      entry.email?.toLowerCase() === from || entry.domain?.toLowerCase() === domain)) {
      return json(request, { ok: true, ignored: true });
    }

    let { data: quota, error: quotaError } = await service.schema("ticket").from("email_quota_configs")
      .select("*").eq("customer_id", customer.id).maybeSingle();
    assertDb(quotaError);
    if (!quota) {
      const created = await service.schema("ticket").from("email_quota_configs")
        .insert({ id: newId(), customer_id: customer.id }).select("*").single();
      assertDb(created.error); quota = created.data;
    }
    if (quota!.suspended || quota!.emails_this_month >= quota!.monthly_cap) {
      await service.schema("ticket").from("email_quota_configs").update({
        suspended: true, suspended_at: new Date().toISOString(), suspended_reason: "Monthly cap reached",
      }).eq("id", quota!.id);
      return json(request, { ok: true, quotaExceeded: true });
    }

    const projectMatch = `${title}\n${description}`.match(/Project-Name\s*=\s*"([^"]+)"/i);
    let projectQuery = service.schema("ticket").from("projects").select("id")
      .eq("customer_id", customer.id).eq("deleted", false);
    if (projectMatch) projectQuery = projectQuery.ilike("name", projectMatch[1].trim());
    const { data: projects, error: projectError } = await projectQuery.limit(1);
    assertDb(projectError); if (!projects?.length) return json(request, { ok: true, ignored: true, reason: "no_project" });
    const categoryId = Deno.env.get("DEFAULT_EMAIL_CATEGORY_ID") ?? "";
    if (!categoryId) throw { status: 500, message: "DEFAULT_EMAIL_CATEGORY_ID is not configured" };
    const { data: category, error: categoryError } = await service.schema("ticket").from("ticket_categories")
      .select("default_payout").eq("id", categoryId).eq("deleted", false).single();
    assertDb(categoryError);
    const { data: ticket, error: ticketError } = await service.schema("ticket").from("tickets").insert({
      id: newId(), ticket_number: ticketNumber(), project_id: projects[0].id, category_id: categoryId,
      title, description, priority: "medium", status: "open", payout_amount: category!.default_payout,
      author: user.id, source: "email", message_id: messageId,
    }).select("id,ticket_number").single();
    assertDb(ticketError);
    await service.schema("ticket").from("email_quota_configs")
      .update({ emails_this_month: quota!.emails_this_month + 1, updated_at: new Date().toISOString() }).eq("id", quota!.id);
    return json(request, { ok: true, ticket }, 201);
  } catch (error) {
    // Inbound providers retry non-2xx responses. Authentication errors remain explicit;
    // processing errors are logged and acknowledged to prevent retry storms.
    const candidate = error as { status?: number };
    if (candidate.status === 401) return errorResponse(request, error);
    console.error(error);
    return json(request, { ok: true, processingError: true });
  }
});


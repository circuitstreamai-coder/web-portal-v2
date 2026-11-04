import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ExcelJS from "exceljs";

const IMPORT_AUTHOR = "app_xlsx_import";
const DEFAULT_PROJECT_REF = "jrczynixoopyrmfgvcgg";
const DEFAULT_INPUT = "/home/abhishek/Downloads/App.xlsx";
const DEFAULT_CREDENTIALS = "/home/abhishek/Downloads/App-import-credentials.xlsx";
const ROLE_BY_SECTION = new Map([
  ["customer", "customer"],
  ["noc", "noc"],
  ["state lead", "state_planner"],
  ["field engineer", "engineer"],
]);

type ImportRow = { row: number; username: string; email: string; role: string };
type JsonObject = Record<string, any>;

function serviceKey(projectRef: string): string {
  const output = execFileSync(
    "npx",
    ["-y", "supabase@2", "projects", "api-keys", "--project-ref", projectRef, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const keys = JSON.parse(output) as Array<{ name?: string; type?: string; api_key?: string }>;
  const key = keys.find((item) => item.name === "service_role")?.api_key
    ?? keys.find((item) => item.type === "secret")?.api_key;
  if (!key) throw new Error("The authenticated Supabase CLI session did not return a service key");
  return key;
}

async function workbookRows(filename: string): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The source workbook has no worksheets");
  const rows: ImportRow[] = [];
  let role: string | null = null;
  worksheet.eachRow((source, rowNumber) => {
    const username = source.getCell(4).text.trim();
    const email = source.getCell(5).text.trim().toLowerCase();
    const section = ROLE_BY_SECTION.get(username.toLowerCase());
    if (section) { role = section; return; }
    if (!username || username.toLowerCase() === "users") return;
    if (!role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Invalid source row ${rowNumber}`);
    }
    rows.push({ row: rowNumber, username, email, role });
  });
  return rows;
}

async function passwordMap(filename: string): Promise<Map<string, string>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const worksheet = workbook.getWorksheet("Email Logins");
  if (!worksheet) throw new Error("Email Logins sheet is missing from the credentials workbook");
  const passwords = new Map<string, string>();
  for (let row = 2; row <= worksheet.rowCount; row += 1) {
    const email = worksheet.getRow(row).getCell(2).text.trim().toLowerCase();
    const password = worksheet.getRow(row).getCell(5).text;
    if (email && password && password !== "Existing password unchanged") passwords.set(email, password);
  }
  return passwords;
}

function canonicalName(rows: ImportRow[]): string {
  const preferred = rows.find((row) => row.role === "engineer") ?? rows[0];
  return preferred.username.replace(/_(?:NOC|SL|FE|FA)$/i, "").replace(/_/g, " ").trim();
}

async function main() {
  const projectRef = process.argv[2] ?? DEFAULT_PROJECT_REF;
  const input = path.resolve(process.argv[3] ?? DEFAULT_INPUT);
  const credentials = path.resolve(process.argv[4] ?? DEFAULT_CREDENTIALS);
  const rows = await workbookRows(input);
  const passwords = await passwordMap(credentials);
  const byEmail = new Map<string, ImportRow[]>();
  for (const row of rows) byEmail.set(row.email, [...(byEmail.get(row.email) ?? []), row]);
  for (const email of byEmail.keys()) {
    if (!passwords.has(email)) throw new Error(`No temporary password is available for ${email}`);
  }

  const key = serviceKey(projectRef);
  const baseUrl = `https://${projectRef}.supabase.co`;
  const commonHeaders = { apikey: key, Authorization: `Bearer ${key}` };

  async function rest(
    schema: "portal" | "ticket",
    table: string,
    query: Record<string, string> = {},
    method = "GET",
    body?: unknown,
  ): Promise<JsonObject[]> {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const response = await fetch(url, {
      method,
      headers: {
        ...commonHeaders,
        "Accept-Profile": schema,
        "Content-Profile": schema,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${schema}.${table} ${method} failed (${response.status}): ${await response.text()}`);
    if (response.status === 204) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [result];
  }

  async function auth(pathname: string, method = "GET", body?: unknown): Promise<JsonObject> {
    const response = await fetch(`${baseUrl}/auth/v1${pathname}`, {
      method,
      headers: { ...commonHeaders, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Supabase Auth ${method} failed (${response.status}): ${await response.text()}`);
    return response.json();
  }

  const roleRows = await rest("portal", "roles", { select: "id,name", deleted: "eq.false" });
  const roleIds = new Map(roleRows.map((role) => [String(role.name), String(role.id)]));
  const requiredRoles = [...new Set(rows.map((row) => row.role))];
  const missingRoles = requiredRoles.filter((role) => !roleIds.has(role));
  if (missingRoles.length) throw new Error(`Production is missing roles: ${missingRoles.join(", ")}`);

  const authPage = await auth("/admin/users?page=1&per_page=1000");
  const authByEmail = new Map<string, JsonObject>(
    (authPage.users ?? []).filter((user: JsonObject) => user.email)
      .map((user: JsonObject) => [String(user.email).toLowerCase(), user]),
  );
  const userIds = new Map<string, string>();
  const primaryRoles = new Map<string, string>();
  let authUsersCreated = 0;
  let portalUsersCreated = 0;

  for (const [email, emailRows] of byEmail) {
    const primaryRole = emailRows[0].role;
    primaryRoles.set(email, primaryRole);
    let authUser = authByEmail.get(email);
    let portalUsers = await rest("portal", "users", {
      select: "id,email,auth_user_id",
      email: `ilike.${email}`,
      deleted: "eq.false",
    });
    if (!authUser) {
      const created = await auth("/admin/users", "POST", {
        email,
        password: passwords.get(email),
        email_confirm: true,
        user_metadata: { name: canonicalName(emailRows), status: "active" },
        app_metadata: { role: primaryRole, import_source: IMPORT_AUTHOR },
      });
      authUser = created.user ?? created;
      authUsersCreated += 1;
      portalUsers = await rest("portal", "users", {
        select: "id,email,auth_user_id",
        email: `ilike.${email}`,
        deleted: "eq.false",
      });
    } else {
      await auth(`/admin/users/${authUser.id}`, "PUT", {
        app_metadata: { ...(authUser.app_metadata ?? {}), role: primaryRole, import_source: IMPORT_AUTHOR },
      });
    }
    if (!authUser?.id) throw new Error(`Supabase Auth did not return an ID for ${email}`);

    let portalUser = portalUsers[0];
    if (!portalUser) {
      [portalUser] = await rest("portal", "users", {}, "POST", {
        id: randomUUID(), auth_user_id: authUser.id, name: canonicalName(emailRows), email,
        status: "active", author: IMPORT_AUTHOR,
      });
      portalUsersCreated += 1;
    }
    await rest("portal", "users", { id: `eq.${portalUser.id}` }, "PATCH", {
      auth_user_id: authUser.id,
      name: canonicalName(emailRows),
      status: "active",
      author: IMPORT_AUTHOR,
      approved_at: new Date().toISOString(),
    });
    userIds.set(email, String(portalUser.id));
  }

  const existingAssignments = await rest("portal", "user_roles", { select: "user_id,role_id,deleted" });
  const assignmentKeys = new Set(
    existingAssignments.filter((item) => !item.deleted).map((item) => `${item.user_id}:${item.role_id}`),
  );
  let assignmentsCreated = 0;
  for (const [email, emailRows] of byEmail) {
    const userId = userIds.get(email)!;
    for (const role of [...new Set(emailRows.map((row) => row.role))]) {
      const roleId = roleIds.get(role)!;
      const assignmentKey = `${userId}:${roleId}`;
      if (!assignmentKeys.has(assignmentKey)) {
        await rest("portal", "user_roles", {}, "POST", {
          user_id: userId, role_id: roleId, author: IMPORT_AUTHOR, deleted: false,
        });
        assignmentKeys.add(assignmentKey);
        assignmentsCreated += 1;
      }
    }
  }

  const existingAliases = await rest("portal", "login_aliases", { select: "id,username,user_id,role_id,deleted" });
  const aliasesByName = new Map(existingAliases.map((item) => [String(item.username).toLowerCase(), item]));
  let aliasesCreated = 0;
  for (const row of rows) {
    const userId = userIds.get(row.email)!;
    const roleId = roleIds.get(row.role)!;
    const existing = aliasesByName.get(row.username.toLowerCase());
    if (existing) {
      if (existing.user_id !== userId || existing.role_id !== roleId) {
        throw new Error(`Production username ${row.username} is assigned to another identity`);
      }
      if (existing.deleted) {
        await rest("portal", "login_aliases", { id: `eq.${existing.id}` }, "PATCH", { deleted: false });
      }
    } else {
      const [created] = await rest("portal", "login_aliases", {}, "POST", {
        id: randomUUID(), username: row.username, user_id: userId, role_id: roleId,
        author: IMPORT_AUTHOR, deleted: false,
      });
      aliasesByName.set(row.username.toLowerCase(), created);
      aliasesCreated += 1;
    }
  }

  const customerRows = rows.filter((row) => row.role === "customer");
  let customersCreated = 0;
  let projectsCreated = 0;
  for (let index = 0; index < customerRows.length; index += 1) {
    const row = customerRows[index];
    const referenceId = `CUST-APP-${String(index + 1).padStart(3, "0")}`;
    const companyName = row.username.replace(/_/g, " ");
    let [customer] = await rest("ticket", "customers", {
      select: "id", reference_id: `eq.${referenceId}`, deleted: "eq.false",
    });
    if (!customer) {
      [customer] = await rest("ticket", "customers", {}, "POST", {
        id: randomUUID(), company_name: companyName,
        contact_person_name: canonicalName(byEmail.get(row.email)!), email: row.email,
        reference_id: referenceId, user_id: userIds.get(row.email), status: "active",
        approved_by: IMPORT_AUTHOR, approved_at: new Date().toISOString(), author: IMPORT_AUTHOR,
      });
      customersCreated += 1;
    }
    const project = await rest("ticket", "projects", {
      select: "id", customer_id: `eq.${customer.id}`, deleted: "eq.false", limit: "1",
    });
    if (!project.length) {
      await rest("ticket", "projects", {}, "POST", {
        id: randomUUID(), customer_id: customer.id,
        name: `${companyName} - General Support`, author: IMPORT_AUTHOR,
      });
      projectsCreated += 1;
    }
  }

  const engineerRows = rows.filter((row) => row.role === "engineer");
  let engineerProfilesCreated = 0;
  for (let index = 0; index < engineerRows.length; index += 1) {
    const row = engineerRows[index];
    const userId = userIds.get(row.email)!;
    const profile = await rest("ticket", "engineer_profiles", {
      select: "id", user_id: `eq.${userId}`, deleted: "eq.false", limit: "1",
    });
    if (!profile.length) {
      await rest("ticket", "engineer_profiles", {}, "POST", {
        id: randomUUID(), user_id: userId,
        reference_id: `ENG-APP-${String(index + 1).padStart(3, "0")}`,
        documents_status: "pending", author: IMPORT_AUTHOR,
      });
      engineerProfilesCreated += 1;
    }
  }

  console.log(JSON.stringify({
    projectRef, uniqueEmails: byEmail.size, sourceRows: rows.length,
    authUsersCreated, portalUsersCreated, assignmentsCreated, aliasesCreated,
    customersCreated, projectsCreated, engineerProfilesCreated,
  }, null, 2));
}

main().catch((error) => {
  console.error("[supabase-app-user-import] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

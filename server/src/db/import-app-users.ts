import { randomInt } from "node:crypto";
import path from "node:path";
import ExcelJS from "exceljs";
import { and, eq, sql } from "drizzle-orm";
import { pool, db } from "./db.js";
import {
  customers,
  engineerProfiles,
  loginAliases,
  projects,
  roles,
  userRoles,
  users,
} from "./schema/index.js";
import { hashPassword } from "../utils/hash.js";

const IMPORT_AUTHOR = "app_xlsx_import";
const DEFAULT_INPUT = "/home/abhishek/Downloads/App.xlsx";
const ROLE_BY_SECTION = new Map([
  ["customer", "customer"],
  ["noc", "noc"],
  ["state lead", "state_planner"],
  ["field engineer", "engineer"],
]);

type ImportRow = {
  row: number;
  username: string;
  email: string;
  role: string;
};

type Credential = ImportRow & {
  name: string;
  password: string;
};

function generatePassword(length = 14): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text.trim();
}

function canonicalName(rows: ImportRow[]): string {
  const preferred = rows.find((row) => row.role === "engineer") ?? rows[0];
  const withoutRole = preferred.username.replace(/_(?:NOC|SL|FE|FA)$/i, "").trim();
  return withoutRole.replace(/_/g, " ").trim();
}

async function readRows(filename: string): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The workbook has no worksheets");

  const rows: ImportRow[] = [];
  let currentRole: string | null = null;

  worksheet.eachRow((row, rowNumber) => {
    const username = cellText(row.getCell(4));
    const email = cellText(row.getCell(5)).toLowerCase();
    const sectionRole = ROLE_BY_SECTION.get(username.toLowerCase());
    if (sectionRole) {
      currentRole = sectionRole;
      return;
    }
    if (!username || username.toLowerCase() === "users") return;
    if (!currentRole) throw new Error(`Row ${rowNumber}: user appears before a role section`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Row ${rowNumber}: invalid email for ${username}`);
    }
    rows.push({ row: rowNumber, username, email, role: currentRole });
  });

  const usernames = new Set<string>();
  for (const row of rows) {
    const normalized = row.username.toLowerCase();
    if (usernames.has(normalized)) throw new Error(`Duplicate username: ${row.username}`);
    usernames.add(normalized);
  }
  if (rows.length === 0) throw new Error("No importable users were found");
  return rows;
}

async function writeCredentials(filename: string, credentials: Credential[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Innoserve portal import";

  const aliases = workbook.addWorksheet("Username Logins");
  aliases.columns = [
    { header: "Username", key: "username", width: 26 },
    { header: "Email", key: "email", width: 34 },
    { header: "Name", key: "name", width: 24 },
    { header: "Role", key: "role", width: 18 },
    { header: "Temporary Password", key: "password", width: 24 },
  ];
  for (const item of credentials) aliases.addRow(item);

  const canonical = workbook.addWorksheet("Email Logins");
  canonical.columns = [
    { header: "Email Login", key: "username", width: 34 },
    { header: "Email", key: "email", width: 34 },
    { header: "Name", key: "name", width: 24 },
    { header: "Primary Role", key: "role", width: 18 },
    { header: "Temporary Password", key: "password", width: 24 },
  ];
  const byEmail = new Map<string, Credential>();
  for (const item of credentials) {
    if (!byEmail.has(item.email)) byEmail.set(item.email, item);
  }
  for (const item of byEmail.values()) {
    canonical.addRow({ ...item, username: item.email });
  }

  for (const worksheet of workbook.worksheets) {
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183E58" } };
    header.alignment = { vertical: "middle" };
    worksheet.autoFilter = { from: "A1", to: "E1" };
  }

  await workbook.xlsx.writeFile(filename);
}

async function main() {
  const input = path.resolve(process.argv[2] ?? DEFAULT_INPUT);
  const output = path.resolve(
    process.argv[3] ?? path.join(path.dirname(input), "App-import-credentials.xlsx"),
  );
  const importRows = await readRows(input);
  const rowsByEmail = new Map<string, ImportRow[]>();
  for (const row of importRows) {
    const current = rowsByEmail.get(row.email) ?? [];
    current.push(row);
    rowsByEmail.set(row.email, current);
  }

  const plainPasswords = new Map<string, string>();
  const hashedPasswords = new Map<string, string>();
  await Promise.all(
    [...rowsByEmail.keys()].map(async (email) => {
      const password = generatePassword();
      plainPasswords.set(email, password);
      hashedPasswords.set(email, await hashPassword(password));
    }),
  );

  const summary = await db.transaction(async (tx) => {
    const roleNames = [...new Set(importRows.map((row) => row.role))];
    const roleRows = await tx.select({ id: roles.id, name: roles.name }).from(roles);
    const roleIds = new Map(roleRows.map((role) => [role.name, role.id]));
    const missingRoles = roleNames.filter((name) => !roleIds.has(name));
    if (missingRoles.length > 0) {
      throw new Error(`Missing configured roles: ${missingRoles.join(", ")}`);
    }

    const userIds = new Map<string, string>();
    let usersCreated = 0;
    for (const [email, emailRows] of rowsByEmail) {
      const [existing] = await tx
        .select({ id: users.id, password: users.password })
        .from(users)
        .where(and(sql`lower(${users.email}) = ${email}`, eq(users.deleted, false)))
        .limit(1);

      if (existing) {
        userIds.set(email, existing.id);
        plainPasswords.set(email, existing.password ? "Existing password unchanged" : plainPasswords.get(email)!);
        if (!existing.password) {
          await tx.update(users).set({
            password: hashedPasswords.get(email),
            status: "active",
            approvedAt: new Date(),
            author: IMPORT_AUTHOR,
          }).where(eq(users.id, existing.id));
        }
        continue;
      }

      const [created] = await tx.insert(users).values({
        name: canonicalName(emailRows),
        email,
        password: hashedPasswords.get(email),
        status: "active",
        approvedBy: IMPORT_AUTHOR,
        approvedAt: new Date(),
        author: IMPORT_AUTHOR,
      }).returning({ id: users.id });
      userIds.set(email, created.id);
      usersCreated += 1;
    }

    const seenAssignments = new Set<string>();
    let assignmentsCreated = 0;
    let aliasesCreated = 0;
    for (const source of importRows) {
      const userId = userIds.get(source.email)!;
      const roleId = roleIds.get(source.role)!;
      const assignmentKey = `${userId}:${roleId}`;
      if (!seenAssignments.has(assignmentKey)) {
        seenAssignments.add(assignmentKey);
        const [existingAssignment] = await tx.select({ deleted: userRoles.deleted })
          .from(userRoles)
          .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
          .limit(1);
        if (existingAssignment) {
          if (existingAssignment.deleted) {
            await tx.update(userRoles).set({ deleted: false, author: IMPORT_AUTHOR })
              .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
          }
        } else {
          await tx.insert(userRoles).values({
            userId,
            roleId,
            author: IMPORT_AUTHOR,
            createdAt: new Date(Date.now() + source.row),
          });
          assignmentsCreated += 1;
        }
      }

      const [existingAlias] = await tx.select({
        id: loginAliases.id,
        userId: loginAliases.userId,
        roleId: loginAliases.roleId,
      }).from(loginAliases)
        .where(sql`lower(${loginAliases.username}) = ${source.username.toLowerCase()}`)
        .limit(1);
      if (existingAlias) {
        if (existingAlias.userId !== userId || existingAlias.roleId !== roleId) {
          throw new Error(`Username ${source.username} is already assigned to another account or role`);
        }
        await tx.update(loginAliases).set({ deleted: false, username: source.username })
          .where(eq(loginAliases.id, existingAlias.id));
      } else {
        await tx.insert(loginAliases).values({
          username: source.username,
          userId,
          roleId,
          author: IMPORT_AUTHOR,
        });
        aliasesCreated += 1;
      }
    }

    const customerRows = importRows.filter((row) => row.role === "customer");
    let customersCreated = 0;
    let projectsCreated = 0;
    for (let index = 0; index < customerRows.length; index += 1) {
      const source = customerRows[index];
      const referenceId = `CUST-APP-${String(index + 1).padStart(3, "0")}`;
      const companyName = source.username.replace(/_/g, " ");
      const [existing] = await tx.select({ id: customers.id }).from(customers)
        .where(eq(customers.referenceId, referenceId)).limit(1);
      let customerId = existing?.id;
      if (!customerId) {
        const [created] = await tx.insert(customers).values({
          companyName,
          contactPersonName: canonicalName(rowsByEmail.get(source.email)!),
          email: source.email,
          referenceId,
          userId: userIds.get(source.email),
          status: "active",
          approvedBy: IMPORT_AUTHOR,
          approvedAt: new Date(),
          author: IMPORT_AUTHOR,
        }).returning({ id: customers.id });
        customerId = created.id;
        customersCreated += 1;
      }
      const [existingProject] = await tx.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.customerId, customerId), eq(projects.deleted, false))).limit(1);
      if (!existingProject) {
        await tx.insert(projects).values({
          customerId,
          name: `${companyName} - General Support`,
          author: IMPORT_AUTHOR,
        });
        projectsCreated += 1;
      }
    }

    const engineerRows = importRows.filter((row) => row.role === "engineer");
    let engineerProfilesCreated = 0;
    for (let index = 0; index < engineerRows.length; index += 1) {
      const source = engineerRows[index];
      const userId = userIds.get(source.email)!;
      const [existing] = await tx.select({ id: engineerProfiles.id }).from(engineerProfiles)
        .where(and(eq(engineerProfiles.userId, userId), eq(engineerProfiles.deleted, false)))
        .limit(1);
      if (!existing) {
        await tx.insert(engineerProfiles).values({
          userId,
          referenceId: `ENG-APP-${String(index + 1).padStart(3, "0")}`,
          documentsStatus: "pending",
          author: IMPORT_AUTHOR,
        });
        engineerProfilesCreated += 1;
      }
    }

    return {
      usersCreated,
      assignmentsCreated,
      aliasesCreated,
      customersCreated,
      projectsCreated,
      engineerProfilesCreated,
    };
  });

  const credentials = importRows.map((row) => ({
    ...row,
    name: canonicalName(rowsByEmail.get(row.email)!),
    password: plainPasswords.get(row.email)!,
  }));
  await writeCredentials(output, credentials);
  console.log(JSON.stringify({ input, output, rows: importRows.length, uniqueEmails: rowsByEmail.size, ...summary }, null, 2));
}

main()
  .catch((error) => {
    console.error("[app-user-import] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

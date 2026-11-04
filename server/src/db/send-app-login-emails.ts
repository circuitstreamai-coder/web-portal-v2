import ExcelJS from "exceljs";
import { sendEmail } from "../services/email.js";

const SOURCE_FILE = process.argv[2] ?? "/home/abhishek/Downloads/App.xlsx";
const CREDENTIALS_FILE = process.argv[3] ?? "/home/abhishek/Downloads/App-import-credentials.xlsx";
const ROLE_BY_SECTION = new Map([
  ["customer", "Customer"],
  ["noc", "NOC"],
  ["state lead", "State Lead"],
  ["field engineer", "Field Engineer"],
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function rolesByEmail(): Promise<Map<string, Set<string>>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_FILE);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The source workbook has no worksheets");
  const roles = new Map<string, Set<string>>();
  let currentRole: string | null = null;
  worksheet.eachRow((row) => {
    const username = row.getCell(4).text.trim();
    const email = row.getCell(5).text.trim().toLowerCase();
    const section = ROLE_BY_SECTION.get(username.toLowerCase());
    if (section) { currentRole = section; return; }
    if (!username || username.toLowerCase() === "users" || !currentRole || !email.includes("@")) return;
    const assigned = roles.get(email) ?? new Set<string>();
    assigned.add(currentRole);
    roles.set(email, assigned);
  });
  return roles;
}

async function credentials() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(CREDENTIALS_FILE);
  const worksheet = workbook.getWorksheet("Email Logins");
  if (!worksheet) throw new Error("The Email Logins sheet is missing from the credentials workbook");
  const rows: Array<{ email: string; name: string; password: string }> = [];
  for (let index = 2; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const email = row.getCell(2).text.trim().toLowerCase();
    const name = row.getCell(3).text.trim();
    const password = row.getCell(5).text;
    if (!email || !password || password === "Existing password unchanged") continue;
    rows.push({ email, name, password });
  }
  return rows;
}

function message(input: { email: string; name: string; password: string; roles: string[] }) {
  const baseUrl = (process.env.FRONTEND_URL ?? "https://innoserve-test.vercel.app")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
  const loginUrl = `${baseUrl}/login`;
  const details = [
    ["Email", input.email],
    ["Temporary password", input.password],
    ["Assigned access", input.roles.join(", ")],
  ];
  const detailRows = details.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#64748b;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#0B182A;">${escapeHtml(value)}</td>
    </tr>`).join("");
  return {
    to: input.email,
    subject: "Your Innoserve Portal Login Details",
    html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f4f5f7;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#0B182A;padding:22px 32px;font-size:20px;font-weight:700;color:#fff;">Innoserve<span style="color:#E87D1F;"> Portal</span></td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 14px;font-size:22px;color:#0B182A;">Your account is ready</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;">Hi <strong>${escapeHtml(input.name || input.email)}</strong>,</p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#4b5563;">Your Innoserve Portal account has been created. Use the details below to sign in.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${detailRows}</table>
          <p style="margin:0 0 24px;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 22px;border-radius:7px;background:#E87D1F;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">Sign in to Innoserve</a></p>
          <p style="margin:0;padding:12px 14px;border-radius:7px;background:#fff7ed;font-size:13px;line-height:1.6;color:#9a3412;">For your security, change this temporary password immediately after signing in.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">This is an automated message from Innoserve Techsol.</p>
    </td></tr>
  </table>
</body></html>`,
  };
}

async function main() {
  const [roleMap, credentialRows] = await Promise.all([rolesByEmail(), credentials()]);
  const sent: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];
  for (const row of credentialRows) {
    try {
      await sendEmail(message({
        ...row,
        roles: [...(roleMap.get(row.email) ?? new Set(["Portal User"]))],
      }));
      sent.push(row.email);
    } catch (error) {
      failed.push({
        email: row.email,
        reason: error instanceof Error ? error.message : "Unknown delivery error",
      });
    }
  }
  console.log(JSON.stringify({ attempted: credentialRows.length, sent: sent.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[login-email] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

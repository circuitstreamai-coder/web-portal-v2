import { eq, and, asc } from "drizzle-orm";
import { db } from "../../db/db.js";
import { users, roles, userRoles } from "../../db/schema/index.js";
import { verifyPassword, hashPassword } from "../../utils/hash.js";
import type { AuthUser } from "./auth.schema.js";
import { sendEmail, passwordResetEmail } from "../../services/email.js";

const ALLOWED_STATUSES = ["active"];

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: AuthUser; jwtPayload: { id: string; email: string; role: string } }> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      createdAt: users.createdAt,
      role: roles.name,
      password: users.password,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)),
    )
    .leftJoin(
      roles,
      and(eq(roles.id, userRoles.roleId), eq(roles.deleted, false)),
    )
    .where(and(eq(users.email, email), eq(users.deleted, false)))
    .orderBy(asc(userRoles.createdAt))
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw { statusCode: 401, message: "Invalid credentials" };
  }

  if (!row.password || !(await verifyPassword(password, row.password))) {
    throw { statusCode: 401, message: "Invalid credentials" };
  }

  if (!ALLOWED_STATUSES.includes(row.status)) {
    throw { statusCode: 401, message: "Account is not active. Contact support." };
  }

  const { password: _, ...safeRow } = row;

  return {
    user: {
      ...safeRow,
      role: row.role ?? "unknown",
    },
    jwtPayload: {
      id: row.id,
      email: row.email ?? "",
      role: row.role ?? "unknown",
    },
  };
}

export async function changeUserPassword(
  id: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = await db
    .select({ password: users.password })
    .from(users)
    .where(and(eq(users.id, id), eq(users.deleted, false)))
    .then((r) => r[0]);

  if (!row) {
    throw { statusCode: 404, message: "User not found" };
  }

  if (!row.password || !(await verifyPassword(currentPassword, row.password))) {
    throw { statusCode: 401, message: "Current password is incorrect" };
  }

  const hashed = await hashPassword(newPassword);
  await db.update(users).set({ password: hashed }).where(eq(users.id, id));
}

export async function getCurrentUser(id: string): Promise<AuthUser> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      createdAt: users.createdAt,
      role: roles.name,
      avatarFileId: users.avatarFileId,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)),
    )
    .leftJoin(
      roles,
      and(eq(roles.id, userRoles.roleId), eq(roles.deleted, false)),
    )
    .where(and(eq(users.id, id), eq(users.deleted, false)))
    .orderBy(asc(userRoles.createdAt))
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw { statusCode: 404, message: "User not found" };
  }

  return {
    ...row,
    role: row.role ?? "unknown",
  };
}

export async function sendForgotPasswordEmail(
  email: string,
  signResetToken: (payload: { id: string; email: string; role: string; purpose: string }) => string,
): Promise<void> {
  const user = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
    })
    .from(users)
    .where(and(eq(users.email, email), eq(users.deleted, false)))
    .then((rows) => rows[0]);

  if (!user || !user.email || !ALLOWED_STATUSES.includes(user.status)) {
    return;
  }

  const token = signResetToken({
    id: user.id,
    email: user.email,
    role: "password_reset",
    purpose: "password_reset",
  });

  const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "http://localhost:5173";
  const resetLink = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail(
    passwordResetEmail(user.name || "there", user.email, resetLink),
  );
}

export async function resetUserPassword(
  token: string,
  newPassword: string,
  verifyResetToken: (token: string) => { id: string; email: string; role?: string; purpose?: string },
): Promise<void> {
  let payload: { id: string; email: string; role?: string; purpose?: string };

  try {
    payload = verifyResetToken(token);
  } catch {
    throw { statusCode: 400, message: "Invalid or expired reset token" };
  }

  if (payload.purpose !== "password_reset") {
    throw { statusCode: 400, message: "Invalid reset token" };
  }

  const user = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, payload.id), eq(users.deleted, false)))
    .then((rows) => rows[0]);

  if (!user || user.email !== payload.email) {
    throw { statusCode: 400, message: "Invalid reset token" };
  }

  const hashed = await hashPassword(newPassword);
  await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));
}

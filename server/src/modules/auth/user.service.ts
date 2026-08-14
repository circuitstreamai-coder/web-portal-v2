import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { users, roles, userRoles } from "../../db/schema/index.js";
import { hashPassword } from "../../utils/hash.js";
import { sendEmail, staffWelcomeEmail } from "../../services/email.js";

/** Base select shape — joins role name from the roles table. */
const userSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  status: users.status,
  approvedBy: users.approvedBy,
  approvedAt: users.approvedAt,
  author: users.author,
  createdAt: users.createdAt,
  role: roles.name,
  state: userRoles.state,
};

/**
 * List all non-deleted users, optionally filtered by role name.
 * Each row includes the user's role via a left-join.
 */
export async function listUsers(role?: string) {
  const conditions: ReturnType<typeof eq>[] = [eq(users.deleted, false)];
  if (role) conditions.push(eq(roles.name, role));

  return db
    .select(userSelect)
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.deleted, false)),
    )
    .leftJoin(
      roles,
      and(eq(roles.id, userRoles.roleId), eq(roles.deleted, false)),
    )
    .where(and(...conditions));
}

export async function createUser(input: {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: string;
  author?: string;
}) {
  const [user] = await db.insert(users).values(input).returning();
  return user;
}

function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function createStaffUser(input: {
  name: string;
  email: string;
  phone?: string;
  role: "noc";
  state?: string;
}, approvedBy: string) {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const state = input.state?.trim();
  if (!name || !email) throw { statusCode: 400, message: "Name and email are required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw { statusCode: 400, message: "Enter a valid email" };
  if (input.role !== "noc") throw { statusCode: 400, message: "Unsupported staff role" };
  if (!state) throw { statusCode: 400, message: "State is required to segregate NOC access" };

  const [existing] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.email, email), eq(users.deleted, false))).limit(1);
  if (existing) throw { statusCode: 409, message: "Email is already in use" };

  const [role] = await db.select({ id: roles.id }).from(roles)
    .where(and(eq(roles.name, input.role), eq(roles.deleted, false))).limit(1);
  if (!role) throw { statusCode: 500, message: "NOC role is not configured" };

  const password = generatePassword();
  const hashedPassword = await hashPassword(password);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({
      name,
      email,
      phone: input.phone?.trim() || null,
      password: hashedPassword,
      status: "active",
      approvedBy,
      approvedAt: new Date(),
      author: approvedBy,
    }).returning();
    await tx.insert(userRoles).values({
      userId: created.id,
      roleId: role.id,
      state,
      author: approvedBy,
    });
    await sendEmail(staffWelcomeEmail(name, email, password, "NOC Operator", state));
    return { ...created, role: input.role, state, password: undefined };
  });
  return user;
}

export async function updateUserProfile(
  id: string,
  input: { name?: string; email?: string; avatarFileId?: number },
) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.avatarFileId !== undefined) patch.avatarFileId = input.avatarFileId;

  if (Object.keys(patch).length === 0) {
    throw { statusCode: 400, message: "No fields to update" };
  }

  const [user] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, id), eq(users.deleted, false)))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarFileId: users.avatarFileId,
    });

  if (!user) throw { statusCode: 404, message: "User not found" };
  return user;
}

export async function updateUserStatus(
  id: string,
  status: string,
  approvedBy?: string,
) {
  const [user] = await db
    .update(users)
    .set({
      status,
      approvedBy,
      approvedAt: status === "active" ? new Date() : null,
    })
    .where(eq(users.id, id))
    .returning();
  return user;
}

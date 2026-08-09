import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { users, roles, userRoles } from "../../db/schema/index.js";

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

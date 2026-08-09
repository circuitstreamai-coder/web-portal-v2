import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { roles, userRoles, users } from "../../db/schema/index.js";
import { sendEmail, roleChangedEmail } from "../../services/email.js";

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function listRoles() {
  return db.select().from(roles).where(eq(roles.deleted, false));
}

export async function createRole(input: { name: string; author?: string }) {
  const [role] = await db.insert(roles).values(input).returning();
  return role;
}

// ── UserRoles ─────────────────────────────────────────────────────────────────

export async function listUserRoles() {
  return db.select().from(userRoles).where(eq(userRoles.deleted, false));
}

export async function createUserRole(input: {
  userId: string;
  roleId: string;
  author?: string;
  state?: string;
}) {
  const userRole = await db.transaction(async (tx) => {
    // Prevent duplicate: if this exact role is already active, return it as-is
    const [existing] = await tx
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, input.userId),
          eq(userRoles.roleId, input.roleId),
          eq(userRoles.deleted, false),
        ),
      );
    if (existing) return existing;

    // Soft-delete any other active roles for this user before assigning the new one
    await tx
      .update(userRoles)
      .set({ deleted: true })
      .where(and(eq(userRoles.userId, input.userId), eq(userRoles.deleted, false)));

    const [inserted] = await tx.insert(userRoles).values(input).returning();
    return inserted;
  });

  const [[user], [role]] = await Promise.all([
    db.select().from(users).where(eq(users.id, input.userId)),
    db.select().from(roles).where(eq(roles.id, input.roleId)),
  ]);

  if (user?.email && role?.name) {
    await sendEmail(
      roleChangedEmail(user.name ?? user.email, user.email, role.name),
    );
  }

  return userRole;
}

import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../db/db.js";
import { engineerProfiles, users } from "../../db/schema/index.js";
import { sendEmail, engineerWelcomeEmail, engineerProfileUpdatedEmail } from "../../services/email.js";

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getEngineerProfile(id: string) {
  const [profile] = await db
    .select()
    .from(engineerProfiles)
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)));

  if (!profile) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  return profile;
}

export async function getEngineerProfileByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(engineerProfiles)
    .where(eq(engineerProfiles.userId, userId));
  return profile ?? null;
}

export async function listEngineerProfiles(role: string, userId: string) {
  if (["engineer", "l2_engineer", "l3_engineer"].includes(role)) {
    return db
      .select()
      .from(engineerProfiles)
      .where(
        and(
          eq(engineerProfiles.userId, userId),
          eq(engineerProfiles.deleted, false),
        ),
      );
  }

  return db
    .select()
    .from(engineerProfiles)
    .where(eq(engineerProfiles.deleted, false));
}

/** Returns profiles joined with basic user info — used by the GraphQL resolver. */
export async function listEngineerProfilesWithUsers() {
  return db
    .select({
      id: engineerProfiles.id,
      userId: engineerProfiles.userId,
      referenceId: engineerProfiles.referenceId,
      addressState: engineerProfiles.addressState,
      addressCity: engineerProfiles.addressCity,
      addressPincode: engineerProfiles.addressPincode,
      assignedState: engineerProfiles.assignedState,
      profilePhotoUrl: engineerProfiles.profilePhotoUrl,
      aadhaarFrontUrl: engineerProfiles.aadhaarFrontUrl,
      aadhaarBackUrl: engineerProfiles.aadhaarBackUrl,
      panCardUrl: engineerProfiles.panCardUrl,
      dlFrontUrl: engineerProfiles.dlFrontUrl,
      dlBackUrl: engineerProfiles.dlBackUrl,
      documentsStatus: engineerProfiles.documentsStatus,
      bankAccountNumber: engineerProfiles.bankAccountNumber,
      ifscCode: engineerProfiles.ifscCode,
      accountHolderName: engineerProfiles.accountHolderName,
      cancelChequeUrl: engineerProfiles.cancelChequeUrl,
      author: engineerProfiles.author,
      createdAt: engineerProfiles.createdAt,
      userName: users.name,
      userEmail: users.email,
      userPhone: users.phone,
      userStatus: users.status,
    })
    .from(engineerProfiles)
    .leftJoin(users, eq(users.id, engineerProfiles.userId))
    .where(eq(engineerProfiles.deleted, false));
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createEngineerProfile(input: Record<string, unknown>) {
  const [profile] = await db
    .insert(engineerProfiles)
    .values(input as any)
    .returning();
  return profile;
}

export async function updateEngineerDocumentUrls(
  id: string,
  fields: Record<string, unknown>,
) {
  const [profile] = await db
    .update(engineerProfiles)
    .set(fields as any)
    .where(eq(engineerProfiles.id, id))
    .returning();
  return profile;
}

export async function updateEngineerProfile(
  id: string,
  body: {
    userName?: string;
    userPhone?: string;
    addressState?: string;
    addressCity?: string;
    addressPincode?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
  },
) {
  const { userName, userPhone, ...profileFields } = body;

  const [existing] = await db
    .select()
    .from(engineerProfiles)
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)));

  if (!existing) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  if ((userName !== undefined || userPhone !== undefined) && existing.userId) {
    const userUpdate: Record<string, unknown> = {};
    if (userName !== undefined) userUpdate.name = userName;
    if (userPhone !== undefined) userUpdate.phone = userPhone;
    await db.update(users).set(userUpdate as any).where(eq(users.id, existing.userId));
  }

  const hasProfileFields = Object.keys(profileFields).length > 0;

  let profile = existing;
  if (hasProfileFields) {
    const [updated] = await db
      .update(engineerProfiles)
      .set(profileFields as any)
      .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)))
      .returning();
    profile = updated;
  }

  if (existing.userId && existing.referenceId) {
    const [user] = await db.select().from(users).where(eq(users.id, existing.userId));
    if (user && user.email) {
      await sendEmail(
        engineerProfileUpdatedEmail(
          user.name ?? user.email,
          user.email,
          existing.referenceId,
        ),
      );
    }
  }

  return hasProfileFields ? profile : getEngineerProfile(id);
}

export async function updateAccountStatus(id: string, accountStatus: "active" | "suspended") {
  const [profile] = await db
    .select()
    .from(engineerProfiles)
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)));

  if (!profile) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  await db
    .update(users)
    .set({ status: accountStatus === "suspended" ? "inactive" : "active" })
    .where(eq(users.id, profile.userId));

  return { ...profile, accountStatus };
}

export async function deleteEngineerProfile(id: string) {
  const [profile] = await db
    .update(engineerProfiles)
    .set({ deleted: true })
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)))
    .returning();

  if (!profile) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  return profile;
}

export async function updateDocumentsStatus(id: string, status: string) {
  const [profile] = await db
    .update(engineerProfiles)
    .set({ documentsStatus: status })
    .where(
      and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)),
    )
    .returning();

  if (!profile) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  if (status === "approved") {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, profile.userId));

    if (user && user.email) {
      const plainPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      await db
        .update(users)
        .set({ password: hashedPassword, status: "active" })
        .where(eq(users.id, user.id));
      await sendEmail(
        engineerWelcomeEmail(
          user.name ?? user.email,
          user.email,
          plainPassword,
          profile.referenceId!,
        ),
      );
    }
  }

  return profile;
}

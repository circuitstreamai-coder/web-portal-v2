import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../db/db.js";
import { engineerProfiles, files, users } from "../../db/schema/index.js";
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

  if (!["super_admin", "noc", "state_planner", "project_head", "national_head"].includes(role)) {
    throw { statusCode: 403, message: "Forbidden" };
  }

  return db
    .select()
    .from(engineerProfiles)
    .where(eq(engineerProfiles.deleted, false));
}

/** Returns profiles joined with basic user info — used by the GraphQL resolver. */
export async function listEngineerProfilesWithUsers(role: string, userId: string) {
  const query = db
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
    .leftJoin(users, eq(users.id, engineerProfiles.userId));

  if (["engineer", "l2_engineer", "l3_engineer"].includes(role)) {
    return query.where(
      and(eq(engineerProfiles.userId, userId), eq(engineerProfiles.deleted, false)),
    );
  }

  if (!["super_admin", "noc", "state_planner", "project_head", "national_head"].includes(role)) {
    throw { statusCode: 403, message: "Forbidden" };
  }

  return query.where(eq(engineerProfiles.deleted, false));
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
  const documentFields = [
    "aadhaarFrontUrl", "aadhaarBackUrl", "panCardUrl", "dlFrontUrl",
    "dlBackUrl", "cancelChequeUrl", "profilePhotoUrl",
  ];
  const supplied = documentFields
    .filter((key) => fields[key] !== undefined && fields[key] !== null)
    .map((key) => ({ key, value: fields[key] }));

  const parsed = supplied.map(({ key, value }) => {
    const match = typeof value === "string" ? value.match(/^\/file\/(\d+)$/) : null;
    if (!match) throw { statusCode: 400, message: `${key} is not linked to a valid uploaded file` };
    return { key, id: Number(match[1]) };
  });
  const ids = parsed.map(({ id: fileId }) => fileId);
  if (new Set(ids).size !== ids.length) {
    throw { statusCode: 400, message: "Each document slot must contain a different file" };
  }
  if (ids.length > 0) {
    const storedFiles = await db
      .select({ id: files.id, mimeType: files.mimeType })
      .from(files)
      .where(and(inArray(files.id, ids), eq(files.isDeleted, false)));
    const byId = new Map(storedFiles.map((file) => [file.id, file]));
    for (const entry of parsed) {
      const file = byId.get(entry.id);
      if (!file) throw { statusCode: 400, message: `${entry.key} upload was not found or has expired` };
      if (!(file.mimeType === "application/pdf" || file.mimeType.startsWith("image/"))) {
        throw { statusCode: 400, message: `${entry.key} must be a PDF or image` };
      }
    }
  }

  const [profile] = await db
    .update(engineerProfiles)
    .set({ ...fields, documentsStatus: "pending" } as any)
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)))
    .returning();
  if (!profile) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }
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

  await db
    .update(users)
    .set({ deleted: true, status: "inactive" })
    .where(eq(users.id, profile.userId));

  return profile;
}

export async function updateDocumentsStatus(id: string, status: string) {
  const [existing] = await db
    .select()
    .from(engineerProfiles)
    .where(and(eq(engineerProfiles.id, id), eq(engineerProfiles.deleted, false)));

  if (!existing) {
    throw { statusCode: 404, message: "Engineer profile not found" };
  }

  if (
    status === "approved" &&
    ![
      existing.aadhaarFrontUrl,
      existing.aadhaarBackUrl,
      existing.panCardUrl,
      existing.dlFrontUrl,
      existing.dlBackUrl,
      existing.cancelChequeUrl,
    ].every(Boolean)
  ) {
    throw { statusCode: 400, message: "All required documents must be uploaded before approval" };
  }

  if (status === "approved") {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, existing.userId), eq(users.deleted, false)));

    if (user && !user.password) {
      if (!user.email) {
        throw { statusCode: 400, message: "Engineer login email is required before approval" };
      }
      const plainPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      await sendEmail(
        engineerWelcomeEmail(
          user.name ?? user.email,
          user.email,
          plainPassword,
          existing.referenceId!,
        ),
      );
      await db
        .update(users)
        .set({ password: hashedPassword, status: "active" })
        .where(eq(users.id, user.id));
    } else if (user) {
      await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.id, user.id));
    }
  } else {
    await db
      .update(users)
      .set({ status: status === "rejected" ? "rejected" : "pending" })
      .where(eq(users.id, existing.userId));
  }

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

  return profile;
}

import { and, eq, count, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../db/db.js";
import {
  users,
  roles,
  userRoles,
  engineerProfiles,
  files,
  customers,
} from "../../db/schema/index.js";
import {
  sendEmail,
  customerConfirmationEmail,
  superAdminCustomerNotification,
} from "../../services/email.js";

export async function isEmailAvailable(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalized), eq(users.deleted, false)))
    .limit(1);
  return !existing;
}

async function isPhoneAvailable(phone: string): Promise<boolean> {
  const normalized = phone.trim();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, normalized), eq(users.deleted, false)))
    .limit(1);
  return !existing;
}

function generatePassword(length = 10): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

// ── Engineer onboarding ───────────────────────────────────────────────────────

export interface EngineerOnboardingInput {
  fullName: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  pincode: string;
  profilePhotoId?: number;
  aadhaarFrontId: number;
  aadhaarBackId: number;
  panFileId: number;
  dlFrontId: number;
  dlBackId: number;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  cancelChequeFileId: number;
}

export async function submitEngineerOnboarding(input: EngineerOnboardingInput) {
  const {
    fullName, phone, email,
    state, city, pincode,
    profilePhotoId, aadhaarFrontId, aadhaarBackId, panFileId, dlFrontId, dlBackId,
    accountHolderName, accountNumber, ifsc, cancelChequeFileId,
  } = input;

  const fileIds = [
    aadhaarFrontId, aadhaarBackId, panFileId, dlFrontId, dlBackId, cancelChequeFileId,
    ...(profilePhotoId ? [profilePhotoId] : []),
  ];

  const fileRecords = await db
    .select()
    .from(files)
    .where(inArray(files.id, fileIds));
  const fileMap = Object.fromEntries(
    fileRecords.map((f) => [f.id, `${process.env.BASE_URL}/file/${f.id}`]),
  );

  const plainPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const { profile } = await db.transaction(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(engineerProfiles);
    const referenceId = `ENG-${String(Number(total) + 1).padStart(5, "0")}`;

    const [user] = await tx
      .insert(users)
      .values({
        name: fullName,
        email,
        phone,
        password: hashedPassword,
        status: "pending",
        author: "system",
      })
      .returning();

    const [profile] = await tx
      .insert(engineerProfiles)
      .values({
        userId: user.id,
        referenceId,
        addressState: state,
        addressCity: city,
        addressPincode: pincode,
        profilePhotoUrl: profilePhotoId ? fileMap[profilePhotoId] : null,
        aadhaarFrontUrl: fileMap[aadhaarFrontId],
        aadhaarBackUrl: fileMap[aadhaarBackId],
        panCardUrl: fileMap[panFileId],
        dlFrontUrl: fileMap[dlFrontId],
        dlBackUrl: fileMap[dlBackId],
        cancelChequeUrl: fileMap[cancelChequeFileId],
        accountHolderName,
        bankAccountNumber: accountNumber,
        ifscCode: ifsc,
        documentsStatus: "pending",
        author: "system",
      })
      .returning();

    const [engineerRole] = await tx
      .select()
      .from(roles)
      .where(eq(roles.name, "engineer"));
    if (engineerRole) {
      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: engineerRole.id,
        author: "system",
      });
    }

    return { user, profile };
  });

  return {
    id: profile.id,
    referenceId: profile.referenceId!,
    status: "pending",
    createdAt: profile.createdAt.toISOString(),
  };
}

// ── Bulk engineer onboarding ─────────────────────────────────────────────────

export interface BulkEngineerInput {
  fullName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  pincode: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
}

export interface BulkCreateEngineersResult {
  success: Array<{ id: string; referenceId: string; email: string }>;
  failed: Array<{ row: number; email: string | null; reason: string }>;
}

export async function bulkCreateEngineers(
  engineers: BulkEngineerInput[],
): Promise<BulkCreateEngineersResult> {
  const success: BulkCreateEngineersResult["success"] = [];
  const failed: BulkCreateEngineersResult["failed"] = [];

  type Candidate = {
    rowNum: number;
    eng: BulkEngineerInput;
    normalizedEmail: string;
    normalizedPhone: string;
  };

  // Step 1: Deduplicate within the batch in memory
  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();
  const candidates: Candidate[] = [];

  for (let i = 0; i < engineers.length; i++) {
    const eng = engineers[i];
    const rowNum = i + 1;
    const normalizedEmail = eng.email.trim().toLowerCase();
    const normalizedPhone = eng.phone.trim();

    if (seenEmails.has(normalizedEmail)) {
      failed.push({ row: rowNum, email: eng.email, reason: "Duplicate email within upload batch" });
      continue;
    }
    if (seenPhones.has(normalizedPhone)) {
      failed.push({ row: rowNum, email: eng.email, reason: "Duplicate phone within upload batch" });
      continue;
    }

    seenEmails.set(normalizedEmail, rowNum);
    seenPhones.set(normalizedPhone, rowNum);
    candidates.push({ rowNum, eng, normalizedEmail, normalizedPhone });
  }

  if (candidates.length === 0) return { success, failed };

  // Step 2: Check all emails and phones against the DB in two queries (instead of 2×N)
  const [takenEmailRows, takenPhoneRows] = await Promise.all([
    db
      .select({ email: users.email })
      .from(users)
      .where(
        and(
          inArray(users.email, candidates.map((c) => c.normalizedEmail)),
          eq(users.deleted, false),
        ),
      ),
    db
      .select({ phone: users.phone })
      .from(users)
      .where(
        and(
          inArray(users.phone, candidates.map((c) => c.normalizedPhone)),
          eq(users.deleted, false),
        ),
      ),
  ]);

  const takenEmailSet = new Set(
    takenEmailRows.map((u) => u.email).filter((e): e is string => e !== null),
  );
  const takenPhoneSet = new Set(
    takenPhoneRows.map((u) => u.phone).filter((p): p is string => p !== null),
  );

  const valid: Candidate[] = [];
  for (const c of candidates) {
    if (takenEmailSet.has(c.normalizedEmail)) {
      failed.push({ row: c.rowNum, email: c.eng.email, reason: "Email already in use" });
    } else if (takenPhoneSet.has(c.normalizedPhone)) {
      failed.push({ row: c.rowNum, email: c.eng.email, reason: "Phone number already in use" });
    } else {
      valid.push(c);
    }
  }

  if (valid.length === 0) return { success, failed };

  // Step 3: Hash all passwords in parallel
  const hashes = await Promise.all(
    valid.map(() => bcrypt.hash(generatePassword(), 10)),
  );

  // Step 4: Single transaction — insert all users, profiles, and roles at once
  try {
    await db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: count() }).from(engineerProfiles);
      const baseCount = Number(total);

      const [engineerRole] = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, "engineer"));

      const insertedUsers = await tx
        .insert(users)
        .values(
          valid.map((c, idx) => ({
            name: c.eng.fullName.trim(),
            email: c.normalizedEmail,
            phone: c.normalizedPhone,
            password: hashes[idx],
            status: "pending" as const,
            author: "system",
          })),
        )
        .returning({ id: users.id });

      const insertedProfiles = await tx
        .insert(engineerProfiles)
        .values(
          valid.map((c, idx) => ({
            userId: insertedUsers[idx].id,
            referenceId: `ENG-${String(baseCount + idx + 1).padStart(5, "0")}`,
            addressState: c.eng.state.trim(),
            addressCity: c.eng.city.trim(),
            addressPincode: c.eng.pincode.trim(),
            accountHolderName: c.eng.accountHolderName?.trim() ?? null,
            bankAccountNumber: c.eng.accountNumber?.trim() ?? null,
            ifscCode: c.eng.ifsc?.trim().toUpperCase() ?? null,
            documentsStatus: "pending" as const,
            author: "system",
          })),
        )
        .returning({ id: engineerProfiles.id, referenceId: engineerProfiles.referenceId });

      if (engineerRole) {
        await tx.insert(userRoles).values(
          insertedUsers.map((u) => ({
            userId: u.id,
            roleId: engineerRole.id,
            author: "system",
          })),
        );
      }

      for (let i = 0; i < valid.length; i++) {
        success.push({
          id: insertedProfiles[i].id,
          referenceId: insertedProfiles[i].referenceId!,
          email: valid[i].eng.email,
        });
      }
    });
  } catch (err) {
    const reason =
      typeof err === "object" && err !== null && "code" in err &&
      (err as Record<string, unknown>).code === "23505"
        ? "Email or phone already in use"
        : err instanceof Error
          ? err.message
          : "Unknown error";
    for (const c of valid) {
      failed.push({ row: c.rowNum, email: c.eng.email, reason });
    }
  }

  return { success, failed };
}

// ── Customer onboarding ───────────────────────────────────────────────────────

export interface CustomerOnboardingInput {
  customerName: string;
  companyName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  pincode: string;
  secondaryName?: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
}

export async function submitCustomerOnboarding(input: CustomerOnboardingInput) {
  try {
    const {
      customerName, companyName, contactPersonName,
      email, phone, state, city, pincode,
      secondaryName, secondaryEmail, secondaryPhone,
    } = input;

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), eq(users.deleted, false)))
      .limit(1);

    if (existingUser) {
      throw new Error("Email already exists");
    }

    const { customer } = await db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: count() }).from(customers);
      const referenceId = `CUST-${String(Number(total) + 1).padStart(5, "0")}`;

      const [user] = await tx
        .insert(users)
        .values({
          name: customerName,
          email: normalizedEmail,
          phone,
          status: "pending",
          author: "system",
        })
        .returning();

      const [customer] = await tx
        .insert(customers)
        .values({
          companyName,
          contactPersonName,
          email: normalizedEmail,
          phone,
          addressState: state,
          addressCity: city,
          addressPincode: pincode,
          secondaryContactName: secondaryName ?? null,
          secondaryContactEmail: secondaryEmail ?? null,
          secondaryContactPhone: secondaryPhone ?? null,
          userId: user.id,
          referenceId,
          status: "pending",
          author: "system",
        })
        .returning();

      const [customerRole] = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, "customer"));
      if (customerRole) {
        await tx.insert(userRoles).values({
          userId: user.id,
          roleId: customerRole.id,
          author: "system",
        });
      }

      return { user, customer };
    });

    // Notify all super admins (fire and forget)
    db.select({ email: users.email })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(roles.name, "super_admin"))
      .then((admins) => {
        const notif = superAdminCustomerNotification(
          customerName,
          companyName,
          customer.referenceId!,
        );
        admins.forEach(({ email: adminEmail }) => {
          if (adminEmail) {
            sendEmail({ to: adminEmail, ...notif }).catch((err) =>
              console.error("[onboarding] super admin email failed", adminEmail, err),
            );
          }
        });
      })
      .catch((err) =>
        console.error("[onboarding] super admin notify failed", err),
      );

    sendEmail(customerConfirmationEmail(customerName, normalizedEmail, customer.referenceId!));

    return {
      id: customer.id,
      referenceId: customer.referenceId!,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505" &&
      "constraint" in error &&
      error.constraint === "users_email_unique"
    ) {
      throw new Error("Email already exists");
    }

    if (error instanceof Error && error.message === "Email already exists") {
      throw error;
    }

    console.error("[onboarding] submitCustomerOnboarding failed", error);
    throw new Error("Failed to submit customer onboarding");
  }
}

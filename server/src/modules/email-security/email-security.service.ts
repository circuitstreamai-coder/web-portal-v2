import { eq, and } from "drizzle-orm";
import { db } from "../../db/db.js";
import { emailAllowlist, emailQuotaConfig } from "../../db/schema/index.js";

export async function listAllowlist(customerId: string) {
  return db
    .select()
    .from(emailAllowlist)
    .where(eq(emailAllowlist.customerId, customerId));
}

export async function addAllowlistEntry(
  customerId: string,
  entry: { domain?: string; email?: string },
  createdBy: string,
) {
  if (!entry.domain && !entry.email) {
    throw { statusCode: 400, message: "Provide either a domain or an email address" };
  }
  if (entry.domain && entry.email) {
    throw { statusCode: 400, message: "Provide only one of domain or email, not both" };
  }

  const [row] = await db
    .insert(emailAllowlist)
    .values({ customerId, domain: entry.domain, email: entry.email, createdBy })
    .returning();
  return row;
}

export async function removeAllowlistEntry(customerId: string, entryId: string) {
  const [row] = await db
    .delete(emailAllowlist)
    .where(and(eq(emailAllowlist.id, entryId), eq(emailAllowlist.customerId, customerId)))
    .returning();
  if (!row) throw { statusCode: 404, message: "Allowlist entry not found" };
  return { deleted: true };
}

export async function getQuotaConfig(customerId: string) {
  const [config] = await db
    .select()
    .from(emailQuotaConfig)
    .where(eq(emailQuotaConfig.customerId, customerId));

  if (!config) {
    // Return defaults when not yet configured
    return { customerId, monthlyCap: 500, dailyRateLimitPerSender: 50, emailsThisMonth: 0, suspended: false };
  }
  return config;
}

export async function updateQuotaConfig(
  customerId: string,
  patch: { monthlyCap?: number; dailyRateLimitPerSender?: number },
) {
  if (patch.monthlyCap !== undefined && patch.monthlyCap < 1) {
    throw { statusCode: 400, message: "Monthly cap must be at least 1" };
  }
  if (patch.dailyRateLimitPerSender !== undefined && patch.dailyRateLimitPerSender < 1) {
    throw { statusCode: 400, message: "Daily rate limit must be at least 1" };
  }

  const [existing] = await db
    .select()
    .from(emailQuotaConfig)
    .where(eq(emailQuotaConfig.customerId, customerId));

  if (!existing) {
    const [created] = await db
      .insert(emailQuotaConfig)
      .values({
        customerId,
        monthlyCap: patch.monthlyCap ?? 500,
        dailyRateLimitPerSender: patch.dailyRateLimitPerSender ?? 50,
      })
      .returning();
    return created;
  }

  const updates: Partial<typeof emailQuotaConfig.$inferInsert> = {};
  if (patch.monthlyCap !== undefined) updates.monthlyCap = patch.monthlyCap;
  if (patch.dailyRateLimitPerSender !== undefined) updates.dailyRateLimitPerSender = patch.dailyRateLimitPerSender;

  const [updated] = await db
    .update(emailQuotaConfig)
    .set(updates)
    .where(eq(emailQuotaConfig.customerId, customerId))
    .returning();

  return updated;
}

export async function resumeEmailProcessing(customerId: string) {
  const [config] = await db
    .select()
    .from(emailQuotaConfig)
    .where(eq(emailQuotaConfig.customerId, customerId));

  if (!config) throw { statusCode: 404, message: "No quota config found for this customer" };
  if (!config.suspended) throw { statusCode: 400, message: "Email processing is not suspended" };

  const [updated] = await db
    .update(emailQuotaConfig)
    .set({
      suspended: false,
      suspendedAt: null,
      suspendedReason: null,
    })
    .where(eq(emailQuotaConfig.customerId, customerId))
    .returning();

  return updated;
}

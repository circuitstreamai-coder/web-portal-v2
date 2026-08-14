import { eq, and, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { db } from "../../db/db.js";
import { customers, projects, roles, tickets, userRoles, users } from "../../db/schema/index.js";
import { hashPassword } from "../../utils/hash.js";
import {
  sendEmail,
  customerWelcomeEmail,
  customerProfileUpdatedEmail,
} from "../../services/email.js";
import type { CreateCustomerBody, UpdateCustomerBody } from "./customer.schema.js";

function generateReferenceId(): string {
  return "CUST-" + uuidv7().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function generatePassword(length = 10): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

export async function createCustomer(
  data: CreateCustomerBody,
  isAdmin: boolean,
  approvedById?: string,
) {
  const status = isAdmin ? "active" : "pending";
  const referenceId = generateReferenceId();

  if (isAdmin) {
    const normalizedEmail = data.email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw { statusCode: 400, message: "Customer email is required to create portal access" };
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), eq(users.deleted, false)))
      .limit(1);
    if (existingUser) {
      throw { statusCode: 409, message: "Email is already in use" };
    }

    const [customerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, "customer"), eq(roles.deleted, false)))
      .limit(1);
    if (!customerRole) {
      throw { statusCode: 500, message: "Customer role is not configured" };
    }

    const plainPassword = generatePassword();
    const hashedPassword = await hashPassword(plainPassword);
    let approvedBy: string | undefined;
    if (approvedById) {
      const [approver] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, approvedById));
      approvedBy = approver?.name ?? approver?.email ?? approvedById;
    }

    const customer = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: data.contactPersonName,
          email: normalizedEmail,
          phone: data.phone,
          password: hashedPassword,
          status: "active",
          approvedBy,
          approvedAt: new Date(),
          author: data.author ?? "admin",
        })
        .returning();

      const [createdCustomer] = await tx
        .insert(customers)
        .values({
          ...data,
          email: normalizedEmail,
          userId: user.id,
          status,
          referenceId,
          approvedBy,
          approvedAt: new Date(),
        })
        .returning();

      await tx.insert(projects).values({
        customerId: createdCustomer.id,
        name: `${data.companyName?.trim() || "Customer"} - General Support`,
        author: data.author ?? "admin",
      });

      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: customerRole.id,
        author: data.author ?? "admin",
      });

      await sendEmail(
        customerWelcomeEmail(
          data.contactPersonName ?? normalizedEmail,
          normalizedEmail,
          plainPassword,
          referenceId,
        ),
      );

      return createdCustomer;
    });

    return customer;
  }

  const [customer] = await db
    .insert(customers)
    .values({ ...data, status, referenceId })
    .returning();

  return customer;
}

export async function approveCustomer(id: string, approvedById: string) {
  return setCustomerStatus(id, "active", approvedById);
}

export async function provisionCustomerAccess(id: string, approvedById: string) {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, id), eq(customers.deleted, false))).limit(1);
  if (!customer) throw { statusCode: 404, message: "Customer not found" };
  if (customer.userId) throw { statusCode: 409, message: "Portal access is already linked" };
  const email = customer.email?.trim().toLowerCase();
  if (!email) throw { statusCode: 400, message: "Add a customer email before creating portal access" };

  const [existingUser] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.email, email), eq(users.deleted, false))).limit(1);
  if (existingUser) throw { statusCode: 409, message: "Email already belongs to another portal account" };
  const [customerRole] = await db.select({ id: roles.id }).from(roles)
    .where(and(eq(roles.name, "customer"), eq(roles.deleted, false))).limit(1);
  if (!customerRole) throw { statusCode: 500, message: "Customer role is not configured" };

  const password = generatePassword();
  const hashedPassword = await hashPassword(password);
  const [approver] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, approvedById));
  const approvedBy = approver?.name ?? approver?.email ?? approvedById;

  const updated = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      name: customer.contactPersonName,
      email,
      phone: customer.phone,
      password: hashedPassword,
      status: "active",
      approvedBy,
      approvedAt: new Date(),
      author: approvedById,
    }).returning();
    await tx.insert(userRoles).values({ userId: user.id, roleId: customerRole.id, author: approvedById });
    const [linked] = await tx.update(customers).set({
      userId: user.id,
      status: "active",
      approvedBy,
      approvedAt: new Date(),
    }).where(eq(customers.id, customer.id)).returning();
    await sendEmail(customerWelcomeEmail(customer.contactPersonName ?? email, email, password, customer.referenceId!));
    return linked;
  });
  return updated;
}

export async function rejectCustomer(id: string, approvedById: string) {
  return setCustomerStatus(id, "rejected", approvedById);
}

/**
 * Low-level status setter used by the GraphQL resolver (handles any status,
 * not just "active").  For the REST approval flow use `approveCustomer`.
 */
export async function setCustomerStatus(
  id: string,
  status: string,
  approvedById?: string,
) {
  const [existingCustomer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.deleted, false)));

  if (!existingCustomer) {
    throw { statusCode: 404, message: "Customer not found" };
  }

  let approvedBy: string | undefined;
  if (approvedById) {
    const [approver] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, approvedById));
    approvedBy = approver?.name ?? approver?.email ?? approvedById;
  }

  if (existingCustomer.userId) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, existingCustomer.userId), eq(users.deleted, false)));

    if (user && status === "active" && !user.password) {
      if (!user.email) {
        throw { statusCode: 400, message: "Customer login email is required before approval" };
      }
      const plainPassword = generatePassword();
      const hashedPassword = await hashPassword(plainPassword);
      await sendEmail(
        customerWelcomeEmail(
          user.name ?? user.email,
          user.email,
          plainPassword,
          existingCustomer.referenceId!,
        ),
      );
      await db
        .update(users)
        .set({ password: hashedPassword, status: "active" })
        .where(eq(users.id, user.id));
    } else if (user) {
      await db
        .update(users)
        .set({ status: status === "active" ? "active" : status })
        .where(eq(users.id, user.id));
    }
  }

  const [customer] = await db
    .update(customers)
    .set({
      status,
      approvedBy,
      approvedAt: status === "active" ? new Date() : null,
    })
    .where(and(eq(customers.id, id), eq(customers.deleted, false)))
    .returning();

  if (!customer) throw { statusCode: 404, message: "Customer not found" };

  return customer;
}

export async function deleteCustomer(id: string) {
  const [customer] = await db
    .update(customers)
    .set({ deleted: true, status: "inactive" })
    .where(and(eq(customers.id, id), eq(customers.deleted, false)))
    .returning();

  if (!customer) {
    throw { statusCode: 404, message: "Customer not found" };
  }

  if (customer.userId) {
    await db
      .update(users)
      .set({ deleted: true, status: "inactive" })
      .where(eq(users.id, customer.userId));
  }

  const customerProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.customerId, customer.id), eq(projects.deleted, false)));
  const projectIds = customerProjects.map((project) => project.id);
  if (projectIds.length > 0) {
    await db.update(tickets).set({ deleted: true }).where(inArray(tickets.projectId, projectIds));
    await db.update(projects).set({ deleted: true }).where(inArray(projects.id, projectIds));
  }

  return customer;
}

export async function createCustomerDirect(input: Record<string, unknown>) {
  const [customer] = await db.insert(customers).values(input as any).returning();
  return customer;
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomerBody,
) {
  const [customer] = await db
    .update(customers)
    .set(data)
    .where(and(eq(customers.id, id), eq(customers.deleted, false)))
    .returning();

  if (!customer) {
    throw { statusCode: 404, message: "Customer not found" };
  }

  const recipientEmail = customer.email;
  const recipientName = customer.contactPersonName ?? recipientEmail;
  if (recipientEmail && customer.referenceId) {
    await sendEmail(
      customerProfileUpdatedEmail(
        recipientName ?? recipientEmail,
        recipientEmail,
        customer.referenceId,
      ),
    );
  }

  return customer;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveApprovedBy(rows: { approvedBy: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.approvedBy).filter((v): v is string => !!v && UUID_RE.test(v)))];
  if (ids.length === 0) return rows;

  const approvers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids));
  const nameMap = new Map(approvers.map((u) => [u.id, u.name ?? u.email ?? u.id]));

  return rows.map((r) =>
    r.approvedBy && nameMap.has(r.approvedBy)
      ? { ...r, approvedBy: nameMap.get(r.approvedBy)! }
      : r,
  );
}

export async function listCustomers(role: string, userId: string) {
  if (role !== "customer") {
    // super_admin, noc, state_planner, project_head, engineer — all records
    const rows = await db.select().from(customers).where(eq(customers.deleted, false));
    return resolveApprovedBy(rows);
  }

  // customer role — only their own record
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.userId, userId), eq(customers.deleted, false)));
  return resolveApprovedBy(rows);
}

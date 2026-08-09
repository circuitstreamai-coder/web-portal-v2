import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/db.js";
import { notifications } from "../../db/schema/index.js";

export type NotificationType = "info" | "success" | "warning" | "error";

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message?: string,
  href?: string,
) {
  await db.insert(notifications).values({ userId, type, title, message, href });
}

export async function listNotifications(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.deleted, false)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: string, userId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (!updated) throw { statusCode: 404, message: "Notification not found" };
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}

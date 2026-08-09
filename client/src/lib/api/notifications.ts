import { restRequest } from './rest';
import type { Notification } from '$lib/stores/notifications';

// Shape returned by the backend
interface BackendNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  href?: string;
  read: boolean;
  createdAt: string; // ISO-8601
}

/**
 * Fetch the current user's notifications from the backend.
 * Returns an empty array if the endpoint is unavailable (graceful degradation).
 */
export async function fetchNotifications(): Promise<Notification[]> {
  try {
    const items = await restRequest<BackendNotification[]>('/api/notifications');
    return items.map((n) => ({
      ...n,
      createdAt: new Date(n.createdAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Mark a single notification as read on the backend.
 * Silently ignores errors (best-effort; UI is already updated optimistically).
 */
export async function patchNotificationRead(id: string): Promise<void> {
  try {
    await restRequest<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });
  } catch {
    // best-effort — UI state was already updated optimistically
  }
}

/**
 * Mark all notifications as read on the backend.
 */
export async function patchAllNotificationsRead(): Promise<void> {
  try {
    await restRequest<void>('/api/notifications/read-all', { method: 'PATCH' });
  } catch {
    // best-effort
  }
}

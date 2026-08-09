import { writable, derived } from 'svelte/store';
import { patchNotificationRead, patchAllNotificationsRead } from '$lib/api/notifications';

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  href?: string;
  read: boolean;
  createdAt: Date;
}

export type NewNotification = Omit<Notification, 'id' | 'read' | 'createdAt'>;

// ── Store ──────────────────────────────────────────────────────────────────

function createNotificationStore() {
  const { subscribe, update, set } = writable<Notification[]>([]);

  return {
    subscribe,

    /** Bulk-load notifications from the backend (replaces current list). */
    seed(items: Notification[]) {
      set(items);
    },

    /** Prepend a new client-side notification (e.g. after a REST action). */
    push(n: NewNotification) {
      update((items) => [
        {
          ...n,
          id: crypto.randomUUID(),
          read: false,
          createdAt: new Date(),
        },
        ...items,
      ]);
    },

    /** Mark one notification as read locally and sync to backend. */
    markRead(id: string) {
      update((items) => items.map((n) => (n.id === id ? { ...n, read: true } : n)));
      patchNotificationRead(id);
    },

    /** Mark all notifications as read locally and sync to backend. */
    markAllRead() {
      update((items) => items.map((n) => ({ ...n, read: true })));
      patchAllNotificationsRead();
    },

    remove(id: string) {
      update((items) => items.filter((n) => n.id !== id));
    },

    clear() {
      set([]);
    },
  };
}

export const notifications = createNotificationStore();

// ── Derived ────────────────────────────────────────────────────────────────

export const unreadCount = derived(notifications, ($n) => $n.filter((n) => !n.read).length);

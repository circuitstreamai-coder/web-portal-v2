import { writable } from "svelte/store";

export const sidebarCollapsed = writable(false);
export const mobileOpen = writable(false);

export function toggleSidebar() {
  sidebarCollapsed.update((v) => !v);
}

export function toggleMobileSidebar() {
  mobileOpen.update((v) => !v);
}

export function closeMobileSidebar() {
  mobileOpen.set(false);
}

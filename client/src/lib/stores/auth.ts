import { writable, derived } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { authMe, authLogout as apiLogout } from '$lib/utils/api';
import type { Role } from '$lib/config/roles';
import { ROLE_REDIRECTS } from '$lib/config/roles';

// Re-export so existing consumers of '$lib/stores/auth' keep working.
export type { Role };
export { ROLE_REDIRECTS };

// ── Types ──────────────────────────────────────────────────────────────────

export interface User {
	id: string;
	email: string;
	name: string;
	role: Role;
	avatarFileId?: number | null;
}

export interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	loading: boolean;
}

// ── Store factory ──────────────────────────────────────────────────────────

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		user: null,
		isAuthenticated: false,
		loading: false,
	});

	return {
		subscribe,

		setUser(user: User) {
			set({ user, isAuthenticated: true, loading: false });
		},

		clear() {
			set({ user: null, isAuthenticated: false, loading: false });
		},

		async fetchUser(): Promise<User | null> {
			if (!browser) return null;
			update((s) => ({ ...s, loading: true }));
			try {
				const user = await authMe();
				set({ user, isAuthenticated: true, loading: false });
				return user;
			} catch {
				set({ user: null, isAuthenticated: false, loading: false });
				return null;
			}
		},

		async logout(): Promise<void> {
			try {
				await apiLogout();
			} finally {
				set({ user: null, isAuthenticated: false, loading: false });
				goto('/login');
			}
		},
	};
}

export const authStore = createAuthStore();

// ── Convenience derived stores ─────────────────────────────────────────────

export const user = derived(authStore, ($s) => $s.user);
export const isAuthenticated = derived(authStore, ($s) => $s.isAuthenticated);
export const role = derived(authStore, ($s) => $s.user?.role ?? null);

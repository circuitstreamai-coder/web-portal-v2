import type { LayoutLoad } from './$types';
import { portalRoleForPath } from '$lib/utils/portal-session';

// Public paths — skip auth check entirely
const PUBLIC_PATHS = new Set(['/', '/login', '/auth', '/unauthorized', '/forgot-password', '/reset-password', '/customer/register']);
const PUBLIC_PREFIXES = ['/onboarding/'];

export const load: LayoutLoad = async ({ fetch, url }) => {
	const isPublic =
		PUBLIC_PATHS.has(url.pathname) ||
		PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p));
	if (isPublic) {
		return { user: null };
	}

	try {
		// Use SvelteKit's enhanced fetch so cookies are forwarded on both server and client.
		const role = portalRoleForPath(url.pathname);
		const res = await fetch('/api/auth/me', {
			credentials: 'include',
			headers: role ? { 'X-Portal-Role': role } : {},
		});
		if (!res.ok) return { user: null };
		const data = await res.json();
		// Normalise: some APIs return { user: {...} }, others return the user directly
		const user = data?.user ?? data;
		if (!user?.id) return { user: null };
		return { user };
	} catch {
		return { user: null };
	}
};

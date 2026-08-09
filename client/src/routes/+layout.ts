import type { LayoutLoad } from './$types';

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
		const res = await fetch('/api/auth/me', { credentials: 'include' });
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

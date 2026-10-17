import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { portalRoleForPath } from '$lib/utils/portal-session';
import { getSupabaseClient, isSupabaseConfigured, supabaseAuthHeaders, supabaseFunctionUrl } from '$lib/supabase/client';

// Public paths — skip auth check entirely
const PUBLIC_PATHS = new Set(['/', '/login', '/auth', '/unauthorized', '/forgot-password', '/reset-password', '/customer/register']);
const PUBLIC_PREFIXES = ['/onboarding/'];

// Supabase Auth persists browser sessions. Rendering authenticated route guards
// in the browser avoids a false redirect before that session is hydrated.
export const ssr = false;

export const load: LayoutLoad = async ({ fetch, url }) => {
	const isPublic =
		PUBLIC_PATHS.has(url.pathname) ||
		PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p));
	if (isPublic) {
		return { user: null };
	}

	try {
		if (browser && isSupabaseConfigured()) {
			const { data: sessionData } = await getSupabaseClient().auth.getSession();
			if (!sessionData.session) return { user: null };
			const role = portalRoleForPath(url.pathname);
			const headers = await supabaseAuthHeaders(role ? { 'X-Portal-Role': role } : undefined);
			const res = await fetch(supabaseFunctionUrl('api', '/api/auth/me'), { headers });
			if (!res.ok) return { user: null };
			return { user: await res.json() };
		}
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

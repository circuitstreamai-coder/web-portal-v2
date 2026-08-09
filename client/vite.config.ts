import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type ProxyOptions } from 'vite';

// Routes handled by SvelteKit itself — must not be forwarded to the backend.
// Keep in sync with INTERNAL_API_PREFIXES in src/hooks.server.ts.
const INTERNAL_API_PREFIXES = ['/api/otp/', '/api/stream', '/api/paginated/'];

const bypassInternalRoutes: ProxyOptions['bypass'] = (req) => {
	if (req.url && INTERNAL_API_PREFIXES.some((p) => req.url!.startsWith(p))) {
		return req.url;
	}
};

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		proxy: {
			'/graphql': 'http://localhost:4000',
			'/upload': 'http://localhost:4000',
			'/file': 'http://localhost:4000',
			'/api/': {
				target: 'http://localhost:4000',
				changeOrigin: true,
				bypass: bypassInternalRoutes
			}
		}
	}
});

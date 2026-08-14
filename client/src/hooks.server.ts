import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

function getApiBase() {
  const configuredBase = env.PRIVATE_API_BASE_URL?.trim();
  if (configuredBase) return configuredBase.replace(/\/$/, '');
  if (dev) return 'http://localhost:4000';

  throw new Error('PRIVATE_API_BASE_URL is required in production');
}

// Routes handled by SvelteKit itself — must not be forwarded to Railway.
const INTERNAL_API_PREFIXES = [
  '/api/stream',     // SSE real-time stream
  '/api/paginated/', // Server-side paginated data endpoints
];

function shouldProxy(pathname: string): boolean {
  if (INTERNAL_API_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (pathname === '/graphql') return true;
  if (pathname === '/upload') return true;
  if (pathname.startsWith('/file/')) return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;

  if (shouldProxy(pathname)) {
    const target = `${getApiBase()}${pathname}${search}`;

    const proxyHeaders = new Headers(event.request.headers);
    proxyHeaders.delete('host');
    proxyHeaders.delete('accept-encoding');

    const response = await fetch(target, {
      method: event.request.method,
      headers: proxyHeaders,
      body: ['GET', 'HEAD'].includes(event.request.method)
        ? undefined
        : event.request.body,
      // @ts-expect-error — Node 18+ streams need duplex hint
      duplex: 'half',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  return resolve(event);
};

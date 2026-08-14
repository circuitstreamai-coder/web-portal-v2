import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';

// Use Vercel Edge runtime — no execution timeout, supports long-lived streaming.
export const config: Config = { runtime: 'edge' };

// Re-open the connection every 55 s from the client side so it fits safely
// within any upstream proxy timeout; EventSource auto-reconnects.
const POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 25_000;

interface BackendNotification {
  id: string;
  type: string;
  title: string;
  message?: string;
  href?: string;
  read: boolean;
  createdAt: string;
}

export const GET: RequestHandler = async ({ fetch, request, url }) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function enqueue(line: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          closed = true;
        }
      }

      function sendEvent(event: string, data: unknown) {
        enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      // Announce connection
      sendEvent('connected', { ts: Date.now() });

      let lastNotifHash = '';

      async function pollNotifications() {
        if (closed) return;
        try {
          const portalRole = url.searchParams.get('portalRole');
          const res = await fetch('/api/notifications', {
            headers: portalRole ? { 'X-Portal-Role': portalRole } : {},
          });
          if (!res.ok) return;
          const items: BackendNotification[] = await res.json();
          // Hash on id+read so we only push when something actually changed
          const hash = items.map((n) => `${n.id}:${n.read}`).join(',');
          if (hash !== lastNotifHash) {
            lastNotifHash = hash;
            sendEvent('notifications', items);
          }
        } catch {
          // Ignore transient network errors — next poll will retry
        }
      }

      await pollNotifications();
      const pollTimer = setInterval(pollNotifications, POLL_INTERVAL_MS);

      // Heartbeat comment keeps proxies from closing an idle connection
      const heartbeatTimer = setInterval(() => {
        enqueue(': heartbeat\n\n');
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx response buffering
    },
  });
};

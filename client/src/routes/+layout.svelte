<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/innoserve-techsol-logo.svg";
  import { Toaster } from "svelte-sonner";
  import { authStore } from "$lib/stores/auth";
  import { notifications } from "$lib/stores/notifications";

  interface BackendNotification {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message?: string;
    href?: string;
    read: boolean;
    createdAt: string;
  }

  let { data, children } = $props();

  // Hydrate the auth store from the server-loaded user (runs once on mount / after SSR)
  $effect(() => {
    if (data.user) {
      authStore.setUser(data.user);
    }
  });

  // Open an SSE connection to /api/stream.
  // The server polls the Railway backend every 10 s and pushes a 'notifications'
  // event only when something changes — true push from the browser's perspective.
  // EventSource auto-reconnects if the connection drops (e.g. Vercel 55 s timeout).
  $effect(() => {
    if (!data.user) return;

    let source: EventSource | null = null;

    function connect() {
      source = new EventSource('/api/stream');

      source.addEventListener('notifications', (e: MessageEvent) => {
        const items: BackendNotification[] = JSON.parse(e.data);
        const mapped = items.map((n) => ({ ...n, createdAt: new Date(n.createdAt) }));
        if (mapped.length > 0) notifications.seed(mapped);
      });

      // onerror fires on connection drop; EventSource will auto-reconnect,
      // but we close explicitly so it can reopen with a clean state.
      source.onerror = () => {
        source?.close();
        source = null;
        setTimeout(connect, 3_000);
      };
    }

    connect();
    return () => {
      source?.close();
      source = null;
    };
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<Toaster richColors position="top-right" expand={true} />

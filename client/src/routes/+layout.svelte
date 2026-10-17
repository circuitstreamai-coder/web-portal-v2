<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/innoserve-techsol-logo.svg";
  import { Toaster } from "svelte-sonner";
  import { authStore } from "$lib/stores/auth";
  import { notifications } from "$lib/stores/notifications";
  import { currentPortalRole } from "$lib/utils/portal-session";
  import { fetchNotifications } from "$lib/api/notifications";
  import { isSupabaseConfigured } from "$lib/supabase/client";

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

  // Supabase mode polls the compatibility API; legacy mode retains the SSE
  // bridge so rollback does not change notification behaviour.
  $effect(() => {
    if (!data.user) return;

    if (isSupabaseConfigured()) {
      let active = true;
      const refresh = async () => {
        const items = await fetchNotifications();
        if (active) notifications.seed(items);
      };
      refresh();
      const timer = setInterval(refresh, 10_000);
      return () => { active = false; clearInterval(timer); };
    }

    let source: EventSource | null = null;

    function connect() {
      const role = currentPortalRole();
      source = new EventSource(`/api/stream${role ? `?portalRole=${encodeURIComponent(role)}` : ""}`);

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

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { notifications } from '$lib/stores/notifications';
  import { restRequest } from '$lib/api/rest';

  interface Props {
    /** Only roles that should monitor SLA need the poller. */
    enabled?: boolean;
    /** Link to navigate to when clicking the notification. */
    slaHref?: string;
  }

  let { enabled = true, slaHref = '' }: Props = $props();

  const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
  const BREACH_WINDOW = 4 * 60 * 60 * 1000; // 4 hours → "breaching soon"

  // Track IDs already alerted this session so we don't spam on every poll.
  const alertedIds = new Set<string>();

  interface SlimTicket { id: string; ticketNumber?: string; title: string; slaDeadline?: string | null; status: string; }

  async function pollSla() {
    if (!enabled) return;
    try {
      const tickets = await restRequest<SlimTicket[]>('/api/tickets?pageSize=200');
      const now = Date.now();
      for (const t of tickets) {
        if (!t.slaDeadline) continue;
        if (t.status === 'resolved' || t.status === 'closed') continue;
        const diff = new Date(t.slaDeadline).getTime() - now;
        const id = t.id;
        if (diff < 0 && !alertedIds.has(`breached:${id}`)) {
          alertedIds.add(`breached:${id}`);
          notifications.push({
            type: 'error',
            title: `SLA Breached — ${t.ticketNumber || id.slice(0, 8)}`,
            message: t.title,
            href: slaHref || undefined,
          });
        } else if (diff >= 0 && diff < BREACH_WINDOW && !alertedIds.has(`breaching:${id}`)) {
          alertedIds.add(`breaching:${id}`);
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          notifications.push({
            type: 'warning',
            title: `SLA Breaching Soon — ${t.ticketNumber || id.slice(0, 8)}`,
            message: `${h}h ${m}m left · ${t.title}`,
            href: slaHref || undefined,
          });
        }
      }
    } catch {
      // silent — don't disturb UX if poll fails
    }
  }

  let timer: ReturnType<typeof setInterval>;

  onMount(() => {
    if (!enabled) return;
    pollSla();
    timer = setInterval(pollSla, POLL_INTERVAL);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

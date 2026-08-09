<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import type { Project } from "$lib/modules/data/projects/queries";
  import type { Ticket } from "$lib/modules/data/tickets/queries";
  import { restRequest } from "$lib/api/rest";
  import { queryVersion } from "$lib/stores/query";

  // ── State ─────────────────────────────────────────────────────────────────

  let projects = $state<Project[]>([]);
  let tickets = $state<Ticket[]>([]);
  let loading = $state(true);
  let lastSeenProjectsVersion = $state<number | null>(null);
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadData() {
    const [projectData, ticketData] = await Promise.all([
      restRequest<Project[]>("/api/projects"),
      restRequest<Ticket[]>("/api/tickets"),
    ]);
    projects = projectData;
    tickets = ticketData;
  }

  onMount(async () => {
    try {
      await loadData();
    } catch (err) {
      toast.error("Failed to load projects");
    } finally {
      loading = false;
    }
  });

  function watchVersion(key: "projects" | "tickets", lastSeen: number | null, setLastSeen: (v: number) => void) {
    const version = $queryVersion[key];
    if (lastSeen === null) {
      setLastSeen(version);
      return;
    }
    if (version === lastSeen) return;
    setLastSeen(version);
    void loadData().catch(() => toast.error("Failed to refresh projects"));
  }

  $effect(() => watchVersion("projects", lastSeenProjectsVersion, (v) => (lastSeenProjectsVersion = v)));
  $effect(() => watchVersion("tickets", lastSeenTicketsVersion, (v) => (lastSeenTicketsVersion = v)));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function normalizeStatus(status: string) {
    return status?.toLowerCase().replace(/\s+/g, "_") ?? "";
  }

  function ticketsForProject(projectId: string): Ticket[] {
    return tickets.filter((t) => t.projectId === projectId);
  }

  function countByStatus(projectId: string, statuses: string[]): number {
    return ticketsForProject(projectId).filter((t) => statuses.includes(normalizeStatus(t.status))).length;
  }

  function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalTickets = $derived(tickets.length);
  const openTickets = $derived(tickets.filter((t) => normalizeStatus(t.status) === "open").length);
  const inProgressTickets = $derived(
    tickets.filter((t) => ["assigned", "accepted", "in_progress"].includes(normalizeStatus(t.status))).length,
  );
  const resolvedTickets = $derived(
    tickets.filter((t) => ["resolved", "closed"].includes(normalizeStatus(t.status))).length,
  );
</script>

<svelte:head><title>My Projects · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <!-- Header row -->
  <div class="bg-white rounded-xl px-5 py-4 shadow">
    <h2 class="text-[18px] font-semibold text-[#0B182A]">My Projects</h2>
    <p class="text-[13px] text-gray-400 mt-0.5">Projects your organization has with Innoserve Techsol</p>
  </div>

  <!-- Stats strip -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {#each [
      { label: "Projects", value: projects.length, color: "text-[#0B182A]" },
      { label: "Open Tickets", value: openTickets, color: "text-blue-600" },
      { label: "In Progress", value: inProgressTickets, color: "text-amber-600" },
      { label: "Resolved", value: resolvedTickets, color: "text-green-600" },
    ] as stat}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
        <p class="text-[24px] font-bold {stat.color}">{loading ? "—" : stat.value}</p>
      </div>
    {/each}
  </div>

  <!-- Projects table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">All Projects</h3>
      <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{projects.length} Total</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["PROJECT", "TOTAL TICKETS", "OPEN", "IN PROGRESS", "RESOLVED", "CREATED"] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan="6" class="py-12 text-center text-[13px] text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if projects.length === 0}
            <tr>
              <td colspan="6" class="py-16 text-center">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                    <Icons.Folder size={22} stroke="#9ca3af" />
                  </div>
                  <p class="text-[13px] text-gray-400">No projects assigned yet</p>
                  <p class="text-[12px] text-gray-400">Contact your account manager to get a project set up</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each projects as p}
              <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#0B182A] whitespace-nowrap">{p.name || "—"}</td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{ticketsForProject(p.id).length}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                    {countByStatus(p.id, ["open"])}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
                    {countByStatus(p.id, ["assigned", "accepted", "in_progress"])}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">
                    {countByStatus(p.id, ["resolved", "closed"])}
                  </span>
                </td>
                <td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(p.createdAt)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

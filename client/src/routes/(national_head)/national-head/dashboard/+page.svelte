<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { authStore } from "$lib/stores/auth";
  import { fetchAdminDashboardData } from "$lib/api/admin";

  const user = $derived($authStore.user);

  let loading = $state(true);
  let totalTickets = $state<number | null>(null);
  let activeEngineers = $state<number | null>(null);
  let openProjects = $state<number | null>(null);
  let customers = $state<number | null>(null);

  onMount(async () => {
    try {
      const { summary } = await fetchAdminDashboardData();
      totalTickets    = summary.totalTickets;
      activeEngineers = summary.activeEngineers;
      openProjects    = summary.openProjects;
      customers       = summary.customers;
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      loading = false;
    }
  });

  function fmt(n: number | null): string {
    if (n === null) return "—";
    return n.toLocaleString("en-IN");
  }
</script>

<svelte:head><title>National Head · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
      Welcome back, {user?.name ?? "National Head"} 👋
    </h2>
    <p class="text-[14px] text-gray-500">
      You have full operational oversight across projects with read and write
      access, excluding delete actions.
    </p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each [
      { label: "Total Tickets",   value: fmt(totalTickets),    color: "text-blue-700",    bg: "bg-blue-50" },
      { label: "Active Engineers",value: fmt(activeEngineers), color: "text-emerald-700", bg: "bg-emerald-50" },
      { label: "Open Projects",   value: fmt(openProjects),    color: "text-amber-700",   bg: "bg-amber-50" },
      { label: "Customers",       value: fmt(customers),       color: "text-purple-700",  bg: "bg-purple-50" },
    ] as stat}
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
        <p class="text-[28px] font-bold {stat.color} {loading ? 'animate-pulse' : ''}">
          {loading ? "…" : stat.value}
        </p>
      </div>
    {/each}
  </div>
</div>

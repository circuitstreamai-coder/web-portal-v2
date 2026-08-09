<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    fetchAdminDashboardData,
    type AdminDashboardSummary,
  } from "$lib/api/admin";
  import { authStore } from "$lib/stores/auth";

  const user = $derived($authStore.user);

  let loading = $state(true);
  let summary = $state<AdminDashboardSummary>({
    totalTickets: 0,
    activeEngineers: 0,
    openProjects: 0,
    customers: 0,
  });

  onMount(async () => {
    try {
      const data = await fetchAdminDashboardData();
      summary = data.summary;
    } catch (err) {
      toast.error(`Failed to load dashboard: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
      Welcome back, {user?.name ?? "Admin"} 👋
    </h2>
    <p class="text-[14px] text-gray-500">
      You have full system access as Super Administrator.
    </p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each [{ label: "Total Tickets", value: summary.totalTickets, color: "bg-blue-50 text-blue-700" }, { label: "Active Engineers", value: summary.activeEngineers, color: "bg-emerald-50 text-emerald-700" }, { label: "Open Projects", value: summary.openProjects, color: "bg-amber-50 text-amber-700" }, { label: "Customers", value: summary.customers, color: "bg-purple-50 text-purple-700" }] as stat}
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
        <p class="text-[28px] font-bold {stat.color.split(' ')[1]}">
          {loading ? "—" : stat.value}
        </p>
      </div>
    {/each}
  </div>
</div>

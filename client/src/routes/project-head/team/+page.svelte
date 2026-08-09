<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { fetchProjectHeadTeam } from '$lib/api/project-head';
  import type { ProjectHeadEngineerGroup, ProjectHeadPlannerRow } from '$lib/api/project-head';
  import Pagination from '$lib/components/Pagination.svelte';

  let loading = $state(true);
  let activeTab = $state<'planners' | 'engineers'>('planners');
  let planners = $state<ProjectHeadPlannerRow[]>([]);
  let engineersByState = $state<ProjectHeadEngineerGroup[]>([]);

  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => { activeTab; currentPage = 1; });
  const totalPages      = $derived(Math.max(1, Math.ceil(planners.length / PAGE_SIZE)));
  const pagedPlanners   = $derived(planners.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  onMount(async () => {
    try {
      const data = await fetchProjectHeadTeam();
      planners = data.team.planners;
      engineersByState = data.team.engineersByState;
    } catch (err) {
      toast.error(`Failed to load team: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Project Team · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="flex items-center gap-2 flex-wrap">
    <button
      onclick={() => (activeTab = 'planners')}
      class="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-all {activeTab === 'planners' ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
    >
      <Icons.Users size={14} />
      State Planners
    </button>
    <button
      onclick={() => (activeTab = 'engineers')}
      class="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-all {activeTab === 'engineers' ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
    >
      <Icons.UserCheck size={14} />
      Engineers by State
    </button>
  </div>

  {#if activeTab === 'planners'}
    <div class="bg-white rounded-2xl p-6 shadow">
      <div class="flex items-center gap-3 mb-4">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">Assigned State Planners</h3>
        <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{planners.length} Total</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ['NAME', 'EMAIL', 'ACTIVE TICKETS'] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="3" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if planners.length === 0}
              <tr><td colspan="3" class="py-10 text-center text-[13px] text-gray-400">No planners assigned to these projects yet</td></tr>
            {:else}
              {#each pagedPlanners as planner}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="py-3 px-3 text-[13px] font-medium text-[#0B182A]">{planner.name}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{planner.email}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{planner.ticketCount}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={planners.length}
        pageSize={PAGE_SIZE}
        itemLabel="planners"
        loading={loading}
        onchange={(p) => (currentPage = p)}
      />
    </div>
  {/if}

  {#if activeTab === 'engineers'}
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {#if loading}
        <div class="bg-white rounded-2xl p-10 shadow text-center text-[13px] text-gray-400 xl:col-span-2">Loading…</div>
      {:else if engineersByState.length === 0}
        <div class="bg-white rounded-2xl p-10 shadow text-center text-[13px] text-gray-400 xl:col-span-2">No engineers linked to current project tickets yet</div>
      {:else}
        {#each engineersByState as group}
          <div class="bg-white rounded-2xl p-6 shadow">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-[16px] font-semibold text-[#0B182A]">{group.state}</h3>
                <p class="text-[12px] text-gray-400 mt-0.5">{group.engineers.length} engineers</p>
              </div>
              <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {group.engineers.reduce((sum, engineer) => sum + engineer.ticketCount, 0)} tickets
              </span>
            </div>

            <div class="flex flex-col gap-3">
              {#each group.engineers as engineer}
                <div class="border border-gray-100 rounded-xl px-4 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-[13px] font-medium text-[#0B182A]">{engineer.name}</p>
                      <p class="text-[12px] text-gray-500 mt-0.5">{engineer.email}</p>
                    </div>
                    <span class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                      {engineer.ticketCount} active
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import { TICKET_STATUS_LABELS } from '$lib/config/roles';
  import { fetchProjectHeadDashboardData, type ProjectHeadSummary } from '$lib/api/project-head';
  import type { Ticket } from '$lib/modules/data/tickets/queries';
  import Pagination from '$lib/components/Pagination.svelte';

  const user = $derived($authStore.user);

  let loading = $state(true);
  let summary = $state<ProjectHeadSummary>({
    totalTickets: 0,
    openTickets: 0,
    slaAtRisk: 0,
    resolvedThisWeek: 0,
  });
  let atRiskTickets = $state<Ticket[]>([]);
  let projectNames = $state<string[]>([]);

  onMount(async () => {
    try {
      const data = await fetchProjectHeadDashboardData();
      summary = data.summary;
      atRiskTickets = data.atRiskTickets;
      projectNames = data.projects.map((project) => project.name);
    } catch (err) {
      toast.error(`Failed to load dashboard: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  const PAGE_SIZE = 10;
  let currentPage = $state(1);
  const totalPages     = $derived(Math.max(1, Math.ceil(atRiskTickets.length / PAGE_SIZE)));
  const pagedAtRisk    = $derived(atRiskTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  function fmtDate(value: string): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function badgeTone(index: number): string {
    const tones = [
      'bg-blue-50 text-blue-700',
      'bg-amber-50 text-amber-700',
      'bg-red-50 text-red-700',
      'bg-emerald-50 text-emerald-700',
    ];
    return tones[index] ?? 'bg-gray-100 text-gray-700';
  }
</script>

<svelte:head><title>Project Head Dashboard · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
      Welcome, {user?.name ?? 'Project Head'} 👋
    </h2>
    <p class="text-[14px] text-gray-500">
      Monitor ticket health, team readiness, and validation workload across your assigned projects.
    </p>
    {#if projectNames.length > 0}
      <div class="flex flex-wrap gap-2 mt-4">
        {#each projectNames as name}
          <span class="px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-[12px] font-medium">{name}</span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    {#each [
      { label: 'Total Tickets', value: summary.totalTickets, icon: 'ticket' },
      { label: 'Open Tickets', value: summary.openTickets, icon: 'activity' },
      { label: 'SLA At Risk', value: summary.slaAtRisk, icon: 'alert' },
      { label: 'Resolved This Week', value: summary.resolvedThisWeek, icon: 'check' },
    ] as card, index}
      <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div class="flex items-center justify-between">
          <p class="text-[13px] text-gray-500">{card.label}</p>
          <span class="w-10 h-10 rounded-xl flex items-center justify-center {badgeTone(index)}">
            {#if card.icon === 'ticket'}
              <Icons.TicketCard size={18} />
            {:else if card.icon === 'activity'}
              <Icons.Activity size={18} />
            {:else if card.icon === 'alert'}
              <Icons.AlertTriangle size={18} />
            {:else}
              <Icons.CheckCircle size={18} />
            {/if}
          </span>
        </div>
        <p class="text-[30px] font-bold text-[#0B182A] mt-4">{loading ? '—' : card.value}</p>
      </div>
    {/each}
  </div>

  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-[18px] font-semibold text-[#0B182A]">Tickets Near SLA Breach</h3>
        <p class="text-[12px] text-gray-400 mt-0.5">Tickets due within the next 24 hours</p>
      </div>
      <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{atRiskTickets.length} Visible</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['TICKET', 'ISSUE', 'STATUS', 'SLA DEADLINE', 'ENGINEER'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
          {:else if atRiskTickets.length === 0}
            <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">No tickets are at risk right now</td></tr>
          {:else}
            {#each pagedAtRisk as ticket}
              <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">
                  {ticket.ticketNumber || ticket.id.slice(0, 8)}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-700">{ticket.title}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                    {TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}
                  </span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{fmtDate(ticket.slaDeadline)}</td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{ticket.assignedEngineerId || 'Unassigned'}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={atRiskTickets.length}
      pageSize={PAGE_SIZE}
      itemLabel="tickets"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

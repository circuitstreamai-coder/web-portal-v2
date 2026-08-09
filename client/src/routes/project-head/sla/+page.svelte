<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { TICKET_STATUS_LABELS } from '$lib/config/roles';
  import { fetchProjectHeadSlaData, type ProjectHeadSlaData, type ProjectHeadProject } from '$lib/api/project-head';
  import type { Ticket } from '$lib/modules/data/tickets/queries';
  import Pagination from '$lib/components/Pagination.svelte';

  let loading = $state(true);
  let projects = $state<ProjectHeadProject[]>([]);
  let sla = $state<ProjectHeadSlaData>({
    compliancePercent: 0,
    monitoredTickets: 0,
    atRiskTickets: [],
    breachedTickets: [],
  });

  onMount(async () => {
    try {
      const data = await fetchProjectHeadSlaData();
      projects = data.projects;
      sla = data.sla;
    } catch (err) {
      toast.error(`Failed to load SLA data: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  function projectName(id: string): string {
    return projects.find((project) => project.id === id)?.name ?? '—';
  }

  function fmtDate(value: string): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  const PAGE_SIZE = 10;
  let atRiskPage   = $state(1);
  let breachedPage = $state(1);

  const atRiskTotal    = $derived(sla.atRiskTickets.length);
  const atRiskPages    = $derived(Math.max(1, Math.ceil(atRiskTotal / PAGE_SIZE)));
  const pagedAtRisk    = $derived(sla.atRiskTickets.slice((atRiskPage - 1) * PAGE_SIZE, atRiskPage * PAGE_SIZE));

  const breachedTotal  = $derived(sla.breachedTickets.length);
  const breachedPages  = $derived(Math.max(1, Math.ceil(breachedTotal / PAGE_SIZE)));
  const pagedBreached  = $derived(sla.breachedTickets.slice((breachedPage - 1) * PAGE_SIZE, breachedPage * PAGE_SIZE));
</script>

<svelte:head><title>Project SLA · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p class="text-[13px] text-gray-500">SLA Compliance</p>
      <p class="text-[30px] font-bold text-[#0B182A] mt-2">{loading ? '—' : `${sla.compliancePercent}%`}</p>
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden mt-4">
        <div class="h-full bg-emerald-500 rounded-full" style={`width: ${sla.compliancePercent}%`}></div>
      </div>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p class="text-[13px] text-gray-500">Tickets Monitored</p>
      <p class="text-[30px] font-bold text-[#0B182A] mt-2">{loading ? '—' : sla.monitoredTickets}</p>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p class="text-[13px] text-gray-500">Breached / At Risk</p>
      <p class="text-[30px] font-bold text-[#0B182A] mt-2">
        {loading ? '—' : `${sla.breachedTickets.length} / ${sla.atRiskTickets.length}`}
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
    <div class="bg-white rounded-2xl p-6 shadow">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">Tickets At Risk</h3>
        <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{sla.atRiskTickets.length} Total</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ['TICKET', 'PROJECT', 'STATUS', 'SLA DEADLINE'] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if sla.atRiskTickets.length === 0}
              <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">No tickets at risk right now</td></tr>
            {:else}
              {#each pagedAtRisk as ticket}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F]">{ticket.ticketNumber || ticket.id.slice(0, 8)}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{projectName(ticket.projectId)}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{fmtDate(ticket.slaDeadline)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={atRiskPage}
        totalPages={atRiskPages}
        totalItems={atRiskTotal}
        pageSize={PAGE_SIZE}
        itemLabel="tickets"
        loading={loading}
        onchange={(p) => (atRiskPage = p)}
      />
    </div>

    <div class="bg-white rounded-2xl p-6 shadow">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">Breached Tickets</h3>
        <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{sla.breachedTickets.length} Total</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ['TICKET', 'PROJECT', 'STATUS', 'SLA DEADLINE'] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if sla.breachedTickets.length === 0}
              <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">No breached tickets right now</td></tr>
            {:else}
              {#each pagedBreached as ticket}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F]">{ticket.ticketNumber || ticket.id.slice(0, 8)}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{projectName(ticket.projectId)}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{fmtDate(ticket.slaDeadline)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={breachedPage}
        totalPages={breachedPages}
        totalItems={breachedTotal}
        pageSize={PAGE_SIZE}
        itemLabel="tickets"
        loading={loading}
        onchange={(p) => (breachedPage = p)}
      />
    </div>
  </div>
</div>

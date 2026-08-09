<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import { fileUrl } from '$lib/api/upload';
  import { checkClosureEligibility, type ClosureEligibility } from '$lib/api/ticket-closure';
  import { TICKET_STATUS_LABELS } from '$lib/config/roles';
  import {
    fetchProjectHeadProjects,
    fetchProjectHeadTickets,
    fetchProjectHeadTeam,
    fetchTicketResolutionContext,
    validateProjectHeadTicket,
    type ProjectHeadProject,
  } from '$lib/api/project-head';
  import type { Attachment, Ticket, TicketHistory } from '$lib/modules/data/tickets/queries';
  import { queryVersion } from '$lib/stores/query';
  import Pagination from '$lib/components/Pagination.svelte';

  type EngineerOption = { id: string; name: string };
  const user = $derived($authStore.user);

  let loading = $state(true);
  let tickets = $state<Ticket[]>([]);
  let projects = $state<ProjectHeadProject[]>([]);
  let engineers = $state<EngineerOption[]>([]);

  let statusFilter = $state('all');
  let engineerFilter = $state('all');
  let fromDate = $state('');
  let toDate = $state('');

  let selectedTicket = $state<Ticket | null>(null);
  let contextLoading = $state(false);
  let irAttachments = $state<Attachment[]>([]);
  let siteImages = $state<Attachment[]>([]);
  let history = $state<TicketHistory[]>([]);
  let validationNotes = $state('');
  let validating = $state(false);
  let validatedTicketIds = $state<Record<string, boolean>>({});
  let closureEligibilityByTicket = $state<Record<string, ClosureEligibility>>({});
  let loadingClosureEligibility = $state<Record<string, boolean>>({});
  let lastSeenTicketsVersion = $state<number | null>(null);

  async function loadTickets() {
    const ticketData = await fetchProjectHeadTickets();
    tickets = ticketData;
    await primeClosureEligibility(ticketData);
  }

  onMount(async () => {
    try {
      const [projectData, , teamData] = await Promise.all([
        fetchProjectHeadProjects(),
        loadTickets(),
        fetchProjectHeadTeam(),
      ]);
      projects = projectData;
      engineers = teamData.team.engineersByState.flatMap((group) =>
        group.engineers.map((engineer) => ({ id: engineer.id, name: engineer.name })),
      );
    } catch (err) {
      toast.error(`Failed to load tickets: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    const version = $queryVersion.tickets;
    if (lastSeenTicketsVersion === null) {
      lastSeenTicketsVersion = version;
      return;
    }
    if (version === lastSeenTicketsVersion) return;
    lastSeenTicketsVersion = version;
    void loadTickets().catch((err) => {
      toast.error(`Failed to refresh tickets: ${(err as Error).message}`);
    });
  });

  const filteredTickets = $derived.by(() => {
    return tickets.filter((ticket) => {
      const normalizedStatus = String(ticket.status ?? '').toLowerCase();
      const createdAt = ticket.createdAt ? new Date(ticket.createdAt) : null;

      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
      if (engineerFilter !== 'all' && ticket.assignedEngineerId !== engineerFilter) return false;
      if (fromDate && createdAt && createdAt < new Date(fromDate)) return false;
      if (toDate && createdAt && createdAt > new Date(`${toDate}T23:59:59`)) return false;

      return true;
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => { statusFilter; engineerFilter; currentPage = 1; });
  const totalPages   = $derived(Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE)));
  const pagedTickets = $derived(filteredTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  function projectName(id: string): string {
    return projects.find((project) => project.id === id)?.name ?? '—';
  }

  function engineerName(id: string): string {
    return engineers.find((engineer) => engineer.id === id)?.name ?? id ?? 'Unassigned';
  }

  function fmtDate(value: string): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function statusBadge(status: string): string {
    const value = String(status ?? '').toLowerCase();
    if (value === 'pending_validation') return 'bg-purple-50 text-purple-700';
    if (value === 'resolved' || value === 'closed') return 'bg-green-50 text-green-700';
    if (value === 'in_progress') return 'bg-amber-50 text-amber-700';
    return 'bg-blue-50 text-blue-700';
  }

  function canValidate(status: string): boolean {
    return (
      String(status ?? '').toLowerCase() === 'pending_validation' &&
      user?.role === 'project_head'
    );
  }

  function closureEligibilityFor(ticketId: string): ClosureEligibility | null {
    return closureEligibilityByTicket[ticketId] ?? null;
  }

  function closureBlocked(ticketId: string): boolean {
    const eligibility = closureEligibilityFor(ticketId);
    return !!eligibility && !eligibility.eligible;
  }

  function closureReasons(ticketId: string): string[] {
    return closureEligibilityFor(ticketId)?.reasons ?? [];
  }

  async function loadClosureEligibility(ticketId: string): Promise<void> {
    loadingClosureEligibility[ticketId] = true;
    try {
      closureEligibilityByTicket[ticketId] = await checkClosureEligibility(ticketId);
    } catch (err) {
      toast.error(`Failed to check closure eligibility: ${(err as Error).message}`);
    } finally {
      loadingClosureEligibility[ticketId] = false;
    }
  }

  async function primeClosureEligibility(list: Ticket[]): Promise<void> {
    const ids = list
      .filter((ticket) => canValidate(ticket.status))
      .map((ticket) => ticket.id)
      .filter((id) => !closureEligibilityByTicket[id]);

    await Promise.all(ids.map((id) => loadClosureEligibility(id)));
  }

  function attachmentHref(filePath: string): string {
    if (!filePath) return '#';
    if (filePath.startsWith('/file/')) return filePath;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    return fileUrl(filePath);
  }

  async function openValidation(ticket: Ticket) {
    selectedTicket = ticket;
    validationNotes = '';
    contextLoading = true;
    irAttachments = [];
    siteImages = [];
    history = [];

    try {
      const context = await fetchTicketResolutionContext(ticket.id);
      irAttachments = context.attachments.filter((attachment) => attachment.type === 'ir_report' || attachment.type === 'proof');
      siteImages = context.attachments.filter((attachment) => attachment.type === 'site_image');
      history = context.history;
    } catch (err) {
      toast.error(`Failed to load validation details: ${(err as Error).message}`);
    } finally {
      contextLoading = false;
    }
  }

  async function submitValidation() {
    if (!selectedTicket) return;
    validating = true;
    try {
      await validateProjectHeadTicket(selectedTicket.id, validationNotes);
      validatedTicketIds[selectedTicket.id] = true;
      await loadClosureEligibility(selectedTicket.id);
      toast.success('Resolution validated successfully');
      selectedTicket = null;
    } catch (err) {
      toast.error(`Validation failed: ${(err as Error).message}`);
    } finally {
      validating = false;
    }
  }
</script>

<svelte:head><title>Project Head Tickets · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <div class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow">
    <label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white">
      <Icons.Circle size={14} />
      <select class="text-[13px] text-gray-700 outline-none bg-transparent" bind:value={statusFilter}>
        <option value="all">All Statuses</option>
        <option value="open">Open</option>
        <option value="assigned">Assigned</option>
        <option value="in_progress">In Progress</option>
        <option value="pending_validation">Pending Validation</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
    </label>

    <label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white">
      <Icons.Person size={14} />
      <select class="text-[13px] text-gray-700 outline-none bg-transparent" bind:value={engineerFilter}>
        <option value="all">All Engineers</option>
        {#each engineers as engineer}
          <option value={engineer.id}>{engineer.name}</option>
        {/each}
      </select>
    </label>

    <label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white text-[13px] text-gray-700">
      From
      <input type="date" class="outline-none bg-transparent" bind:value={fromDate} />
    </label>

    <label class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white text-[13px] text-gray-700">
      To
      <input type="date" class="outline-none bg-transparent" bind:value={toDate} />
    </label>
  </div>

  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">Project Tickets</h3>
      <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{filteredTickets.length} Visible</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['TICKET', 'PROJECT', 'ISSUE', 'ENGINEER', 'STATUS', 'PRIORITY', 'CREATED', 'ACTIONS'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="8" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
          {:else if filteredTickets.length === 0}
            <tr><td colspan="8" class="py-10 text-center text-[13px] text-gray-400">No tickets match the selected filters</td></tr>
          {:else}
            {#each pagedTickets as ticket}
              <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">
                  {ticket.ticketNumber || ticket.id.slice(0, 8)}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{projectName(ticket.projectId)}</td>
                <td class="py-3 px-3">
                  <p class="text-[13px] font-medium text-gray-800">{ticket.title}</p>
                  {#if ticket.description}
                    <p class="text-[11px] text-gray-400 mt-0.5 max-w-[280px] truncate">{ticket.description}</p>
                  {/if}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{engineerName(ticket.assignedEngineerId)}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(ticket.status)}">
                    {TICKET_STATUS_LABELS[ticket.status as keyof typeof TICKET_STATUS_LABELS] ?? ticket.status}
                  </span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{ticket.priority || '—'}</td>
                <td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(ticket.createdAt)}</td>
                <td class="py-3 px-3">
                  {#if canValidate(ticket.status)}
                    <div class="flex flex-col gap-1">
                      <button
                        onclick={() => openValidation(ticket)}
                        disabled={!!validatedTicketIds[ticket.id] || loadingClosureEligibility[ticket.id] || closureBlocked(ticket.id)}
                        class="px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed {validatedTicketIds[ticket.id] ? 'bg-green-50 text-green-700' : 'bg-[#0B182A] text-white hover:opacity-90'}"
                      >
                        {validatedTicketIds[ticket.id] ? 'Validated' : 'Validate Resolution'}
                      </button>
                      {#if loadingClosureEligibility[ticket.id]}
                        <span class="text-[11px] text-gray-400">Checking closure eligibility…</span>
                      {:else if closureBlocked(ticket.id)}
                        <span class="max-w-[220px] text-[11px] text-red-600">{closureReasons(ticket.id).join(' • ')}</span>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={filteredTickets.length}
      pageSize={PAGE_SIZE}
      itemLabel="tickets"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

{#if selectedTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (selectedTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Validate Resolution"
    >
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {selectedTicket.ticketNumber || selectedTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">Validate Resolution</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">{selectedTicket.title}</p>
        </div>
        <button
          onclick={() => (selectedTicket = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="px-6 py-5 overflow-y-auto flex flex-col gap-5">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gray-50 rounded-xl p-4">
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Project</p>
            <p class="text-[13px] font-medium text-[#0B182A] mt-1">{projectName(selectedTicket.projectId)}</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4">
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Engineer</p>
            <p class="text-[13px] font-medium text-[#0B182A] mt-1">{engineerName(selectedTicket.assignedEngineerId)}</p>
          </div>
          <div class="bg-gray-50 rounded-xl p-4">
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</p>
            <p class="text-[13px] font-medium text-[#0B182A] mt-1">
              {TICKET_STATUS_LABELS[selectedTicket.status as keyof typeof TICKET_STATUS_LABELS] ?? selectedTicket.status}
            </p>
          </div>
        </div>

        {#if contextLoading}
          <div class="py-10 text-center text-[13px] text-gray-400">Loading resolution details…</div>
        {:else}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="bg-white border border-gray-100 rounded-2xl p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-[15px] font-semibold text-[#0B182A]">IR Upload</h3>
                <span class="text-[11px] text-gray-400">{irAttachments.length} file(s)</span>
              </div>
              {#if irAttachments.length === 0}
                <p class="text-[13px] text-gray-400">No IR file uploaded yet.</p>
              {:else}
                <div class="flex flex-col gap-2">
                  {#each irAttachments as attachment}
                    <a
                      href={attachmentHref(attachment.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-[#0B182A] hover:bg-gray-50"
                    >
                      <span class="flex items-center gap-2">
                        <Icons.File size={14} />
                        IR Document
                      </span>
                      <Icons.Eye size={14} />
                    </a>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="bg-white border border-gray-100 rounded-2xl p-5">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-[15px] font-semibold text-[#0B182A]">Site Images</h3>
                <span class="text-[11px] text-gray-400">{siteImages.length} file(s)</span>
              </div>
              {#if siteImages.length === 0}
                <p class="text-[13px] text-gray-400">No site images uploaded yet.</p>
              {:else}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {#each siteImages as image, index}
                    <a
                      href={attachmentHref(image.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-[#0B182A] hover:bg-gray-50"
                    >
                      <Icons.Eye size={14} />
                      Site Image {index + 1}
                    </a>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <div class="bg-white border border-gray-100 rounded-2xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[15px] font-semibold text-[#0B182A]">Ticket Notes & History</h3>
              <span class="text-[11px] text-gray-400">{history.length} entries</span>
            </div>
            {#if history.length === 0}
              <p class="text-[13px] text-gray-400">No notes available for this ticket.</p>
            {:else}
              <div class="flex flex-col gap-3 max-h-56 overflow-y-auto">
                {#each history as entry}
                  <div class="border border-gray-100 rounded-xl px-4 py-3">
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-[12px] font-semibold text-[#0B182A]">
                        {TICKET_STATUS_LABELS[entry.status as keyof typeof TICKET_STATUS_LABELS] ?? entry.status}
                      </span>
                      <span class="text-[11px] text-gray-400">{fmtDate(entry.createdAt)}</span>
                    </div>
                    <p class="text-[12px] text-gray-600 mt-1">{entry.remarks || 'No remarks'}</p>
                    <p class="text-[11px] text-gray-400 mt-1">By: {entry.author || 'System'}</p>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Validation Notes</span>
            <textarea
              bind:value={validationNotes}
              rows="4"
              placeholder="Add any verification notes before approving this resolution…"
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white resize-none"
            ></textarea>
          </label>
        {/if}
      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
        <button
          onclick={() => (selectedTicket = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onclick={submitValidation}
          disabled={contextLoading || validating}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {validating ? 'Validating…' : 'Validate Resolution'}
        </button>
      </div>
    </div>
  </div>
{/if}

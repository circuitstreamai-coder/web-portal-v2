<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import { fetchTickets, fetchUsersByRole, type Ticket, type User } from '$lib/modules/data/tickets/queries';
  import { createTicketHistory } from '$lib/modules/data/tickets/actions';
  import {
    assignTicket as assignTicketRequest,
    escalateTicket as escalateTicketRequest,
  } from '$lib/api/tickets';
  import { fetchProjects, type Project } from '$lib/modules/data/projects/queries';
  import { TICKET_STATUS_LABELS } from '$lib/config/roles';
  import { queryVersion } from '$lib/stores/query';
  import Pagination from '$lib/components/Pagination.svelte';

  const user = $derived($authStore.user);

  const ESCALATION_LEVELS = ['L2', 'L3'] as const;

  const fieldClass =
    'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';

  // ── State ─────────────────────────────────────────────────────────────────

  let tickets = $state<Ticket[]>([]);
  let engineers = $state<User[]>([]);
  let planners = $state<User[]>([]);
  let projects = $state<Project[]>([]);
  let loading = $state(true);

  // Assign modal
  let assignTicket = $state<Ticket | null>(null);
  let assignEngineerId = $state('');
  let assignPlannerId = $state('');
  let assigning = $state(false);

  // Escalation modal
  let escalateTicket = $state<Ticket | null>(null);
  let escalationLevel = $state<'L2' | 'L3' | ''>('');
  let escalationReason = $state('');
  let escalating = $state(false);
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTickets() {
    tickets = await fetchTickets();
  }

  onMount(async () => {
    try {
      const [, eng, plan, projs] = await Promise.all([
        loadTickets(),
        fetchUsersByRole('engineer'),
        fetchUsersByRole('state_planner'),
        fetchProjects().catch(() => [] as Project[]),
      ]);
      engineers = eng;
      planners = plan;
      projects = projs;
    } catch {
      toast.error('Failed to load data');
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
    void loadTickets().catch(() => {
      toast.error('Failed to refresh tickets');
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages   = $derived(Math.max(1, Math.ceil(tickets.length / PAGE_SIZE)));
  const pagedTickets = $derived(tickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function normalizeStatus(status: string): string {
    return (status ?? '').toLowerCase().replace(/\s+/g, '_');
  }

  function statusLabel(status: string): string {
    return TICKET_STATUS_LABELS[normalizeStatus(status) as keyof typeof TICKET_STATUS_LABELS] ?? status ?? '—';
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      open: 'bg-blue-50 text-blue-600',
      assigned: 'bg-indigo-50 text-indigo-600',
      accepted: 'bg-teal-50 text-teal-600',
      in_progress: 'bg-amber-50 text-amber-600',
      on_hold: 'bg-yellow-50 text-yellow-700',
      pending_replacement: 'bg-fuchsia-50 text-fuchsia-700',
      escalated_l2: 'bg-orange-50 text-orange-600',
      escalated_l3: 'bg-red-50 text-red-600',
      pending_validation: 'bg-purple-50 text-purple-700',
      resolved: 'bg-green-50 text-green-600',
      closed: 'bg-gray-100 text-gray-500',
      reopened: 'bg-cyan-50 text-cyan-700',
    };
    return map[normalizeStatus(status)] ?? 'bg-gray-100 text-gray-500';
  }

  function priorityBadge(p: string) {
    if (p === 'High') return 'bg-red-50 text-red-500';
    if (p === 'Medium') return 'bg-amber-50 text-amber-500';
    return 'bg-green-50 text-green-600';
  }

  function escalationBadge(level: string) {
    if (level === 'L3') return 'bg-red-50 text-red-600';
    if (level === 'L2') return 'bg-orange-50 text-orange-600';
    return '';
  }

  function fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function projectName(id: string): string {
    if (!id) return '—';
    return projects.find((p) => p.id === id)?.name ?? '—';
  }

  function nameById(list: User[], id: string) {
    return list.find((u) => u.id === id)?.name ?? id.slice(0, 8);
  }

  function canAct(t: Ticket) {
    return !['closed'].includes(normalizeStatus(t.status));
  }

  // ── Assign ────────────────────────────────────────────────────────────────

  function openAssign(ticket: Ticket) {
    assignTicket = ticket;
    assignEngineerId = ticket.assignedEngineerId ?? '';
    assignPlannerId = ticket.statePlannerId ?? '';
  }

  async function saveAssign() {
    if (!assignTicket) return;
    assigning = true;
    try {
      const updated = await assignTicketRequest(assignTicket.id, {
        engineerId: assignEngineerId || undefined,
        statePlannerId: assignPlannerId || undefined,
      });
      await createTicketHistory({
        ticketId: assignTicket.id,
        status: assignTicket.status,
        remarks: [
          assignEngineerId && `Engineer assigned: ${nameById(engineers, assignEngineerId)}`,
          assignPlannerId && `Planner assigned: ${nameById(planners, assignPlannerId)}`,
        ].filter(Boolean).join('; ') || 'Assignment updated',
        author: user?.id ?? 'planner',
      });
      tickets = tickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success('Assignment saved');
      assignTicket = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      assigning = false;
    }
  }

  // ── Escalation ────────────────────────────────────────────────────────────

  function openEscalate(ticket: Ticket) {
    escalateTicket = ticket;
    escalationLevel = (ticket.escalationLevel as 'L2' | 'L3') ?? '';
    escalationReason = '';
  }

  async function saveEscalation() {
    if (!escalateTicket || !escalationLevel) return;
    escalating = true;
    try {
      const updated = await escalateTicketRequest(escalateTicket.id, {
        level: escalationLevel,
        reason: escalationReason.trim() || `Support requested: ${escalationLevel}`,
      });
      await createTicketHistory({
        ticketId: escalateTicket.id,
        status: normalizeStatus(escalateTicket.status),
        remarks: `Support requested: ${escalationLevel}${escalationReason.trim() ? ` — ${escalationReason.trim()}` : ''}`,
        author: user?.id ?? 'planner',
      });
      tickets = tickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success(`Support request sent (${escalationLevel})`);
      escalateTicket = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      escalating = false;
    }
  }
</script>

<svelte:head><title>Tickets · Planner · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">

  <!-- Stats -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {#each [
      { label: 'Total', value: tickets.length, color: 'text-[#0B182A]' },
      { label: 'Open', value: tickets.filter(t => normalizeStatus(t.status) === 'open').length, color: 'text-blue-600' },
      { label: 'Unassigned', value: tickets.filter(t => !t.assignedEngineerId).length, color: 'text-amber-600' },
      { label: 'Escalated', value: tickets.filter(t => t.escalationLevel).length, color: 'text-red-500' },
    ] as stat}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
        <p class="text-[24px] font-bold {stat.color}">{loading ? '—' : stat.value}</p>
      </div>
    {/each}
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">All Tickets</h3>
      <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{tickets.length} Total</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['TICKET', 'PROJECT', 'ISSUE', 'STATUS', 'PRIORITY', 'ENGINEER', 'ESCALATION', 'DATE', 'ACTIONS'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan="9" class="py-12 text-center text-[13px] text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if tickets.length === 0}
            <tr>
              <td colspan="9" class="py-16 text-center">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                    <Icons.Ticket size={22} stroke="#9ca3af" />
                  </div>
                  <p class="text-[13px] text-gray-400">No tickets found</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each pagedTickets as t}
              <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors
                         {!t.assignedEngineerId ? 'bg-amber-50/20' : ''}">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">
                  {t.ticketNumber || t.id.slice(0, 8)}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{projectName(t.projectId)}</td>
                <td class="py-3 px-3">
                  <p class="text-[13px] font-medium text-gray-800 max-w-[160px] truncate">{t.title}</p>
                  {#if t.state}
                    <p class="text-[11px] text-gray-400">{t.state}</p>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(t.status)}">
                    {statusLabel(t.status)}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(t.priority)}">
                    {t.priority || '—'}
                  </span>
                </td>
                <td class="py-3 px-3 text-[12px]">
                  {#if t.assignedEngineerId}
                    <span class="text-gray-700">{nameById(engineers, t.assignedEngineerId)}</span>
                  {:else}
                    <span class="text-amber-500 font-medium">Unassigned</span>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  {#if t.escalationLevel}
                    <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {escalationBadge(t.escalationLevel)}">
                      {t.escalationLevel}
                    </span>
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
                <td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                <td class="py-3 px-3">
                  {#if canAct(t)}
                    <div class="flex gap-1.5 flex-wrap">
                      <!-- Assign -->
                      <button
                        onclick={() => openAssign(t)}
                        title="Assign engineer / planner"
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Icons.UserCheck size={12} />
                        Assign
                      </button>

                      <!-- Escalate -->
                      {#if !t.escalationLevel}
                        <button
                          onclick={() => openEscalate(t)}
                          title="Request escalation support"
                          class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Icons.AlertTriangle size={12} />
                          Support
                        </button>
                      {:else}
                        <button
                          onclick={() => openEscalate(t)}
                          title="Change escalation level"
                          class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg {escalationBadge(t.escalationLevel)} hover:opacity-80 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Icons.AlertTriangle size={12} />
                          {t.escalationLevel}
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-[12px] text-gray-400">{statusLabel(t.status)}</span>
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
      totalItems={tickets.length}
      pageSize={PAGE_SIZE}
      itemLabel="tickets"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

<!-- ── Assign Modal ───────────────────────────────────────────────────────── -->
{#if assignTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (assignTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Assign Ticket"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {assignTicket.ticketNumber || assignTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A] leading-tight max-w-[220px]">Assign Ticket</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">Set the engineer and state planner</p>
        </div>
        <button
          onclick={() => (assignTicket = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <!-- Engineer dropdown -->
        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Assigned Engineer</span>
          <select class={fieldClass} bind:value={assignEngineerId}>
            <option value="">— Unassigned —</option>
            {#each engineers as eng}
              <option value={eng.id}>{eng.name} ({eng.email})</option>
            {/each}
          </select>
        </label>

        <!-- State Planner dropdown -->
        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">State Planner</span>
          <select class={fieldClass} bind:value={assignPlannerId}>
            <option value="">— Unassigned —</option>
            {#each planners as p}
              <option value={p.id}>{p.name} ({p.email})</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button
          onclick={() => (assignTicket = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onclick={saveAssign}
          disabled={assigning}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {assigning ? 'Saving…' : 'Save Assignment'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Escalation / Request Support Modal ────────────────────────────────── -->
{#if escalateTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (escalateTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Request Support"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {escalateTicket.ticketNumber || escalateTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Request Support</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">Escalate this ticket to a higher support level</p>
        </div>
        <button
          onclick={() => (escalateTicket = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <!-- L2 / L3 selector -->
        <div class="flex flex-col gap-2">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Escalation Level</span>
          <div class="grid grid-cols-2 gap-3 mt-1">
            {#each ESCALATION_LEVELS as lvl}
              <button
                type="button"
                onclick={() => (escalationLevel = lvl)}
                class="flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl border-2 transition-all cursor-pointer
                       {escalationLevel === lvl
                         ? lvl === 'L3'
                           ? 'bg-red-50 border-red-400 text-red-700'
                           : 'bg-orange-50 border-orange-400 text-orange-700'
                         : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}"
              >
                <span class="text-[22px] font-bold leading-none">{lvl}</span>
                <span class="text-[11px] font-medium">
                  {lvl === 'L2' ? 'Level 2 Support' : 'Level 3 Specialist'}
                </span>
              </button>
            {/each}
          </div>
        </div>

        {#if escalationLevel === 'L3'}
          <div class="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-red-50 border border-red-100">
            <Icons.AlertTriangle size={15} stroke="#ef4444" />
            <p class="text-[12px] text-red-600">
              L3 escalation is for critical issues only. This will notify senior specialists immediately.
            </p>
          </div>
        {/if}

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Reason</span>
          <textarea
            bind:value={escalationReason}
            placeholder="Describe why additional support is needed…"
            rows="3"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button
          onclick={() => (escalateTicket = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onclick={saveEscalation}
          disabled={!escalationLevel || escalating}
          class="px-5 py-2.5 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer
                 {escalationLevel === 'L3' ? 'bg-red-500' : 'bg-[#E87D1F]'}"
        >
          {escalating ? 'Sending…' : `Request ${escalationLevel || '…'} Support`}
        </button>
      </div>
    </div>
  </div>
{/if}

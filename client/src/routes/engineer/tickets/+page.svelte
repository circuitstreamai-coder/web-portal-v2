<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import { fetchTickets, type Ticket } from '$lib/modules/data/tickets/queries';
  import {
    createTicketHistory,
    uploadTicketAttachment,
  } from '$lib/modules/data/tickets/actions';
  import { restRequest } from '$lib/api/rest';
  import type { InventoryItem } from '$lib/modules/data/inventory/actions';
  import { escalateTicket, updateTicketStatus, acceptTicket, declineTicket } from '$lib/api/tickets';
  import {
    fetchTicketReplacement,
    type ReplacementRequest,
  } from '$lib/api/replacements';
  import { ROLE_STATUS_OPTIONS, TICKET_STATUS_LABELS, type TicketStatus } from '$lib/config/roles';
  import { ApiError } from '$lib/api/rest';
  import { fetchProjects, type Project } from '$lib/modules/data/projects/queries';
  import ClosureChecklist from '$lib/modules/data/tickets/ClosureChecklist.svelte';
  import { queryVersion, invalidate } from '$lib/stores/query';
  import Pagination from '$lib/components/Pagination.svelte';

  const user = $derived($authStore.user);

  // ── Constants ─────────────────────────────────────────────────────────────

  // Engineers can move to In Progress or Resolved only.
  // "Send for Validation" is a separate direct action (resolved → pending_validation).
  const ENGINEER_STATUSES = ROLE_STATUS_OPTIONS.engineer;
  const ESCALATION_LEVELS = ['L2', 'L3'] as const;

  function normalizeStatus(s: string): string {
    return (s ?? '').toLowerCase().replace(/ /g, '_');
  }

  function statusLabel(s: string): string {
    return TICKET_STATUS_LABELS[normalizeStatus(s) as keyof typeof TICKET_STATUS_LABELS] ?? s ?? '—';
  }

  const fieldClass =
    'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';

  // ── State ─────────────────────────────────────────────────────────────────

  let allTickets = $state<Ticket[]>([]);
  let activeTab = $state<'assigned' | 'escalated'>('assigned');

  const isEscalationRole = $derived(user?.role === 'l2_engineer' || user?.role === 'l3_engineer');
  const activeEscalationLevel  = $derived(user?.role === 'l3_engineer' ? 'L3' : 'L2');

  const assignedTickets  = $derived(user ? allTickets.filter((t) => t.assignedEngineerId === user.id) : allTickets);
  const escalatedTickets = $derived(isEscalationRole ? allTickets.filter((t) => t.escalationLevel === activeEscalationLevel) : []);
  const tickets          = $derived(activeTab === 'escalated' ? escalatedTickets : assignedTickets);

  let projects = $state<Project[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let searchQuery = $state('');
  let statusFilter = $state<'all' | 'needs_action' | 'in_progress' | 'waiting' | 'closed'>('all');
  let priorityFilter = $state<'all' | 'Critical' | 'High' | 'Medium' | 'Low'>('all');

  // Status update modal
  let statusTicket = $state<Ticket | null>(null);
  let newStatus = $state<TicketStatus>('in_progress');
  let remarks = $state('');
  let statusSaving = $state(false);

  // Escalation modal
  let escalateModal = $state<Ticket | null>(null);
  let escalationLevel = $state<'L2' | 'L3' | ''>('');
  let escalationReason = $state('');
  let escalating = $state(false);

  // Replacement status tracker
  let trackerTicket = $state<Ticket | null>(null);
  let trackerData = $state<ReplacementRequest | null>(null);
  let trackerLoading = $state(false);

  // Upload proof modal
  let uploadTicket = $state<Ticket | null>(null);
  let irFileInput = $state<HTMLInputElement | null>(null);
  let siteImageInput = $state<HTMLInputElement | null>(null);
  let selectedIrFile = $state<File | null>(null);
  let selectedSiteFiles = $state<File[]>([]);
  let uploadingIr = $state(false);
  let uploadingSiteImages = $state(false);
  let checklistRefreshKey = $state(0);
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTickets() {
    const all = await fetchTickets();
    allTickets = all;
  }

  async function refreshTickets() {
    refreshing = true;
    try {
      await loadTickets();
      toast.success('Ticket queue refreshed');
    } catch {
      toast.error('Failed to refresh tickets');
    } finally {
      refreshing = false;
    }
  }

  onMount(async () => {
    try {
      const [, projs] = await Promise.all([
        loadTickets(),
        fetchProjects().catch(() => [] as Project[]),
      ]);
      projects = projs;
    } catch (err) {
      toast.error('Failed to load tickets');
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

  function projectName(id: string): string {
    if (!id) return '—';
    return projects.find((p) => p.id === id)?.name ?? '—';
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const filteredTickets = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    const statusGroups: Record<typeof statusFilter, string[]> = {
      all: [],
      needs_action: ['open', 'assigned', 'accepted', 'reopened'],
      in_progress: ['in_progress', 'on_hold', 'pending_replacement'],
      waiting: ['resolved', 'pending_validation'],
      closed: ['closed'],
    };

    return tickets
      .filter((ticket) => {
        const normalizedStatus = normalizeStatus(ticket.status);
        const matchesStatus = statusFilter === 'all' || statusGroups[statusFilter].includes(normalizedStatus);
        const matchesPriority = priorityFilter === 'all' || priorityLabel(ticket.priority) === priorityFilter;
        const matchesQuery = !query || [
          ticket.ticketNumber,
          ticket.title,
          ticket.description,
          projectName(ticket.projectId),
          ticketLocation(ticket),
        ].some((value) => value?.toLowerCase().includes(query));
        return matchesStatus && matchesPriority && matchesQuery;
      })
      .sort((a, b) => {
        const statusRank = (ticket: Ticket) => {
          const status = normalizeStatus(ticket.status);
          if (status === 'assigned' || status === 'accepted' || status === 'reopened') return 0;
          if (status === 'in_progress' || status === 'on_hold') return 1;
          if (status === 'resolved' || status === 'pending_validation') return 2;
          return 3;
        };
        const rankDifference = statusRank(a) - statusRank(b);
        if (rankDifference !== 0) return rankDifference;
        const priorityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
        const priorityDifference = (priorityRank[priorityLabel(a.priority)] ?? 4) - (priorityRank[priorityLabel(b.priority)] ?? 4);
        if (priorityDifference !== 0) return priorityDifference;
        return new Date(a.slaDeadline || a.createdAt).getTime() - new Date(b.slaDeadline || b.createdAt).getTime();
      });
  });
  const totalPages   = $derived(Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE)));
  const pagedTickets = $derived(filteredTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  $effect(() => {
    searchQuery;
    statusFilter;
    priorityFilter;
    activeTab;
    currentPage = 1;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      'open': 'bg-blue-50 text-blue-600',
      'assigned': 'bg-indigo-50 text-indigo-600',
      'accepted': 'bg-teal-50 text-teal-600',
      'in_progress': 'bg-amber-50 text-amber-600',
      'on_hold': 'bg-yellow-50 text-yellow-700',
      'pending_replacement': 'bg-fuchsia-50 text-fuchsia-700',
      'escalated_l2': 'bg-orange-50 text-orange-600',
      'escalated_l3': 'bg-red-50 text-red-600',
      'pending_validation': 'bg-purple-50 text-purple-600',
      'resolved': 'bg-green-50 text-green-600',
      'closed': 'bg-gray-100 text-gray-500',
      'reopened': 'bg-cyan-50 text-cyan-700',
    };
    return map[normalizeStatus(status)] ?? 'bg-gray-100 text-gray-500';
  }

  function priorityBadge(p: string) {
    const priority = p?.toLowerCase();
    if (priority === 'critical') return 'bg-red-100 text-red-700';
    if (priority === 'high') return 'bg-red-50 text-red-600';
    if (priority === 'medium') return 'bg-amber-50 text-amber-600';
    return 'bg-green-50 text-green-600';
  }

  function priorityLabel(priority: string): 'Critical' | 'High' | 'Medium' | 'Low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'critical') return 'Critical';
    if (normalized === 'high') return 'High';
    if (normalized === 'medium') return 'Medium';
    return 'Low';
  }

  function priorityAccent(priority: string): string {
    const normalized = priority?.toLowerCase();
    if (normalized === 'critical') return 'bg-red-700';
    if (normalized === 'high') return 'bg-red-500';
    if (normalized === 'medium') return 'bg-amber-400';
    return 'bg-emerald-500';
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

  function slaInfo(ticket: Ticket): { label: string; classes: string } {
    const status = normalizeStatus(ticket.status);
    if (['closed', 'resolved', 'pending_validation'].includes(status)) {
      return { label: status === 'closed' ? 'Completed' : 'Work complete', classes: 'text-emerald-700 bg-emerald-50' };
    }
    if (!ticket.slaDeadline) return { label: 'No SLA deadline', classes: 'text-gray-500 bg-gray-100' };

    const diff = new Date(ticket.slaDeadline).getTime() - Date.now();
    const absoluteHours = Math.max(1, Math.ceil(Math.abs(diff) / 3_600_000));
    if (diff < 0) {
      const value = absoluteHours >= 24 ? `${Math.ceil(absoluteHours / 24)}d` : `${absoluteHours}h`;
      return { label: `${value} overdue`, classes: 'text-red-700 bg-red-50' };
    }
    if (absoluteHours <= 24) return { label: `${absoluteHours}h remaining`, classes: 'text-orange-700 bg-orange-50' };
    return { label: `${Math.ceil(absoluteHours / 24)}d remaining`, classes: 'text-gray-600 bg-gray-100' };
  }

  function ticketLocation(ticket: Ticket): string {
    return [ticket.address, ticket.city, ticket.state, ticket.pincode].filter(Boolean).join(', ') || '—';
  }

  // ── Status update ─────────────────────────────────────────────────────────

  function openStatus(ticket: Ticket) {
    statusTicket = ticket;
    const ns = normalizeStatus(ticket.status);
    newStatus = (ns === 'open' || ns === 'assigned' ? 'in_progress' : ns) as TicketStatus;
    remarks = '';
  }

  async function saveStatus() {
    if (!statusTicket) return;
    statusSaving = true;
    try {
      await createTicketHistory({
        ticketId: statusTicket.id,
        status: newStatus,
        remarks: remarks.trim() || undefined,
        author: user?.id ?? 'engineer',
      });
      const updated = await updateTicketStatus(
        statusTicket.id,
        newStatus,
        remarks.trim() || undefined,
      );
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));

      if (newStatus === 'pending_validation') {
        toast.success('Ticket submitted for admin validation');
      } else {
        toast.success('Status updated');
      }
      statusTicket = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      statusSaving = false;
    }
  }

  // ── Send for Validation ───────────────────────────────────────────────────

  let sendingValidation = $state<string | null>(null);
  let acceptingId = $state<string | null>(null);
  let startingWork = $state<string | null>(null);
  let markingResolved = $state<string | null>(null);
  let openDropdownId = $state<string | null>(null);
  let dropdownPos = $state({ top: 0, right: 0 });
  let dropdownActions = $state<TicketAction[]>([]);

  // ── Actions (centralised per-status rules) ────────────────────────────────

  type TicketAction = { label: string; onClick: () => void; disabled?: boolean };

  function getTicketActions(t: Ticket): TicketAction[] {
    const ns = normalizeStatus(t.status);

    if (ns === 'assigned') {
      const actions: TicketAction[] = [];
      if (t.assignedEngineerId === user?.id) {
        actions.push({ label: 'Accept', onClick: () => handleAccept(t), disabled: acceptingId === t.id });
        actions.push({ label: 'Decline', onClick: () => openDecline(t) });
      }
      actions.push({ label: 'Escalate', onClick: () => openEscalate(t) });
      return actions;
    }

    if (ns === 'accepted') {
      const actions: TicketAction[] = [];
      if (t.assignedEngineerId === user?.id) {
        actions.push({ label: 'Start Work', onClick: () => startWork(t), disabled: startingWork === t.id });
        actions.push({ label: 'Decline', onClick: () => openDecline(t) });
      }
      actions.push({ label: 'Escalate', onClick: () => openEscalate(t) });
      return actions;
    }

    if (ns === 'in_progress') {
      return [
        { label: 'Mark Resolved', onClick: () => markResolved(t), disabled: markingResolved === t.id },
        { label: 'Use Item',      onClick: () => openUseItem(t) },
        { label: 'Upload Proof',  onClick: () => openUpload(t) },
        { label: 'Escalate',      onClick: () => openEscalate(t) },
      ];
    }

    if (ns === 'resolved') {
      return [
        { label: 'Send for Validation', onClick: () => sendForValidation(t), disabled: sendingValidation === t.id },
        { label: 'Upload Proof',        onClick: () => openUpload(t) },
      ];
    }

    return []; // pending_validation, closed — no actions
  }

  function primaryTicketAction(ticket: Ticket): TicketAction | undefined {
    return getTicketActions(ticket)[0];
  }

  function secondaryTicketActions(ticket: Ticket): TicketAction[] {
    return getTicketActions(ticket).slice(1);
  }

  async function handleAccept(ticket: Ticket) {
    acceptingId = ticket.id;
    try {
      await createTicketHistory({
        ticketId: ticket.id,
        status: 'accepted',
        remarks: 'Ticket accepted',
        author: user?.id ?? 'engineer',
      });
      const updated = await acceptTicket(ticket.id);
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success('Ticket accepted');
      invalidate('tickets');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      acceptingId = null;
    }
  }

  // ── Decline ───────────────────────────────────────────────────────────────

  let declineModal = $state<Ticket | null>(null);
  let declineReason = $state('');
  let declining = $state(false);

  function openDecline(ticket: Ticket) {
    declineModal = ticket;
    declineReason = '';
  }

  async function saveDecline() {
    if (!declineModal) return;
    declining = true;
    try {
      await declineTicket(declineModal.id, declineReason.trim() || undefined);
      allTickets = allTickets.filter((t) => t.id !== declineModal!.id);
      toast.success('Ticket declined');
      declineModal = null;
      invalidate('tickets');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      declining = false;
    }
  }

  async function startWork(ticket: Ticket) {
    startingWork = ticket.id;
    try {
      await createTicketHistory({
        ticketId: ticket.id,
        status: 'in_progress',
        remarks: 'Work started',
        author: user?.id ?? 'engineer',
      });
      const updated = await updateTicketStatus(ticket.id, 'in_progress');
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success('Work started');
      invalidate('tickets');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      startingWork = null;
    }
  }

  async function markResolved(ticket: Ticket) {
    markingResolved = ticket.id;
    try {
      await createTicketHistory({
        ticketId: ticket.id,
        status: 'resolved',
        remarks: 'Ticket resolved',
        author: user?.id ?? 'engineer',
      });
      const updated = await updateTicketStatus(ticket.id, 'resolved');
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success('Ticket marked as resolved');
      invalidate('tickets');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      markingResolved = null;
    }
  }

  async function sendForValidation(ticket: Ticket) {
    sendingValidation = ticket.id;
    try {
      await createTicketHistory({
        ticketId: ticket.id,
        status: 'pending_validation',
        remarks: 'Sent for admin validation',
        author: user?.id ?? 'engineer',
      });
      const updated = await updateTicketStatus(
        ticket.id,
        'pending_validation',
        'Sent for admin validation',
      );
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success('Ticket submitted for validation');
      invalidate('tickets');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      sendingValidation = null;
    }
  }

  // ── Escalation ────────────────────────────────────────────────────────────

  function openEscalate(ticket: Ticket) {
    escalateModal = ticket;
    escalationLevel = ticket.escalationLevel as 'L2' | 'L3' | '' ?? '';
    escalationReason = '';
  }

  async function saveEscalation() {
    if (!escalateModal || !escalationLevel) return;
    escalating = true;
    try {
      const updated = await escalateTicket(escalateModal.id, {
        level: escalationLevel,
        reason: escalationReason.trim() || `Support requested: ${escalationLevel}`,
      });
      await createTicketHistory({
        ticketId: escalateModal.id,
        status: normalizeStatus(escalateModal.status),
        remarks: `Support requested: ${escalationLevel}${escalationReason.trim() ? ` — ${escalationReason.trim()}` : ''}`,
        author: user?.id ?? 'engineer',
      });
      allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
      toast.success(`Support request sent (${escalationLevel})`);
      escalateModal = null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error('Unauthorized: cannot escalate this ticket');
      } else {
        toast.error(`Failed: ${(err as Error).message}`);
      }
    } finally {
      escalating = false;
    }
  }

  // ── Upload proof ──────────────────────────────────────────────────────────

  function openUpload(ticket: Ticket) {
    uploadTicket = ticket;
    selectedIrFile = null;
    selectedSiteFiles = [];
    checklistRefreshKey += 1;
  }

  function handleIrFileChange(e: Event) {
    selectedIrFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
  }

  function handleSiteImageChange(e: Event) {
    selectedSiteFiles = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
  }

  async function submitIrUpload() {
    if (!uploadTicket || !selectedIrFile) return;
    uploadingIr = true;
    try {
      await uploadTicketAttachment({
        ticketId: uploadTicket.id,
        file: selectedIrFile,
        type: 'ir_report',
        author: user?.id ?? 'engineer',
      });
      selectedIrFile = null;
      if (irFileInput) irFileInput.value = '';
      checklistRefreshKey += 1;
      toast.success('IR uploaded successfully');
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`);
    } finally {
      uploadingIr = false;
    }
  }

  async function submitSiteImages() {
    if (!uploadTicket || selectedSiteFiles.length === 0) return;
    const ticketId = uploadTicket.id;
    uploadingSiteImages = true;
    try {
      await Promise.all(
        selectedSiteFiles.map((file) =>
          uploadTicketAttachment({
            ticketId,
            file,
            type: 'site_image',
            author: user?.id ?? 'engineer',
          }),
        ),
      );
      selectedSiteFiles = [];
      if (siteImageInput) siteImageInput.value = '';
      checklistRefreshKey += 1;
      toast.success('Site image(s) uploaded successfully');
    } catch (err) {
      toast.error(`Upload failed: ${(err as Error).message}`);
    } finally {
      uploadingSiteImages = false;
    }
  }

  // ── Use Item ──────────────────────────────────────────────────────────────

  let useItemTicket = $state<Ticket | null>(null);
  let useItemForm = $state({ inventoryItemId: '', quantity: '' });
  let useItemSaving = $state(false);
  let inventoryItems = $state<InventoryItem[]>([]);
  let inventoryLoading = $state(false);

  async function openUseItem(ticket: Ticket) {
    useItemTicket = ticket;
    useItemForm = { inventoryItemId: '', quantity: '' };
    if (inventoryItems.length === 0) {
      inventoryLoading = true;
      try {
        inventoryItems = await restRequest<InventoryItem[]>('/api/inventory');
      } catch {
        toast.error('Failed to load inventory');
      } finally {
        inventoryLoading = false;
      }
    }
  }

  async function submitUseItem() {
    if (!useItemTicket || !useItemForm.inventoryItemId || !useItemForm.quantity) return;
    useItemSaving = true;
    try {
      await restRequest(`/api/tickets/${useItemTicket.id}/use-item`, {
        method: 'POST',
        body: JSON.stringify({
          itemId: useItemForm.inventoryItemId,
          quantity: Number(useItemForm.quantity),
        }),
      });
      invalidate('tickets');
      toast.success('Item usage recorded');
      useItemTicket = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      useItemSaving = false;
    }
  }

  // ── Ticket Detail ─────────────────────────────────────────────────────────

  type UsedItem = { name: string; quantity: number };

  let detailTicket = $state<Ticket | null>(null);
  let usedItems = $state<UsedItem[]>([]);
  let usedItemsLoading = $state(false);

  async function openDetail(ticket: Ticket) {
    detailTicket = ticket;
    usedItems = [];
    usedItemsLoading = true;
    try {
      usedItems = await restRequest<UsedItem[]>(`/api/tickets/${ticket.id}/items`);
    } catch {
      // non-critical — show empty state
    } finally {
      usedItemsLoading = false;
    }
  }

  // ── Device Replacement ────────────────────────────────────────────────────

  async function openTracker(ticket: Ticket) {
    trackerTicket = ticket;
    trackerData = null;
    trackerLoading = true;
    try {
      trackerData = await fetchTicketReplacement(ticket.id);
    } finally {
      trackerLoading = false;
    }
  }
</script>

<svelte:head><title>My Tickets · Engineer · Innoserve Techsol</title></svelte:head>

{#if openDropdownId}
  <button type="button" class="fixed inset-0 z-20 cursor-default" aria-label="Close dropdown" onclick={() => (openDropdownId = null)}></button>
{/if}

<div class="flex flex-col gap-5">
  <!-- Queue heading -->
  <section class="relative overflow-hidden rounded-2xl bg-[#0B182A] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
    <div class="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#E87D1F]/15 blur-2xl"></div>
    <div class="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          <span class="h-2 w-2 rounded-full bg-[#E87D1F]"></span>
          Field service workspace
        </div>
        <h1 class="text-[24px] font-bold tracking-tight sm:text-[28px]">
          {activeTab === 'escalated' ? `${activeEscalationLevel} support queue` : 'Your work queue'}
        </h1>
        <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-white/60 sm:text-[14px]">
          {activeTab === 'escalated'
            ? 'Review escalated work, assess the site issue, and move the ticket toward resolution.'
            : 'Prioritised by workflow, urgency, and SLA so your next job is always clear.'}
        </p>
      </div>
      <button
        type="button"
        onclick={refreshTickets}
        disabled={refreshing}
        class="inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-60"
      >
        <svg class={refreshing ? 'animate-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        {refreshing ? 'Refreshing…' : 'Refresh queue'}
      </button>
    </div>
  </section>

  <!-- Queue tabs -->
  {#if isEscalationRole}
    <div class="inline-flex w-fit max-w-full gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      {#each [
        { id: 'assigned' as const, label: 'Assigned to me', count: assignedTickets.length },
        { id: 'escalated' as const, label: `${activeEscalationLevel} escalations`, count: escalatedTickets.length },
      ] as tab}
        <button
          type="button"
          onclick={() => (activeTab = tab.id)}
          class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-colors sm:px-4
            {activeTab === tab.id ? 'bg-[#0B182A] text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-[#0B182A]'}"
        >
          {tab.label}
          <span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === tab.id ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}">
            {loading ? '…' : tab.count}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Operational summary -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {#each [
      { label: 'Needs action', value: tickets.filter((t) => ['open', 'assigned', 'accepted', 'reopened'].includes(normalizeStatus(t.status))).length, color: 'text-[#E87D1F]', bar: 'bg-[#E87D1F]' },
      { label: 'In progress', value: tickets.filter((t) => ['in_progress', 'on_hold', 'pending_replacement'].includes(normalizeStatus(t.status))).length, color: 'text-amber-700', bar: 'bg-amber-500' },
      { label: 'Waiting review', value: tickets.filter((t) => ['resolved', 'pending_validation'].includes(normalizeStatus(t.status))).length, color: 'text-purple-700', bar: 'bg-purple-500' },
      { label: 'Completed', value: tickets.filter((t) => normalizeStatus(t.status) === 'closed').length, color: 'text-emerald-700', bar: 'bg-emerald-500' },
    ] as stat}
      <button
        type="button"
        onclick={() => (statusFilter = stat.label === 'Needs action' ? 'needs_action' : stat.label === 'In progress' ? 'in_progress' : stat.label === 'Waiting review' ? 'waiting' : 'closed')}
        class="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md"
      >
        <span class="absolute inset-y-0 left-0 w-1 {stat.bar}"></span>
        <p class="pl-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{stat.label}</p>
        <div class="mt-1 flex items-end justify-between pl-1">
          <p class="text-[26px] font-bold leading-none {stat.color}">{loading ? '—' : stat.value}</p>
          <span class="text-[10px] font-medium text-gray-300 transition-colors group-hover:text-gray-500">Filter</span>
        </div>
      </button>
    {/each}
  </div>

  <!-- Search and filters -->
  <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="relative min-w-0 flex-1 lg:max-w-md">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
          <Icons.Search size={15} />
        </span>
        <input
          bind:value={searchQuery}
          type="search"
          placeholder="Search ticket, project, issue, or location"
          class="h-10 w-full rounded-lg border border-gray-200 bg-gray-50/70 pl-9 pr-3 text-[13px] text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-[#0B182A] focus:bg-white"
        />
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <select bind:value={statusFilter} class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 outline-none focus:border-[#0B182A]">
          <option value="all">All workflow stages</option>
          <option value="needs_action">Needs action</option>
          <option value="in_progress">In progress</option>
          <option value="waiting">Waiting review</option>
          <option value="closed">Completed</option>
        </select>
        <select bind:value={priorityFilter} class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 outline-none focus:border-[#0B182A]">
          <option value="all">All priorities</option>
          <option value="Critical">Critical priority</option>
          <option value="High">High priority</option>
          <option value="Medium">Medium priority</option>
          <option value="Low">Low priority</option>
        </select>
        {#if searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'}
          <button
            type="button"
            onclick={() => { searchQuery = ''; statusFilter = 'all'; priorityFilter = 'all'; }}
            class="h-10 rounded-lg px-3 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#0B182A]"
          >
            Clear filters
          </button>
        {/if}
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
      <div>
        <h2 class="text-[15px] font-bold text-[#0B182A]">
          {activeTab === 'escalated' ? `${activeEscalationLevel} escalated tickets` : 'Assigned tickets'}
        </h2>
        <p class="mt-0.5 text-[11px] text-gray-400">
          {filteredTickets.length === tickets.length
            ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} in this queue`
            : `${filteredTickets.length} of ${tickets.length} tickets shown`}
        </p>
      </div>
      <p class="hidden text-[11px] font-medium text-gray-400 sm:block">Action required first</p>
    </div>

    <!-- Responsive ticket cards -->
    <div class="mt-3 flex flex-col gap-3">
      {#if loading}
        {#each Array(3) as _}
          <div class="animate-pulse rounded-xl border border-gray-100 p-4">
            <div class="mb-3 h-3 w-24 rounded bg-gray-100"></div>
            <div class="mb-2 h-4 w-2/3 rounded bg-gray-100"></div>
            <div class="h-3 w-1/2 rounded bg-gray-100"></div>
          </div>
        {/each}
      {:else if filteredTickets.length === 0}
        <div class="flex flex-col items-center px-4 py-14 text-center">
          <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
            <Icons.Search size={21} />
          </div>
          <p class="text-[14px] font-semibold text-[#0B182A]">
            {tickets.length === 0 ? 'Your queue is clear' : 'No matching tickets'}
          </p>
          <p class="mt-1 max-w-sm text-[12px] leading-relaxed text-gray-400">
            {tickets.length === 0 ? 'New assignments will appear here when they are routed to you.' : 'Try clearing a filter or searching with a different term.'}
          </p>
        </div>
      {:else}
        {#each pagedTickets as t}
          <article class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-md">
            <span class="absolute inset-y-0 left-0 w-1 {priorityAccent(t.priority)}"></span>
            <div class="p-4 pl-5 sm:p-5 sm:pl-6">
              <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <button type="button" onclick={() => openDetail(t)} class="min-w-0 flex-1 text-left">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-bold tracking-[0.05em] text-[#E87D1F]">{t.ticketNumber || t.id.slice(0, 8)}</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full {statusBadge(t.status)}">{statusLabel(t.status)}</span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full {priorityBadge(t.priority)}">{priorityLabel(t.priority)}</span>
                    {#if t.escalationLevel}
                      <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full {escalationBadge(t.escalationLevel)}">{t.escalationLevel} support</span>
                    {/if}
                  </div>
                  <h3 class="truncate text-[15px] font-bold text-[#0B182A] transition-colors group-hover:text-[#18375f] sm:text-[16px]">{t.title}</h3>
                  {#if t.description}
                    <p class="mt-1 line-clamp-1 text-[12px] leading-relaxed text-gray-500">{t.description}</p>
                  {/if}
                  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
                    <span class="inline-flex min-w-0 items-center gap-1.5">
                      <Icons.Folder size={13} stroke="#9ca3af" />
                      <span class="max-w-[210px] truncate">{projectName(t.projectId)}</span>
                    </span>
                    <span class="inline-flex min-w-0 items-center gap-1.5">
                      <Icons.MapPin size={13} stroke="#9ca3af" />
                      <span class="max-w-[260px] truncate">{ticketLocation(t)}</span>
                    </span>
                    <span class="inline-flex items-center gap-1.5">
                      <Icons.Clock size={13} stroke="#9ca3af" />
                      Raised {fmtDate(t.createdAt)}
                    </span>
                  </div>
                </button>

                <div class="flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 pt-3 xl:justify-end xl:border-0 xl:pt-0">
                  <span class="mr-auto whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold xl:mr-2 {slaInfo(t).classes}">
                    {slaInfo(t).label}
                  </span>

                  <button
                    type="button"
                    onclick={() => openDetail(t)}
                    class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    <Icons.Eye size={14} />
                    <span class="hidden sm:inline">Details</span>
                  </button>

                  {#if primaryTicketAction(t)}
                    <button
                      type="button"
                      onclick={() => primaryTicketAction(t)?.onClick()}
                      disabled={primaryTicketAction(t)?.disabled}
                      class="h-9 whitespace-nowrap rounded-lg bg-[#0B182A] px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#18375f] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {primaryTicketAction(t)?.label}
                    </button>
                  {/if}

                  {#if secondaryTicketActions(t).length > 0}
                    <button
                      type="button"
                      onclick={(event) => {
                        event.stopPropagation();
                        if (openDropdownId === t.id) { openDropdownId = null; return; }
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
                        dropdownActions = secondaryTicketActions(t);
                        openDropdownId = t.id;
                      }}
                      class="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-[#0B182A]"
                      aria-label="More ticket actions"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                    </button>
                  {/if}
                </div>
              </div>
            </div>
          </article>
        {/each}
      {/if}
    </div>

    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={filteredTickets.length}
      pageSize={PAGE_SIZE}
      itemLabel="tickets"
      loading={loading}
      onchange={(page) => (currentPage = page)}
    />
  </section>
</div>

<!-- ── Actions Dropdown (fixed to escape overflow-x-auto clipping) ─────── -->
{#if openDropdownId}
  <div
    class="fixed z-50 w-48 rounded-xl bg-white shadow-lg border border-gray-100 py-1 overflow-hidden"
    style="top: {dropdownPos.top}px; right: {dropdownPos.right}px;"
  >
    {#each dropdownActions as action}
      <button
        onclick={() => { action.onClick(); openDropdownId = null; }}
        disabled={action.disabled}
        class="w-full text-left px-4 py-2.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {action.label}
      </button>
    {/each}
  </div>
{/if}

<!-- ── Update Status Modal ───────────────────────────────────────────────── -->
{#if statusTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (statusTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Update Status"
      tabindex="-1"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {statusTicket.ticketNumber || statusTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A] max-w-[230px] leading-tight">{statusTicket.title}</h2>
        </div>
        <button onclick={() => (statusTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <!-- Engineer-limited status options -->
        <div class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">New Status</span>
          <div class="flex flex-col gap-2 mt-1">
            {#each ENGINEER_STATUSES as s}
              <button
                type="button"
                onclick={() => (newStatus = s)}
                class="flex items-center gap-3 px-4 py-3 rounded-xl border text-[13px] font-medium transition-all cursor-pointer text-left
                       {newStatus === s
                         ? s === 'pending_validation'
                           ? 'bg-purple-50 border-purple-200 text-purple-700'
                           : 'bg-[#0B182A] border-[#0B182A] text-white'
                         : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}"
              >
                <span class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                             {newStatus === s ? 'border-current' : 'border-gray-300'}">
                  {#if newStatus === s}
                    <span class="w-2.5 h-2.5 rounded-full bg-current"></span>
                  {/if}
                </span>
                {statusLabel(s)}
                {#if s === 'pending_validation'}
                  <span class="ml-auto text-[10px] font-semibold opacity-60">Sends to admin</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Remarks</span>
          <textarea
            bind:value={remarks}
            placeholder="Describe work done or observations…"
            rows="3"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button onclick={() => (statusTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          onclick={saveStatus}
          disabled={statusSaving}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {statusSaving ? 'Saving…' : 'Update Status'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Escalation / Request Support Modal ────────────────────────────────── -->
{#if escalateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (escalateModal = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Request Support"
      tabindex="-1"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {escalateModal.ticketNumber || escalateModal.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Request Support</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">Escalate this ticket to a higher support level</p>
        </div>
        <button onclick={() => (escalateModal = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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

        <!-- Warning for L3 -->
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
            placeholder="Describe why you need additional support…"
            rows="3"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button onclick={() => (escalateModal = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
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

<!-- ── Decline Ticket Modal ────────────────────────────────────────────────── -->
{#if declineModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (declineModal = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Decline Ticket"
      tabindex="-1"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {declineModal.ticketNumber || declineModal.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Decline Ticket</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">This returns the ticket to the unassigned pool for staff to reassign</p>
        </div>
        <button onclick={() => (declineModal = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <div class="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-red-50 border border-red-100">
          <Icons.AlertTriangle size={15} stroke="#ef4444" />
          <p class="text-[12px] text-red-600">
            You will no longer be assigned to this ticket. It becomes unassigned until staff reassign it.
          </p>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Reason (optional)</span>
          <textarea
            bind:value={declineReason}
            placeholder="Let staff know why you can't take this ticket…"
            rows="3"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button onclick={() => (declineModal = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          onclick={saveDecline}
          disabled={declining}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-red-500 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {declining ? 'Declining…' : 'Decline Ticket'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Ticket Detail Modal ──────────────────────────────────────────────── -->
{#if detailTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (detailTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Ticket Details"
    >
      <!-- Header -->
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {detailTicket.ticketNumber || detailTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A] max-w-[260px] leading-tight">{detailTicket.title}</h2>
        </div>
        <button onclick={() => (detailTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-4">
        <!-- Ticket meta -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(detailTicket.status)}">
              {statusLabel(detailTicket.status)}
            </span>
          </div>
          <div>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Priority</p>
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(detailTicket.priority)}">
              {priorityLabel(detailTicket.priority)}
            </span>
          </div>
        </div>

        <!-- Site Location -->
        <div class="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Site Location</p>
          <p class="text-[13px] font-medium text-gray-800 leading-relaxed">{ticketLocation(detailTicket)}</p>
        </div>

        <!-- Used Items -->
        <div>
          <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Items Used</p>
          {#if usedItemsLoading}
            <p class="text-[13px] text-gray-400">Loading…</p>
          {:else if usedItems.length === 0}
            <p class="text-[13px] text-gray-400">No items used for this ticket.</p>
          {:else}
            <div class="rounded-xl border border-gray-100 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide px-4 py-2.5">ITEM</th>
                    <th class="text-right text-[11px] font-semibold text-gray-400 tracking-wide px-4 py-2.5">QTY</th>
                  </tr>
                </thead>
                <tbody>
                  {#each usedItems as item}
                    <tr class="border-b border-gray-50 last:border-0">
                      <td class="px-4 py-2.5 text-[13px] text-gray-700 font-medium">{item.name}</td>
                      <td class="px-4 py-2.5 text-[13px] text-gray-600 text-right">{item.quantity}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <div class="flex justify-end px-6 pb-5">
        <button onclick={() => (detailTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Use Item Modal ──────────────────────────────────────────────────── -->
{#if useItemTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (useItemTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Use Item"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {useItemTicket.ticketNumber || useItemTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Use Item</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">Record inventory usage for this ticket</p>
        </div>
        <button onclick={() => (useItemTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Item</span>
          {#if inventoryLoading}
            <div class="text-[13px] text-gray-400 py-2">Loading inventory…</div>
          {:else}
            <select bind:value={useItemForm.inventoryItemId} class={fieldClass}>
              <option value="" disabled>Select an item</option>
              {#each inventoryItems as item}
                <option value={item.id}>{item.name} — {item.sku}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Quantity</span>
          <input
            type="number"
            min="1"
            placeholder="e.g. 2"
            bind:value={useItemForm.quantity}
            class={fieldClass}
          />
        </label>
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button onclick={() => (useItemTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          onclick={submitUseItem}
          disabled={useItemSaving || !useItemForm.inventoryItemId || !useItemForm.quantity}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {useItemSaving ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Upload Ticket Documents Modal ──────────────────────────────────────── -->
{#if uploadTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (uploadTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-2xl shadow-2xl"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label="Upload Ticket Documents"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {uploadTicket.ticketNumber || uploadTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Upload Resolution Documents</h2>
        </div>
        <button onclick={() => (uploadTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-5">
        <ClosureChecklist ticketId={uploadTicket.id} refreshKey={checklistRefreshKey} />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h3 class="text-[14px] font-semibold text-[#0B182A]">Upload Incident Report (IR)</h3>
              <p class="text-[12px] text-gray-400 mt-1">Accepted formats: PDF, DOC, DOCX</p>
            </div>
            <label class="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#0B182A] hover:bg-gray-50 transition-colors">
              <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Icons.File size={20} stroke="#6b7280" />
              </div>
              <div class="text-center">
                <p class="text-[13px] font-medium text-gray-700">Select IR document</p>
                <p class="text-[11px] text-gray-400 mt-0.5">One report file per upload</p>
              </div>
              {#if selectedIrFile}
                <span class="text-[12px] font-medium text-[#0B182A] bg-gray-100 px-3 py-1 rounded-full max-w-full truncate">
                  {selectedIrFile.name}
                </span>
              {/if}
              <input
                type="file"
                class="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onchange={handleIrFileChange}
                bind:this={irFileInput}
              />
            </label>
            <button
              onclick={submitIrUpload}
              disabled={!selectedIrFile || uploadingIr}
              class="px-4 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {uploadingIr ? 'Uploading…' : 'Upload Incident Report'}
            </button>
          </div>

          <div class="border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h3 class="text-[14px] font-semibold text-[#0B182A]">Upload Site Images</h3>
              <p class="text-[12px] text-gray-400 mt-1">Accepted formats: JPG, PNG. Multiple images allowed.</p>
            </div>
            <label class="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#0B182A] hover:bg-gray-50 transition-colors">
              <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Icons.CloudUpload size={20} stroke="#6b7280" />
              </div>
              <div class="text-center">
                <p class="text-[13px] font-medium text-gray-700">Select site images</p>
                <p class="text-[11px] text-gray-400 mt-0.5">You can choose multiple files at once</p>
              </div>
              {#if selectedSiteFiles.length > 0}
                <div class="flex flex-wrap justify-center gap-2">
                  {#each selectedSiteFiles as file}
                    <span class="text-[12px] font-medium text-[#0B182A] bg-gray-100 px-3 py-1 rounded-full max-w-full truncate">
                      {file.name}
                    </span>
                  {/each}
                </div>
              {/if}
              <input
                type="file"
                class="hidden"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                multiple
                onchange={handleSiteImageChange}
                bind:this={siteImageInput}
              />
            </label>
            <button
              onclick={submitSiteImages}
              disabled={selectedSiteFiles.length === 0 || uploadingSiteImages}
              class="px-4 py-2.5 text-[13px] font-semibold text-white bg-[#E87D1F] rounded-lg hover:bg-[#d06a10] transition-colors disabled:opacity-60 cursor-pointer"
            >
              {uploadingSiteImages ? 'Uploading…' : 'Upload Site Images'}
            </button>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-1 border-t border-gray-100">
          <button onclick={() => (uploadTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ── Replacement Status Tracker Modal ───────────────────────────────────── -->
{#if trackerTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (trackerTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Replacement Status"
      tabindex="-1"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {trackerTicket.ticketNumber || trackerTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Replacement Status</h2>
        </div>
        <button onclick={() => (trackerTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="px-6 py-5">
        {#if trackerLoading}
          <div class="flex items-center justify-center gap-2 py-8 text-[13px] text-gray-400">
            <div class="w-4 h-4 border-2 border-gray-200 border-t-fuchsia-500 rounded-full animate-spin"></div>
            Loading…
          </div>
        {:else if !trackerData}
          <p class="text-[13px] text-gray-400 py-6 text-center">No replacement data found</p>
        {:else}
          <!-- Device info -->
          <div class="flex items-center gap-3 p-3 rounded-xl bg-fuchsia-50 mb-5">
            <Icons.Cube size={18} stroke="#a21caf" />
            <div>
              <p class="text-[13px] font-semibold text-fuchsia-800">{trackerData.deviceType}</p>
              <p class="text-[11px] text-fuchsia-600 mt-0.5 line-clamp-2">{trackerData.reason}</p>
            </div>
          </div>

          <!-- Timeline -->
          {@const STEPS = ['pending', 'approved', 'dispatched', 'replaced'] as const}
          {@const LABELS = { pending: 'Requested', approved: 'Approved', dispatched: 'Dispatched', replaced: 'Replaced' }}
          {@const currentIdx = STEPS.indexOf((trackerData.status ?? 'pending') as typeof STEPS[number])}
          <div class="flex flex-col gap-0">
            {#each STEPS as step, i}
              {@const done = i <= currentIdx && trackerData.status !== 'rejected'}
              {@const active = i === currentIdx && trackerData.status !== 'rejected'}
              <div class="flex gap-3 {i < STEPS.length - 1 ? 'pb-4' : ''}">
                <div class="flex flex-col items-center">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0
                               {done ? 'bg-fuchsia-600 border-fuchsia-600' : 'bg-white border-gray-200'}">
                    {#if done}
                      <Icons.Check size={12} stroke="white" />
                    {:else}
                      <span class="w-2 h-2 rounded-full bg-gray-300"></span>
                    {/if}
                  </div>
                  {#if i < STEPS.length - 1}
                    <div class="w-0.5 flex-1 mt-1 {done ? 'bg-fuchsia-300' : 'bg-gray-200'}"></div>
                  {/if}
                </div>
                <div class="pt-0.5 pb-2">
                  <p class="text-[13px] font-semibold {active ? 'text-fuchsia-700' : done ? 'text-gray-700' : 'text-gray-400'}">
                    {LABELS[step]}
                  </p>
                  {#if step === 'approved' && trackerData.poNumber}
                    <p class="text-[11px] text-gray-400 mt-0.5">PO: {trackerData.poNumber}</p>
                  {/if}
                </div>
              </div>
            {/each}
            {#if trackerData.status === 'rejected'}
              <div class="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                <Icons.XSquare size={14} stroke="#dc2626" />
                <p class="text-[12px] text-red-600 font-medium">Request rejected</p>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="flex justify-end px-6 pb-5">
        <button onclick={() => (trackerTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

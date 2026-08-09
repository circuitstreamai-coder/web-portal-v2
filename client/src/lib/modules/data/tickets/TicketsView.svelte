<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import TicketForm from "./TicketForm.svelte";
  import type { Ticket } from "./queries";
  import { createTicket } from "./actions";
  import { assignTicket, updateTicketStatus } from "$lib/api/tickets";
  import { type TicketStatus } from "$lib/config/roles";
  import { fetchProjects, type Project } from "$lib/modules/data/projects/queries";
  import { ApiError } from "$lib/api/rest";
  import { toast } from "svelte-sonner";
  import Pagination from "$lib/components/Pagination.svelte";

  interface Props {
    canDelete?: boolean;
  }

  let { canDelete = true }: Props = $props();

  // ── View model ───────────────────────────────────────────────────────────────
  type TicketRow = {
    id: string;
    projectId: string;
    categoryId: string;
    issue: string;
    sub: string;
    sla: string;
    place: string;
    engineer: string;
    planner: string;
    status: string;
    priority: string;
    date: string;
  };

  function toRow(t: Ticket): TicketRow {
    return {
      id: t.ticketNumber || t.id,
      projectId: t.projectId ?? '',
      categoryId: t.categoryId ?? '',
      issue: t.title,
      sub: t.author ?? "—",
      sla: t.slaDeadline
        ? new Date(t.slaDeadline) < new Date() ? "Breached" : "On Track"
        : "On Track",
      place: t.state ?? "—",
      engineer: t.assignedEngineerId ?? "",
      planner: t.statePlannerId ?? "",
      status: t.status ?? "Open",
      priority: t.priority ?? "Medium",
      date: t.createdAt
        ? new Date(t.createdAt).toLocaleDateString("en-GB")
        : "—",
    };
  }

  // ── Server-side pagination state ─────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  let totalItems  = $state(0);
  let totalPages  = $state(1);
  let pagedTickets = $state<TicketRow[]>([]);
  let loading = $state(true);

  // Search (raw input) and its debounced value sent to the API
  let searchInput = $state('');
  let searchQuery = $state('');

  // Increment to bust the server-side cache after a mutation
  let fetchGeneration = $state(0);

  // ── Project name lookup ──────────────────────────────────────────────────────
  let projects = $state<Project[]>([]);

  onMount(async () => {
    projects = await fetchProjects().catch(() => [] as Project[]);
  });

  function projectName(id: string): string {
    if (!id) return '—';
    return projects.find((p) => p.id === id)?.name ?? '—';
  }

  // ── Debounce search input → searchQuery (300 ms) ────────────────────────────
  $effect(() => {
    const value = searchInput;
    const timer = setTimeout(() => {
      if (searchQuery !== value) {
        searchQuery = value;
        currentPage = 1;
      }
    }, 300);
    return () => clearTimeout(timer);
  });

  // ── Fetch current page whenever any param changes ────────────────────────────
  // AbortController ensures in-flight requests from previous renders are cancelled.
  $effect(() => {
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(PAGE_SIZE),
    });
    if (searchQuery) params.set('search', searchQuery);
    if (fetchGeneration > 0) params.set('_bust', '1');

    const controller = new AbortController();
    loading = true;

    fetch(`/api/paginated/tickets?${params}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { items: Ticket[]; total: number; totalPages: number }) => {
        pagedTickets = data.items.map(toRow);
        totalItems   = data.total;
        totalPages   = data.totalPages;
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') toast.error('Failed to load tickets');
      })
      .finally(() => {
        loading = false;
      });

    return () => controller.abort();
  });

  // ── Form state ───────────────────────────────────────────────────────────────
  let showForm = $state(false);
  let formMode = $state<"add" | "edit">("add");
  let editData = $state<TicketRow | null>(null);

  function openAdd() {
    formMode = "add";
    editData = null;
    showForm = true;
  }

  function openEdit(ticket: TicketRow) {
    formMode = "edit";
    editData = { ...ticket };
    showForm = true;
  }

  async function handleSave(form: Record<string, string>) {
    if (formMode === "add") {
      try {
        await createTicket({
          projectId: form.projectId || undefined,
          categoryId: form.categoryId || undefined,
          title: form.issue,
          description: form.sub || undefined,
          priority: form.priority,
          state: form.place,
        });
        toast.success("Ticket created successfully");
        fetchGeneration++; // bust server cache → re-fetch current page
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && err.errors?.length) {
          toast.error(err.errors.map((field) => field.message).join(", "));
        } else if (err instanceof ApiError && err.status === 403) {
          toast.error('Invalid project access');
        } else {
          toast.error(`Failed to create ticket: ${(err as Error).message}`);
        }
        return;
      }
    } else if (editData) {
      try {
        const assignmentChanged =
          (form.engineer || '') !== (editData.engineer || '') ||
          (form.planner || '') !== (editData.planner || '');
        const statusChanged = (form.status || '') !== (editData.status || '');
        let updated: Ticket | null = null;

        if (assignmentChanged) {
          updated = await assignTicket(editData.id, {
            engineerId: form.engineer || undefined,
            statePlannerId: form.planner || undefined,
          });
        }

        if (statusChanged) {
          updated = await updateTicketStatus(
            editData.id,
            form.status as TicketStatus,
          );
        }

        if (!updated) {
          toast.success("No ticket changes to save");
          showForm = false;
          return;
        }
        toast.success("Ticket updated");
        fetchGeneration++; // bust server cache → re-fetch current page
      } catch (err) {
        toast.error(`Failed to update ticket: ${(err as Error).message}`);
        return;
      }
    }
    showForm = false;
  }
</script>

<div class="flex flex-col gap-5" data-can-delete={canDelete}>
  <!-- Filter Bar -->
  <div class="bg-white rounded-xl px-4 py-4 shadow sm:px-5 flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <!-- Search -->
      <div class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 p-3">
        <Icons.Search size={16} stroke="#9ca3af" />
        <input
          type="text"
          placeholder="Search by title, ID, state…"
          bind:value={searchInput}
          class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
        />
      </div>
      <!-- Create Ticket -->
      <button
        onclick={openAdd}
        class="flex items-center gap-1.5 p-3 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-opacity duration-150 shrink-0"
      >
        <Icons.Plus size={14} strokeWidth={2.5} />
        <span class="hidden sm:inline">Create Ticket</span>
        <span class="sm:hidden">New</span>
      </button>
    </div>
    <!-- Filter Dropdowns (scrollable row on mobile) -->
    <div class="flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5">
      {#each [{ label: "Status", icon: "circle" }, { label: "SLA Priority", icon: "settings" }, { label: "State", icon: "map-pin" }, { label: "Assigned Agents", icon: "user" }] as f}
        <button class="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150 whitespace-nowrap shrink-0">
          {#if f.icon === "circle"}
            <Icons.Circle size={14} />
          {:else if f.icon === "settings"}
            <Icons.Settings size={14} />
          {:else if f.icon === "map-pin"}
            <Icons.MapPin size={14} />
          {:else if f.icon === "user"}
            <Icons.Person size={14} />
          {/if}
          {f.label}
          <Icons.ChevronDown size={12} />
        </button>
      {/each}
    </div>
  </div>

  <!-- Tickets Table Card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <!-- Table Header -->
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">All Tickets</h3>
        <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{totalItems} Total</span>
      </div>
      <div class="flex gap-2">
        <button class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
          <Icons.Grid size={14} />
          Columns
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
          <Icons.Download size={14} />
          Export
        </button>
      </div>
    </div>

    <!-- Desktop table (hidden on small screens) -->
    <div class="hidden sm:block overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["TICKET ID", "PROJECT", "ISSUE", "SLA", "PLACE", "ENGINEER", "STATUS", "PRIORITY", "DATE", "ACTIONS"] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="10" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
          {:else if pagedTickets.length === 0}
            <tr><td colspan="10" class="py-10 text-center text-[13px] text-gray-400">No tickets yet</td></tr>
          {:else}
          {#each pagedTickets as ticket}
            <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td class="py-3 px-3 text-accent font-medium text-[13px]">{ticket.id}</td>
              <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{projectName(ticket.projectId)}</td>
              <td class="py-3 px-3">
                <div class="text-[13px] text-gray-700 font-medium">{ticket.issue}</div>
                <div class="text-[11px] text-gray-400">{ticket.sub}</div>
              </td>
              <td class="py-3 px-3">
                <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {ticket.sla === 'Breached' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}">
                  {ticket.sla}
                </span>
              </td>
              <td class="py-3 px-3 text-[13px] text-gray-600">{ticket.place}</td>
              <td class="py-3 px-3 text-[13px] text-gray-600">{ticket.engineer}</td>
              <td class="py-3 px-3">
                <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">{ticket.status}</span>
              </td>
              <td class="py-3 px-3">
                <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {ticket.priority === 'High' ? 'bg-red-50 text-red-500' : ticket.priority === 'Medium' ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-600'}">
                  {ticket.priority}
                </span>
              </td>
              <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{ticket.date}</td>
              <td class="py-3 px-3">
                <div class="flex gap-1">
                  <button aria-label="View ticket details" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors">
                    <Icons.Eye size={16} />
                  </button>
                  <button
                    aria-label="Edit ticket"
                    onclick={() => openEdit(ticket)}
                    class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
                  >
                    <Icons.Edit size={16} />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Mobile card list (shown only on small screens) -->
    <div class="sm:hidden flex flex-col divide-y divide-gray-50">
      {#if loading}
        <div class="py-10 text-center text-[13px] text-gray-400">Loading…</div>
      {:else if pagedTickets.length === 0}
        <div class="py-10 text-center text-[13px] text-gray-400">No tickets yet</div>
      {:else}
        {#each pagedTickets as ticket}
          <div class="py-4 flex flex-col gap-2">
            <div class="flex justify-between items-start gap-2">
              <span class="text-accent font-semibold text-[13px]">{ticket.id}</span>
              <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 shrink-0">{ticket.status}</span>
            </div>
            <div class="text-[13px] text-gray-700 font-medium leading-snug">{ticket.issue}</div>
            {#if ticket.sub && ticket.sub !== '—'}
              <div class="text-[11px] text-gray-400">{ticket.sub}</div>
            {/if}
            <div class="flex flex-wrap gap-1.5 mt-0.5">
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full {ticket.sla === 'Breached' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}">{ticket.sla}</span>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full {ticket.priority === 'High' ? 'bg-red-50 text-red-500' : ticket.priority === 'Medium' ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-600'}">{ticket.priority}</span>
              {#if projectName(ticket.projectId) !== '—'}
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{projectName(ticket.projectId)}</span>
              {/if}
            </div>
            <div class="flex justify-between items-center mt-1">
              <div class="text-[12px] text-gray-500 truncate">
                {ticket.place}{ticket.engineer ? ` · ${ticket.engineer}` : ''} · {ticket.date}
              </div>
              <div class="flex gap-1 shrink-0">
                <button aria-label="View ticket details" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors">
                  <Icons.Eye size={16} />
                </button>
                <button
                  aria-label="Edit ticket"
                  onclick={() => openEdit(ticket)}
                  class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
                >
                  <Icons.Edit size={16} />
                </button>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={PAGE_SIZE}
      itemLabel="Tickets"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

{#if showForm}
  <TicketForm
    mode={formMode}
    data={editData}
    onSave={handleSave}
    onClose={() => (showForm = false)}
  />
{/if}

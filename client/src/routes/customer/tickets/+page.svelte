<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import {
    fetchTicketCategories,
    type Ticket,
    type TicketCategory,
  } from "$lib/modules/data/tickets/queries";
  import type { Project } from "$lib/modules/data/projects/queries";
  import { createTicket } from "$lib/modules/data/tickets/actions";
  import { ApiError, restRequest } from "$lib/api/rest";
  import { queryVersion } from "$lib/stores/query";
  import Pagination from "$lib/components/Pagination.svelte";

  // ── State ─────────────────────────────────────────────────────────────────

  let tickets = $state<Ticket[]>([]);
  let projects = $state<Project[]>([]);
  let categories = $state<TicketCategory[]>([]);
  let loading = $state(true);
  let loadingCategories = $state(false);
  let showForm = $state(false);
  let submitting = $state(false);
  let lastSeenTicketsVersion = $state<number | null>(null);

  let form = $state({
    projectId: "",
    categoryId: "",
    title: "",
    description: "",
    priority: "Medium",
    state: "",
    city: "",
    address: "",
  });
  let errors = $state<Record<string, string>>({});

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTickets() {
    const data = await restRequest<Ticket[]>("/api/tickets");
    tickets = data.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  onMount(async () => {
    try {
      const [, projectData] = await Promise.all([
        loadTickets(),
        restRequest<Project[]>("/api/projects"),
      ]);
      projects = projectData;
      if (projects.length > 0) {
        form.projectId = projects[0].id;
      }
    } catch (err) {
      toast.error("Failed to load tickets");
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
      toast.error("Failed to refresh tickets");
    });
  });

  async function ensureCategories() {
    if (categories.length > 0) {
      if (!categories.some((category) => category.id === form.categoryId)) {
        form.categoryId = categories[0]?.id ?? "";
      }
      return;
    }

    loadingCategories = true;
    try {
      categories = await fetchTicketCategories();
      form.categoryId = categories[0]?.id ?? "";
    } catch {
      categories = [];
      form.categoryId = "";
      toast.error("Failed to load call types");
    } finally {
      loadingCategories = false;
    }
  }

  $effect(() => {
    if (!showForm || !form.projectId) {
      if (!form.projectId) form.categoryId = "";
      return;
    }

    void ensureCategories();
  });

  function projectName(id: string): string {
    if (!id) return "—";
    return projects.find((p) => p.id === id)?.name ?? "—";
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages   = $derived(Math.max(1, Math.ceil(tickets.length / PAGE_SIZE)));
  const pagedTickets = $derived(tickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function normalizeStatus(status: string) {
    return status?.toLowerCase().replace(/\s+/g, "_") ?? "";
  }

  function displayStatus(status: string) {
    const map: Record<string, string> = {
      open: "Open",
      assigned: "Assigned",
      accepted: "Accepted",
      in_progress: "In Progress",
      pending_validation: "Pending Validation",
      resolved: "Resolved",
      closed: "Closed",
      rejected: "Rejected",
      cancelled: "Cancelled",
    };
    return map[normalizeStatus(status)] ?? status ?? "—";
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      open: "bg-blue-50 text-blue-600",
      assigned: "bg-indigo-50 text-indigo-600",
      accepted: "bg-teal-50 text-teal-600",
      in_progress: "bg-amber-50 text-amber-600",
      pending_validation: "bg-purple-50 text-purple-600",
      resolved: "bg-green-50 text-green-600",
      closed: "bg-gray-100 text-gray-500",
      rejected: "bg-rose-50 text-rose-600",
      cancelled: "bg-red-50 text-red-500",
    };
    return map[normalizeStatus(status)] ?? "bg-gray-100 text-gray-500";
  }

  function priorityBadge(p: string) {
    if (p === "High") return "bg-red-50 text-red-500";
    if (p === "Medium") return "bg-amber-50 text-amber-500";
    return "bg-green-50 text-green-600";
  }

  function fmtDate(d: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  function openForm() {
    form = {
      projectId: projects[0]?.id ?? "",
      categoryId: "",
      title: "",
      description: "",
      priority: "Medium",
      state: "",
      city: "",
      address: "",
    };
    errors = {};
    showForm = true;
  }

  function validate(): boolean {
    errors = {};
    if (!form.projectId) errors.projectId = "Please select a project";
    if (!form.categoryId) errors.categoryId = "Please select a call type";
    if (!form.title.trim()) errors.title = "Issue title is required";
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate()) return;
    submitting = true;
    try {
      const created = await createTicket({
        projectId: form.projectId,
        categoryId: form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        state: form.state.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      tickets = [created, ...tickets];
      toast.success("Ticket raised successfully");
      showForm = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors?.length) {
        const fieldErrors: Record<string, string> = {};
        for (const fe of err.errors) fieldErrors[fe.field] = fe.message;
        errors = fieldErrors;
        toast.error("Please fix the highlighted fields");
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error("Invalid project access");
      } else {
        toast.error(`Failed to create ticket: ${(err as Error).message}`);
      }
    } finally {
      submitting = false;
    }
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass =
    "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<svelte:head><title>My Tickets · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <!-- Header row -->
  <div
    class="flex items-center justify-between bg-white rounded-xl px-5 py-4 shadow"
  >
    <div>
      <h2 class="text-[18px] font-semibold text-[#0B182A]">My Tickets</h2>
      <p class="text-[13px] text-gray-400 mt-0.5">
        Track the status of your service requests
      </p>
    </div>
    <button
      onclick={openForm}
      class="flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-opacity"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Raise Ticket
    </button>
  </div>

  <!-- Stats strip -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {#each [{ label: "Open", value: tickets.filter((t) => normalizeStatus(t.status) === "open").length, color: "text-blue-600" }, { label: "In Progress", value: tickets.filter((t) => normalizeStatus(t.status) === "in_progress").length, color: "text-amber-600" }, { label: "Resolved", value: tickets.filter((t) => normalizeStatus(t.status) === "resolved").length, color: "text-green-600" }, { label: "Total", value: tickets.length, color: "text-[#0B182A]" }] as stat}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
        <p class="text-[24px] font-bold {stat.color}">
          {loading ? "—" : stat.value}
        </p>
      </div>
    {/each}
  </div>

  <!-- Tickets table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["TICKET ID", "PROJECT", "ISSUE", "STATUS", "PRIORITY", "SUPPORT", "LOCATION", "DATE"] as col}
              <th
                class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap"
              >
                {col}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td
                colspan="8"
                class="py-12 text-center text-[13px] text-gray-400"
              >
                <div class="flex items-center justify-center gap-2">
                  <div
                    class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"
                  ></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if tickets.length === 0}
            <tr>
              <td colspan="8" class="py-16 text-center">
                <div class="flex flex-col items-center gap-3">
                  <div
                    class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center"
                  >
                    <Icons.Ticket size={22} stroke="#9ca3af" />
                  </div>
                  <p class="text-[13px] text-gray-400">No tickets yet</p>
                  <button
                    onclick={openForm}
                    class="text-[13px] font-medium text-[#E87D1F] hover:underline cursor-pointer"
                  >
                    Raise your first ticket
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            {#each pagedTickets as t}
              <tr
                class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
              >
                <td
                  class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap"
                >
                  {t.ticketNumber || t.id.slice(0, 8)}
                </td>
                <td
                  class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap"
                  >{projectName(t.projectId)}</td
                >
                <td class="py-3 px-3">
                  <p
                    class="text-[13px] font-medium text-gray-800 max-w-50 truncate"
                  >
                    {t.title}
                  </p>
                  {#if t.description}
                    <p class="text-[11px] text-gray-400 max-w-50 truncate">
                      {t.description}
                    </p>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  <span
                    class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(
                      t.status,
                    )}"
                  >
                    {t.status || "—"}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <span
                    class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(
                      t.priority,
                    )}"
                  >
                    {t.priority || "—"}
                  </span>
                </td>
                <td class="py-3 px-3">
                  {#if t.escalationLevel}
                    <span
                      class="text-[11px] font-semibold px-2.5 py-1 rounded-full
                                 {t.escalationLevel === 'L3'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-orange-50 text-orange-600'}"
                    >
                      {t.escalationLevel} Support
                    </span>
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600"
                  >{t.state || "—"}</td
                >
                <td
                  class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap"
                  >{fmtDate(t.createdAt)}</td
                >
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

<!-- Raise Ticket Modal -->
{#if showForm}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (showForm = false)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Raise Ticket"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">
            Raise a Ticket
          </h2>
          <p class="text-[12px] text-gray-400 mt-0.5">
            Describe your issue and we'll assign an engineer
          </p>
        </div>
        <button
          onclick={() => (showForm = false)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" /><line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>
      </div>

      <!-- Form -->
      <form
        class="px-6 py-5 flex flex-col gap-4 overflow-y-auto"
        onsubmit={handleSubmit}
        novalidate
      >
        <!-- Project -->
        {#if projects.length === 0}
          <div
            class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700 font-medium"
          >
            No project assigned. Please contact admin.
          </div>
        {:else if projects.length === 1}
          <div class={labelClass}>
            <span class={labelTextClass}>Project</span>
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-gray-50"
            >
              {projects[0].name}
            </div>
          </div>
        {:else}
          <label class={labelClass}>
            <span class={labelTextClass}
              >Project <span class="text-red-400">*</span></span
            >
            <select class={fieldClass} bind:value={form.projectId}>
              {#each projects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
            {#if errors.projectId}<span class={errorClass}
                >{errors.projectId}</span
              >{/if}
          </label>
        {/if}

        <!-- Call Type (category) -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Call Type <span class="text-red-400">*</span></span
          >
          {#if !form.projectId}
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
            >
              Select a project first
            </div>
          {:else if loadingCategories}
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
            >
              Loading call types…
            </div>
          {:else if categories.length === 0}
            <div
              class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700"
            >
              No call types available
            </div>
          {:else}
            <select class={fieldClass} bind:value={form.categoryId}>
              {#each categories as c}
                <option value={c.id}>{c.name}</option>
              {/each}
            </select>
          {/if}
          {#if errors.categoryId}<span class={errorClass}
              >{errors.categoryId}</span
            >{/if}
        </label>

        <!-- Title -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Issue Title <span class="text-red-400">*</span></span
          >
          <input
            type="text"
            placeholder="e.g. ATM not dispensing cash"
            class="{fieldClass} {errors.title ? 'border-red-300' : ''}"
            bind:value={form.title}
          />
          {#if errors.title}<span class={errorClass}>{errors.title}</span>{/if}
        </label>

        <!-- Description -->
        <label class={labelClass}>
          <span class={labelTextClass}>Description</span>
          <textarea
            placeholder="Describe the problem in detail…"
            rows="3"
            class="{fieldClass} resize-none"
            bind:value={form.description}
          ></textarea>
        </label>

        <!-- Priority -->
        <label class={labelClass}>
          <span class={labelTextClass}>Priority</span>
          <select class={fieldClass} bind:value={form.priority}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </label>

        <!-- Location row -->
        <div class="grid grid-cols-2 gap-4">
          <label class={labelClass}>
            <span class={labelTextClass}>State</span>
            <input
              type="text"
              placeholder="e.g. Kerala"
              class={fieldClass}
              bind:value={form.state}
            />
          </label>
          <label class={labelClass}>
            <span class={labelTextClass}>City</span>
            <input
              type="text"
              placeholder="e.g. Kochi"
              class={fieldClass}
              bind:value={form.city}
            />
          </label>
        </div>

        <!-- Address -->
        <label class={labelClass}>
          <span class={labelTextClass}>Address / Branch</span>
          <input
            type="text"
            placeholder="Branch address or landmark"
            class={fieldClass}
            bind:value={form.address}
          />
        </label>

        <!-- Footer -->
        <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
          <button
            type="button"
            onclick={() => (showForm = false)}
            class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting ||
              projects.length === 0 ||
              categories.length === 0}
            class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Raise Ticket"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

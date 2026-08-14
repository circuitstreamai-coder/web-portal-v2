<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import {
    fetchTickets,
    fetchUsersByRole,
    fetchTicketCategories,
    type Ticket,
    type User,
    type TicketCategory,
  } from "$lib/modules/data/tickets/queries";
  import {
    createTicket,
    createTicketHistory,
    deleteTicket,
  } from "$lib/modules/data/tickets/actions";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import ClosureChecklist from "$lib/modules/data/tickets/ClosureChecklist.svelte";
  import {
    assignTicket,
    escalateTicket,
    updateTicketStatus,
  } from "$lib/api/tickets";
  import {
    fetchEngineerProfiles,
    type EngineerProfile,
  } from "$lib/modules/data/engineers/queries";
  import {
    fetchProjects,
    type Project,
  } from "$lib/modules/data/projects/queries";
  import {
    fetchCustomers,
    type Customer,
  } from "$lib/modules/data/customers/queries";
  import {
    ALL_TICKET_STATUSES,
    ROLE_STATUS_OPTIONS,
    TICKET_STATUS_LABELS,
    type TicketStatus,
  } from "$lib/config/roles";
  import { ApiError } from "$lib/api/rest";
  import type { ClosureEligibility } from "$lib/api/ticket-closure";
  import { queryVersion } from "$lib/stores/query";
  import { authStore } from "$lib/stores/auth";
  import { lookupPincode } from "$lib/utils/pincode";
  import Pagination from "$lib/components/Pagination.svelte";
  import {
    Modal,
    ModalHeader,
    ModalFooter,
    Badge,
    Spinner,
    FormField,
    DetailRow,
  } from "$lib/components/ui";

  const user = $derived($authStore.user);

  // ── Constants ─────────────────────────────────────────────────────────────

  const ADMIN_FILTER_STATUSES = ALL_TICKET_STATUSES;
  const ADMIN_UPDATE_STATUSES = ROLE_STATUS_OPTIONS.super_admin;
  const PRIORITIES = ["High", "Medium", "Low"];
  const ESCALATION_LEVELS = ["L2", "L3"];

  const fieldClass =
    "px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";

  // ── State ─────────────────────────────────────────────────────────────────

  let allTickets = $state<Ticket[]>([]);
  let engineers = $state<EngineerProfile[]>([]);
  let statePlanners = $state<User[]>([]);
  let projects = $state<Project[]>([]);
  let customers = $state<Customer[]>([]);
  let categories = $state<TicketCategory[]>([]);
  let loading = $state(true);

  let filterStatus = $state("");
  let filterPriority = $state("");
  let search = $state("");

  let showCreateModal = $state(false);
  let creatingTicket = $state(false);
  let autoAssign = $state(true);
  let createErrors = $state<Record<string, string>>({});
  let createForm = $state({
    customerId: "",
    projectId: "",
    categoryId: "",
    title: "",
    description: "",
    priority: "Medium",
    state: "",
    city: "",
    pincode: "",
    address: "",
  });

  let viewTicket = $state<Ticket | null>(null);

  let actionTicket = $state<Ticket | null>(null);
  let actionStatus = $state<TicketStatus>("open");
  let actionEngineerId = $state("");
  let actionStatePlannerId = $state("");
  let actionEscalate = $state(false);
  let actionEscalationLevel = $state("");
  let actionRemarks = $state("");
  let saving = $state(false);
  let actionEligibility = $state<ClosureEligibility | null>(null);
  let checklistRefreshKey = $state(0);
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  let tickets = $derived(
    allTickets
      .filter((t) => {
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterPriority && t.priority !== filterPriority) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            t.title?.toLowerCase().includes(q) ||
            t.ticketNumber?.toLowerCase().includes(q) ||
            t.state?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
  );

  let filteredProjects = $derived(
    createForm.customerId
      ? projects.filter((p) => p.customerId === createForm.customerId)
      : projects,
  );

  // ── Pagination ────────────────────────────────────────────────────────────

  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => {
    filterStatus;
    filterPriority;
    search;
    currentPage = 1;
  });
  const totalPages = $derived(
    Math.max(1, Math.ceil(tickets.length / PAGE_SIZE)),
  );
  const pagedTickets = $derived(
    tickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  function projectName(id: string): string {
    if (!id) return "—";
    return projects.find((p) => p.id === id)?.name ?? "—";
  }

  function engineerProfile(id: string): EngineerProfile | undefined {
    if (!id) return undefined;
    return engineers.find((eng) => eng.userId === id || eng.id === id);
  }

  function engineerName(id: string): string {
    if (!id) return "—";
    const e = engineerProfile(id);
    return e?.userName ?? e?.userEmail ?? id;
  }

  function plannerName(id: string): string {
    if (!id) return "—";
    const u = statePlanners.find((p) => p.id === id);
    return u?.name ?? u?.email ?? id;
  }

  function normalizeStatus(s: string): string {
    return (s ?? "").toLowerCase().replace(/ /g, "_");
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      open: "bg-blue-50 text-blue-600",
      assigned: "bg-indigo-50 text-indigo-600",
      accepted: "bg-teal-50 text-teal-600",
      in_progress: "bg-amber-50 text-amber-600",
      on_hold: "bg-yellow-50 text-yellow-700",
      pending_replacement: "bg-fuchsia-50 text-fuchsia-700",
      escalated_l2: "bg-orange-50 text-orange-600",
      escalated_l3: "bg-red-50 text-red-600",
      pending_validation: "bg-purple-50 text-purple-600",
      resolved: "bg-green-50 text-green-600",
      closed: "bg-gray-100 text-gray-500",
      reopened: "bg-cyan-50 text-cyan-700",
    };
    return map[normalizeStatus(status)] ?? "bg-gray-100 text-gray-500";
  }

  function statusLabel(s: string): string {
    return (
      TICKET_STATUS_LABELS[
        normalizeStatus(s) as keyof typeof TICKET_STATUS_LABELS
      ] ??
      s ??
      "—"
    );
  }

  function priorityBadge(p: string) {
    if (p === "High") return "bg-red-50 text-red-500";
    if (p === "Medium") return "bg-amber-50 text-amber-500";
    return "bg-green-50 text-green-600";
  }

  function escalationBadge(level: string) {
    if (level === "L3") return "bg-red-50 text-red-600";
    if (level === "L2") return "bg-orange-50 text-orange-600";
    return "";
  }

  function fmtDate(d: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function customerName(id: string): string {
    if (!id) return "—";
    return customers.find((c) => c.id === id)?.companyName ?? "—";
  }

  function openCreateModal() {
    createErrors = {};
    createForm = {
      customerId: "",
      projectId: "",
      categoryId: categories[0]?.id ?? "",
      title: "",
      description: "",
      priority: "Medium",
      state: "",
      city: "",
      pincode: "",
      address: "",
    };
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
    creatingTicket = false;
    createErrors = {};
  }

  function handleCustomerChange(customerId: string) {
    createForm.customerId = customerId;
    const nextProjects = customerId
      ? projects.filter((p) => p.customerId === customerId)
      : projects;
    createForm.projectId = nextProjects[0]?.id ?? "";
  }

  // ── Pincode autofill ──────────────────────────────────────────────────────

  let pincodeLoading = $state(false);

  async function handlePincodeInput(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    pincodeLoading = true;
    try {
      const result = await lookupPincode(pincode);
      if (result) {
        createForm.state = result.state;
        createForm.city = result.city;
      }
    } finally {
      pincodeLoading = false;
    }
  }

  function validateCreateForm() {
    const errors: Record<string, string> = {};
    if (!createForm.customerId) errors.customerId = "Please select a customer";
    if (!createForm.projectId) errors.projectId = "Please select a project";
    if (!createForm.categoryId) errors.categoryId = "Please select a call type";
    if (!createForm.title.trim()) errors.title = "Issue title is required";
    const pin = createForm.pincode.trim();
    if (pin && !/^[1-9]\d{5}$/.test(pin))
      errors.pincode = "Enter a valid 6-digit pincode";
    const selectedProject = projects.find((p) => p.id === createForm.projectId);
    if (
      selectedProject &&
      createForm.customerId &&
      selectedProject.customerId !== createForm.customerId
    )
      errors.projectId =
        "Selected project does not belong to the selected customer";
    createErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleCreateTicket() {
    if (!validateCreateForm()) return;
    creatingTicket = true;
    try {
      const created = await createTicket({
        projectId: createForm.projectId,
        categoryId: createForm.categoryId,
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        priority: createForm.priority,
        state: createForm.state.trim() || undefined,
        city: createForm.city.trim() || undefined,
        pincode: createForm.pincode.trim() || undefined,
        address: createForm.address.trim() || undefined,
        ...(user?.role === "super_admin" && { autoAssign }),
      });
      allTickets = [created, ...allTickets];
      closeCreateModal();
      toast.success(
        `Ticket created for ${customerName(createForm.customerId)}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors?.length) {
        const fieldErrors: Record<string, string> = {};
        for (const fe of err.errors) fieldErrors[fe.field] = fe.message;
        createErrors = fieldErrors;
        toast.error("Please fix the highlighted fields");
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error("Invalid customer or project selection");
      } else {
        toast.error(`Failed to create ticket: ${(err as Error).message}`);
      }
    } finally {
      creatingTicket = false;
    }
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTickets() {
    allTickets = await fetchTickets();
  }

  onMount(async () => {
    try {
      [, engineers, statePlanners, projects, customers, categories] =
        await Promise.all([
          loadTickets(),
          fetchEngineerProfiles(),
          fetchUsersByRole("state_planner").catch(() => [] as User[]),
          fetchProjects().catch(() => [] as Project[]),
          fetchCustomers().catch(() => [] as Customer[]),
          fetchTicketCategories().catch(() => [] as TicketCategory[]),
        ]);
    } catch {
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
    void loadTickets().catch(() => toast.error("Failed to refresh tickets"));
  });

  // ── Manage modal ──────────────────────────────────────────────────────────

  function openAction(ticket: Ticket, nextStatus?: TicketStatus) {
    actionTicket = ticket;
    actionStatus =
      nextStatus ?? (normalizeStatus(ticket.status) as TicketStatus);
    actionEngineerId = ticket.assignedEngineerId ?? "";
    actionStatePlannerId = ticket.statePlannerId ?? "";
    actionEscalate = !!ticket.escalationLevel;
    actionEscalationLevel = ticket.escalationLevel ?? "";
    actionRemarks = "";
    actionEligibility = null;
    checklistRefreshKey += 1;
  }

  async function saveAction() {
    if (!actionTicket) return;
    if (actionStatus === "closed" && !actionEligibility?.eligible) {
      toast.error("Complete the closure checklist before closing this ticket");
      return;
    }
    saving = true;
    try {
      const assignmentChanged =
        (actionEngineerId || "") !== (actionTicket.assignedEngineerId ?? "") ||
        (actionStatePlannerId || "") !== (actionTicket.statePlannerId ?? "");
      const statusChanged =
        actionStatus !== normalizeStatus(actionTicket.status);
      const escalationChanged =
        actionEscalate &&
        !!actionEscalationLevel &&
        actionEscalationLevel !== (actionTicket.escalationLevel ?? "");

      let updated = actionTicket;

      if (assignmentChanged) {
        updated = await assignTicket(actionTicket.id, {
          engineerId: actionEngineerId || undefined,
          statePlannerId: actionStatePlannerId || undefined,
        });
      }
      if (escalationChanged && actionEscalationLevel) {
        updated = await escalateTicket(actionTicket.id, {
          level: actionEscalationLevel as "L2" | "L3",
          reason:
            actionRemarks.trim() || `Escalated to ${actionEscalationLevel}`,
        });
      }
      if (statusChanged) {
        updated = await updateTicketStatus(
          actionTicket.id,
          actionStatus,
          actionRemarks.trim() || undefined,
        );
      }
      if (
        statusChanged ||
        assignmentChanged ||
        actionRemarks.trim() ||
        escalationChanged
      ) {
        await createTicketHistory({
          ticketId: actionTicket.id,
          status: actionStatus,
          remarks:
            [
              actionRemarks.trim(),
              assignmentChanged && actionEngineerId
                ? `Engineer assigned: ${engineerName(actionEngineerId)}`
                : "",
              assignmentChanged && actionStatePlannerId
                ? `Planner assigned: ${plannerName(actionStatePlannerId)}`
                : "",
              escalationChanged && actionEscalationLevel
                ? `Escalated to ${actionEscalationLevel}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          author: "admin",
        });
      }

      allTickets = allTickets.map((t) =>
        t.id === updated.id ? { ...t, ...updated } : t,
      );
      toast.success("Ticket updated");
      actionTicket = null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error("Unauthorized: insufficient permissions");
      } else {
        toast.error(`Update failed: ${(err as Error).message}`);
      }
    } finally {
      saving = false;
    }
  }

  function openApprove(ticket: Ticket) {
    openAction(ticket, "closed");
    actionRemarks = "Approved and closed by admin";
  }

  let deleteTicketTarget = $state<Ticket | null>(null);
  let deleting = $state(false);

  async function confirmDeleteTicket() {
    if (!deleteTicketTarget) return;
    deleting = true;
    try {
      await deleteTicket(deleteTicketTarget.id);
      allTickets = allTickets.filter((t) => t.id !== deleteTicketTarget!.id);
      toast.success("Ticket deleted");
      deleteTicketTarget = null;
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      deleting = false;
    }
  }
</script>

<svelte:head><title>Tickets · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <!-- Filter / Action Bar -->
  <div
    class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow"
  >
    <div
      class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-40 max-w-xs"
    >
      <Icons.Search size={16} stroke="#9ca3af" />
      <input
        type="text"
        placeholder="Search tickets…"
        bind:value={search}
        class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
      />
    </div>

    <select
      bind:value={filterStatus}
      class="px-3 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white outline-none focus:border-[#0B182A] cursor-pointer"
    >
      <option value="">All Statuses</option>
      {#each ADMIN_FILTER_STATUSES as s}
        <option value={s}>{TICKET_STATUS_LABELS[s]}</option>
      {/each}
    </select>

    <select
      bind:value={filterPriority}
      class="px-3 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white outline-none focus:border-[#0B182A] cursor-pointer"
    >
      <option value="">All Priorities</option>
      {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
    </select>

    <button
      onclick={openCreateModal}
      class="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Create Ticket
    </button>

    <span class="text-[12px] text-gray-400">{tickets.length} tickets</span>
  </div>

  <!-- Table Card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">All Tickets</h3>
      <span
        class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full"
      >
        {allTickets.length} Total
      </span>
      {#if allTickets.filter((t) => normalizeStatus(t.status) === "pending_validation").length > 0}
        <span
          class="text-[12px] font-semibold bg-purple-50 text-purple-600 px-3 py-1 rounded-full"
        >
          {allTickets.filter(
            (t) => normalizeStatus(t.status) === "pending_validation",
          ).length} Awaiting Approval
        </span>
      {/if}
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["TICKET", "PROJECT", "TITLE", "STATUS", "PRIORITY", "ENGINEER", "ESCALATION", "DATE", "ACTIONS"] as col}
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
                colspan="9"
                class="py-12 text-center text-[13px] text-gray-400"
              >
                <div class="flex items-center justify-center gap-2">
                  <Spinner />
                  Loading tickets…
                </div>
              </td>
            </tr>
          {:else if tickets.length === 0}
            <tr>
              <td
                colspan="9"
                class="py-12 text-center text-[13px] text-gray-400"
              >
                No tickets found
              </td>
            </tr>
          {:else}
            {#each pagedTickets as t}
              <tr
                class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors
                       {normalizeStatus(t.status) === 'pending_validation'
                  ? 'bg-purple-50/30'
                  : ''}"
              >
                <td
                  class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap"
                >
                  {t.ticketNumber || t.id.slice(0, 8)}
                </td>
                <td
                  class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap"
                >
                  {projectName(t.projectId)}
                </td>
                <td class="py-3 px-3">
                  <p
                    class="text-[13px] font-medium text-gray-800 max-w-45 truncate"
                  >
                    {t.title}
                  </p>
                  {#if t.description}
                    <p class="text-[11px] text-gray-400 max-w-45 truncate">
                      {t.description}
                    </p>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  <div class="flex flex-col gap-1">
                    <Badge class={statusBadge(t.status)}>{statusLabel(t.status)}</Badge>
                    {#if t.replacementStatus}
                      <Badge class="bg-fuchsia-50 text-fuchsia-700">Replacement: {t.replacementStatus}</Badge>
                    {/if}
                  </div>
                </td>
                <td class="py-3 px-3">
                  <Badge class={priorityBadge(t.priority)}
                    >{t.priority || "—"}</Badge
                  >
                </td>
                <td
                  class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap"
                >
                  <div class="flex flex-col gap-0.5">
                    <span class="font-medium text-gray-700">{engineerName(t.assignedEngineerId)}</span>
                    {#if engineerProfile(t.assignedEngineerId)?.userPhone}
                      <a class="text-[11px] text-gray-400 hover:text-[#E87D1F]" href={`tel:${engineerProfile(t.assignedEngineerId)?.userPhone}`}>{engineerProfile(t.assignedEngineerId)?.userPhone}</a>
                    {/if}
                    {#if engineerProfile(t.assignedEngineerId)?.userEmail}
                      <a class="text-[11px] text-gray-400 hover:text-[#E87D1F]" href={`mailto:${engineerProfile(t.assignedEngineerId)?.userEmail}`}>{engineerProfile(t.assignedEngineerId)?.userEmail}</a>
                    {/if}
                  </div>
                </td>
                <td class="py-3 px-3">
                  {#if t.escalationLevel}
                    <Badge class={escalationBadge(t.escalationLevel)}
                      >{t.escalationLevel}</Badge
                    >
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
                <td
                  class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap"
                >
                  {fmtDate(t.createdAt)}
                </td>
                <td class="py-3 px-3">
                  <div class="flex gap-1.5">
                    {#if normalizeStatus(t.status) === "pending_validation"}
                      <button
                        onclick={() => openApprove(t)}
                        disabled={saving}
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        <Icons.Check size={11} strokeWidth={2.5} />
                        Approve & Close
                      </button>
                    {/if}
                    <button
                      onclick={() => (viewTicket = t)}
                      class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <Icons.Eye size={12} />
                      View
                    </button>
                    <button
                      onclick={() => openAction(t)}
                      class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-[#0B182A]/5 text-[#0B182A] hover:bg-[#0B182A]/10 transition-colors cursor-pointer"
                    >
                      <Icons.Edit size={12} />
                      Manage
                    </button>
                    <button
                      onclick={() => (deleteTicketTarget = t)}
                      class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                      aria-label="Delete ticket"
                    >
                      <Icons.Trash size={12} />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <Pagination
      {currentPage}
      {totalPages}
      totalItems={tickets.length}
      pageSize={PAGE_SIZE}
      itemLabel="tickets"
      {loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

<!-- ── Create Ticket Modal ───────────────────────────────────────────────── -->
{#if showCreateModal}
  <Modal maxWidth="max-w-2xl" label="Create Ticket" onclose={closeCreateModal}>
    <ModalHeader onclose={closeCreateModal}>
      <h2 class="text-[16px] font-semibold text-[#0B182A]">Create Ticket</h2>
      <p class="text-[12px] text-gray-400 mt-0.5">
        Select a customer, choose their project, then create a ticket.
      </p>
    </ModalHeader>

    <div class="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Customer" error={createErrors.customerId}>
          <select
            class={fieldClass}
            bind:value={createForm.customerId}
            onchange={() => handleCustomerChange(createForm.customerId)}
          >
            <option value="">Select customer</option>
            {#each customers as customer}
              <option value={customer.id}>{customer.companyName}</option>
            {/each}
          </select>
        </FormField>

        <FormField label="Project" error={createErrors.projectId}>
          <select
            class={fieldClass}
            bind:value={createForm.projectId}
            disabled={filteredProjects.length === 0}
          >
            <option value="">
              {filteredProjects.length === 0
                ? "No projects available"
                : "Select project"}
            </option>
            {#each filteredProjects as project}
              <option value={project.id}>{project.name}</option>
            {/each}
          </select>
        </FormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Call Type" error={createErrors.categoryId}>
          <select class={fieldClass} bind:value={createForm.categoryId}>
            <option value="">Select call type</option>
            {#each categories as category}
              <option value={category.id}>{category.name}</option>
            {/each}
          </select>
        </FormField>

        <FormField label="Priority">
          <select class={fieldClass} bind:value={createForm.priority}>
            {#each PRIORITIES as p}<option value={p}>{p}</option>{/each}
          </select>
        </FormField>
      </div>

      <FormField label="Issue Title" error={createErrors.title}>
        <input
          type="text"
          bind:value={createForm.title}
          placeholder="Enter issue title"
          class={fieldClass}
        />
      </FormField>

      <FormField label="Description">
        <textarea
          bind:value={createForm.description}
          placeholder="Describe the issue"
          rows="3"
          class="{fieldClass} resize-none"
        ></textarea>
      </FormField>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField label="State">
          <input
            type="text"
            bind:value={createForm.state}
            placeholder="e.g. Kerala"
            class={fieldClass}
          />
        </FormField>

        <FormField label="City">
          <input
            type="text"
            bind:value={createForm.city}
            placeholder="e.g. Kochi"
            class={fieldClass}
          />
        </FormField>

        <FormField label="Pincode" error={createErrors.pincode}>
          <div class="relative">
            <input
              type="text"
              bind:value={createForm.pincode}
              placeholder="e.g. 682001"
              maxlength="6"
              class="{fieldClass} {createErrors.pincode
                ? 'border-red-400 focus:border-red-400'
                : ''}"
              oninput={() => handlePincodeInput(createForm.pincode)}
            />
            {#if pincodeLoading}
              <div class="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Spinner size="w-3.5 h-3.5" />
              </div>
            {/if}
          </div>
          <p class="text-[11px] text-blue-500">
            Enter 6-digit pincode to auto-fill state & city
          </p>
        </FormField>
      </div>

      <FormField label="Address">
        <textarea
          bind:value={createForm.address}
          placeholder="Site address"
          rows="2"
          class="{fieldClass} resize-none"
        ></textarea>
      </FormField>

      {#if user?.role === "super_admin"}
        <div class="flex items-center gap-3 pt-1">
          <button
            type="button"
            id="auto-assign"
            role="switch"
            aria-checked={autoAssign}
            aria-label="Auto-assign to engineer"
            onclick={() => (autoAssign = !autoAssign)}
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors {autoAssign
              ? 'bg-[#0B182A]'
              : 'bg-gray-200'}"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform {autoAssign
                ? 'translate-x-4'
                : 'translate-x-0'}"
            ></span>
          </button>
          <label
            for="auto-assign"
            class="text-[13px] font-medium text-gray-700 cursor-pointer"
          >
            Auto-assign to engineer
          </label>
          <span class="text-[11px] text-gray-400">
            {autoAssign
              ? "Will be assigned automatically via round-robin"
              : "Ticket will stay open — assign manually later"}
          </span>
        </div>
      {/if}
    </div>

    <ModalFooter>
      <button
        onclick={closeCreateModal}
        class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <button
        onclick={handleCreateTicket}
        disabled={creatingTicket}
        class="px-4 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
      >
        {creatingTicket ? "Creating…" : "Create Ticket"}
      </button>
    </ModalFooter>
  </Modal>
{/if}

<!-- ── View Ticket Modal ──────────────────────────────────────────────────── -->
{#if viewTicket}
  {@const vt = viewTicket}
  <Modal label="View Ticket" onclose={() => (viewTicket = null)}>
    <ModalHeader onclose={() => (viewTicket = null)}>
      <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
        {vt.ticketNumber || vt.id.slice(0, 8)}
      </p>
      <h2
        class="text-[15px] font-semibold text-[#0B182A] leading-tight max-w-85"
      >
        {vt.title}
      </h2>
    </ModalHeader>

    <div class="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
      <div class="flex items-center gap-2">
        <Badge class={statusBadge(vt.status)}>{statusLabel(vt.status)}</Badge>
        <Badge class={priorityBadge(vt.priority)}>{vt.priority || "—"}</Badge>
        {#if vt.escalationLevel}
          <Badge class={escalationBadge(vt.escalationLevel)}
            >{vt.escalationLevel}</Badge
          >
        {/if}
      </div>

      {#if vt.description}
        <p class="text-[13px] text-gray-600 leading-relaxed">
          {vt.description}
        </p>
      {/if}

      <div class="rounded-xl border border-gray-100 divide-y divide-gray-100">
        <DetailRow label="Project">{projectName(vt.projectId)}</DetailRow>
        <DetailRow label="Customer">
          {customerName(
            projects.find((p) => p.id === vt.projectId)?.customerId ?? "",
          )}
        </DetailRow>
        <DetailRow label="Engineer"
          >{engineerName(vt.assignedEngineerId)}</DetailRow
        >
        {#if engineerProfile(vt.assignedEngineerId)?.userPhone}
          <DetailRow label="Engineer Phone">
            <a class="text-[#E87D1F]" href={`tel:${engineerProfile(vt.assignedEngineerId)?.userPhone}`}>
              {engineerProfile(vt.assignedEngineerId)?.userPhone}
            </a>
          </DetailRow>
        {/if}
        {#if engineerProfile(vt.assignedEngineerId)?.userEmail}
          <DetailRow label="Engineer Email">
            <a class="text-[#E87D1F]" href={`mailto:${engineerProfile(vt.assignedEngineerId)?.userEmail}`}>
              {engineerProfile(vt.assignedEngineerId)?.userEmail}
            </a>
          </DetailRow>
        {/if}
        <DetailRow label="State Planner"
          >{plannerName(vt.statePlannerId)}</DetailRow
        >
        <DetailRow label="Raised On">{fmtDate(vt.createdAt)}</DetailRow>
        {#if vt.slaDeadline}
          {@const overdue = new Date(vt.slaDeadline) < new Date()}
          <div class="flex justify-between items-center px-4 py-3">
            <span
              class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
            >
              SLA Deadline
            </span>
            <span
              class="text-[13px] font-semibold {overdue
                ? 'text-red-600'
                : 'text-gray-700'}"
            >
              {fmtDate(vt.slaDeadline)}
              {#if overdue}
                <span
                  class="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full"
                >
                  Overdue
                </span>
              {/if}
            </span>
          </div>
        {/if}
        {#if vt.payoutAmount}
          <DetailRow label="Payout">₹{vt.payoutAmount}</DetailRow>
        {/if}
      </div>

      {#if vt.state || vt.city || vt.pincode || vt.address}
        <div>
          <p
            class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2"
          >
            Location
          </p>
          <div
            class="rounded-xl border border-gray-100 divide-y divide-gray-100"
          >
            {#if vt.state}<DetailRow label="State">{vt.state}</DetailRow>{/if}
            {#if vt.city}<DetailRow label="City">{vt.city}</DetailRow>{/if}
            {#if vt.pincode}<DetailRow label="Pincode">{vt.pincode}</DetailRow
              >{/if}
            {#if vt.address}
              <div class="px-4 py-3">
                <span
                  class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1"
                >
                  Address
                </span>
                <span class="text-[13px] text-gray-700 leading-relaxed"
                  >{vt.address}</span
                >
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <ModalFooter>
      <button
        onclick={() => {
          viewTicket = null;
          openAction(vt);
        }}
        class="px-4 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
      >
        Manage
      </button>
      <button
        onclick={() => (viewTicket = null)}
        class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
      >
        Close
      </button>
    </ModalFooter>
  </Modal>
{/if}

<!-- ── Manage Ticket Modal ────────────────────────────────────────────────── -->
{#if actionTicket}
  <Modal
    maxWidth="max-w-md"
    label="Manage Ticket"
    onclose={() => (actionTicket = null)}
  >
    <ModalHeader onclose={() => (actionTicket = null)}>
      <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
        {actionTicket.ticketNumber || actionTicket.id.slice(0, 8)}
      </p>
      <h2
        class="text-[15px] font-semibold text-[#0B182A] leading-tight max-w-72.5"
      >
        {actionTicket.title}
      </h2>
    </ModalHeader>

    <div class="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
      {#if normalizeStatus(actionTicket.status) === "pending_validation"}
        <div
          class="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-100"
        >
          <div
            class="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0"
          >
            <Icons.AlertTriangle size={16} stroke="#7c3aed" />
          </div>
          <div>
            <p class="text-[13px] font-semibold text-purple-700">
              Pending Validation
            </p>
            <p class="text-[11px] text-purple-500 mt-0.5">
              Engineer has marked this as resolved. Review and approve to close.
            </p>
          </div>
        </div>
      {/if}

      {#if actionStatus === "closed"}
        <ClosureChecklist
          ticketId={actionTicket.id}
          refreshKey={checklistRefreshKey}
          onLoaded={(eligibility) => {
            actionEligibility = eligibility;
          }}
        />
      {/if}

      <FormField label="Status">
        <select class={fieldClass} bind:value={actionStatus}>
          {#each ADMIN_UPDATE_STATUSES as s}
            <option value={s}>{TICKET_STATUS_LABELS[s]}</option>
          {/each}
        </select>
      </FormField>

      <FormField label="Assign Engineer">
        <select class={fieldClass} bind:value={actionEngineerId}>
          <option value="">— Unassigned —</option>
          {#each engineers as eng}
            <option value={eng.userId}
              >{eng.userName ?? eng.userEmail ?? eng.userId}</option
            >
          {/each}
        </select>
      </FormField>

      <FormField label="Assign State Planner">
        {#if statePlanners.length > 0}
          <select class={fieldClass} bind:value={actionStatePlannerId}>
            <option value="">— Unassigned —</option>
            {#each statePlanners as sp}
              <option value={sp.id}>{sp.name ?? sp.email}</option>
            {/each}
          </select>
        {:else}
          <p class="text-[12px] text-gray-400 italic">
            {actionStatePlannerId
              ? plannerName(actionStatePlannerId)
              : "No state planners available"}
          </p>
        {/if}
      </FormField>

      <!-- Escalation toggle -->
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <span
            class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
          >
            Request Support
          </span>
          <button
            type="button"
            onclick={() => {
              actionEscalate = !actionEscalate;
              if (!actionEscalate) actionEscalationLevel = "";
            }}
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer
                   {actionEscalate ? 'bg-[#E87D1F]' : 'bg-gray-200'}"
            role="switch"
            aria-checked={actionEscalate}
            aria-label="Toggle escalation"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                     {actionEscalate ? 'translate-x-4.5' : 'translate-x-0.5'}"
            ></span>
          </button>
        </div>
        {#if actionEscalate}
          <div class="flex gap-2">
            {#each ESCALATION_LEVELS as lvl}
              <button
                type="button"
                onclick={() => (actionEscalationLevel = lvl)}
                class="flex-1 py-2 text-[13px] font-semibold rounded-lg border transition-all cursor-pointer
                       {actionEscalationLevel === lvl
                  ? lvl === 'L3'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-[#E87D1F] text-white border-[#E87D1F]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}"
              >
                {lvl}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <FormField label="Remarks (optional)">
        <textarea
          bind:value={actionRemarks}
          placeholder="Add a note about this update…"
          rows="3"
          class="{fieldClass} resize-none"
        ></textarea>
      </FormField>
    </div>

    <ModalFooter>
      <button
        onclick={() => (actionTicket = null)}
        class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
      >
        Cancel
      </button>

      {#if actionStatus === "closed" && actionEligibility?.eligible}
        <button
          onclick={saveAction}
          disabled={saving}
          class="px-4 py-2.5 text-[13px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving
            ? "Saving…"
            : normalizeStatus(actionTicket.status) === "pending_validation"
              ? "Approve & Close"
              : "Close Ticket"}
        </button>
      {/if}

      {#if actionStatus !== "closed"}
        <button
          onclick={saveAction}
          disabled={saving}
          class="px-4 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      {/if}
    </ModalFooter>
  </Modal>
{/if}

{#if deleteTicketTarget}
  <ConfirmModal
    title="Delete Ticket"
    message="Delete ticket {deleteTicketTarget.ticketNumber || deleteTicketTarget.id.slice(0, 8)}? This cannot be undone."
    confirmLabel={deleting ? "Deleting…" : "Delete"}
    confirmClass="bg-red-600 text-white hover:bg-red-700"
    onConfirm={confirmDeleteTicket}
    onCancel={() => (deleteTicketTarget = null)}
  />
{/if}

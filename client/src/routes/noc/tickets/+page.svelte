<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import { authStore } from "$lib/stores/auth";
  import ClosureChecklist from "$lib/modules/data/tickets/ClosureChecklist.svelte";
  import RcaSection from "$lib/modules/data/tickets/RcaSection.svelte";
  import {
    fetchTicketCategories,
    fetchTickets,
    type Ticket,
    type TicketCategory,
  } from "$lib/modules/data/tickets/queries";
  import {
    createTicketHistory,
    validateTicket,
  } from "$lib/modules/data/tickets/actions";
  import { updateTicketStatus, assignTicket } from "$lib/api/tickets";
  import {
    checkClosureEligibility,
    type ClosureEligibility,
  } from "$lib/api/ticket-closure";
  import {
    fetchProjects,
    type Project,
  } from "$lib/modules/data/projects/queries";
  import { ApiError, restRequest } from "$lib/api/rest";
  import { queryVersion, invalidate } from "$lib/stores/query";
  import Pagination from "$lib/components/Pagination.svelte";

  const user = $derived($authStore.user);

  // ── State ─────────────────────────────────────────────────────────────────

  let tickets = $state<Ticket[]>([]);
  let projects = $state<Project[]>([]);
  let loading = $state(true);

  // Tabs
  let activeTab = $state<"all" | "unassigned">("all");

  // Detail sidebar
  let detailTicket = $state<Ticket | null>(null);
  let detailEngineer = $state<User | null>(null);
  let detailPlanner = $state<User | null>(null);
  let loadingDetailUsers = $state(false);
  const usersCache = new Map<string, User>();

  async function openDetail(t: Ticket) {
    detailTicket = t;
    detailEngineer = null;
    detailPlanner = null;
    const tAny = t as any;
    const engineerId: string = tAny.assignedEngineerId ?? "";
    const plannerId: string = tAny.statePlannerId ?? "";
    if (!engineerId && !plannerId) return;
    loadingDetailUsers = true;
    try {
      const fetches: Promise<void>[] = [];
      if (engineerId) {
        if (usersCache.has(engineerId)) {
          detailEngineer = usersCache.get(engineerId)!;
        } else {
          fetches.push(
            restRequest<User[]>("/api/users?role=engineer").then((users) => {
              users.forEach((u) => usersCache.set(u.id, u));
              detailEngineer = usersCache.get(engineerId) ?? null;
            }),
          );
        }
      }
      if (plannerId) {
        if (usersCache.has(plannerId)) {
          detailPlanner = usersCache.get(plannerId)!;
        } else {
          fetches.push(
            restRequest<User[]>("/api/users?role=state_planner").then(
              (users) => {
                users.forEach((u) => usersCache.set(u.id, u));
                detailPlanner = usersCache.get(plannerId) ?? null;
              },
            ),
          );
        }
      }
      await Promise.all(fetches);
    } catch {
      // names just won't show
    } finally {
      loadingDetailUsers = false;
    }
  }

  // Validation / close modal
  let actionTicket = $state<Ticket | null>(null);
  let actionType = $state<"approve" | "close">("approve");
  let actionRemarks = $state("");
  let actioning = $state(false);
  let actionEligibility = $state<ClosureEligibility | null>(null);
  let checklistRefreshKey = $state(0);
  let validatingTicketId = $state<string | null>(null);
  let closureEligibilityByTicket = $state<Record<string, ClosureEligibility>>(
    {},
  );
  let loadingClosureEligibility = $state<Record<string, boolean>>({});

  // Assignment panel
  type User = { id: string; name: string; email?: string; role: string };
  let assignTarget = $state<Ticket | null>(null);
  let assignPlanners = $state<User[]>([]);
  let assignEngineers = $state<User[]>([]);
  let assignForm = $state({ engineerId: "", statePlannerId: "" });
  let assigning = $state(false);
  let loadingAssignees = $state(false);

  // Escalation modal
  let escalateTarget = $state<Ticket | null>(null);
  let escalateUsers = $state<User[]>([]);
  let escalateForm = $state({ level: "L2", engineerId: "", reason: "" });
  let escalateErrors = $state<Record<string, string>>({});
  let escalating = $state(false);
  let loadingEscalateUsers = $state(false);

  const filteredEscalateUsers = $derived(
    escalateUsers.filter((u) =>
      escalateForm.level === "L2"
        ? u.role === "l2_engineer"
        : escalateForm.level === "L3"
          ? u.role === "l3_engineer"
          : true,
    ),
  );

  // Create ticket modal
  type Customer = { id: string; companyName: string; status?: string };
  let showCreate = $state(false);
  let submitting = $state(false);
  let customers = $state<Customer[]>([]);
  let categories = $state<TicketCategory[]>([]);
  let formProjects = $state<Project[]>([]);
  let form = $state({
    customerId: "",
    projectId: "",
    categoryId: "",
    title: "",
    description: "",
    priority: "Medium",
    state: "",
    city: "",
    address: "",
  });
  let formErrors = $state<Record<string, string>>({});
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTickets() {
    const fetchedTickets = await fetchTickets();
    tickets = fetchedTickets;
    await primeClosureEligibility(fetchedTickets);
  }

  onMount(async () => {
    try {
      const [, fetchedProjects, fetchedCustomers, fetchedCategories] = await Promise.all([
        loadTickets(),
        fetchProjects().catch(() => [] as Project[]),
        restRequest<Customer[]>("/api/customers"),
        fetchTicketCategories().catch(() => [] as TicketCategory[]),
      ]);
      projects = fetchedProjects;
      customers = fetchedCustomers.filter((c) => c.status !== "inactive");
      categories = fetchedCategories;
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
    void loadTickets().catch(() => {
      toast.error("Failed to refresh tickets");
    });
  });

  function switchTab(tab: "all" | "unassigned") {
    activeTab = tab;
  }

  // ── Assignment panel ──────────────────────────────────────────────────────

  async function openAssign(t: Ticket) {
    const tAny = t as any;
    assignTarget = t;
    assignForm = {
      engineerId: tAny.engineerId ?? "",
      statePlannerId: tAny.statePlannerId ?? "",
    };
    loadingAssignees = true;
    assignPlanners = [];
    assignEngineers = [];
    try {
      const stateId = tAny.stateId;
      const qs = stateId ? `&stateId=${encodeURIComponent(stateId)}` : "";
      const [planners, engineers] = await Promise.all([
        restRequest<User[]>(`/api/users?role=state_planner${qs}`),
        restRequest<User[]>(`/api/users?role=engineer${qs}`),
      ]);
      assignPlanners = planners;
      assignEngineers = engineers;
    } catch {
      toast.error("Failed to load assignees");
    } finally {
      loadingAssignees = false;
    }
  }

  async function submitAssign() {
    if (!assignTarget) return;
    if (!assignForm.engineerId && !assignForm.statePlannerId) {
      toast.error("Select at least one assignee");
      return;
    }
    assigning = true;
    try {
      const updated = await assignTicket(assignTarget.id, {
        engineerId: assignForm.engineerId || undefined,
        statePlannerId: assignForm.statePlannerId || undefined,
      });
      tickets = tickets.map((t) =>
        t.id === updated.id ? { ...t, ...updated } : t,
      );
      toast.success("Ticket assigned successfully");
      assignTarget = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      assigning = false;
    }
  }

  // ── Escalation modal ──────────────────────────────────────────────────────

  async function openEscalate(t: Ticket) {
    escalateTarget = t;
    escalateForm = { level: "L2", engineerId: "", reason: "" };
    escalateErrors = {};
    loadingEscalateUsers = true;
    escalateUsers = [];
    try {
      const [l2, l3] = await Promise.all([
        restRequest<User[]>("/api/users?role=l2_engineer").catch(() => []),
        restRequest<User[]>("/api/users?role=l3_engineer").catch(() => []),
      ]);
      escalateUsers = [...l2, ...l3];
    } finally {
      loadingEscalateUsers = false;
    }
  }

  async function submitEscalate() {
    if (!escalateTarget) return;
    escalateErrors = {};
    if (!escalateForm.reason.trim()) {
      escalateErrors.reason = "Reason is required";
      return;
    }
    const escalationLevel = escalateForm.level.toUpperCase();
    if (!['L1', 'L2', 'L3'].includes(escalationLevel)) {
      escalateErrors.level = 'Invalid escalation level';
      return;
    }
    escalating = true;
    try {
      const updated = await restRequest<Ticket>(
        `/api/tickets/${escalateTarget.id}/escalate`,
        {
          method: "PATCH",
          body: JSON.stringify({
            escalationLevel,
            remarks: escalateForm.reason.trim(),
            ...(escalateForm.engineerId ? { engineerId: escalateForm.engineerId } : {}),
          }),
        },
      );
      tickets = tickets.map((t) =>
        t.id === updated.id ? { ...t, ...updated } : t,
      );
      invalidate('tickets');
      toast.success(`Ticket escalated to ${escalationLevel}`);
      escalateTarget = null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error('Invalid escalation level');
      } else {
        toast.error(`Failed: ${(err as Error).message}`);
      }
    } finally {
      escalating = false;
    }
  }

  // ── Categories (lazy) ─────────────────────────────────────────────────────

  async function ensureCategories() {
    if (categories.length > 0) {
      if (!categories.some((c) => c.id === form.categoryId))
        form.categoryId = categories[0]?.id ?? "";
      return;
    }
    try {
      categories = await fetchTicketCategories();
      form.categoryId = categories[0]?.id ?? "";
    } catch {
      categories = [];
      form.categoryId = "";
      toast.error("Failed to load call types");
    }
  }

  $effect(() => {
    const cid = form.customerId;
    if (!cid) {
      formProjects = [];
      form.projectId = "";
      form.categoryId = "";
      return;
    }
    formProjects = projects.filter((p) => p.customerId === cid);
    if (!formProjects.some((p) => p.id === form.projectId))
      form.projectId = formProjects[0]?.id ?? "";
  });

  $effect(() => {
    if (!showCreate || !form.projectId) {
      if (!form.projectId) form.categoryId = "";
      return;
    }
    void ensureCategories();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function projectName(id: string) {
    if (!id) return "—";
    return projects.find((p) => p.id === id)?.name ?? "—";
  }

  function categoryName(id: string) {
    if (!id) return "—";
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

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
      pending_validation: "bg-purple-50 text-purple-700",
      resolved: "bg-green-50 text-green-600",
      closed: "bg-gray-100 text-gray-500",
      rejected: "bg-rose-50 text-rose-600",
      cancelled: "bg-red-50 text-red-500",
    };
    return map[normalizeStatus(status)] ?? "bg-gray-100 text-gray-500";
  }

  function priorityBadge(p: string) {
    if (p === "Critical") return "bg-red-100 text-red-700";
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

  function canAct(t: Ticket) {
    return !["closed", "cancelled", "rejected"].includes(
      normalizeStatus(t.status),
    );
  }

  function canAssign(t: Ticket) {
    return ["open", "assigned"].includes(normalizeStatus(t.status));
  }

  function canEscalate(t: Ticket) {
    return !["closed", "cancelled", "rejected", "resolved"].includes(
      normalizeStatus(t.status),
    );
  }

  function canValidateResolution(t: Ticket) {
    return normalizeStatus(t.status) === "resolved" && user?.role === "noc";
  }

  function needsClosureEligibility(t: Ticket) {
    return canAct(t);
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
      closureEligibilityByTicket[ticketId] =
        await checkClosureEligibility(ticketId);
    } catch (err) {
      toast.error(
        `Failed to check closure eligibility: ${(err as Error).message}`,
      );
    } finally {
      loadingClosureEligibility[ticketId] = false;
    }
  }

  async function primeClosureEligibility(list: Ticket[]): Promise<void> {
    const ids = list
      .filter(needsClosureEligibility)
      .map((ticket) => ticket.id)
      .filter((id) => !closureEligibilityByTicket[id]);

    await Promise.all(ids.map((id) => loadClosureEligibility(id)));
  }

  // ── Action modal (approve / close) ────────────────────────────────────────

  function openApprove(ticket: Ticket) {
    actionTicket = ticket;
    actionType = "approve";
    actionRemarks = "";
    actionEligibility = null;
    checklistRefreshKey += 1;
  }

  function openClose(ticket: Ticket) {
    actionTicket = ticket;
    actionType = "close";
    actionRemarks = "";
    actionEligibility = null;
    checklistRefreshKey += 1;
  }

  async function saveAction() {
    if (!actionTicket) return;
    if (!actionEligibility?.eligible) {
      toast.error("Complete the closure checklist before closing this ticket");
      return;
    }
    actioning = true;
    const defaultRemarks =
      actionType === "approve"
        ? "Validated and approved — ticket closed"
        : "Closed by NOC";
    try {
      await createTicketHistory({
        ticketId: actionTicket.id,
        status: "Closed",
        remarks: actionRemarks.trim() || defaultRemarks,
        author: user?.id ?? "noc",
      });
      const updated = await updateTicketStatus(
        actionTicket.id,
        "closed",
        actionRemarks.trim() || defaultRemarks,
      );
      tickets = tickets.map((t) =>
        t.id === updated.id ? { ...t, ...updated } : t,
      );
      await loadClosureEligibility(actionTicket.id);
      toast.success(
        actionType === "approve"
          ? "Ticket approved and closed"
          : "Ticket closed",
      );
      actionTicket = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      actioning = false;
    }
  }

  async function handleValidateResolution(ticket: Ticket) {
    validatingTicketId = ticket.id;
    try {
      await validateTicket(ticket.id, "Validated by NOC");
      await loadClosureEligibility(ticket.id);
      checklistRefreshKey += 1;
      toast.success("NOC validation completed");
    } catch (err) {
      toast.error(`Validation failed: ${(err as Error).message}`);
    } finally {
      validatingTicketId = null;
    }
  }

  // ── Create ticket (manual) ────────────────────────────────────────────────

  function openCreate() {
    form = {
      customerId: "",
      projectId: "",
      categoryId: "",
      title: "",
      description: "",
      priority: "Medium",
      state: "",
      city: "",
      address: "",
    };
    formProjects = [];
    formErrors = {};
    showCreate = true;
  }

  function validateCreate(): boolean {
    formErrors = {};
    if (!form.customerId) formErrors.customerId = "Please select a customer";
    if (!form.projectId) formErrors.projectId = "Please select a project";
    if (!form.categoryId) formErrors.categoryId = "Please select a call type";
    if (!form.title.trim()) formErrors.title = "Issue title is required";
    return Object.keys(formErrors).length === 0;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!validateCreate()) return;
    submitting = true;
    try {
      const created = await restRequest<Ticket>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          projectId: form.projectId,
          categoryId: form.categoryId,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          state: form.state.trim() || undefined,
          city: form.city.trim() || undefined,
          address: form.address.trim() || undefined,
          source: "manual_noc",
        }),
      });
      tickets = [created, ...tickets];
      toast.success("Ticket created successfully");
      showCreate = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors?.length) {
        const fe: Record<string, string> = {};
        for (const e of err.errors) fe[e.field] = e.message;
        formErrors = fe;
        toast.error("Please fix the highlighted fields");
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error("Unauthorized: insufficient permissions");
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

  // ── Pagination ─────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPageAll = $state(1);
  let currentPageUnassigned = $state(1);

  $effect(() => {
    activeTab;
    currentPageAll = 1;
    currentPageUnassigned = 1;
  });

  const pagedTickets = $derived(
    tickets.slice((currentPageAll - 1) * PAGE_SIZE, currentPageAll * PAGE_SIZE),
  );
  const totalPagesAll = $derived(
    Math.max(1, Math.ceil(tickets.length / PAGE_SIZE)),
  );

  const unassigned = $derived(
    tickets.filter((t) => normalizeStatus(t.status) === "open"),
  );
  const pagedUnassigned = $derived(
    unassigned.slice(
      (currentPageUnassigned - 1) * PAGE_SIZE,
      currentPageUnassigned * PAGE_SIZE,
    ),
  );
  const totalPagesUnassigned = $derived(
    Math.max(1, Math.ceil(unassigned.length / PAGE_SIZE)),
  );
</script>

<svelte:head><title>Tickets · NOC · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <!-- Stats -->
  <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
    {#each [{ label: "Total", value: tickets.length, color: "text-[#0B182A]" }, { label: "Unassigned", value: tickets.filter((t) => normalizeStatus(t.status) === "open").length, color: "text-orange-600" }, { label: "Pending Validation", value: tickets.filter((t) => normalizeStatus(t.status) === "pending_validation").length, color: "text-purple-700" }, { label: "Open / In Progress", value: tickets.filter( (t) => ["open", "in_progress"].includes(normalizeStatus(t.status)), ).length, color: "text-amber-600" }, { label: "Closed", value: tickets.filter((t) => normalizeStatus(t.status) === "closed").length, color: "text-gray-500" }] as stat}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
        <p class="text-[24px] font-bold {stat.color}">
          {loading ? "—" : stat.value}
        </p>
      </div>
    {/each}
  </div>

  <!-- Table card -->
  <div class="bg-white rounded-2xl shadow">
    <!-- Card header -->
    <div class="flex items-center justify-between gap-3 px-6 pt-5 pb-0">
      <!-- Tab bar -->
      <div class="flex items-center gap-0.5">
        <button
          onclick={() => switchTab("all")}
          class="px-4 py-2.5 text-[13px] font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer
                 {activeTab === 'all'
            ? 'border-[#E87D1F] text-[#E87D1F] bg-[#E87D1F]/5'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}"
        >
          All Tickets
        </button>
        <button
          onclick={() => switchTab("unassigned")}
          class="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-t-lg border-b-2 transition-colors cursor-pointer
                 {activeTab === 'unassigned'
            ? 'border-[#E87D1F] text-[#E87D1F] bg-[#E87D1F]/5'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}"
        >
          Unassigned
          <span
            class="px-2 py-0.5 rounded-full text-[10px] font-bold
                       {activeTab === 'unassigned'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-gray-100 text-gray-500'}"
          >
            {activeTab === "unassigned"
              ? unassigned.length
              : tickets.filter((t) => normalizeStatus(t.status) === "open")
                  .length}
          </span>
        </button>
      </div>

      <button
        onclick={openCreate}
        class="flex items-center gap-1.5 px-4 py-2 bg-[#E87D1F] hover:bg-[#E87D1F]/90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-colors"
      >
        <Icons.Plus size={14} strokeWidth={2.5} />
        Log Ticket Manually
      </button>
    </div>

    <div class="border-t border-gray-100 mt-0 px-6 py-4">
      <!-- ── All Tickets Tab ─────────────────────────────────────────────── -->
      {#if activeTab === "all"}
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-gray-100">
                {#each ["TICKET", "PROJECT", "CATEGORY", "ISSUE", "STATUS", "PRIORITY", "ESCALATION", "DATE", "ACTIONS"] as col}
                  <th
                    class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap"
                    >{col}</th
                  >
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
                      <div
                        class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"
                      ></div>
                      Loading…
                    </div>
                  </td>
                </tr>
              {:else if tickets.length === 0}
                <tr>
                  <td colspan="9" class="py-16 text-center">
                    <div class="flex flex-col items-center gap-2">
                      <div
                        class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center"
                      >
                        <Icons.Ticket size={22} stroke="#9ca3af" />
                      </div>
                      <p class="text-[13px] text-gray-400">No tickets found</p>
                    </div>
                  </td>
                </tr>
              {:else}
                {#each pagedTickets as t}
                  <tr
                    class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors cursor-pointer
                             {normalizeStatus(t.status) === 'pending_validation'
                      ? 'bg-purple-50/30'
                      : ''}
                             {normalizeStatus(t.status) === 'open'
                      ? 'bg-orange-50/20'
                      : ''}"
                    onclick={() => openDetail(t)}
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
                    <td class="py-3 px-3 text-[13px] text-gray-600"
                      >{categoryName((t as any).categoryId)}</td
                    >
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
                      <span
                        class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(
                          t.status,
                        )}"
                      >
                        {displayStatus(t.status)}
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
                          {t.escalationLevel}
                        </span>
                      {:else}
                        <span class="text-[12px] text-gray-300">—</span>
                      {/if}
                    </td>
                    <td
                      class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap"
                      >{fmtDate(t.createdAt)}</td
                    >
                    <td class="py-3 px-3" onclick={(e) => e.stopPropagation()}>
                      {#if canAct(t)}
                        <div class="flex gap-1.5 flex-wrap">
                          {#if canValidateResolution(t)}
                            <button
                              onclick={() => handleValidateResolution(t)}
                              disabled={validatingTicketId === t.id ||
                                loadingClosureEligibility[t.id] ||
                                closureBlocked(t.id)}
                              class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <Icons.CheckCircle size={12} />
                              {validatingTicketId === t.id
                                ? "Validating…"
                                : "Validate"}
                            </button>
                          {/if}
                        </div>
                        {#if loadingClosureEligibility[t.id]}
                          <p class="mt-1 text-[11px] text-gray-400">
                            Checking closure eligibility…
                          </p>
                        {:else if closureBlocked(t.id)}
                          <p
                            class="mt-1 max-w-[260px] text-[11px] text-red-600"
                          >
                            {closureReasons(t.id).join(" • ")}
                          </p>
                        {/if}
                      {:else}
                        <span class="text-[12px] text-gray-400"
                          >{displayStatus(t.status)}</span
                        >
                      {/if}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPageAll}
          totalPages={totalPagesAll}
          totalItems={tickets.length}
          pageSize={PAGE_SIZE}
          itemLabel="tickets"
          {loading}
          onchange={(p) => (currentPageAll = p)}
        />

        <!-- ── Unassigned Tab ──────────────────────────────────────────────── -->
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-gray-100">
                {#each ["TICKET", "PROJECT", "CATEGORY", "PRIORITY", "RAISED AT", "SLA DEADLINE", "ACTIONS"] as col}
                  <th
                    class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap"
                    >{col}</th
                  >
                {/each}
              </tr>
            </thead>
            <tbody>
              {#if loading}
                <tr>
                  <td
                    colspan="7"
                    class="py-12 text-center text-[13px] text-gray-400"
                  >
                    <div class="flex items-center justify-center gap-2">
                      <div
                        class="w-4 h-4 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin"
                      ></div>
                      Loading unassigned tickets…
                    </div>
                  </td>
                </tr>
              {:else if unassigned.length === 0}
                <tr>
                  <td colspan="7" class="py-16 text-center">
                    <div class="flex flex-col items-center gap-2">
                      <div
                        class="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center"
                      >
                        <Icons.CheckCircle size={22} stroke="#16a34a" />
                      </div>
                      <p class="text-[13px] text-gray-400">
                        All tickets are assigned
                      </p>
                    </div>
                  </td>
                </tr>
              {:else}
                {#each pagedUnassigned as t}
                  {@const tAny = t as any}
                  <tr
                    class="border-b border-orange-50 hover:bg-orange-50/40 transition-colors bg-orange-50/20 cursor-pointer"
                    onclick={() => openDetail(t)}
                  >
                    <td class="py-3 px-3">
                      <p
                        class="text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap"
                      >
                        {t.ticketNumber || t.id.slice(0, 8)}
                      </p>
                      <p class="text-[11px] text-gray-400 max-w-40 truncate">
                        {t.title}
                      </p>
                    </td>
                    <td
                      class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap"
                      >{projectName(t.projectId)}</td
                    >
                    <td class="py-3 px-3 text-[13px] text-gray-600"
                      >{categoryName(tAny.categoryId)}</td
                    >
                    <td class="py-3 px-3">
                      <span
                        class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(
                          t.priority,
                        )}"
                      >
                        {t.priority || "—"}
                      </span>
                    </td>
                    <td
                      class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap"
                      >{fmtDate(t.createdAt)}</td
                    >
                    <td class="py-3 px-3">
                      {#if tAny.slaDeadline}
                        {@const overdue =
                          new Date(tAny.slaDeadline) < new Date()}
                        <span
                          class="text-[12px] font-semibold whitespace-nowrap {overdue
                            ? 'text-red-600'
                            : 'text-gray-600'}"
                        >
                          {fmtDate(tAny.slaDeadline)}
                          {#if overdue}<span
                              class="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full"
                              >Overdue</span
                            >{/if}
                        </span>
                      {:else}
                        <span class="text-[12px] text-gray-400">—</span>
                      {/if}
                    </td>
                    <td class="py-3 px-3" onclick={(e) => e.stopPropagation()}>
                      <button
                        onclick={() => openAssign(t)}
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          ><path
                            d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                          /><circle cx="12" cy="7" r="4" /></svg
                        >
                        Assign Now
                      </button>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPageUnassigned}
          totalPages={totalPagesUnassigned}
          totalItems={unassigned.length}
          pageSize={PAGE_SIZE}
          itemLabel="tickets"
          loading={loading}
          onchange={(p) => (currentPageUnassigned = p)}
        />
      {/if}
    </div>
  </div>
</div>

<!-- ── Ticket Detail Sidebar ───────────────────────────────────────────────── -->
{#if detailTicket}
  {@const dt = detailTicket as any}
  <div class="fixed inset-0 z-50 flex justify-end">
    <button
      type="button"
      class="absolute inset-0 bg-black/40 cursor-default"
      aria-label="Close modal"
      onclick={() => (detailTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white w-full sm:w-[420px] h-full shadow-2xl flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Ticket Details"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {detailTicket.ticketNumber || detailTicket.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A] max-w-72 leading-snug">
            {detailTicket.title}
          </h2>
        </div>
        <button
          onclick={() => (detailTicket = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0 mt-0.5"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            ><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

        <!-- Status / Priority / Escalation -->
        <div class="flex flex-wrap gap-2">
          <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(detailTicket.status)}">
            {displayStatus(detailTicket.status)}
          </span>
          {#if detailTicket.priority}
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(detailTicket.priority)}">
              {detailTicket.priority}
            </span>
          {/if}
          {#if detailTicket.escalationLevel}
            <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {detailTicket.escalationLevel === 'L3' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}">
              {detailTicket.escalationLevel}
            </span>
          {/if}
        </div>

        <!-- Description -->
        {#if detailTicket.description}
          <div>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</p>
            <p class="text-[13px] text-gray-700 leading-relaxed">{detailTicket.description}</p>
          </div>
        {/if}

        <!-- Ticket Info -->
        <div class="rounded-xl border border-gray-100 divide-y divide-gray-100">
          <div class="flex justify-between items-center px-4 py-3">
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Project</span>
            <span class="text-[13px] text-gray-700">{projectName(detailTicket.projectId)}</span>
          </div>
          <div class="flex justify-between items-center px-4 py-3">
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Category</span>
            <span class="text-[13px] text-gray-700">{categoryName(detailTicket.categoryId)}</span>
          </div>
          <div class="flex justify-between items-center px-4 py-3">
            <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Raised At</span>
            <span class="text-[13px] text-gray-700">{fmtDate(detailTicket.createdAt)}</span>
          </div>
          {#if dt.slaDeadline}
            {@const overdue = new Date(dt.slaDeadline) < new Date()}
            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">SLA Deadline</span>
              <span class="text-[13px] font-semibold {overdue ? 'text-red-600' : 'text-gray-700'}">
                {fmtDate(dt.slaDeadline)}
                {#if overdue}<span class="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Overdue</span>{/if}
              </span>
            </div>
          {/if}
          {#if dt.payoutAmount}
            <div class="flex justify-between items-center px-4 py-3">
              <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Payout</span>
              <span class="text-[13px] text-gray-700">₹{dt.payoutAmount}</span>
            </div>
          {/if}
        </div>

        <!-- Location -->
        {#if detailTicket.state || detailTicket.city || detailTicket.address}
          <div>
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Location</p>
            <div class="rounded-xl border border-gray-100 divide-y divide-gray-100">
              {#if detailTicket.state}
                <div class="flex justify-between items-center px-4 py-3">
                  <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">State</span>
                  <span class="text-[13px] text-gray-700">{detailTicket.state}</span>
                </div>
              {/if}
              {#if detailTicket.city}
                <div class="flex justify-between items-center px-4 py-3">
                  <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">City</span>
                  <span class="text-[13px] text-gray-700">{detailTicket.city}</span>
                </div>
              {/if}
              {#if detailTicket.pincode}
                <div class="flex justify-between items-center px-4 py-3">
                  <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Pincode</span>
                  <span class="text-[13px] text-gray-700">{detailTicket.pincode}</span>
                </div>
              {/if}
              {#if detailTicket.address}
                <div class="px-4 py-3">
                  <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide block mb-1">Address</span>
                  <span class="text-[13px] text-gray-700 leading-relaxed">{detailTicket.address}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Assignees -->
        <div>
          <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Assignees</p>
          {#if loadingDetailUsers}
            <div class="flex items-center gap-2 text-[13px] text-gray-400 py-2">
              <div class="w-3.5 h-3.5 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin"></div>
              Loading…
            </div>
          {:else if !detailEngineer && !detailPlanner}
            <p class="text-[13px] text-gray-400">Not yet assigned</p>
          {:else}
            <div class="rounded-xl border border-gray-100 divide-y divide-gray-100">
              {#if detailEngineer}
                <div class="px-4 py-3">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Site Engineer</p>
                  <p class="text-[13px] font-medium text-gray-800">{detailEngineer.name}</p>
                  {#if detailEngineer.email}<p class="text-[11px] text-gray-400">{detailEngineer.email}</p>{/if}
                </div>
              {/if}
              {#if detailPlanner}
                <div class="px-4 py-3">
                  <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">State Planner</p>
                  <p class="text-[13px] font-medium text-gray-800">{detailPlanner.name}</p>
                  {#if detailPlanner.email}<p class="text-[11px] text-gray-400">{detailPlanner.email}</p>{/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>

      </div>
    </div>
  </div>
{/if}

<!-- ── Assignment Panel ────────────────────────────────────────────────────── -->
{#if assignTarget}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-end p-0 sm:p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (assignTarget = null)}
    ></button>
    <div
      class="relative z-10 bg-white w-full sm:w-105 sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[calc(100vh-4rem)]"
      role="dialog"
      aria-modal="true"
      aria-label="Assign Ticket"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0"
      >
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {assignTarget.ticketNumber || assignTarget.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">
            Assign Ticket
          </h2>
          <p class="text-[12px] text-gray-400 mt-0.5 max-w-70 truncate">
            {assignTarget.title}
          </p>
        </div>
        <button
          onclick={() => (assignTarget = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
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
            ><line x1="18" y1="6" x2="6" y2="18" /><line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            /></svg
          >
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
        <!-- Current assignees (if any) -->
        {#if (assignTarget as any).engineerName || (assignTarget as any).statePlannerName}
          <div class="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
            <p class="text-[11px] font-semibold text-blue-700 mb-2">
              Current Assignees
            </p>
            <div class="flex flex-col gap-1">
              {#if (assignTarget as any).engineerName}
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-semibold text-blue-500 uppercase tracking-wide w-20 shrink-0"
                    >Engineer</span
                  >
                  <span class="text-[13px] text-blue-800 font-medium"
                    >{(assignTarget as any).engineerName}</span
                  >
                </div>
              {/if}
              {#if (assignTarget as any).statePlannerName}
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-semibold text-blue-500 uppercase tracking-wide w-20 shrink-0"
                    >Planner</span
                  >
                  <span class="text-[13px] text-blue-800 font-medium"
                    >{(assignTarget as any).statePlannerName}</span
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if loadingAssignees}
          <div
            class="flex items-center justify-center gap-2 py-6 text-[13px] text-gray-400"
          >
            <div
              class="w-4 h-4 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin"
            ></div>
            Loading available users…
          </div>
        {:else}
          <!-- State Planner -->
          <label class={labelClass}>
            <span class={labelTextClass}>State Planner</span>
            {#if assignPlanners.length === 0}
              <div
                class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
              >
                No state planners available for this region
              </div>
            {:else}
              <select class={fieldClass} bind:value={assignForm.statePlannerId}>
                <option value="">— None —</option>
                {#each assignPlanners as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            {/if}
          </label>

          <!-- Site Engineer -->
          <label class={labelClass}>
            <span class={labelTextClass}>Site Engineer</span>
            {#if assignEngineers.length === 0}
              <div
                class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
              >
                No engineers available for this region
              </div>
            {:else}
              <select class={fieldClass} bind:value={assignForm.engineerId}>
                <option value="">— None —</option>
                {#each assignEngineers as e}
                  <option value={e.id}>{e.name}</option>
                {/each}
              </select>
            {/if}
          </label>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex justify-end gap-3 px-6 pb-5 pt-4 border-t border-gray-100 shrink-0"
      >
        <button
          onclick={() => (assignTarget = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onclick={submitAssign}
          disabled={assigning || loadingAssignees}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
        >
          {assigning ? "Assigning…" : "Assign Ticket"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Escalation Modal ────────────────────────────────────────────────────── -->
{#if escalateTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (escalateTarget = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100vh-4rem)]"
      role="dialog"
      aria-modal="true"
      aria-label="Escalate Ticket"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0"
      >
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {escalateTarget.ticketNumber || escalateTarget.id.slice(0, 8)}
          </p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">
            Escalate Ticket
          </h2>
          <p class="text-[12px] text-gray-400 mt-0.5 max-w-70 truncate">
            {escalateTarget.title}
          </p>
        </div>
        <button
          onclick={() => (escalateTarget = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
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
            ><line x1="18" y1="6" x2="6" y2="18" /><line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            /></svg
          >
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
        <!-- Level -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Escalation Level <span class="text-red-400">*</span></span
          >
          <select class={fieldClass} bind:value={escalateForm.level}>
            <option value="L2">L2 — Second Level Support</option>
            <option value="L3">L3 — Third Level / Engineering</option>
            <option value="Vendor">Vendor Escalation</option>
          </select>
        </label>

        <!-- Assigned Engineer (filtered by level) -->
        <label class={labelClass}>
          <span class={labelTextClass}>Assign to Engineer</span>
          {#if loadingEscalateUsers}
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
            >
              Loading engineers…
            </div>
          {:else if filteredEscalateUsers.length === 0 && escalateForm.level !== "Vendor"}
            <div
              class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700"
            >
              No {escalateForm.level} engineers available
            </div>
          {:else}
            <select class={fieldClass} bind:value={escalateForm.engineerId}>
              <option value="">— None / Auto-assign —</option>
              {#each filteredEscalateUsers as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          {/if}
        </label>

        <!-- Reason -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Reason <span class="text-red-400">*</span></span
          >
          <textarea
            rows="4"
            placeholder="Describe why this ticket needs escalation…"
            class="{fieldClass} resize-none {escalateErrors.reason
              ? 'border-red-300'
              : ''}"
            bind:value={escalateForm.reason}
          ></textarea>
          {#if escalateErrors.reason}<span class={errorClass}
              >{escalateErrors.reason}</span
            >{/if}
        </label>

        <!-- Warning banner -->
        <div
          class="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100"
        >
          <svg
            class="shrink-0 mt-0.5"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e11d48"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path
              d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            /><line x1="12" y1="9" x2="12" y2="13" /><line
              x1="12"
              y1="17"
              x2="12.01"
              y2="17"
            /></svg
          >
          <p class="text-[12px] text-rose-700 leading-relaxed">
            Escalating to <strong>{escalateForm.level}</strong> will notify the assigned
            team and flag this ticket as a priority item.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex justify-end gap-3 px-6 pb-5 pt-4 border-t border-gray-100 shrink-0"
      >
        <button
          onclick={() => (escalateTarget = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onclick={submitEscalate}
          disabled={escalating}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
        >
          {escalating ? "Escalating…" : `Escalate to ${escalateForm.level}`}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Action Modal (Approve & Close / Close Ticket) ──────────────────────── -->
{#if actionTicket}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (actionTicket = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[calc(100vh-4rem)]"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={actionType === "approve"
        ? "Approve & Close Ticket"
        : "Close Ticket"}
    >
      <div
        class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0"
      >
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">
            {actionTicket.ticketNumber || actionTicket.id.slice(0, 8)}
          </p>
          <h2
            class="text-[15px] font-semibold text-[#0B182A] leading-tight max-w-70"
          >
            {actionType === "approve"
              ? "Approve & Close Ticket"
              : "Close Ticket"}
          </h2>
          <p class="text-[12px] text-gray-400 mt-0.5">
            {actionType === "approve"
              ? "Confirm the work is validated and close this ticket"
              : "Mark this ticket as closed"}
          </p>
        </div>
        <button
          onclick={() => (actionTicket = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
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

      <div class="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
        {#if ["resolved", "pending_validation"].includes(normalizeStatus(actionTicket.status))}
          <RcaSection
            ticketId={actionTicket.id}
            ticketStatus={actionTicket.status}
            role={user?.role ?? ""}
            onRcaSaved={() => {
              checklistRefreshKey++;
            }}
          />
          <div class="border-t border-gray-100"></div>
        {/if}

        <ClosureChecklist
          ticketId={actionTicket.id}
          refreshKey={checklistRefreshKey}
          onLoaded={(value) => {
            actionEligibility = value;
          }}
        />

        {#if actionType === "approve"}
          <div
            class="flex items-start gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-100"
          >
            <Icons.CheckCircle size={16} stroke="#16a34a" />
            <p class="text-[12px] text-green-700 leading-relaxed">
              This will mark the ticket as <strong>Closed</strong> and log a validation
              approval in the history.
            </p>
          </div>
        {:else}
          <div
            class="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200"
          >
            <Icons.XSquare size={16} stroke="#6b7280" />
            <p class="text-[12px] text-gray-600 leading-relaxed">
              Closing this ticket will set its status to <strong>Closed</strong
              >. This action can only be undone by an admin.
            </p>
          </div>
        {/if}

        <label class="flex flex-col gap-1.5">
          <span
            class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
            >Remarks (optional)</span
          >
          <textarea
            bind:value={actionRemarks}
            placeholder="Add a note about this decision…"
            rows="3"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>
      </div>

      <div
        class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4 shrink-0"
      >
        <button
          onclick={() => (actionTicket = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        {#if actionEligibility?.eligible}
          <button
            onclick={saveAction}
            disabled={actioning}
            class="px-5 py-2.5 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer
                   {actionType === 'approve'
              ? 'bg-green-600'
              : 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)]'}"
          >
            {actioning
              ? "Saving…"
              : actionType === "approve"
                ? "Approve & Close"
                : "Close Ticket"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ── Log Ticket Manually Modal ───────────────────────────────────────────── -->
{#if showCreate}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (showCreate = false)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Log Ticket Manually"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">
            Log Ticket Manually
          </h2>
          <p class="text-[12px] text-gray-400 mt-0.5">
            Raise a ticket on behalf of a customer · source: NOC
          </p>
        </div>
        <button
          onclick={() => (showCreate = false)}
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
        onsubmit={handleCreate}
        novalidate
      >
        <!-- Customer -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Customer <span class="text-red-400">*</span></span
          >
          <select class={fieldClass} bind:value={form.customerId}>
            <option value="">— Select Customer —</option>
            {#each customers as c}
              <option value={c.id}>{c.companyName}</option>
            {/each}
          </select>
          {#if formErrors.customerId}<span class={errorClass}
              >{formErrors.customerId}</span
            >{/if}
        </label>

        <!-- Project -->
        <label class={labelClass}>
          <span class={labelTextClass}
            >Project <span class="text-red-400">*</span></span
          >
          {#if !form.customerId}
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50"
            >
              Select a customer first
            </div>
          {:else if formProjects.length === 0}
            <div
              class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700"
            >
              No projects found for this customer
            </div>
          {:else if formProjects.length === 1}
            <div
              class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-gray-50"
            >
              {formProjects[0].name}
            </div>
          {:else}
            <select class={fieldClass} bind:value={form.projectId}>
              {#each formProjects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          {/if}
          {#if formErrors.projectId}<span class={errorClass}
              >{formErrors.projectId}</span
            >{/if}
        </label>

        <!-- Call Type -->
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
          {#if formErrors.categoryId}<span class={errorClass}
              >{formErrors.categoryId}</span
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
            class="{fieldClass} {formErrors.title ? 'border-red-300' : ''}"
            bind:value={form.title}
          />
          {#if formErrors.title}<span class={errorClass}
              >{formErrors.title}</span
            >{/if}
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
            <option value="Critical">Critical</option>
          </select>
        </label>

        <!-- Location -->
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
            onclick={() => (showCreate = false)}
            class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || categories.length === 0}
            class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[#E87D1F] hover:bg-[#d06a10] rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? "Creating…" : "Log Ticket"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

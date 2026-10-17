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
  let refreshing = $state(false);

  // Tabs
  let activeTab = $state<"all" | "unassigned">("all");
  let searchQuery = $state("");
  let statusFilter = $state<
    "all" | "attention" | "active" | "validation" | "closed"
  >("all");
  let priorityFilter = $state<"all" | "Critical" | "High" | "Medium" | "Low">(
    "all",
  );

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

  async function refreshTickets() {
    refreshing = true;
    try {
      await loadTickets();
      toast.success("Ticket queue refreshed");
    } catch {
      toast.error("Failed to refresh tickets");
    } finally {
      refreshing = false;
    }
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
    statusFilter = "all";
  }

  // ── Assignment panel ──────────────────────────────────────────────────────

  function assignmentChanged(): boolean {
    if (!assignTarget) return false;
    return (
      assignForm.engineerId !== (assignTarget.assignedEngineerId ?? "") ||
      assignForm.statePlannerId !== (assignTarget.statePlannerId ?? "")
    );
  }

  function assigneeName(users: User[], id: string | null | undefined, fallback: string): string {
    if (!id) return fallback;
    return users.find((candidate) => candidate.id === id)?.name ?? fallback;
  }

  async function openAssign(t: Ticket) {
    const tAny = t as any;
    assignTarget = t;
    assignForm = {
      engineerId: tAny.assignedEngineerId ?? "",
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

    const currentEngineerId = assignTarget.assignedEngineerId ?? "";
    const currentPlannerId = assignTarget.statePlannerId ?? "";
    if (
      assignForm.engineerId === currentEngineerId &&
      assignForm.statePlannerId === currentPlannerId
    ) {
      toast.info("Select a different assignee to update this ticket");
      return;
    }

    const isReassignment = Boolean(currentEngineerId && assignForm.engineerId !== currentEngineerId);
    assigning = true;
    try {
      const updated = await assignTicket(assignTarget.id, {
        engineerId: assignForm.engineerId || undefined,
        statePlannerId: assignForm.statePlannerId || undefined,
      });
      tickets = tickets.map((t) =>
        t.id === updated.id ? { ...t, ...updated } : t,
      );
      toast.success(isReassignment ? "Engineer reassigned successfully" : "Ticket assignment updated");
      assignTarget = null;
      invalidate("tickets");
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
      on_hold: "On Hold",
      pending_replacement: "Pending Replacement",
      pending_validation: "Pending Validation",
      resolved: "Resolved",
      closed: "Closed",
      reopened: "Reopened",
      escalated_l2: "Escalated L2",
      escalated_l3: "Escalated L3",
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
      on_hold: "bg-yellow-50 text-yellow-700",
      pending_replacement: "bg-fuchsia-50 text-fuchsia-700",
      pending_validation: "bg-purple-50 text-purple-700",
      resolved: "bg-green-50 text-green-600",
      closed: "bg-gray-100 text-gray-500",
      reopened: "bg-cyan-50 text-cyan-700",
      escalated_l2: "bg-orange-50 text-orange-700",
      escalated_l3: "bg-red-50 text-red-700",
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

  function priorityLabel(priority: string): "Critical" | "High" | "Medium" | "Low" {
    const normalized = priority?.toLowerCase();
    if (normalized === "critical") return "Critical";
    if (normalized === "high") return "High";
    if (normalized === "medium") return "Medium";
    return "Low";
  }

  function priorityAccent(priority: string): string {
    const normalized = priority?.toLowerCase();
    if (normalized === "critical") return "bg-red-700";
    if (normalized === "high") return "bg-red-500";
    if (normalized === "medium") return "bg-amber-400";
    return "bg-emerald-500";
  }

  function ticketLocation(ticket: Ticket): string {
    return [ticket.city, ticket.state].filter(Boolean).join(", ") || "Location not provided";
  }

  function slaInfo(ticket: Ticket): { label: string; classes: string } {
    const status = normalizeStatus(ticket.status);
    if (["closed", "resolved", "pending_validation"].includes(status)) {
      return {
        label: status === "closed" ? "Completed" : "Work complete",
        classes: "bg-emerald-50 text-emerald-700",
      };
    }
    if (!ticket.slaDeadline) {
      return { label: "No SLA deadline", classes: "bg-gray-100 text-gray-500" };
    }

    const difference = new Date(ticket.slaDeadline).getTime() - Date.now();
    const hours = Math.max(1, Math.ceil(Math.abs(difference) / 3_600_000));
    const duration = hours >= 24 ? `${Math.ceil(hours / 24)}d` : `${hours}h`;
    if (difference < 0) {
      return { label: `${duration} overdue`, classes: "bg-red-50 text-red-700" };
    }
    if (hours <= 24) {
      return { label: `${hours}h remaining`, classes: "bg-orange-50 text-orange-700" };
    }
    return { label: `${Math.ceil(hours / 24)}d remaining`, classes: "bg-gray-100 text-gray-600" };
  }

  function canAct(t: Ticket) {
    return !["closed", "cancelled", "rejected"].includes(
      normalizeStatus(t.status),
    );
  }

  function canAssign(t: Ticket) {
    return ["open", "assigned", "in_progress"].includes(normalizeStatus(t.status));
  }

  function canEscalate(t: Ticket) {
    return !["closed", "cancelled", "rejected", "resolved", "pending_validation"].includes(
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

  // ── Queue filters and pagination ───────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);

  const unassigned = $derived(
    tickets.filter(
      (ticket) =>
        normalizeStatus(ticket.status) === "open" && !ticket.assignedEngineerId,
    ),
  );

  const filteredTickets = $derived.by(() => {
    const source = activeTab === "unassigned" ? unassigned : tickets;
    const query = searchQuery.trim().toLowerCase();
    const statusGroups: Record<typeof statusFilter, string[]> = {
      all: [],
      attention: ["open", "reopened", "escalated_l2", "escalated_l3"],
      active: ["assigned", "accepted", "in_progress", "on_hold", "pending_replacement"],
      validation: ["resolved", "pending_validation"],
      closed: ["closed", "cancelled", "rejected"],
    };

    return source
      .filter((ticket) => {
        const normalizedStatus = normalizeStatus(ticket.status);
        const matchesStatus =
          statusFilter === "all" || statusGroups[statusFilter].includes(normalizedStatus);
        const matchesPriority =
          priorityFilter === "all" || priorityLabel(ticket.priority) === priorityFilter;
        const matchesQuery =
          !query ||
          [
            ticket.ticketNumber,
            ticket.title,
            ticket.description,
            projectName(ticket.projectId),
            categoryName(ticket.categoryId),
            ticketLocation(ticket),
          ].some((value) => value?.toLowerCase().includes(query));
        return matchesStatus && matchesPriority && matchesQuery;
      })
      .sort((left, right) => {
        const workflowRank = (ticket: Ticket) => {
          const status = normalizeStatus(ticket.status);
          if (["open", "reopened", "escalated_l2", "escalated_l3"].includes(status)) return 0;
          if (status === "resolved" || status === "pending_validation") return 1;
          if (["assigned", "accepted", "in_progress", "on_hold"].includes(status)) return 2;
          return 3;
        };
        const workflowDifference = workflowRank(left) - workflowRank(right);
        if (workflowDifference !== 0) return workflowDifference;
        const priorityRank: Record<string, number> = {
          Critical: 0,
          High: 1,
          Medium: 2,
          Low: 3,
        };
        const priorityDifference =
          (priorityRank[priorityLabel(left.priority)] ?? 4) -
          (priorityRank[priorityLabel(right.priority)] ?? 4);
        if (priorityDifference !== 0) return priorityDifference;
        return (
          new Date(left.slaDeadline || left.createdAt).getTime() -
          new Date(right.slaDeadline || right.createdAt).getTime()
        );
      });
  });

  const pagedTickets = $derived(
    filteredTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
  );
  const totalPages = $derived(
    Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE)),
  );

  $effect(() => {
    activeTab;
    searchQuery;
    statusFilter;
    priorityFilter;
    currentPage = 1;
  });
</script>

<svelte:head><title>Tickets · NOC · Innoserve Techsol</title></svelte:head>


<div class="flex flex-col gap-5">
  <!-- NOC queue heading -->
  <section class="relative overflow-hidden rounded-2xl bg-[#0B182A] px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
    <div class="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#E87D1F]/15 blur-2xl"></div>
    <div class="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          <span class="h-2 w-2 rounded-full bg-[#E87D1F]"></span>
          Network operations control
        </div>
        <h1 class="text-[24px] font-bold tracking-tight sm:text-[28px]">Ticket command centre</h1>
        <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-white/60 sm:text-[14px]">
          Route incoming work, monitor SLA exposure, and validate completed field activity.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={refreshTickets}
          disabled={refreshing}
          class="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-60"
        >
          <svg class={refreshing ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          onclick={openCreate}
          class="inline-flex h-10 items-center gap-2 rounded-lg bg-[#E87D1F] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-orange-600"
        >
          <Icons.Plus size={14} strokeWidth={2.5} />
          Log ticket
        </button>
      </div>
    </div>
  </section>

  <!-- Operational summary -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {#each [
      {
        label: "Needs assignment",
        value: unassigned.length,
        color: "text-[#E87D1F]",
        bar: "bg-[#E87D1F]",
        tab: "unassigned" as const,
        filter: "all" as const,
      },
      {
        label: "Active work",
        value: tickets.filter((ticket) => ["assigned", "accepted", "in_progress", "on_hold", "pending_replacement"].includes(normalizeStatus(ticket.status))).length,
        color: "text-amber-700",
        bar: "bg-amber-500",
        tab: "all" as const,
        filter: "active" as const,
      },
      {
        label: "Awaiting review",
        value: tickets.filter((ticket) => ["resolved", "pending_validation"].includes(normalizeStatus(ticket.status))).length,
        color: "text-purple-700",
        bar: "bg-purple-500",
        tab: "all" as const,
        filter: "validation" as const,
      },
      {
        label: "Closed",
        value: tickets.filter((ticket) => normalizeStatus(ticket.status) === "closed").length,
        color: "text-emerald-700",
        bar: "bg-emerald-500",
        tab: "all" as const,
        filter: "closed" as const,
      },
    ] as stat}
      <button
        type="button"
        onclick={() => {
          activeTab = stat.tab;
          statusFilter = stat.filter;
        }}
        class="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md"
      >
        <span class="absolute inset-y-0 left-0 w-1 {stat.bar}"></span>
        <p class="pl-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{stat.label}</p>
        <div class="mt-1 flex items-end justify-between pl-1">
          <p class="text-[26px] font-bold leading-none {stat.color}">{loading ? "—" : stat.value}</p>
          <span class="text-[10px] font-medium text-gray-300 transition-colors group-hover:text-gray-500">View queue</span>
        </div>
      </button>
    {/each}
  </div>

  <!-- Queue workspace -->
  <section class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
    <div class="flex flex-col gap-4 border-b border-gray-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="inline-flex w-fit max-w-full gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onclick={() => switchTab("all")}
          class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-colors sm:px-4
            {activeTab === "all" ? "bg-white text-[#0B182A] shadow-sm" : "text-gray-500 hover:text-[#0B182A]"}"
        >
          All tickets
          <span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === "all" ? "bg-gray-100 text-gray-600" : "bg-gray-200 text-gray-500"}">
            {loading ? "…" : tickets.length}
          </span>
        </button>
        <button
          type="button"
          onclick={() => switchTab("unassigned")}
          class="flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-colors sm:px-4
            {activeTab === "unassigned" ? "bg-white text-[#0B182A] shadow-sm" : "text-gray-500 hover:text-[#0B182A]"}"
        >
          Needs assignment
          <span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === "unassigned" ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-500"}">
            {loading ? "…" : unassigned.length}
          </span>
        </button>
      </div>
      <p class="text-[11px] font-medium text-gray-400">
        {#if filteredTickets.length === (activeTab === "unassigned" ? unassigned.length : tickets.length)}
          {filteredTickets.length} ticket{filteredTickets.length === 1 ? "" : "s"} in this queue
        {:else}
          {filteredTickets.length} matching tickets
        {/if}
      </p>
    </div>

    <div class="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div class="relative min-w-0 flex-1 xl:max-w-md">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
          <Icons.Search size={15} />
        </span>
        <input
          bind:value={searchQuery}
          type="search"
          placeholder="Search ticket, project, category, or location"
          aria-label="Search tickets"
          class="h-10 w-full rounded-lg border border-gray-200 bg-gray-50/70 pl-9 pr-3 text-[13px] text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-[#0B182A] focus:bg-white"
        />
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <select bind:value={statusFilter} aria-label="Filter by workflow stage" class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 outline-none focus:border-[#0B182A]">
          <option value="all">All workflow stages</option>
          <option value="attention">Needs attention</option>
          <option value="active">Active work</option>
          <option value="validation">Awaiting review</option>
          <option value="closed">Closed</option>
        </select>
        <select bind:value={priorityFilter} aria-label="Filter by priority" class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 outline-none focus:border-[#0B182A]">
          <option value="all">All priorities</option>
          <option value="Critical">Critical priority</option>
          <option value="High">High priority</option>
          <option value="Medium">Medium priority</option>
          <option value="Low">Low priority</option>
        </select>
        {#if searchQuery || statusFilter !== "all" || priorityFilter !== "all"}
          <button
            type="button"
            onclick={() => {
              searchQuery = "";
              statusFilter = "all";
              priorityFilter = "all";
            }}
            class="h-10 rounded-lg px-3 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#0B182A]"
          >
            Clear filters
          </button>
        {/if}
      </div>
    </div>

    <div class="mt-5 flex items-start justify-between">
      <div>
        <h2 class="text-[15px] font-bold text-[#0B182A]">
          {activeTab === "unassigned" ? "Unassigned dispatch queue" : "Operations queue"}
        </h2>
        <p class="mt-0.5 text-[11px] text-gray-400">Sorted by workflow priority, urgency, and SLA deadline.</p>
      </div>
      <span class="hidden rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 sm:block">Highest priority first</span>
    </div>

    <!-- Responsive ticket cards -->
    <div class="mt-3 flex flex-col gap-3">
      {#if loading}
        {#each Array(4) as _}
          <div class="animate-pulse rounded-xl border border-gray-100 p-5">
            <div class="mb-3 h-3 w-24 rounded bg-gray-100"></div>
            <div class="mb-2 h-4 w-2/3 rounded bg-gray-100"></div>
            <div class="h-3 w-1/2 rounded bg-gray-100"></div>
          </div>
        {/each}
      {:else if filteredTickets.length === 0}
        <div class="flex flex-col items-center px-4 py-14 text-center">
          <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
            {#if activeTab === "unassigned" && !searchQuery}
              <Icons.CheckCircle size={21} />
            {:else}
              <Icons.Search size={21} />
            {/if}
          </div>
          <p class="text-[14px] font-semibold text-[#0B182A]">
            {activeTab === "unassigned" && unassigned.length === 0 ? "Everything is assigned" : "No matching tickets"}
          </p>
          <p class="mt-1 max-w-sm text-[12px] leading-relaxed text-gray-400">
            {activeTab === "unassigned" && unassigned.length === 0
              ? "New unassigned requests will appear here for dispatch."
              : "Try clearing a filter or searching with a different term."}
          </p>
        </div>
      {:else}
        {#each pagedTickets as ticket}
          {@const normalizedStatus = normalizeStatus(ticket.status)}
          <article class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-md">
            <span class="absolute inset-y-0 left-0 w-1 {priorityAccent(ticket.priority)}"></span>
            <div class="p-4 pl-5 sm:p-5 sm:pl-6">
              <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <button type="button" onclick={() => openDetail(ticket)} class="min-w-0 flex-1 text-left">
                  <div class="mb-2 flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-bold tracking-[0.05em] text-[#E87D1F]">{ticket.ticketNumber || ticket.id.slice(0, 8)}</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {statusBadge(ticket.status)}">{displayStatus(ticket.status)}</span>
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {priorityBadge(ticket.priority)}">{priorityLabel(ticket.priority)}</span>
                    {#if ticket.escalationLevel}
                      <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {ticket.escalationLevel === "L3" ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"}">
                        {ticket.escalationLevel} support
                      </span>
                    {/if}
                  </div>
                  <h3 class="truncate text-[15px] font-bold text-[#0B182A] transition-colors group-hover:text-[#18375f] sm:text-[16px]">{ticket.title}</h3>
                  {#if ticket.description}
                    <p class="mt-1 line-clamp-1 text-[12px] leading-relaxed text-gray-500">{ticket.description}</p>
                  {/if}
                  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
                    <span class="inline-flex min-w-0 items-center gap-1.5">
                      <Icons.Folder size={13} stroke="#9ca3af" />
                      <span class="max-w-45 truncate">{projectName(ticket.projectId)}</span>
                    </span>
                    <span class="inline-flex min-w-0 items-center gap-1.5">
                      <Icons.Ticket size={13} stroke="#9ca3af" />
                      <span class="max-w-40 truncate">{categoryName(ticket.categoryId)}</span>
                    </span>
                    <span class="inline-flex min-w-0 items-center gap-1.5">
                      <Icons.MapPin size={13} stroke="#9ca3af" />
                      <span class="max-w-48 truncate">{ticketLocation(ticket)}</span>
                    </span>
                    <span class="inline-flex items-center gap-1.5">
                      <Icons.Clock size={13} stroke="#9ca3af" />
                      Raised {fmtDate(ticket.createdAt)}
                    </span>
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold {ticket.assignedEngineerId ? "bg-indigo-50 text-indigo-700" : "bg-orange-50 text-orange-700"}">
                      <Icons.Person size={12} />
                      {ticket.assignedEngineerId ? "Engineer assigned" : "Engineer unassigned"}
                    </span>
                    {#if normalizedStatus === "resolved" || normalizedStatus === "pending_validation"}
                      {#if loadingClosureEligibility[ticket.id]}
                        <span class="text-[10px] font-medium text-gray-400">Checking closure readiness…</span>
                      {:else if closureBlocked(ticket.id)}
                        <span class="text-[10px] font-semibold text-red-600">Closure requirements incomplete</span>
                      {:else}
                        <span class="text-[10px] font-semibold text-emerald-600">Ready for review</span>
                      {/if}
                    {/if}
                  </div>
                </button>

                <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-3 xl:max-w-96 xl:border-0 xl:pt-0">
                  <span class="mr-auto whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold xl:mr-1 {slaInfo(ticket).classes}">{slaInfo(ticket).label}</span>
                  <button type="button" onclick={() => openDetail(ticket)} class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50">
                    <Icons.Eye size={14} />
                    <span class="hidden sm:inline">Details</span>
                  </button>
                  {#if canAssign(ticket)}
                    <button type="button" onclick={() => openAssign(ticket)} class="h-9 whitespace-nowrap rounded-lg bg-[#E87D1F] px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-orange-600">
                      {ticket.assignedEngineerId ? "Reassign" : "Assign engineer"}
                    </button>
                  {/if}
                  {#if canValidateResolution(ticket)}
                    <button
                      type="button"
                      onclick={() => handleValidateResolution(ticket)}
                      disabled={validatingTicketId === ticket.id || loadingClosureEligibility[ticket.id] || closureBlocked(ticket.id)}
                      class="h-9 whitespace-nowrap rounded-lg bg-purple-600 px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {validatingTicketId === ticket.id ? "Validating…" : "Validate resolution"}
                    </button>
                  {:else if normalizedStatus === "pending_validation"}
                    <button type="button" onclick={() => openApprove(ticket)} class="h-9 whitespace-nowrap rounded-lg bg-emerald-600 px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700">
                      Review & close
                    </button>
                  {/if}
                  {#if canEscalate(ticket)}
                    <button type="button" onclick={() => openEscalate(ticket)} class="h-9 whitespace-nowrap rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
                      Escalate
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
      {loading}
      onchange={(page) => (currentPage = page)}
    />
  </section>
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
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Assignees</p>
            {#if canAssign(detailTicket)}
              <button
                type="button"
                onclick={() => { const ticket = detailTicket; detailTicket = null; if (ticket) void openAssign(ticket); }}
                class="text-[11px] font-semibold text-orange-600 hover:text-orange-700"
              >
                {detailTicket.assignedEngineerId ? "Reassign engineer" : "Assign engineer"}
              </button>
            {/if}
          </div>
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
            {assignTarget.assignedEngineerId ? "Reassign Engineer" : "Assign Ticket"}
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
        {#if assignTarget.assignedEngineerId || assignTarget.statePlannerId}
          <div class="px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
            <p class="text-[11px] font-semibold text-blue-700 mb-2">
              Current Assignees
            </p>
            <div class="flex flex-col gap-1">
              {#if assignTarget.assignedEngineerId}
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-semibold text-blue-500 uppercase tracking-wide w-20 shrink-0"
                  >Engineer</span
                  >
                  <span class="text-[13px] text-blue-800 font-medium"
                    >{assigneeName(assignEngineers, assignTarget.assignedEngineerId, loadingAssignees ? "Loading…" : "Current engineer")}</span
                  >
                </div>
              {/if}
              {#if assignTarget.statePlannerId}
                <div class="flex items-center gap-2">
                  <span
                    class="text-[10px] font-semibold text-blue-500 uppercase tracking-wide w-20 shrink-0"
                  >Planner</span
                  >
                  <span class="text-[13px] text-blue-800 font-medium"
                    >{assigneeName(assignPlanners, assignTarget.statePlannerId, loadingAssignees ? "Loading…" : "Current planner")}</span
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
                {#if !assignTarget.statePlannerId}<option value="">— None —</option>{/if}
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
                {#if !assignTarget.assignedEngineerId}<option value="">— None —</option>{/if}
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
          disabled={assigning || loadingAssignees || !assignmentChanged() || (!assignForm.engineerId && !assignForm.statePlannerId)}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
        >
          {assigning ? "Saving…" : assignTarget.assignedEngineerId ? "Reassign Engineer" : "Assign Ticket"}
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
              No projects are mapped to {customers.find((customer) => customer.id === form.customerId)?.companyName ?? "this customer"}. Ask the Super Admin to create or map a project first.
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

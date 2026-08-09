<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { authStore } from "$lib/stores/auth";
  import {
    fetchTicketCategories,
    fetchUsersByRole,
    type TicketCategory,
    type User,
  } from "./queries";
  import { fetchProjects, type Project } from "$lib/modules/data/projects/queries";
  import { ROLE_STATUS_OPTIONS, TICKET_STATUS_LABELS } from "$lib/config/roles";
  import { toast } from "svelte-sonner";

  interface TicketFormData {
    projectId?: string;
    categoryId?: string;
    issue?: string;
    sub?: string;
    sla?: string;
    place?: string;
    engineer?: string;
    planner?: string;
    status?: string;
    priority?: string;
    date?: string;
  }

  let {
    mode = "add",
    data = null,
    onSave,
    onClose,
  }: {
    mode?: "add" | "edit";
    data?: TicketFormData | null;
    onSave: (form: Record<string, string>) => void;
    onClose: () => void;
  } = $props();

  const userRole = $derived($authStore.user?.role ?? 'super_admin');

  // Status options driven by config — no more hardcoded role strings here.
  const statusOptions = $derived(
    (ROLE_STATUS_OPTIONS[userRole] ?? ROLE_STATUS_OPTIONS.super_admin).map(
      (s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }),
    ),
  );

  let engineers = $state<User[]>([]);
  let planners = $state<User[]>([]);
  let projects = $state<Project[]>([]);
  let categories = $state<TicketCategory[]>([]);
  let loadingUsers = $state(false);
  let loadingProjects = $state(false);
  let loadingCategories = $state(false);

  onMount(async () => {
    loadingUsers = true;
    loadingProjects = true;
    loadingCategories = true;
    try {
      const [eng, engL2, engL3, plan, projs, ticketCats] = await Promise.all([
        fetchUsersByRole("engineer"),
        fetchUsersByRole("l2_engineer"),
        fetchUsersByRole("l3_engineer"),
        fetchUsersByRole("state_planner"),
        fetchProjects(),
        fetchTicketCategories(),
      ]);
      engineers = [...eng, ...engL2, ...engL3];
      planners = plan;
      projects = projs;
      categories = ticketCats;
      if (projs.length === 1 && !form.projectId) {
        form.projectId = projs[0].id;
      }
      if (ticketCats.length > 0 && !form.categoryId) {
        form.categoryId = ticketCats[0].id;
      }
    } catch {
      // non-critical — dropdowns fall back to empty
    } finally {
      loadingUsers = false;
      loadingProjects = false;
      loadingCategories = false;
    }
  });

  let form = $state({
    projectId: "",
    categoryId: "",
    issue: "",
    sub: "",
    sla: "On Track",
    place: "",
    engineer: "",
    planner: "",
    status: "open",
    priority: "Medium",
    date: new Date().toLocaleDateString("en-GB"),
  });

  $effect(() => {
    form.projectId  = data?.projectId  ?? "";
    form.categoryId = data?.categoryId ?? "";
    form.issue      = data?.issue      ?? "";
    form.sub        = data?.sub        ?? "";
    form.sla        = data?.sla        ?? "On Track";
    form.place      = data?.place      ?? "";
    form.engineer   = data?.engineer   ?? "";
    form.planner    = data?.planner    ?? "";
    form.status     = data?.status     ?? "open";
    form.priority   = data?.priority   ?? "Medium";
    form.date       = data?.date       ?? new Date().toLocaleDateString("en-GB");
  });

  let errors = $state<Record<string, string>>({});

  function validate() {
    errors = {};
    if (!form.projectId) errors.projectId = "Project is required";
    if (!form.categoryId) errors.categoryId = "Call type is required";
    if (!form.issue.trim()) errors.issue = "Issue / title is required";
    else if (form.issue.trim().length < 3) errors.issue = "Issue must be at least 3 characters";
    if (!form.sub.trim()) errors.sub = "Customer / Subscriber is required";
    if (!form.place.trim()) errors.place = "Place / State is required";
    const date = form.date.trim();
    if (!date) errors.date = "Date is required";
    else if (!/^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/.test(date))
      errors.date = "Enter date in DD/MM/YYYY format";
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!loadingProjects && projects.length === 0) {
      toast.error("No project assigned. Please contact admin.");
      return;
    }
    if (!validate()) {
      if (errors.projectId) toast.error(errors.projectId);
      return;
    }
    onSave({ ...form });
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass =
    "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label={mode === "add" ? "Create Ticket" : "Edit Ticket"}
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">
          {mode === "add" ? "Create Ticket" : "Edit Ticket"}
        </h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {mode === "add"
            ? "Fill in the details to raise a new ticket"
            : "Update the ticket information below"}
        </p>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <form class="px-6 py-5 flex flex-col gap-4 overflow-y-auto" onsubmit={handleSubmit}>

      <!-- Project -->
      {#if loadingProjects}
        <div class={labelClass}>
          <span class={labelTextClass}>Project <span class="text-red-400">*</span></span>
          <div class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50">Loading projects…</div>
        </div>
      {:else if projects.length === 0}
        <div class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700 font-medium">
          No project assigned. Please contact admin.
        </div>
      {:else if projects.length === 1}
        <div class={labelClass}>
          <span class={labelTextClass}>Project</span>
          <div class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 bg-gray-50">{projects[0].name}</div>
        </div>
      {:else}
        <label class={labelClass}>
          <span class={labelTextClass}>Project <span class="text-red-400">*</span></span>
          <select class={fieldClass} bind:value={form.projectId}>
            <option value="">— Select Project —</option>
            {#each projects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          {#if errors.projectId}<span class={errorClass}>{errors.projectId}</span>{/if}
        </label>
      {/if}

      <!-- Call Type -->
      {#if loadingCategories}
        <div class={labelClass}>
          <span class={labelTextClass}>Call Type <span class="text-red-400">*</span></span>
          <div class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50">Loading call types…</div>
        </div>
      {:else if categories.length === 0}
        <div class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700 font-medium">
          No call types available. Please contact admin.
        </div>
      {:else}
        <label class={labelClass}>
          <span class={labelTextClass}>Call Type <span class="text-red-400">*</span></span>
          <select class={fieldClass} bind:value={form.categoryId}>
            {#each categories as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
          {#if errors.categoryId}<span class={errorClass}>{errors.categoryId}</span>{/if}
        </label>
      {/if}

      <!-- Issue -->
      <label class={labelClass}>
        <span class={labelTextClass}>Issue / Title <span class="text-red-400">*</span></span>
        <input type="text" placeholder="e.g. Database Error"
          class="{fieldClass} {errors.issue ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.issue} />
        {#if errors.issue}<span class={errorClass}>{errors.issue}</span>{/if}
      </label>

      <!-- Customer / Sub -->
      <label class={labelClass}>
        <span class={labelTextClass}>Customer / Subscriber <span class="text-red-400">*</span></span>
        <input type="text" placeholder="e.g. SBI Bank"
          class="{fieldClass} {errors.sub ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.sub} />
        {#if errors.sub}<span class={errorClass}>{errors.sub}</span>{/if}
      </label>

      <!-- Row: SLA + Priority -->
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>SLA Status</span>
          <select class={fieldClass} bind:value={form.sla}>
            <option value="On Track">On Track</option>
            <option value="Breached">Breached</option>
          </select>
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Priority</span>
          <select class={fieldClass} bind:value={form.priority}>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>
      </div>

      <!-- Row: Status + Date -->
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Status</span>
          <select class={fieldClass} bind:value={form.status}>
            {#each statusOptions as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Date <span class="text-red-400">*</span></span>
          <input type="text" placeholder="DD/MM/YYYY" maxlength="10"
            class="{fieldClass} {errors.date ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.date} />
          {#if errors.date}<span class={errorClass}>{errors.date}</span>{/if}
        </label>
      </div>

      <!-- Place -->
      <label class={labelClass}>
        <span class={labelTextClass}>Place / State <span class="text-red-400">*</span></span>
        <input type="text" placeholder="e.g. Kerala"
          class="{fieldClass} {errors.place ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.place} />
        {#if errors.place}<span class={errorClass}>{errors.place}</span>{/if}
      </label>

      <!-- Assign Engineer -->
      <label class={labelClass}>
        <span class={labelTextClass}>Assigned Engineer</span>
        <select class={fieldClass} bind:value={form.engineer} disabled={loadingUsers}>
          <option value="">— Unassigned —</option>
          {#each engineers as eng}
            <option value={eng.id}>{eng.name} ({eng.email})</option>
          {/each}
        </select>
      </label>

      <!-- Assign State Planner -->
      <label class={labelClass}>
        <span class={labelTextClass}>State Planner</span>
        <select class={fieldClass} bind:value={form.planner} disabled={loadingUsers}>
          <option value="">— Unassigned —</option>
          {#each planners as p}
            <option value={p.id}>{p.name} ({p.email})</option>
          {/each}
        </select>
      </label>

      <!-- Footer -->
      <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
        <button
          type="button"
          onclick={onClose}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={(!loadingProjects && projects.length === 0) || (!loadingCategories && categories.length === 0)}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mode === "add" ? "Create Ticket" : "Save Changes"}
        </button>
      </div>
    </form>
  </div>
</div>

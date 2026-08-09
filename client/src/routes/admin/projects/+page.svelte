<script lang="ts">
  import { onMount } from "svelte";
  import { untrack } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import {
    fetchProjects,
    type Project,
  } from "$lib/modules/data/projects/queries";
  import {
    createProject,
    updateProject,
  } from "$lib/modules/data/projects/actions";
  import {
    fetchCustomers,
    type Customer,
  } from "$lib/modules/data/customers/queries";
  import {
    fetchUsersByRole,
    type User,
  } from "$lib/modules/data/tickets/queries";
  import Pagination from "$lib/components/Pagination.svelte";

  // ── State ──────────────────────────────────────────────────────────────────

  let projects = $state<Project[]>([]);
  let customers = $state<Customer[]>([]);
  let projectHeads = $state<User[]>([]);
  let loading = $state(true);

  // Search / filter
  let searchQuery = $state("");
  let filterCustomer = $state("");
  let filterHead = $state("");

  // Pagination
  const PAGE_SIZE = 10;
  let currentPage = $state(1);

  // Modals
  let showCreate = $state(false);
  let viewProject = $state<Project | null>(null);
  let editProject = $state<Project | null>(null);

  // Create form
  let createForm = $state({ name: "", customerId: "", projectHeadId: "" });
  let createErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  // Edit form
  let editForm = $state({ name: "", projectHeadId: "" });
  let editErrors = $state<Record<string, string>>({});
  let editSubmitting = $state(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function customerName(id: string): string {
    return customers.find((c) => c.id === id)?.companyName ?? "—";
  }

  function headName(id: string | null | undefined): string {
    if (!id) return "—";
    return projectHeads.find((u) => u.id === id)?.name ?? id;
  }

  // ── Load data ──────────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      [projects, customers, projectHeads] = await Promise.all([
        fetchProjects(),
        fetchCustomers(),
        fetchUsersByRole("project_head"),
      ]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      loading = false;
    }
  });

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalProjects = $derived(projects.length);
  const withHead = $derived(projects.filter((p) => p.projectHeadId).length);
  const withoutHead = $derived(projects.filter((p) => !p.projectHeadId).length);
  const uniqueCustomers = $derived(
    new Set(projects.map((p) => p.customerId)).size,
  );

  const statCards = $derived([
    { label: "Total Projects", value: totalProjects, color: "text-[#0B182A]" },
    { label: "Assigned Head", value: withHead, color: "text-green-600" },
    { label: "No Head Assigned", value: withoutHead, color: "text-amber-600" },
    { label: "Customers", value: uniqueCustomers, color: "text-[#E87D1F]" },
  ]);

  // ── Filtered + paginated ───────────────────────────────────────────────────

  const filteredProjects = $derived(() => {
    const q = searchQuery.toLowerCase().trim();
    return projects.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        customerName(p.customerId).toLowerCase().includes(q) ||
        headName(p.projectHeadId).toLowerCase().includes(q);
      const matchCust = !filterCustomer || p.customerId === filterCustomer;
      const matchHead =
        !filterHead ||
        (filterHead === "__none__" && !p.projectHeadId) ||
        p.projectHeadId === filterHead;
      return matchQ && matchCust && matchHead;
    });
  });

  const totalFiltered = $derived(filteredProjects().length);
  const totalPages = $derived(
    Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE)),
  );

  $effect(() => {
    // reset page on filter change
    searchQuery;
    filterCustomer;
    filterHead;
    untrack(() => {
      currentPage = 1;
    });
  });

  const pagedProjects = $derived(
    filteredProjects().slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE,
    ),
  );

  // ── Create project ─────────────────────────────────────────────────────────

  function openCreate() {
    createForm = { name: "", customerId: "", projectHeadId: "" };
    createErrors = {};
    showCreate = true;
  }

  function validateCreate(): boolean {
    createErrors = {};
    if (!createForm.name.trim()) createErrors.name = "Project name is required";
    if (!createForm.customerId)
      createErrors.customerId = "Please select a customer";
    return Object.keys(createErrors).length === 0;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!validateCreate()) return;
    submitting = true;
    try {
      const created = await createProject({
        name: createForm.name.trim(),
        customerId: createForm.customerId,
        projectHeadId: createForm.projectHeadId || undefined,
        author: "admin",
      });
      projects = [created, ...projects];
      toast.success("Project created successfully");
      showCreate = false;
    } catch (err) {
      toast.error(`Failed to create project: ${(err as Error).message}`);
    } finally {
      submitting = false;
    }
  }

  // ── Edit project ───────────────────────────────────────────────────────────

  function openEdit(p: Project) {
    editForm = { name: p.name, projectHeadId: p.projectHeadId ?? "" };
    editErrors = {};
    editProject = p;
  }

  function validateEdit(): boolean {
    editErrors = {};
    if (!editForm.name.trim()) editErrors.name = "Project name is required";
    return Object.keys(editErrors).length === 0;
  }

  async function handleEdit(e: Event) {
    e.preventDefault();
    if (!editProject || !validateEdit()) return;
    editSubmitting = true;
    try {
      const updated = await updateProject({
        id: editProject.id,
        name: editForm.name.trim(),
        projectHeadId: editForm.projectHeadId || null,
      });
      projects = projects.map((p) => (p.id === updated.id ? updated : p));
      toast.success("Project updated");
      editProject = null;
    } catch (err) {
      toast.error(`Failed to update: ${(err as Error).message}`);
    } finally {
      editSubmitting = false;
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass =
    "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<svelte:head><title>Projects · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <!-- Stat cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    {#each statCards as card}
      <div class="bg-white rounded-2xl px-5 py-4 shadow flex flex-col gap-1">
        <span
          class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
          >{card.label}</span
        >
        <span class="text-[28px] font-bold {card.color} leading-tight">
          {loading ? "—" : card.value}
        </span>
      </div>
    {/each}
  </div>

  <!-- Filter / Action bar -->
  <div
    class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow"
  >
    <!-- Search -->
    <div
      class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-45 max-w-xs"
    >
      <Icons.Search size={16} stroke="#9ca3af" />
      <input
        type="text"
        placeholder="Search projects…"
        class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
        bind:value={searchQuery}
      />
    </div>

    <!-- Customer filter -->
    <select
      class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none focus:border-[#0B182A] bg-white"
      bind:value={filterCustomer}
    >
      <option value="">All Customers</option>
      {#each customers.filter( (c) => projects.some((p) => p.customerId === c.id), ) as c}
        <option value={c.id}>{c.companyName ?? c.id}</option>
      {/each}
    </select>

    <!-- Head filter -->
    <select
      class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none focus:border-[#0B182A] bg-white"
      bind:value={filterHead}
    >
      <option value="">All Heads</option>
      <option value="__none__">No Head Assigned</option>
      {#each projectHeads.filter( (ph) => projects.some((p) => p.projectHeadId === ph.id), ) as ph}
        <option value={ph.id}>{ph.name ?? ph.email ?? ph.id}</option>
      {/each}
    </select>

    <button
      onclick={openCreate}
      class="flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-opacity ml-auto"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Add Project
    </button>
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">All Projects</h3>
      <span
        class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full"
      >
        {loading ? "…" : totalFiltered}
        {totalFiltered !== totalProjects ? `of ${totalProjects}` : "Total"}
      </span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["PROJECT NAME", "CUSTOMER", "PROJECT HEAD", "ACTIONS"] as col}
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
                colspan="4"
                class="py-10 text-center text-[13px] text-gray-400">Loading…</td
              >
            </tr>
          {:else if pagedProjects.length === 0}
            <tr>
              <td
                colspan="4"
                class="py-10 text-center text-[13px] text-gray-400"
              >
                {totalFiltered === 0 && totalProjects > 0
                  ? "No projects match your filters"
                  : "No projects yet"}
              </td>
            </tr>
          {:else}
            {#each pagedProjects as p}
              <tr
                class="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td class="py-3 px-3 text-[13px] font-medium text-[#0B182A]"
                  >{p.name}</td
                >
                <td class="py-3 px-3 text-[13px] text-[#E87D1F] font-medium"
                  >{customerName(p.customerId)}</td
                >
                <td class="py-3 px-3 text-[13px] text-gray-600"
                  >{headName(p.projectHeadId)}</td
                >
                <td class="py-3 px-3">
                  <div class="flex items-center gap-2">
                    <!-- View -->
                    <button
                      onclick={() => (viewProject = p)}
                      class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B182A] transition-colors cursor-pointer"
                      aria-label="View project"
                      title="View"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                        />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <!-- Edit -->
                    <button
                      onclick={() => openEdit(p)}
                      class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B182A] transition-colors cursor-pointer"
                      aria-label="Edit project"
                      title="Edit"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                        />
                        <path
                          d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                        />
                      </svg>
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
      totalItems={totalFiltered}
      pageSize={PAGE_SIZE}
      itemLabel="projects"
      {loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

<!-- ── View Modal ─────────────────────────────────────────────────────────── -->
{#if viewProject}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
      aria-label="Close modal"
      onclick={() => (viewProject = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in"
      role="dialog"
      aria-modal="true"
      aria-label="Project Details"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-start justify-between px-6 py-4 border-b border-gray-100"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">
            {viewProject.name}
          </h2>
          <span class="text-[12px] text-[#E87D1F] font-medium"
            >#{viewProject.id}</span
          >
        </div>
        <button
          onclick={() => (viewProject = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
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

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <p
              class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
            >
              Project Name
            </p>
            <p class="text-[13px] text-gray-800 mt-0.5">{viewProject.name}</p>
          </div>
          <div>
            <p
              class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
            >
              Customer
            </p>
            <p class="text-[13px] text-[#E87D1F] font-medium mt-0.5">
              {customerName(viewProject.customerId)}
            </p>
          </div>
          <div>
            <p
              class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
            >
              Project Head
            </p>
            <p class="text-[13px] text-gray-800 mt-0.5">
              {headName(viewProject.projectHeadId)}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex justify-end gap-3 px-6 pb-5 pt-4 border-t border-gray-100"
      >
        <button
          onclick={() => (viewProject = null)}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
          >Close</button
        >
        <button
          onclick={() => {
            openEdit(viewProject!);
            viewProject = null;
          }}
          class="flex items-center gap-2 px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Edit Modal ─────────────────────────────────────────────────────────── -->
{#if editProject}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (editProject = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Project"
      tabindex="-1"
    >
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">Edit Project</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">Update project details</p>
        </div>
        <button
          onclick={() => (editProject = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
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

      <form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleEdit}>
        <label class={labelClass}>
          <span class={labelTextClass}
            >Project Name <span class="text-red-400">*</span></span
          >
          <input
            type="text"
            placeholder="e.g. ATM Deployment"
            class={fieldClass}
            bind:value={editForm.name}
          />
          {#if editErrors.name}<span class={errorClass}>{editErrors.name}</span
            >{/if}
        </label>

        <label class={labelClass}>
          <span class={labelTextClass}>Project Head</span>
          <select class={fieldClass} bind:value={editForm.projectHeadId}>
            <option value="">— Unassign —</option>
            {#each projectHeads as ph}
              <option value={ph.id}>{ph.name ?? ph.email ?? ph.id}</option>
            {/each}
          </select>
        </label>

        <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
          <button
            type="button"
            onclick={() => (editProject = null)}
            class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
            >Cancel</button
          >
          <button
            type="submit"
            disabled={editSubmitting}
            class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
            >{editSubmitting ? "Saving…" : "Save Changes"}</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- ── Create Modal ───────────────────────────────────────────────────────── -->
{#if showCreate}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (showCreate = false)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Add Project"
      tabindex="-1"
    >
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">Add Project</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">
            Create a new project and assign a project head
          </p>
        </div>
        <button
          onclick={() => (showCreate = false)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
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

      <form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleCreate}>
        <label class={labelClass}>
          <span class={labelTextClass}
            >Project Name <span class="text-red-400">*</span></span
          >
          <input
            type="text"
            placeholder="e.g. ATM Deployment"
            class={fieldClass}
            bind:value={createForm.name}
          />
          {#if createErrors.name}<span class={errorClass}
              >{createErrors.name}</span
            >{/if}
        </label>

        <label class={labelClass}>
          <span class={labelTextClass}
            >Customer <span class="text-red-400">*</span></span
          >
          <select class={fieldClass} bind:value={createForm.customerId}>
            <option value="">— Select customer —</option>
            {#each customers.filter((c) => c.status === "active") as c}
              <option value={c.id}
                >{c.companyName ?? c.contactPersonName ?? c.id}</option
              >
            {/each}
          </select>
          {#if createErrors.customerId}<span class={errorClass}
              >{createErrors.customerId}</span
            >{/if}
        </label>

        <label class={labelClass}>
          <span class={labelTextClass}>Project Head</span>
          <select class={fieldClass} bind:value={createForm.projectHeadId}>
            <option value="">— Assign later —</option>
            {#each projectHeads as ph}
              <option value={ph.id}>{ph.name ?? ph.email ?? ph.id}</option>
            {/each}
          </select>
        </label>

        <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
          <button
            type="button"
            onclick={() => (showCreate = false)}
            class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
            >Cancel</button
          >
          <button
            type="submit"
            disabled={submitting}
            class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
            >{submitting ? "Creating…" : "Add Project"}</button
          >
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .animate-in {
    animation: slideUp 0.18s ease-out both;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>

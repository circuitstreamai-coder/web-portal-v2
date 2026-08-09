<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import ProjectForm from "./ProjectForm.svelte";
  import { fetchProjects, type Project as ApiProject } from "./queries";
  import { createProject, deleteProject } from "./actions";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import { toast } from "svelte-sonner";
  import Pagination from "$lib/components/Pagination.svelte";

  interface Props {
    canDelete?: boolean;
  }

  let { canDelete = true }: Props = $props();

  // ── view-model (keeps the shape ProjectForm expects) ─────────────────────
  type Project = {
    id: string;
    customerId: string;
    name: string;
    customer: string;
    location: string;
    sla: string;
    tickets: number;
    completed: number;
    status: string;
    tags: string[];
  };

  function toRow(p: ApiProject): Project {
    return {
      id: p.id,
      customerId: p.customerId,
      name: p.name,
      customer: p.customerId,
      location: "—",
      sla: "—",
      tickets: 0,
      completed: 0,
      status: "Active",
      tags: [],
    };
  }

  let view = $state("table");
  let projects = $state<Project[]>([]);
  let loading = $state(true);

  // ── Pagination ──────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages    = $derived(Math.max(1, Math.ceil(projects.length / PAGE_SIZE)));
  const pagedProjects = $derived(projects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  onMount(async () => {
    try {
      const data = await fetchProjects();
      projects = data.map(toRow);
    } catch (err) {
      toast.error("Failed to load projects");
    } finally {
      loading = false;
    }
  });

  let showForm = $state(false);
  let formMode = $state<"add" | "edit">("add");
  let editData = $state<Project | null>(null);

  let deleteTarget = $state<Project | null>(null);
  let deleting = $state(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await deleteProject(deleteTarget.id);
      projects = projects.filter((p) => p.id !== deleteTarget!.id);
      toast.success("Project deleted");
      deleteTarget = null;
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      deleting = false;
    }
  }

  function openAdd() {
    formMode = "add";
    editData = null;
    showForm = true;
  }

  function openEdit(project: Project) {
    formMode = "edit";
    editData = { ...project };
    showForm = true;
  }

  async function handleSave(form: Record<string, unknown>) {
    if (formMode === "add") {
      if (!form.customerId) {
        toast.error("Please select a customer");
        return;
      }
      try {
        const created = await createProject({
          customerId: form.customerId as string,
          name: form.name as string,
          author: "system",
        });
        projects = [
          ...projects,
          {
            id: created.id,
            customerId: form.customerId as string,
            name: form.name as string,
            customer: form.customerId as string,
            location: form.location as string,
            sla: form.sla as string,
            status: form.status as string,
            tags: form.tags as string[],
            tickets: 0,
            completed: 0,
          },
        ];
        toast.success("Project created successfully");
      } catch (err) {
        toast.error(`Failed to create project: ${(err as Error).message}`);
        return;
      }
    } else if (editData) {
      projects = projects.map((p) =>
        p.id === editData!.id
          ? {
              ...p,
              customerId: (form.customerId as string) || p.customerId,
              name: form.name as string,
              customer: (form.customerId as string) || p.customerId,
              location: form.location as string,
              sla: form.sla as string,
              status: form.status as string,
              tags: form.tags as string[],
            }
          : p
      );
    }
    showForm = false;
  }
</script>

<div class="flex flex-col gap-5" data-can-delete={canDelete}>
  <!-- Filter Bar -->
  <div class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow">
    <div class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-100">
      <Icons.Search size={16} stroke="#9ca3af" />
      <input type="text" placeholder="Search" class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400" />
    </div>

    <button class="flex items-center gap-1.5 p-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
      <Icons.Circle size={14} />
      Status
      <Icons.ChevronDown size={12} />
    </button>

    <button class="flex items-center gap-1.5 p-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
      <Icons.Person size={14} />
      Customer
      <Icons.ChevronDown size={12} />
    </button>

    <button class="flex items-center gap-1.5 p-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
      <Icons.MapPin size={14} />
      State
      <Icons.ChevronDown size={12} />
    </button>

    <button
      onclick={openAdd}
      class="flex items-center gap-1.5 px-4 py-2.5 bg-[#E87D1F] hover:bg-[#E87D1F]/90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-colors duration-150 ml-auto"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Add Project
    </button>
  </div>

  <!-- Content Card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">All Projects</h3>
        <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{projects.length} Total</span>
      </div>
      <div class="flex gap-2">
        <!-- View Toggle -->
        <div class="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onclick={() => (view = "table")}
            class="flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors duration-150 {view === 'table' ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
          >
            <Icons.List size={14} />
          </button>
          <button
            onclick={() => (view = "card")}
            class="flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition-colors duration-150 {view === 'card' ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}"
          >
            <Icons.Grid size={14} />
          </button>
        </div>

        <button class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
          <Icons.Download size={14} />
          Export
        </button>
      </div>
    </div>

    <!-- Table View -->
    {#if view === "table"}
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ["PROJECT ID", "PROJECT NAME", "CUSTOMER", "LOCATION", "SLA", "TICKETS", "STATUS", "ACTIONS"] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="8" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if projects.length === 0}
              <tr><td colspan="8" class="py-10 text-center text-[13px] text-gray-400">No projects yet</td></tr>
            {:else}
            {#each pagedProjects as p}
              <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="py-3 px-3 text-[#E87D1F] font-medium text-[13px]">{p.id}</td>
                <td class="py-3 px-3 text-[13px] text-gray-700">{p.name}</td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{p.customer}</td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{p.location}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">{p.sla}</span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{p.tickets}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {p.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}">
                    {p.status}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <div class="flex gap-1">
                    <button aria-label="View project" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors">
                      <Icons.Eye size={16} />
                    </button>
                    <button
                      aria-label="Edit project"
                      onclick={() => openEdit(p)}
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
                    >
                      <Icons.Edit size={16} />
                    </button>
                    {#if canDelete}
                      <button
                        aria-label="Delete project"
                        onclick={() => (deleteTarget = p)}
                        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Icons.Trash size={16} />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
            {/if}
          </tbody>
        </table>
      </div>
    {/if}

    <!-- Card View -->
    {#if view === "card"}
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each pagedProjects as p}
          <div class="border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div class="flex items-start justify-between gap-2">
              <div>
                <h4 class="text-[16px] font-semibold text-gray-800">{p.name}</h4>
                <p class="text-[12px] text-[#E87D1F] font-medium mt-0.5">{p.id}</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                  <Icons.MapPin size={10} />
                  {p.location}
                </span>
                <button
                  aria-label="Edit project"
                  onclick={() => openEdit(p)}
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
                >
                  <Icons.Edit size={13} />
                </button>
                {#if canDelete}
                  <button
                    aria-label="Delete project"
                    onclick={() => (deleteTarget = p)}
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Icons.Trash size={13} />
                  </button>
                {/if}
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-3">
              <span class="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">{p.customer}</span>
              {#each p.tags as tag}
                <span class="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">{tag}</span>
              {/each}
            </div>
            <div class="border-t border-gray-100 my-4"></div>
            <div class="grid grid-cols-3 divide-x divide-gray-100">
              <div class="pr-3">
                <p class="text-[10px] text-orange-400 font-semibold mb-1">Open Tickets</p>
                <p class="text-[18px] font-bold text-[#E87D1F] leading-none">{p.tickets}</p>
              </div>
              <div class="px-3">
                <p class="text-[10px] text-green-500 font-semibold mb-1">Completed</p>
                <p class="text-[18px] font-bold text-green-500 leading-none">{p.completed}</p>
              </div>
              <div class="pl-3">
                <p class="text-[10px] text-blue-500 font-semibold mb-1">SLA</p>
                <p class="text-[13px] font-bold text-blue-600 leading-none mt-1">{p.sla}</p>
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {p.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}">
                {p.status}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={projects.length}
      pageSize={PAGE_SIZE}
      itemLabel="Projects"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

{#if showForm}
  <ProjectForm
    mode={formMode}
    data={editData ? { ...editData } : null}
    onSave={handleSave}
    onClose={() => (showForm = false)}
  />
{/if}

{#if deleteTarget}
  <ConfirmModal
    title="Delete Project"
    message="Delete project '{deleteTarget.name}'? This cannot be undone."
    confirmLabel={deleting ? "Deleting…" : "Delete"}
    confirmClass="bg-red-600 text-white hover:bg-red-700"
    onConfirm={confirmDelete}
    onCancel={() => (deleteTarget = null)}
  />
{/if}

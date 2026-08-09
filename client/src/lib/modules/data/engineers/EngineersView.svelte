<script lang="ts">
  import * as Icons from "$lib/icons";
  import { fetchEngineerProfiles, type EngineerProfile } from "./queries";
  import { updateEngineerDocumentsStatus, updateEngineer, updateEngineerAccountStatus, deleteEngineer } from "./actions";
  import { toast } from "svelte-sonner";
  import { queryVersion } from "$lib/stores/query";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import EngineerDocumentsModal from "./EngineerDocumentsModal.svelte";
  import AdminAddEngineerModal from "./AdminAddEngineerModal.svelte";
  import BulkUploadEngineersModal from "./BulkUploadEngineersModal.svelte";
  import EngineerView from "./EngineerView.svelte";
  import EngineerForm from "./EngineerForm.svelte";
  import AdminUploadDocumentsModal from "./AdminUploadDocumentsModal.svelte";
  interface Props {
    canDelete?: boolean;
  }

  let { canDelete = true }: Props = $props();

  let engineers = $state<EngineerProfile[]>([]);
  let loading = $state(true);
  let showAddEngineerModal = $state(false);
  let showBulkUploadModal = $state(false);

  let pendingCount = $derived(engineers.filter(e => e.documentsStatus === "pending").length);
  let approvedCount = $derived(engineers.filter(e => e.documentsStatus === "approved").length);

  // Documents review modal
  let reviewEng = $state<EngineerProfile | null>(null);

  // Delete
  let deleteTarget = $state<EngineerProfile | null>(null);
  let deleting = $state(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await deleteEngineer(deleteTarget.id);
      engineers = engineers.filter((e) => e.id !== deleteTarget!.id);
      toast.success("Engineer deleted");
      deleteTarget = null;
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      deleting = false;
    }
  }

  // Confirmation modal state
  let confirmModal = $state<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
    action: () => Promise<void>;
  } | null>(null);

  async function loadEngineers() {
    loading = true;
    try {
      engineers = await fetchEngineerProfiles();
    } catch (err) {
      toast.error("Failed to load engineers");
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    $queryVersion.engineers;
    loadEngineers();
  });

  function promptApprove(eng: EngineerProfile) {
    reviewEng = null;
    confirmModal = {
      title: "Approve Engineer",
      message: `Approve ${eng.userName ?? eng.referenceId ?? "this engineer"}? Login credentials will be sent to their email.`,
      confirmLabel: "Approve",
      confirmClass: "bg-green-600 text-white hover:bg-green-700",
      action: async () => {
        await updateEngineerDocumentsStatus({ id: eng.id, documentsStatus: "approved" });
        engineers = engineers.map(e => e.id === eng.id ? { ...e, documentsStatus: "approved" } : e);
        toast.success(`${eng.userName ?? eng.referenceId} approved — credentials sent`);
      },
    };
  }

  function promptReject(eng: EngineerProfile) {
    reviewEng = null;
    confirmModal = {
      title: "Reject Engineer",
      message: `Reject ${eng.userName ?? eng.referenceId ?? "this engineer"}? This cannot be undone.`,
      confirmLabel: "Reject",
      confirmClass: "bg-red-500 text-white hover:bg-red-600",
      action: async () => {
        await updateEngineerDocumentsStatus({ id: eng.id, documentsStatus: "rejected" });
        engineers = engineers.map(e => e.id === eng.id ? { ...e, documentsStatus: "rejected" } : e);
        toast.success(`${eng.userName ?? eng.referenceId} rejected`);
      },
    };
  }

  async function handleConfirm() {
    if (!confirmModal) return;
    const action = confirmModal.action;
    confirmModal = null;
    try {
      await action();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function promptSuspend(eng: EngineerProfile) {
    confirmModal = {
      title: "Suspend Engineer Account",
      message: `Suspend ${eng.userName ?? eng.referenceId ?? "this engineer"}? They will lose portal access until unsuspended.`,
      confirmLabel: "Suspend",
      confirmClass: "bg-amber-600 text-white hover:bg-amber-700",
      action: async () => {
        const updated = await updateEngineerAccountStatus(eng.id, "suspended");
        engineers = engineers.map(e => e.id === eng.id ? { ...e, ...updated, accountStatus: "suspended" } : e);
        toast.success(`${eng.userName ?? eng.referenceId} account suspended`);
      },
    };
  }

  function promptUnsuspend(eng: EngineerProfile) {
    confirmModal = {
      title: "Unsuspend Engineer Account",
      message: `Unsuspend ${eng.userName ?? eng.referenceId ?? "this engineer"}? They will regain portal access.`,
      confirmLabel: "Unsuspend",
      confirmClass: "bg-green-600 text-white hover:bg-green-700",
      action: async () => {
        const updated = await updateEngineerAccountStatus(eng.id, "active");
        engineers = engineers.map(e => e.id === eng.id ? { ...e, ...updated, accountStatus: "active" } : e);
        toast.success(`${eng.userName ?? eng.referenceId} account unsuspended`);
      },
    };
  }

  function statusStyle(status: string) {
    if (status === "approved") return "bg-green-50 text-green-600";
    if (status === "pending") return "bg-amber-50 text-amber-600";
    if (status === "rejected") return "bg-red-50 text-red-500";
    if (status === "reupload") return "bg-purple-50 text-purple-600";
    return "bg-gray-100 text-gray-500";
  }

  function accountStatusStyle(s: string | null) {
    if (s === "suspended") return "bg-red-50 text-red-600";
    return "";
  }

  function location(eng: EngineerProfile): string {
    return [eng.addressCity, eng.addressState].filter(Boolean).join(", ") || "—";
  }

  // ── View / Edit / Upload Docs ────────────────────────────────────────────────
  let viewEngineer = $state<EngineerProfile | null>(null);
  let editEngineer = $state<EngineerProfile | null>(null);
  let uploadDocsEngineer = $state<EngineerProfile | null>(null);

  function hasDocuments(eng: EngineerProfile): boolean {
    return !!(eng.aadhaarFrontUrl || eng.aadhaarBackUrl || eng.panCardUrl || eng.dlFrontUrl || eng.dlBackUrl);
  }

  function openView(eng: EngineerProfile) { viewEngineer = eng; }
  function openEdit(eng: EngineerProfile) { viewEngineer = null; editEngineer = eng; }

  async function handleSave(form: Record<string, string>) {
    if (!editEngineer) return;
    const targetId = editEngineer.id;
    try {
      await updateEngineer({
        id: targetId,
        userName:          form.userName          || undefined,
        userPhone:         form.userPhone         || undefined,
        addressState:      form.addressState      || undefined,
        addressCity:       form.addressCity       || undefined,
        addressPincode:    form.addressPincode    || undefined,
        assignedState:     form.assignedState     || undefined,
        bankAccountNumber: form.bankAccountNumber || undefined,
        ifscCode:          form.ifscCode          || undefined,
        accountHolderName: form.accountHolderName || undefined,
      });
      const patch: Partial<EngineerProfile> = {};
      if (form.userName)          patch.userName          = form.userName;
      if (form.userPhone)         patch.userPhone         = form.userPhone;
      if (form.addressState)      patch.addressState      = form.addressState;
      if (form.addressCity)       patch.addressCity       = form.addressCity;
      if (form.addressPincode)    patch.addressPincode    = form.addressPincode;
      if (form.assignedState)     patch.assignedState     = form.assignedState;
      if (form.bankAccountNumber) patch.bankAccountNumber = form.bankAccountNumber;
      if (form.ifscCode)          patch.ifscCode          = form.ifscCode;
      if (form.accountHolderName) patch.accountHolderName = form.accountHolderName;
      engineers = engineers.map(e => e.id === targetId ? { ...e, ...patch } : e);
      toast.success("Engineer updated successfully");
    } catch (err) {
      toast.error(`Failed to update engineer: ${(err as Error).message}`);
      return;
    }
    editEngineer = null;
  }

  // ── Search & filters ────────────────────────────────────────────────────────
  let searchQuery    = $state("");
  let filterStatus   = $state<string>("all");
  let filterState    = $state<string>("all");
  let showStatusDrop = $state(false);
  let showStateDrop  = $state(false);

  const uniqueStates = $derived(
    [...new Set(engineers.map(e => e.addressState).filter(Boolean) as string[])].sort()
  );

  const filteredEngineers = $derived(() => {
    const q = searchQuery.trim().toLowerCase();
    return engineers.filter(e => {
      if (filterStatus !== "all" && e.documentsStatus !== filterStatus) return false;
      if (filterState  !== "all" && e.addressState    !== filterState)  return false;
      if (q) {
        return (
          (e.userName      ?? "").toLowerCase().includes(q) ||
          (e.userEmail     ?? "").toLowerCase().includes(q) ||
          (e.userPhone     ?? "").toLowerCase().includes(q) ||
          (e.referenceId   ?? "").toLowerCase().includes(q) ||
          (e.addressState  ?? "").toLowerCase().includes(q) ||
          (e.addressCity   ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────────────
  const PAGE_SIZE = 12;
  let currentPage = $state(1);

  $effect(() => {
    searchQuery; filterStatus; filterState;
    currentPage = 1;
  });

  const totalFiltered  = $derived(filteredEngineers().length);
  const totalPages     = $derived(Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE)));

  const pagedEngineers = $derived(() => {
    const all   = filteredEngineers();
    const start = (currentPage - 1) * PAGE_SIZE;
    return all.slice(start, start + PAGE_SIZE);
  });

  const pageNumbers = $derived(() => {
    const total = totalPages;
    const curr  = currentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1) as (number | "...")[];
    const pages: (number | "...")[] = [1];
    if (curr > 3) pages.push("...");
    for (let i = Math.max(2, curr - 1); i <= Math.min(total - 1, curr + 1); i++) pages.push(i);
    if (curr < total - 2) pages.push("...");
    if (total > 1) pages.push(total);
    return pages;
  });
</script>

<!-- Close dropdowns when clicking outside -->
<svelte:window onclick={(e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("[data-status-drop]")) showStatusDrop = false;
  if (!t.closest("[data-state-drop]"))  showStateDrop  = false;
}} />

<div class="flex flex-col gap-5" data-can-delete={canDelete}>
  <!-- Stat Pills -->
  <div class="flex gap-3 flex-wrap">
    <div class="bg-white rounded-xl px-5 py-3 shadow flex items-center gap-3">
      <Icons.Users size={18} stroke="#0B182A" />
      <span class="text-[13px] text-gray-500">Total</span>
      <span class="text-[15px] font-bold text-[#0B182A]">{engineers.length}</span>
    </div>
    <div class="bg-white rounded-xl px-5 py-3 shadow flex items-center gap-3">
      <Icons.UserCheck size={18} stroke="#22c55e" />
      <span class="text-[13px] text-gray-500">Approved</span>
      <span class="text-[15px] font-bold text-green-600">{approvedCount}</span>
    </div>
    <div class="bg-white rounded-xl px-5 py-3 shadow flex items-center gap-3">
      <Icons.UserX size={18} stroke="#E87D1F" />
      <span class="text-[13px] text-gray-500">Pending</span>
      <span class="text-[15px] font-bold text-amber-600">{pendingCount}</span>
    </div>
    {#if canDelete}
      <button
        onclick={() => (showBulkUploadModal = true)}
        class="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow flex items-center gap-3 text-[#0B182A] cursor-pointer hover:border-[#0B182A] transition-colors"
      >
        <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="text-[13px] font-semibold">Bulk Upload</span>
      </button>
      <button
        onclick={() => (showAddEngineerModal = true)}
        class="bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-xl px-5 py-3 shadow flex items-center gap-3 text-white cursor-pointer hover:opacity-95 transition-opacity"
      >
        <Icons.Plus size={18} stroke="currentColor" />
        <span class="text-[13px] font-semibold">Add Engineer</span>
      </button>
    {/if}
  </div>

  <!-- Filter Bar -->
  <div class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow">
    <div class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-100">
      <Icons.Search size={16} stroke="#9ca3af" />
      <input
        type="text"
        placeholder="Search"
        bind:value={searchQuery}
        class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
      />
    </div>

    <!-- Status filter -->
    <div class="relative" data-status-drop>
      <button
        onclick={() => { showStatusDrop = !showStatusDrop; showStateDrop = false; }}
        class="flex items-center gap-1.5 p-3 border rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer transition-colors duration-150
               {filterStatus !== 'all' ? 'border-[#0B182A] text-[#0B182A]' : 'border-gray-200 hover:border-[#0B182A]'}"
      >
        <Icons.Circle size={14} />
        {filterStatus === "all" ? "Status" : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
        <Icons.ChevronDown size={12} />
      </button>
      {#if showStatusDrop}
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-36 py-1">
          {#each [
            { value: "all",      label: "All" },
            { value: "approved", label: "Approved" },
            { value: "pending",  label: "Pending" },
            { value: "rejected", label: "Rejected" },
            { value: "reupload", label: "Reupload" },
          ] as opt}
            <button
              onclick={() => { filterStatus = opt.value; showStatusDrop = false; }}
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors
                     {filterStatus === opt.value ? 'text-[#0B182A] font-semibold' : 'text-gray-600'}"
            >{opt.label}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- State filter -->
    <div class="relative" data-state-drop>
      <button
        onclick={() => { showStateDrop = !showStateDrop; showStatusDrop = false; }}
        class="flex items-center gap-1.5 p-3 border rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer transition-colors duration-150
               {filterState !== 'all' ? 'border-[#0B182A] text-[#0B182A]' : 'border-gray-200 hover:border-[#0B182A]'}"
      >
        <Icons.MapPin size={14} />
        {filterState === "all" ? "State" : filterState}
        <Icons.ChevronDown size={12} />
      </button>
      {#if showStateDrop}
        <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-40 max-h-56 overflow-y-auto py-1">
          <button
            onclick={() => { filterState = "all"; showStateDrop = false; }}
            class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors
                   {filterState === 'all' ? 'text-[#0B182A] font-semibold' : 'text-gray-600'}"
          >All States</button>
          {#each uniqueStates as s}
            <button
              onclick={() => { filterState = s; showStateDrop = false; }}
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors
                     {filterState === s ? 'text-[#0B182A] font-semibold' : 'text-gray-600'}"
            >{s}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Engineer Cards Grid -->
  {#if loading}
    <div class="text-center py-16 text-[13px] text-gray-400">Loading…</div>
  {:else if filteredEngineers().length === 0}
    <div class="text-center py-16 text-[13px] text-gray-400">
      {engineers.length === 0 ? "No engineers yet" : "No engineers match your search"}
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {#each pagedEngineers() as eng}
        <div class="bg-white rounded-2xl p-5 border border-gray-200 hover:shadow-md transition-shadow duration-200">
          <!-- Card Header -->
          <div class="flex justify-between items-start mb-3">
            <div class="flex flex-col">
              <h4 class="text-[15px] font-semibold text-[#0B182A]">{eng.userName ?? "—"}</h4>
              <p class="text-[12px] text-[#E87D1F] font-medium mt-px">{eng.referenceId ?? eng.id}</p>
            </div>
            <div class="flex items-center gap-1 flex-wrap justify-end">
              {#if eng.accountStatus === "suspended"}
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Suspended</span>
              {/if}
              <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusStyle(eng.documentsStatus)}">
                {eng.documentsStatus}
              </span>
              <button
                aria-label="View engineer"
                onclick={() => openView(eng)}
                class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors cursor-pointer"
              ><Icons.Eye size={14} /></button>
              <button
                aria-label="Edit engineer"
                onclick={() => openEdit(eng)}
                class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors cursor-pointer"
              ><Icons.Edit size={14} /></button>
              {#if eng.documentsStatus === "approved" && eng.accountStatus !== "suspended"}
                <button
                  aria-label="Suspend engineer"
                  onclick={() => promptSuspend(eng)}
                  title="Suspend account"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                </button>
              {/if}
              {#if eng.accountStatus === "suspended"}
                <button
                  aria-label="Unsuspend engineer"
                  onclick={() => promptUnsuspend(eng)}
                  title="Unsuspend account"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </button>
              {/if}
              {#if canDelete}
                <button
                  aria-label="Delete engineer"
                  onclick={() => (deleteTarget = eng)}
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                ><Icons.Trash size={14} /></button>
              {/if}
            </div>
          </div>

          <!-- Details -->
          <div class="flex flex-col gap-1.5 mb-4">
            <span class="flex items-center gap-1.5 text-[12px] text-gray-500">
              <Icons.MapPin size={12} stroke="#9ca3af" />
              {location(eng)}
            </span>
          </div>

          <!-- Footer: review / upload docs or meta info -->
          <div class="pt-3.5 border-t border-gray-100">
            {#if eng.documentsStatus === "pending" && hasDocuments(eng)}
              <button
                onclick={() => (reviewEng = eng)}
                class="w-full py-2 text-[12px] font-semibold rounded-lg bg-[#0B182A] text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                Review Documents
              </button>
            {:else if eng.documentsStatus === "pending" && !hasDocuments(eng)}
              <button
                onclick={() => (uploadDocsEngineer = eng)}
                class="w-full py-2 text-[12px] font-semibold rounded-lg border-2 border-[#0B182A] text-[#0B182A] hover:bg-[#0B182A] hover:text-white transition-colors cursor-pointer"
              >
                Upload Documents
              </button>
            {:else}
              <div class="flex items-center justify-between text-[12px] text-gray-400">
                <span>{eng.addressState ?? "—"}</span>
                <span class="text-gray-300">{eng.createdAt ? new Date(eng.createdAt).toLocaleDateString() : ""}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Footer / Pagination -->
  <div class="bg-white rounded-xl px-6 py-4 shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
    <span class="text-[13px] text-gray-500">
      {#if totalFiltered === 0}
        No engineers to show
      {:else}
        Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalFiltered)}</strong> of {totalFiltered} engineers
      {/if}
    </span>
    {#if totalPages > 1}
      <div class="flex items-center gap-1">
        <button
          disabled={currentPage === 1}
          onclick={() => currentPage--}
          class="px-3 py-1.5 text-[12px] rounded-md border transition-colors bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A]
                 {currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
        >← Prev</button>
        {#each pageNumbers() as page}
          {#if page === "..."}
            <span class="px-2 py-1.5 text-[12px] text-gray-400">…</span>
          {:else}
            <button
              onclick={() => { currentPage = page as number; }}
              class="px-3 py-1.5 text-[12px] rounded-md border transition-colors cursor-pointer
                     {page === currentPage ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A]'}"
            >{page}</button>
          {/if}
        {/each}
        <button
          disabled={currentPage === totalPages}
          onclick={() => currentPage++}
          class="px-3 py-1.5 text-[12px] rounded-md border transition-colors bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A]
                 {currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"
        >Next →</button>
      </div>
    {/if}
  </div>
</div>

{#if reviewEng}
  {@const eng = reviewEng}
  <EngineerDocumentsModal
    {eng}
    onApprove={() => promptApprove(eng)}
    onReject={() => promptReject(eng)}
    onClose={() => (reviewEng = null)}
  />
{/if}

{#if confirmModal}
  <ConfirmModal
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel={confirmModal.confirmLabel}
    confirmClass={confirmModal.confirmClass}
    onConfirm={handleConfirm}
    onCancel={() => (confirmModal = null)}
  />
{/if}

{#if showAddEngineerModal}
  <AdminAddEngineerModal onClose={() => (showAddEngineerModal = false)} />
{/if}

{#if showBulkUploadModal}
  <BulkUploadEngineersModal onClose={() => (showBulkUploadModal = false)} />
{/if}

{#if viewEngineer}
  <EngineerView
    engineer={viewEngineer}
    onClose={() => (viewEngineer = null)}
    onEdit={() => openEdit(viewEngineer!)}
  />
{/if}

{#if editEngineer}
  <EngineerForm
    data={editEngineer}
    onSave={handleSave}
    onClose={() => (editEngineer = null)}
  />
{/if}

{#if uploadDocsEngineer}
  {@const eng = uploadDocsEngineer}
  <AdminUploadDocumentsModal
    engineerId={eng.id}
    engineerName={eng.userName ?? eng.referenceId ?? eng.id}
    referenceId={eng.referenceId ?? eng.id}
    onClose={() => (uploadDocsEngineer = null)}
  />
{/if}

{#if deleteTarget}
  <ConfirmModal
    title="Delete Engineer"
    message="Delete {deleteTarget.userName ?? deleteTarget.referenceId ?? deleteTarget.id}? This cannot be undone."
    confirmLabel={deleting ? "Deleting…" : "Delete"}
    confirmClass="bg-red-600 text-white hover:bg-red-700"
    onConfirm={confirmDelete}
    onCancel={() => (deleteTarget = null)}
  />
{/if}

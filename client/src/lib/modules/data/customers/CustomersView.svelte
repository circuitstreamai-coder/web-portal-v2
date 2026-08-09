<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import CustomerForm from "./CustomerForm.svelte";
  import CustomerView from "./CustomerView.svelte";
  import { fetchCustomers, type Customer } from "./queries";
  import {
    createCustomer,
    updateCustomer,
    updateCustomerStatus,
    deleteCustomer,
  } from "./actions";
  import { toast } from "svelte-sonner";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import MaskedContact from "$lib/components/MaskedContact.svelte";

  interface Props {
    canDelete?: boolean;
  }

  let { canDelete = true }: Props = $props();

  let customers = $state<Customer[]>([]);
  let loading = $state(true);

  // ── Derived stat values ─────────────────────────────────────────────────────
  const totalCustomers = $derived(customers.length);
  const activeCustomers = $derived(
    customers.filter((c) => c.status === "active").length,
  );
  const pendingCustomers = $derived(
    customers.filter((c) => c.status === "pending").length,
  );

  const statCards = $derived([
    {
      label: "Total Customers",
      value: String(totalCustomers),
      icon: "users",
      color: "#0B182A",
    },
    {
      label: "Active Customers",
      value: String(activeCustomers),
      icon: "active",
      color: "#22c55e",
    },
    {
      label: "Pending Approval",
      value: String(pendingCustomers),
      icon: "inactive",
      color: "#E87D1F",
    },
    { label: "Open Tickets", value: "—", icon: "tickets", color: "#6366f1" },
  ]);

  onMount(async () => {
    try {
      customers = await fetchCustomers();
    } catch (err) {
      toast.error("Failed to load customers");
    } finally {
      loading = false;
    }
  });

  // ── Search & filters ────────────────────────────────────────────────────────
  let searchQuery = $state("");
  let filterStatus = $state<string>("all");
  let filterState = $state<string>("all");
  let showStatusDrop = $state(false);
  let showStateDrop = $state(false);

  const uniqueStates = $derived(
    [
      ...new Set(
        customers.map((c) => c.addressState).filter(Boolean) as string[],
      ),
    ].sort(),
  );

  const filteredCustomers = $derived(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterState !== "all" && c.addressState !== filterState) return false;
      if (q) {
        return (
          c.companyName.toLowerCase().includes(q) ||
          c.contactPersonName.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.addressState ?? "").toLowerCase().includes(q) ||
          (c.addressCity ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────────────
  const PAGE_SIZE = 10;
  let currentPage = $state(1);

  $effect(() => {
    searchQuery;
    filterStatus;
    filterState;
    currentPage = 1;
  });

  const totalFiltered = $derived(filteredCustomers().length);
  const totalPages = $derived(
    Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE)),
  );

  const pagedCustomers = $derived(() => {
    const all = filteredCustomers();
    const start = (currentPage - 1) * PAGE_SIZE;
    return all.slice(start, start + PAGE_SIZE);
  });

  const pageNumbers = $derived(() => {
    const total = totalPages;
    const curr = currentPage;
    if (total <= 7)
      return Array.from({ length: total }, (_, i) => i + 1) as (
        | number
        | "..."
      )[];
    const pages: (number | "...")[] = [1];
    if (curr > 3) pages.push("...");
    for (let i = Math.max(2, curr - 1); i <= Math.min(total - 1, curr + 1); i++)
      pages.push(i);
    if (curr < total - 2) pages.push("...");
    if (total > 1) pages.push(total);
    return pages;
  });

  // ── Column visibility ───────────────────────────────────────────────────────
  const ALL_COLUMNS = [
    { key: "company", label: "Company" },
    { key: "contact", label: "Contact Person" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Actions" },
  ] as const;

  type ColKey = (typeof ALL_COLUMNS)[number]["key"];

  const PRIVATE_COLS = new Set<ColKey>(["email", "phone"]);

  let visibleCols = $state<Set<ColKey>>(
    new Set(ALL_COLUMNS.map((c) => c.key).filter((k) => !PRIVATE_COLS.has(k as ColKey))),
  );
  let showColsDrop = $state(false);

  function toggleCol(key: ColKey) {
    const next = new Set(visibleCols);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    visibleCols = next;
  }

  // ── CSV Export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const cols = ALL_COLUMNS.filter(
      (c) => visibleCols.has(c.key) && c.key !== "actions",
    );
    const header = cols.map((c) => c.label).join(",");

    const rows = filteredCustomers().map((c) => {
      return cols
        .map((col) => {
          let val = "";
          if (col.key === "company") val = c.companyName;
          if (col.key === "contact") val = c.contactPersonName;
          if (col.key === "email") val = c.email ?? "";
          if (col.key === "phone") val = c.phone ?? "";
          if (col.key === "location")
            val = [c.addressCity, c.addressState, c.addressPincode]
              .filter(Boolean)
              .join(", ");
          if (col.key === "status")
            val = c.status === "pending" ? "Pending" : c.status;
          val = val.replace(/"/g, '""');
          if (val.includes(",") || val.includes('"') || val.includes("\n"))
            val = `"${val}"`;
          return val;
        })
        .join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  }

  // ── Per-row action loading states ───────────────────────────────────────────
  let actionLoadingId = $state<string | null>(null);

  // ── Confirmation modal ──────────────────────────────────────────────────────
  let confirmModal = $state<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
    action: () => Promise<void>;
  } | null>(null);

  function promptApprove(customer: Customer) {
    confirmModal = {
      title: "Approve Customer",
      message: `Approve ${customer.companyName}? Login credentials will be sent to their email.`,
      confirmLabel: "Approve",
      confirmClass: "bg-green-600 text-white hover:bg-green-700",
      action: async () => {
        actionLoadingId = customer.id;
        try {
          const updated = await updateCustomerStatus({
            id: customer.id,
            status: "active",
            approvedBy: "admin",
          });
          customers = customers.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c,
          );
          toast.success(`${customer.companyName} approved — credentials sent`);
        } finally {
          actionLoadingId = null;
        }
      },
    };
  }

  function promptReject(customer: Customer) {
    confirmModal = {
      title: "Reject Customer",
      message: `Reject ${customer.companyName}? This cannot be undone.`,
      confirmLabel: "Reject",
      confirmClass: "bg-red-500 text-white hover:bg-red-600",
      action: async () => {
        actionLoadingId = customer.id;
        try {
          const updated = await updateCustomerStatus({
            id: customer.id,
            status: "rejected",
          });
          customers = customers.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c,
          );
          toast.success(`${customer.companyName} rejected`);
        } finally {
          actionLoadingId = null;
        }
      },
    };
  }

  function promptDeactivate(customer: Customer) {
    confirmModal = {
      title: "Deactivate Customer",
      message: `Deactivate ${customer.companyName}? They will lose portal access until reactivated.`,
      confirmLabel: "Deactivate",
      confirmClass: "bg-amber-600 text-white hover:bg-amber-700",
      action: async () => {
        actionLoadingId = customer.id;
        try {
          const updated = await updateCustomerStatus({
            id: customer.id,
            status: "inactive",
          });
          customers = customers.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c,
          );
          toast.success(`${customer.companyName} deactivated`);
        } finally {
          actionLoadingId = null;
        }
      },
    };
  }

  function promptReactivate(customer: Customer) {
    confirmModal = {
      title: "Reactivate Customer",
      message: `Reactivate ${customer.companyName}? They will regain portal access.`,
      confirmLabel: "Reactivate",
      confirmClass: "bg-green-600 text-white hover:bg-green-700",
      action: async () => {
        actionLoadingId = customer.id;
        try {
          const updated = await updateCustomerStatus({
            id: customer.id,
            status: "active",
            approvedBy: "admin",
          });
          customers = customers.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c,
          );
          toast.success(`${customer.companyName} reactivated`);
        } finally {
          actionLoadingId = null;
        }
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

  function statusStyle(status: string) {
    if (status === "active")   return "bg-green-50 text-green-600";
    if (status === "pending")  return "bg-amber-50 text-amber-600";
    if (status === "rejected") return "bg-red-50 text-red-500";
    if (status === "inactive") return "bg-gray-100 text-gray-500";
    return "bg-gray-100 text-gray-500";
  }

  // ── Form (add / edit) ───────────────────────────────────────────────────────
  let showForm = $state(false);
  let formMode = $state<"add" | "edit">("add");
  let editData = $state<Customer | null>(null);

  // ── View modal ──────────────────────────────────────────────────────────────
  let viewCustomer = $state<Customer | null>(null);

  // ── Delete ──────────────────────────────────────────────────────────────────
  let deleteTarget = $state<Customer | null>(null);
  let deleting = $state(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await deleteCustomer(deleteTarget.id);
      customers = customers.filter((c) => c.id !== deleteTarget!.id);
      toast.success("Customer deleted");
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

  function openEdit(c: Customer) {
    viewCustomer = null;
    formMode = "edit";
    editData = c;
    showForm = true;
  }

  function openView(c: Customer) {
    viewCustomer = c;
  }

  async function handleSave(form: Record<string, string>) {
    if (formMode === "add") {
      try {
        const created = await createCustomer({
          companyName: form.company,
          contactPersonName: form.contact,
          email: form.email || undefined,
          phone: form.phone,
          addressState: form.addressState || undefined,
          addressCity: form.addressCity || undefined,
          addressPincode: form.addressPincode || undefined,
          author: "admin",
        });
        customers = [...customers, created];
        toast.success("Customer created successfully");
        showForm = false;
      } catch (err) {
        toast.error(`Failed to create customer: ${(err as Error).message}`);
        throw err; // re-throw so form keeps saving=true guard
      }
    } else if (editData) {
      try {
        const updated = await updateCustomer({
          id: editData.id,
          companyName: form.company,
          contactPersonName: form.contact,
          email: form.email || undefined,
          phone: form.phone,
          addressState: form.addressState || undefined,
          addressCity: form.addressCity || undefined,
          addressPincode: form.addressPincode || undefined,
          secondaryContactName: form.secondaryContactName || undefined,
          secondaryContactEmail: form.secondaryContactEmail || undefined,
          secondaryContactPhone: form.secondaryContactPhone || undefined,
        });
        customers = customers.map((c) =>
          c.id === updated.id ? { ...c, ...updated } : c,
        );
        toast.success("Customer updated successfully");
        showForm = false;
      } catch (err) {
        toast.error(`Failed to update customer: ${(err as Error).message}`);
        throw err;
      }
    }
  }
</script>

<!-- Close dropdowns when clicking outside -->
<svelte:window
  onclick={(e) => {
    const t = e.target as HTMLElement;
    if (!t.closest("[data-status-drop]")) showStatusDrop = false;
    if (!t.closest("[data-state-drop]")) showStateDrop = false;
    if (!t.closest("[data-cols-drop]")) showColsDrop = false;
  }}
/>

<div class="flex flex-col gap-5" data-can-delete={canDelete}>
  <!-- Stat Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
    {#if loading}
      {#each [1, 2, 3, 4] as _}
        <div
          class="bg-white rounded-2xl shadow border border-amber-50 relative overflow-hidden flex items-center gap-4 px-4 py-3.5 md:flex-col md:items-start md:gap-1 md:p-5"
        >
          <div
            class="absolute top-0 left-0 bottom-0 w-1 md:hidden skeleton-bar"
          ></div>
          <div class="w-10 h-10 rounded-xl skeleton shrink-0"></div>
          <div class="flex-1 min-w-0 md:flex-none flex flex-col gap-2">
            <div class="skeleton h-6 w-14 rounded"></div>
            <div class="skeleton h-3 w-28 rounded"></div>
          </div>
        </div>
      {/each}
    {:else}
      {#each statCards as stat}
        <div
          class="bg-white rounded-2xl shadow border border-amber-50 relative overflow-hidden
                    flex items-center gap-4 px-4 py-3.5
                    md:flex-col md:items-start md:gap-1 md:p-5"
        >
          <div
            class="absolute top-0 left-0 bottom-0 w-1 md:hidden"
            style="background-color: {stat.color};"
          ></div>
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 md:mb-1"
            style="background-color: {stat.color}15;"
          >
            {#if stat.icon === "users"}
              <Icons.Users size={20} stroke={stat.color} />
            {:else if stat.icon === "active"}
              <Icons.UserCheck size={20} stroke={stat.color} />
            {:else if stat.icon === "inactive"}
              <Icons.UserX size={20} stroke={stat.color} />
            {:else}
              <Icons.TicketCard size={20} stroke={stat.color} />
            {/if}
          </div>
          <div class="flex-1 min-w-0 md:flex-none">
            <div
              class="text-[21px] md:text-[22px] font-bold text-[#0B182A] leading-tight"
            >
              {stat.value}
            </div>
            <div class="text-[12px] md:text-[13px] text-gray-400">
              {stat.label}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Filter Bar -->
  <div
    class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow"
  >
    <!-- Search -->
    <div
      class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-125 focus-within:border-[#0B182A] focus-within:ring-2 focus-within:ring-[#0B182A]/10 transition-all"
    >
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
        onclick={() => {
          showStatusDrop = !showStatusDrop;
          showStateDrop = false;
        }}
        class="flex items-center gap-1.5 p-3 border rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer transition-all active:scale-95
               {filterStatus !== 'all'
          ? 'border-[#0B182A] text-[#0B182A]'
          : 'border-gray-200 hover:border-[#0B182A]'}"
      >
        <Icons.Circle size={14} />
        {filterStatus === "all"
          ? "Status"
          : filterStatus === "pending"
            ? "Pending"
            : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
        <Icons.ChevronDown size={12} />
      </button>
      {#if showStatusDrop}
        <div
          class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-36 py-1"
        >
          {#each [{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "pending", label: "Pending" }, { value: "inactive", label: "Inactive" }, { value: "rejected", label: "Rejected" }] as opt}
            <button
              onclick={() => {
                filterStatus = opt.value;
                showStatusDrop = false;
              }}
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer
                     {filterStatus === opt.value
                ? 'text-[#0B182A] font-semibold'
                : 'text-gray-600'}">{opt.label}</button
            >
          {/each}
        </div>
      {/if}
    </div>

    <!-- State filter -->
    <div class="relative" data-state-drop>
      <button
        onclick={() => {
          showStateDrop = !showStateDrop;
          showStatusDrop = false;
        }}
        class="flex items-center gap-1.5 p-3 border rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer transition-all active:scale-95
               {filterState !== 'all'
          ? 'border-[#0B182A] text-[#0B182A]'
          : 'border-gray-200 hover:border-[#0B182A]'}"
      >
        <Icons.MapPin size={14} />
        {filterState === "all" ? "State" : filterState}
        <Icons.ChevronDown size={12} />
      </button>
      {#if showStateDrop}
        <div
          class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-40 max-h-56 overflow-y-auto py-1"
        >
          <button
            onclick={() => {
              filterState = "all";
              showStateDrop = false;
            }}
            class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer
                   {filterState === 'all'
              ? 'text-[#0B182A] font-semibold'
              : 'text-gray-600'}">All States</button
          >
          {#each uniqueStates as s}
            <button
              onclick={() => {
                filterState = s;
                showStateDrop = false;
              }}
              class="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer
                     {filterState === s
                ? 'text-[#0B182A] font-semibold'
                : 'text-gray-600'}">{s}</button
            >
          {/each}
        </div>
      {/if}
    </div>

    <button
      onclick={openAdd}
      class="flex items-center gap-1.5 p-3 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 active:scale-[0.97] text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-all ml-auto"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Add Customer
    </button>
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">All Customers</h3>
        {#if loading}
          <div class="skeleton h-5 w-16 rounded-full"></div>
        {:else}
          <span
            class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full"
            >{filteredCustomers().length} Total</span
          >
        {/if}
      </div>
      <div class="flex gap-2">
        <!-- Columns selector -->
        <div class="relative" data-cols-drop>
          <button
            onclick={() => {
              showColsDrop = !showColsDrop;
            }}
            class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] active:scale-95 transition-all"
          >
            <Icons.Grid size={14} />
            Columns
          </button>
          {#if showColsDrop}
            <div
              class="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-44 py-2 px-1"
            >
              <p
                class="text-[11px] text-gray-400 uppercase tracking-wide px-2 pb-1"
              >
                Toggle columns
              </p>
              {#each ALL_COLUMNS as col}
                <label
                  class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onchange={() => toggleCol(col.key)}
                    class="accent-[#0B182A] w-3.5 h-3.5 cursor-pointer"
                  />
                  <span class="text-[13px] text-gray-700 flex items-center gap-1.5">
                    {col.label}
                    {#if PRIVATE_COLS.has(col.key)}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    {/if}
                  </span>
                </label>
              {/each}
            </div>
          {/if}
        </div>

        <!-- CSV Export -->
        <button
          onclick={exportCSV}
          class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] active:scale-95 transition-all"
        >
          <Icons.Download size={14} />
          Export
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ALL_COLUMNS.filter((c) => visibleCols.has(c.key)) as col}
              <th
                class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap uppercase"
                >{col.label}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <!-- Skeleton rows -->
            {#each Array(6) as _}
              <tr class="border-b border-gray-50">
                {#if visibleCols.has("company")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-4 w-32 rounded"></div></td
                  >
                {/if}
                {#if visibleCols.has("contact")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-4 w-28 rounded"></div></td
                  >
                {/if}
                {#if visibleCols.has("email")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-4 w-40 rounded"></div></td
                  >
                {/if}
                {#if visibleCols.has("phone")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-4 w-24 rounded"></div></td
                  >
                {/if}
                {#if visibleCols.has("location")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-4 w-20 rounded"></div></td
                  >
                {/if}
                {#if visibleCols.has("status")}
                  <td class="py-3 px-3"
                    ><div class="skeleton h-5 w-16 rounded-full"></div></td
                  >
                {/if}
                {#if visibleCols.has("actions")}
                  <td class="py-3 px-3">
                    <div class="flex gap-1">
                      <div class="skeleton w-8 h-8 rounded-lg"></div>
                      <div class="skeleton w-8 h-8 rounded-lg"></div>
                    </div>
                  </td>
                {/if}
              </tr>
            {/each}
          {:else if filteredCustomers().length === 0}
            <tr
              ><td
                colspan={visibleCols.size}
                class="py-10 text-center text-[13px] text-gray-400"
              >
                {customers.length === 0
                  ? "No customers yet"
                  : "No customers match your search"}
              </td></tr
            >
          {:else}
            {#each pagedCustomers() as c}
              {@const isActioning = actionLoadingId === c.id}
              <tr
                class="border-b border-gray-50 hover:bg-gray-50/70 transition-colors {isActioning
                  ? 'opacity-60'
                  : ''}"
              >
                {#if visibleCols.has("company")}
                  <td class="py-3 px-3 text-[#E87D1F] font-medium text-[13px]"
                    >{c.companyName}</td
                  >
                {/if}
                {#if visibleCols.has("contact")}
                  <td class="py-3 px-3 text-[13px] text-gray-700"
                    >{c.contactPersonName}</td
                  >
                {/if}
                {#if visibleCols.has("email")}
                  <td class="py-3 px-3 text-[13px] text-gray-600">
                    <MaskedContact value={c.email} type="email" />
                  </td>
                {/if}
                {#if visibleCols.has("phone")}
                  <td class="py-3 px-3 text-[13px] text-gray-600">
                    <MaskedContact value={c.phone} type="phone" />
                  </td>
                {/if}
                {#if visibleCols.has("location")}
                  <td class="py-3 px-3 text-[13px] text-gray-600"
                    >{c.addressState ?? "—"}</td
                  >
                {/if}
                {#if visibleCols.has("status")}
                  <td class="py-3 px-3">
                    <span
                      class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusStyle(
                        c.status,
                      )}"
                    >
                      {c.status === "pending" ? "Pending" : c.status}
                    </span>
                  </td>
                {/if}
                {#if visibleCols.has("actions")}
                  <td class="py-3 px-3">
                    <div class="flex gap-1">
                      {#if c.status === "pending"}
                        <button
                          aria-label="Approve customer"
                          onclick={() => promptApprove(c)}
                          disabled={isActioning}
                          class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-green-50 text-green-600 hover:bg-green-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {#if isActioning}
                            <span
                              class="inline-block w-3 h-3 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin"
                            ></span>
                          {:else}
                            Approve
                          {/if}
                        </button>
                        <button
                          aria-label="Reject customer"
                          onclick={() => promptReject(c)}
                          disabled={isActioning}
                          class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >Reject</button
                        >
                      {/if}
                      {#if c.status === "active"}
                        <button
                          aria-label="Deactivate customer"
                          onclick={() => promptDeactivate(c)}
                          disabled={isActioning}
                          class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >Deactivate</button
                        >
                      {/if}
                      {#if c.status === "inactive"}
                        <button
                          aria-label="Reactivate customer"
                          onclick={() => promptReactivate(c)}
                          disabled={isActioning}
                          class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-green-50 text-green-600 hover:bg-green-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >Reactivate</button
                        >
                      {/if}
                      <button
                        aria-label="View customer"
                        onclick={() => openView(c)}
                        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
                      >
                        <Icons.Eye size={16} />
                      </button>
                      <button
                        aria-label="Edit customer"
                        onclick={() => openEdit(c)}
                        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
                      >
                        <Icons.Edit size={16} />
                      </button>
                      {#if canDelete}
                        <button
                          aria-label="Delete customer"
                          onclick={() => (deleteTarget = c)}
                          class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all cursor-pointer"
                        >
                          <Icons.Trash size={16} />
                        </button>
                      {/if}
                    </div>
                  </td>
                {/if}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-gray-100 mt-2 gap-3"
    >
      <span class="text-[13px] text-gray-500">
        {#if loading}
          <div class="skeleton h-4 w-48 rounded"></div>
        {:else if totalFiltered === 0}
          No customers to show
        {:else}
          Showing <strong
            >{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(
              currentPage * PAGE_SIZE,
              totalFiltered,
            )}</strong
          >
          of {totalFiltered} Customers
        {/if}
      </span>
      {#if !loading && totalPages > 1}
        <div class="flex items-center gap-1">
          <button
            disabled={currentPage === 1}
            onclick={() => currentPage--}
            class="px-3 py-1.5 text-[12px] rounded-md border transition-all bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A] active:scale-95
                   {currentPage === 1
              ? 'opacity-40 cursor-not-allowed'
              : 'cursor-pointer'}">← Prev</button
          >
          {#each pageNumbers() as page}
            {#if page === "..."}
              <span class="px-2 py-1.5 text-[12px] text-gray-400">…</span>
            {:else}
              <button
                onclick={() => {
                  currentPage = page as number;
                }}
                class="px-3 py-1.5 text-[12px] rounded-md border transition-all cursor-pointer active:scale-95
                       {page === currentPage
                  ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A]'}"
                >{page}</button
              >
            {/if}
          {/each}
          <button
            disabled={currentPage === totalPages}
            onclick={() => currentPage++}
            class="px-3 py-1.5 text-[12px] rounded-md border transition-all bg-white text-gray-500 border-gray-200 hover:border-[#0B182A] hover:text-[#0B182A] active:scale-95
                   {currentPage === totalPages
              ? 'opacity-40 cursor-not-allowed'
              : 'cursor-pointer'}">Next →</button
          >
        </div>
      {/if}
    </div>
  </div>
</div>

{#if viewCustomer}
  <CustomerView
    customer={viewCustomer}
    onClose={() => (viewCustomer = null)}
    onEdit={() => openEdit(viewCustomer!)}
  />
{/if}

{#if showForm}
  <CustomerForm
    mode={formMode}
    data={editData}
    onSave={handleSave}
    onClose={() => (showForm = false)}
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

{#if deleteTarget}
  <ConfirmModal
    title="Delete Customer"
    message="Delete {deleteTarget.companyName}? This cannot be undone."
    confirmLabel={deleting ? "Deleting…" : "Delete"}
    confirmClass="bg-red-600 text-white hover:bg-red-700"
    onConfirm={confirmDelete}
    onCancel={() => (deleteTarget = null)}
  />
{/if}

<style>
  .skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  .skeleton-bar {
    background: linear-gradient(90deg, #e0e0e0 25%, #d0d0d0 50%, #e0e0e0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>

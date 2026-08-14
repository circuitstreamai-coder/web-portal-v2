<script lang="ts">
  import { restRequest } from "$lib/api/rest";
  import { queryVersion } from "$lib/stores/query";
  import { toast } from "svelte-sonner";
  import * as Icons from "$lib/icons";
  import InventoryForm from "./InventoryForm.svelte";
  import AddStockForm from "./AddStockForm.svelte";
  import { createInventoryItem, updateInventoryItem, type InventoryItem } from "./actions";
  import Pagination from "$lib/components/Pagination.svelte";
  import type { ItemStatus, AssetType } from "./actions";

  let items = $state<InventoryItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state("");
  let filterStatus = $state<ItemStatus | "">("");
  let filterType = $state<AssetType | "">("");

  const PAGE_SIZE = 15;
  let currentPage = $state(1);

  $effect(() => { searchQuery; filterStatus; filterType; currentPage = 1; });

  const filteredItems = $derived(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((i) => {
      const matchSearch = !q ||
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? "").toLowerCase().includes(q) ||
        (i.location ?? "").toLowerCase().includes(q) ||
        (i.serialNumber ?? "").toLowerCase().includes(q);
      const matchStatus = !filterStatus || i.status === filterStatus;
      const matchType = !filterType || i.assetType === filterType;
      return matchSearch && matchStatus && matchType;
    });
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filteredItems().length / PAGE_SIZE)));
  const pagedItems = $derived(filteredItems().slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  async function fetchInventory() {
    loading = true;
    error = null;
    try {
      items = await restRequest<InventoryItem[]>("/api/inventory");
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    $queryVersion.inventory;
    fetchInventory();
  });

  let showForm = $state(false);
  let formMode = $state<"add" | "edit">("add");
  let editData = $state<InventoryItem | null>(null);
  let saving = $state(false);
  let stockItem = $state<InventoryItem | null>(null);
  let locationItem = $state<InventoryItem | null>(null);

  function openAdd() {
    formMode = "add";
    editData = null;
    showForm = true;
  }

  function openEdit(item: InventoryItem) {
    formMode = "edit";
    editData = { ...item };
    showForm = true;
  }

  function exportCSV() {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Type", "SKU", "Status", "Quantity", "Owner", "Location", "Serial Number", "Expiry"];
    const rows = filteredItems().map((item) => [
      item.name,
      TYPE_LABEL[item.assetType] ?? item.assetType,
      item.sku,
      STATUS_LABEL[item.status] ?? item.status,
      item.quantity,
      item.ownershipType === "customer" ? "Customer" : "Innoserve",
      item.location,
      item.serialNumber,
      item.expiryDate ?? item.warrantyExpiry,
    ].map(escape).join(","));
    const blob = new Blob([[header.map(escape).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inventory.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(form: Record<string, unknown>) {
    saving = true;
    try {
      if (formMode === "add") {
        await createInventoryItem({
          name: form.name as string,
          sku: form.sku as string,
          quantity: form.quantity as number,
          location: form.location as string,
          assetType: form.assetType as any,
          serialNumber: form.serialNumber as string,
          purchaseDate: form.purchaseDate as string,
          warrantyExpiry: form.warrantyExpiry as string,
          expiryDate: form.expiryDate as string,
          ownershipType: form.ownershipType as any,
          customerId: form.customerId as string,
        });
        toast.success("Item added");
      } else if (editData) {
        await updateInventoryItem({
          id: editData.id,
          name: form.name as string,
          sku: form.sku as string,
          location: form.location as string,
          assetType: form.assetType as any,
          serialNumber: form.serialNumber as string,
          purchaseDate: form.purchaseDate as string,
          warrantyExpiry: form.warrantyExpiry as string,
          expiryDate: form.expiryDate as string,
          ownershipType: form.ownershipType as any,
          customerId: form.customerId as string,
          status: form.status as any,
        });
        toast.success("Item updated");
      }
      showForm = false;
    } catch (e) {
      toast.error((e as Error).message ?? "Something went wrong");
    } finally {
      saving = false;
    }
  }

  // ── Formatting helpers ────────────────────────────────────────────────────

  const STATUS_LABEL: Record<string, string> = {
    available: "Available",
    in_use: "In Use",
    under_maintenance: "Maintenance",
    retired: "Retired",
    replaced: "Replaced",
    deployed_externally: "Deployed",
  };

  const STATUS_CLASS: Record<string, string> = {
    available: "bg-green-100 text-green-700",
    in_use: "bg-blue-100 text-blue-700",
    under_maintenance: "bg-yellow-100 text-yellow-700",
    retired: "bg-gray-100 text-gray-500",
    replaced: "bg-purple-100 text-purple-700",
    deployed_externally: "bg-orange-100 text-orange-700",
  };

  const TYPE_LABEL: Record<string, string> = {
    hardware: "Hardware",
    software_license: "SW License",
    network_equipment: "Network",
    tool: "Tool",
    other: "Other",
  };

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function isExpiringSoon(d: string | null) {
    if (!d) return false;
    const diff = new Date(d).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  function isExpired(d: string | null) {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  }
</script>

<div class="flex flex-col gap-5">
  <!-- Filter Bar -->
  <div class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow">
    <div class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-80">
      <Icons.Search size={16} stroke="#9ca3af" />
      <input
        type="text"
        placeholder="Search name, SKU, serial, location…"
        bind:value={searchQuery}
        class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
      />
    </div>

    <select
      bind:value={filterType}
      class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none"
    >
      <option value="">All Types</option>
      <option value="hardware">Hardware</option>
      <option value="software_license">SW License</option>
      <option value="network_equipment">Network</option>
      <option value="tool">Tool</option>
      <option value="other">Other</option>
    </select>

    <select
      bind:value={filterStatus}
      class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none"
    >
      <option value="">All Statuses</option>
      <option value="available">Available</option>
      <option value="in_use">In Use</option>
      <option value="under_maintenance">Maintenance</option>
      <option value="deployed_externally">Deployed</option>
      <option value="retired">Retired</option>
      <option value="replaced">Replaced</option>
    </select>

    <button
      onclick={openAdd}
      class="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-[#E87D1F] hover:bg-[#E87D1F]/90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-colors duration-150"
    >
      <Icons.Plus size={14} strokeWidth={2.5} />
      Add Item
    </button>
  </div>

  <!-- Table Card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-[18px] font-semibold text-[#0B182A]">All Inventory</h3>
        {#if !loading}
          <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{filteredItems().length} Total</span>
        {/if}
      </div>
      <button onclick={exportCSV} class="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] text-gray-600 bg-white cursor-pointer hover:border-[#0B182A] transition-colors duration-150">
        <Icons.Download size={14} />
        Export
      </button>
    </div>

    <div class="overflow-x-auto">
      {#if loading}
        <div class="flex items-center justify-center py-16 text-gray-400 text-[13px]">Loading…</div>
      {:else if error}
        <div class="flex items-center justify-center py-16 text-red-500 text-[13px]">{error}</div>
      {:else}
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ["NAME", "TYPE", "SKU", "STATUS", "QTY", "OWNER", "LOCATION", "EXPIRY", "ACTIONS"] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each pagedItems as item}
              {@const expiry = item.expiryDate ?? item.warrantyExpiry}
              <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="py-3 px-3 text-[13px] text-gray-700 font-medium max-w-40 truncate" title={item.name}>{item.name}</td>
                <td class="py-3 px-3 text-[13px] text-gray-500">{TYPE_LABEL[item.assetType] ?? item.assetType}</td>
                <td class="py-3 px-3 text-[13px] text-[#E87D1F] font-medium">{item.sku ?? "—"}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full {STATUS_CLASS[item.status] ?? 'bg-gray-100 text-gray-500'}">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{item.quantity}</td>
                <td class="py-3 px-3 text-[13px] text-gray-500">
                  {item.ownershipType === "customer" ? "Customer" : "Innoserve"}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 max-w-30">
                  {#if item.location}
                    <button
                      type="button"
                      onclick={() => (locationItem = item)}
                      class="max-w-30 truncate text-left text-[#0B5EA8] hover:text-[#E87D1F] hover:underline cursor-pointer"
                      title="View complete location"
                    >{item.location}</button>
                  {:else}
                    —
                  {/if}
                </td>
                <td class="py-3 px-3 text-[13px]">
                  {#if expiry}
                    <span class="{isExpired(expiry) ? 'text-red-600 font-semibold' : isExpiringSoon(expiry) ? 'text-yellow-600 font-semibold' : 'text-gray-500'}">
                      {formatDate(expiry)}
                    </span>
                  {:else}
                    <span class="text-gray-300">—</span>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  <div class="flex gap-1">
                    <button
                      aria-label="Add stock"
                      onclick={() => (stockItem = item)}
                      class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#0B182A] bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <Icons.Plus size={13} strokeWidth={2.5} />
                      Stock
                    </button>
                    <button
                      aria-label="Edit item"
                      onclick={() => openEdit(item)}
                      class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
                    >
                      <Icons.Edit size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        {#if filteredItems().length === 0}
          <div class="flex items-center justify-center py-16 text-gray-400 text-[13px]">
            {items.length === 0 ? "No inventory items found." : "No items match your search."}
          </div>
        {/if}
      {/if}
    </div>

    {#if !error}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredItems().length}
        pageSize={PAGE_SIZE}
        itemLabel="items"
        loading={loading}
        onchange={(p) => (currentPage = p)}
      />
    {/if}
  </div>
</div>

{#if showForm}
  <InventoryForm
    mode={formMode}
    data={editData}
    {saving}
    onSave={handleSave}
    onClose={() => (showForm = false)}
  />
{/if}

{#if stockItem}
  <AddStockForm
    item={stockItem}
    onClose={() => (stockItem = null)}
  />
{/if}

{#if locationItem}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button type="button" class="absolute inset-0 bg-black/50" aria-label="Close location" onclick={() => (locationItem = null)}></button>
    <div class="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Inventory location details" tabindex="-1">
      <header class="flex items-start justify-between border-b border-gray-100 px-6 py-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wide text-[#E87D1F]">Inventory Location</p>
          <h2 class="mt-1 text-[17px] font-semibold text-[#0B182A]">{locationItem.name}</h2>
        </div>
        <button type="button" class="text-gray-400 hover:text-gray-700" aria-label="Close" onclick={() => (locationItem = null)}>✕</button>
      </header>
      <div class="space-y-4 px-6 py-5">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Complete address / location</p>
          <p class="mt-1 whitespace-pre-wrap text-[14px] leading-6 text-gray-800">{locationItem.location}</p>
        </div>
        <div class="grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4 text-[13px]">
          <div><span class="block text-gray-400">SKU</span><span class="font-medium text-gray-700">{locationItem.sku ?? "—"}</span></div>
          <div><span class="block text-gray-400">Serial number</span><span class="font-medium text-gray-700">{locationItem.serialNumber ?? "—"}</span></div>
          <div><span class="block text-gray-400">Owner</span><span class="font-medium text-gray-700">{locationItem.ownershipType === "customer" ? "Customer" : "Innoserve"}</span></div>
          <div><span class="block text-gray-400">Available quantity</span><span class="font-medium text-gray-700">{locationItem.quantity}</span></div>
        </div>
      </div>
      <footer class="flex justify-end border-t border-gray-100 px-6 py-4">
        <button type="button" onclick={() => (locationItem = null)} class="rounded-lg bg-[#0B182A] px-5 py-2.5 text-[13px] font-semibold text-white">Close</button>
      </footer>
    </div>
  </div>
{/if}

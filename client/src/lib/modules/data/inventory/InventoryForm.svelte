<script lang="ts">
  import { untrack } from "svelte";
  import type { AssetType, OwnershipType, ItemStatus, InventoryItem } from "./actions";

  let {
    mode = "add",
    data = null,
    saving = false,
    onSave,
    onClose,
  }: {
    mode?: "add" | "edit";
    data?: InventoryItem | null;
    saving?: boolean;
    onSave: (form: Record<string, unknown>) => void;
    onClose: () => void;
  } = $props();

  let form = $state({
    name: untrack(() => data?.name ?? ""),
    sku: untrack(() => data?.sku ?? ""),
    quantity: untrack(() => String(data?.quantity ?? "")),
    location: untrack(() => data?.location ?? ""),
    assetType: untrack(() => data?.assetType ?? "hardware") as AssetType,
    serialNumber: untrack(() => data?.serialNumber ?? ""),
    purchaseDate: untrack(() => data?.purchaseDate?.slice(0, 10) ?? ""),
    warrantyExpiry: untrack(() => data?.warrantyExpiry?.slice(0, 10) ?? ""),
    expiryDate: untrack(() => data?.expiryDate?.slice(0, 10) ?? ""),
    ownershipType: untrack(() => data?.ownershipType ?? "innoserve") as OwnershipType,
    customerId: untrack(() => data?.customerId ?? ""),
    status: untrack(() => data?.status ?? "available") as ItemStatus,
  });

  let errors = $state<Record<string, string>>({});

  const ASSET_TYPE_OPTIONS: { value: AssetType; label: string }[] = [
    { value: "hardware", label: "Hardware" },
    { value: "software_license", label: "Software License" },
    { value: "network_equipment", label: "Network Equipment" },
    { value: "tool", label: "Tool" },
    { value: "other", label: "Other" },
  ];

  const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
    { value: "available", label: "Available" },
    { value: "in_use", label: "In Use" },
    { value: "under_maintenance", label: "Under Maintenance" },
    { value: "retired", label: "Retired" },
    { value: "replaced", label: "Replaced" },
    { value: "deployed_externally", label: "Deployed Externally" },
  ];

  function validate() {
    errors = {};
    if (!form.name.trim()) errors.name = "Item name is required";
    if (form.sku.trim() && !/^[A-Za-z0-9\-_]+$/.test(form.sku.trim())) {
      errors.sku = "SKU must contain only letters, numbers, hyphens or underscores";
    }
    if (mode === "add") {
      const qty = form.quantity.trim();
      if (!qty) errors.quantity = "Quantity is required";
      else if (!/^\d+$/.test(qty)) errors.quantity = "Quantity must be a whole number";
      else if (Number(qty) < 0) errors.quantity = "Quantity cannot be negative";
    }
    if (!form.location.trim()) errors.location = "Location is required";
    if (form.ownershipType === "customer" && !form.customerId.trim()) {
      errors.customerId = "Customer ID is required when ownership is Customer";
    }
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      sku: form.sku || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      location: form.location || undefined,
      assetType: form.assetType,
      serialNumber: form.serialNumber || undefined,
      purchaseDate: form.purchaseDate || undefined,
      warrantyExpiry: form.warrantyExpiry || undefined,
      expiryDate: form.expiryDate || undefined,
      ownershipType: form.ownershipType,
      customerId: form.ownershipType === "customer" ? form.customerId || undefined : undefined,
    };
    if (mode === "edit") {
      payload.status = form.status;
    }
    onSave(payload);
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={mode === "add" ? "Add Inventory Item" : "Edit Inventory Item"}
  >
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">
          {mode === "add" ? "Add Inventory Item" : "Edit Inventory Item"}
        </h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {mode === "add" ? "Add a new asset to the inventory" : "Update the asset details below"}
        </p>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <form class="px-6 py-5 flex flex-col gap-4 overflow-y-auto" onsubmit={handleSubmit}>
      <!-- Section: Basic Info -->
      <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide -mb-1">Basic Information</p>

      <label class={labelClass}>
        <span class={labelTextClass}>Item Name <span class="text-red-400">*</span></span>
        <input type="text" placeholder="e.g. Cisco Router" class="{fieldClass} {errors.name ? 'border-red-400' : ''}" bind:value={form.name} />
        {#if errors.name}<span class={errorClass}>{errors.name}</span>{/if}
      </label>

      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Asset Type <span class="text-red-400">*</span></span>
          <select class={fieldClass} bind:value={form.assetType}>
            {#each ASSET_TYPE_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>SKU</span>
          <input type="text" placeholder="e.g. SKU-001" class="{fieldClass} {errors.sku ? 'border-red-400' : ''}" bind:value={form.sku} />
          {#if errors.sku}<span class={errorClass}>{errors.sku}</span>{/if}
        </label>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Serial Number</span>
          <input type="text" placeholder="e.g. SN-20241001" class={fieldClass} bind:value={form.serialNumber} />
        </label>
        {#if mode === "add"}
          <label class={labelClass}>
            <span class={labelTextClass}>Quantity <span class="text-red-400">*</span></span>
            <input
              type="text"
              inputmode="numeric"
              placeholder="0"
              class="{fieldClass} {errors.quantity ? 'border-red-400' : ''}"
              bind:value={form.quantity}
              oninput={(e) => { const el = e.target as HTMLInputElement; el.value = el.value.replace(/\D/g, ""); form.quantity = el.value; }}
            />
            {#if errors.quantity}<span class={errorClass}>{errors.quantity}</span>{/if}
          </label>
        {/if}
      </div>

      <label class={labelClass}>
        <span class={labelTextClass}>Location <span class="text-red-400">*</span></span>
        <input type="text" placeholder="e.g. Kerala Warehouse" class="{fieldClass} {errors.location ? 'border-red-400' : ''}" bind:value={form.location} />
        {#if errors.location}<span class={errorClass}>{errors.location}</span>{/if}
      </label>

      <!-- Section: Ownership -->
      <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide -mb-1 mt-2 border-t border-gray-100 pt-4">Ownership</p>

      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Owned By <span class="text-red-400">*</span></span>
          <select class={fieldClass} bind:value={form.ownershipType}>
            <option value="innoserve">Innoserve</option>
            <option value="customer">Customer</option>
          </select>
        </label>
        {#if form.ownershipType === "customer"}
          <label class={labelClass}>
            <span class={labelTextClass}>Customer ID <span class="text-red-400">*</span></span>
            <input type="text" placeholder="Customer ID" class="{fieldClass} {errors.customerId ? 'border-red-400' : ''}" bind:value={form.customerId} />
            {#if errors.customerId}<span class={errorClass}>{errors.customerId}</span>{/if}
          </label>
        {/if}
      </div>

      <!-- Section: Dates & Expiry -->
      <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide -mb-1 mt-2 border-t border-gray-100 pt-4">Dates & Expiry</p>

      <div class="grid grid-cols-3 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Purchase Date</span>
          <input type="date" class={fieldClass} bind:value={form.purchaseDate} />
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Warranty Expiry</span>
          <input type="date" class={fieldClass} bind:value={form.warrantyExpiry} />
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>
            {form.assetType === "software_license" ? "License Expiry" : "Expiry Date"}
          </span>
          <input type="date" class={fieldClass} bind:value={form.expiryDate} />
        </label>
      </div>

      <!-- Section: Status (edit only) -->
      {#if mode === "edit"}
        <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide -mb-1 mt-2 border-t border-gray-100 pt-4">Status</p>
        <label class={labelClass}>
          <span class={labelTextClass}>Current Status</span>
          <select class={fieldClass} bind:value={form.status}>
            {#each STATUS_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
      {/if}

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
          disabled={saving}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[#E87D1F] hover:bg-[#d06a10] rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : mode === "add" ? "Add Item" : "Save Changes"}
        </button>
      </div>
    </form>
  </div>
</div>

<script lang="ts">
  import { restRequest } from "$lib/api/rest";
  import { invalidate } from "$lib/stores/query";
  import { toast } from "svelte-sonner";

  interface InventoryItem {
    id: string;
    name: string;
    sku: string | null;
  }

  let {
    item,
    onClose,
  }: {
    item: InventoryItem;
    onClose: () => void;
  } = $props();

  let form = $state({ quantity: "", remarks: "" });
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);

  function validate() {
    errors = {};
    const qty = form.quantity.trim();
    if (!qty) errors.quantity = "Quantity is required";
    else if (!/^\d+$/.test(qty)) errors.quantity = "Quantity must be a whole number";
    else if (Number(qty) <= 0) errors.quantity = "Quantity must be greater than 0";
    if (form.remarks.trim().length > 500) errors.remarks = "Remarks must not exceed 500 characters";
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate()) return;
    saving = true;
    try {
      await restRequest(`/api/inventory/${item.id}/add`, {
        method: "POST",
        body: JSON.stringify({ quantity: Number(form.quantity), remarks: form.remarks }),
      });
      invalidate("inventory");
      toast.success("Stock added");
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to add stock");
    } finally {
      saving = false;
    }
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
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
  <!-- Modal -->
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Add Stock"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">Add Stock</h2>
        <p class="text-[12px] text-gray-400 mt-0.5">{item.name}{item.sku ? ` · ${item.sku}` : ""}</p>
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
    <form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleSubmit}>
      <label class={labelClass}>
        <span class={labelTextClass}>Quantity <span class="text-red-400">*</span></span>
        <input
          type="number"
          min="1"
          step="1"
          placeholder="e.g. 10"
          class="{fieldClass} {errors.quantity ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.quantity}
        />
        {#if errors.quantity}<span class={errorClass}>{errors.quantity}</span>{/if}
      </label>

      <label class={labelClass}>
        <span class={labelTextClass}>Remarks</span>
        <textarea
          rows="3"
          placeholder="e.g. Received from supplier"
          class="{fieldClass} resize-none {errors.remarks ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.remarks}
        ></textarea>
        {#if errors.remarks}<span class={errorClass}>{errors.remarks}</span>{/if}
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
          disabled={saving}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[#0B182A] hover:bg-[#021E44] rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Add Stock"}
        </button>
      </div>
    </form>
  </div>
</div>

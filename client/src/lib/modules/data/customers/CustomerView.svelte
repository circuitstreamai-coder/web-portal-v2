<script lang="ts">
  import MaskedContact from "$lib/components/MaskedContact.svelte";
  import type { Customer } from "./queries";

  let {
    customer,
    onClose,
    onEdit,
  }: {
    customer: Customer;
    onClose: () => void;
    onEdit?: () => void;
  } = $props();

  function statusStyle(status: string) {
    if (status === "active") return "bg-green-50 text-green-600";
    if (status === "pending" || status === "pending_approval") return "bg-amber-50 text-amber-600";
    if (status === "rejected") return "bg-red-50 text-red-500";
    return "bg-gray-100 text-gray-500";
  }

  function statusLabel(status: string) {
    if (status === "pending" || status === "pending_approval") return "Pending Approval";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const labelClass =
    "text-[11px] font-semibold text-gray-400 uppercase tracking-wide";
  const valueClass = "text-[13px] text-gray-800 mt-0.5";
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col animate-in"
    role="dialog"
    aria-modal="true"
    aria-label="Customer Details"
    tabindex="-1"
  >
    <!-- Header -->
    <div
      class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-[#0B182A]/5 flex items-center justify-center shrink-0"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0B182A"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A] leading-tight">
            {customer.companyName}
          </h2>
          <span
            class="text-[11px] font-semibold px-2 py-0.5 rounded-full {statusStyle(
              customer.status,
            )}"
          >
            {statusLabel(customer.status)}
          </span>
        </div>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:scale-90 transition-all text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer"
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
    <div class="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
      <!-- Primary Contact -->
      <div>
        <p
          class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3"
        >
          Primary Contact
        </p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p class={labelClass}>Contact Person</p>
            <p class={valueClass}>{customer.contactPersonName || "—"}</p>
          </div>
          <div>
            <p class={labelClass}>Phone</p>
            <p class={valueClass}><MaskedContact value={customer.phone} type="phone" /></p>
          </div>
          <div class="col-span-2">
            <p class={labelClass}>Email</p>
            <p class={valueClass}><MaskedContact value={customer.email} type="email" /></p>
          </div>
        </div>
      </div>

      <!-- Address -->
      <div class="border-t border-gray-100 pt-4">
        <p
          class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3"
        >
          Address
        </p>
        <div class="grid grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <p class={labelClass}>State</p>
            <p class={valueClass}>{customer.addressState || "—"}</p>
          </div>
          <div>
            <p class={labelClass}>City</p>
            <p class={valueClass}>{customer.addressCity || "—"}</p>
          </div>
          <div>
            <p class={labelClass}>Pincode</p>
            <p class={valueClass}>{customer.addressPincode || "—"}</p>
          </div>
        </div>
      </div>

      <!-- Secondary Contact -->
      {#if customer.secondaryContactName || customer.secondaryContactEmail || customer.secondaryContactPhone}
        <div class="border-t border-gray-100 pt-4">
          <p
            class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3"
          >
            Secondary Contact
          </p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-4">
            <div class="col-span-2">
              <p class={labelClass}>Name</p>
              <p class={valueClass}>{customer.secondaryContactName || "—"}</p>
            </div>
            <div>
              <p class={labelClass}>Phone</p>
              <p class={valueClass}><MaskedContact value={customer.secondaryContactPhone} type="phone" /></p>
            </div>
            <div>
              <p class={labelClass}>Email</p>
              <p class={valueClass}><MaskedContact value={customer.secondaryContactEmail} type="email" /></p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Meta -->
      <div class="border-t border-gray-100 pt-4">
        <div class="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p class={labelClass}>Registered</p>
            <p class={valueClass}>{fmtDate(customer.createdAt)}</p>
          </div>
          {#if customer.approvedAt}
            <div>
              <p class={labelClass}>Approved</p>
              <p class={valueClass}>{fmtDate(customer.approvedAt)}</p>
            </div>
          {/if}
          {#if customer.approvedBy}
            <div>
              <p class={labelClass}>Approved By</p>
              <p class={valueClass}>{customer.approvedBy}</p>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div
      class="flex justify-end gap-3 px-6 pb-5 pt-4 border-t border-gray-100 shrink-0"
    >
      <button
        onclick={onClose}
        class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 active:scale-95 transition-all cursor-pointer"
      >
        Close
      </button>
      {#if onEdit}
        <button
          onclick={onEdit}
          class="flex items-center gap-2 px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
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
      {/if}
    </div>
  </div>
</div>

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

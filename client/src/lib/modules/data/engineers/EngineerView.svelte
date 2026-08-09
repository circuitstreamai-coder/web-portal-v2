<script lang="ts">
  import { fileUrl } from "$lib/api/upload";
  import MaskedContact from "$lib/components/MaskedContact.svelte";
  import type { EngineerProfile } from "./queries";

  let {
    engineer,
    onClose,
    onEdit,
  }: {
    engineer: EngineerProfile;
    onClose: () => void;
    onEdit: () => void;
  } = $props();

  // Stored URLs are absolute (http://host/file/123). Extract the ID and rebuild
  // as a relative path so requests go through the Vite proxy / reverse proxy.
  function toRelUrl(stored: string | null): string | null {
    if (!stored) return null;
    const match = stored.match(/\/file\/(\d+)$/);
    return match ? fileUrl(match[1]) : stored;
  }

  const profilePhoto = $derived(toRelUrl(engineer.profilePhotoUrl));

  const docs = $derived([
    { label: "Aadhaar Card (Front)",    url: toRelUrl(engineer.aadhaarFrontUrl) },
    { label: "Aadhaar Card (Back)",     url: toRelUrl(engineer.aadhaarBackUrl) },
    { label: "PAN Card",                url: toRelUrl(engineer.panCardUrl) },
    { label: "Driving Licence (Front)", url: toRelUrl(engineer.dlFrontUrl) },
    { label: "Driving Licence (Back)",  url: toRelUrl(engineer.dlBackUrl) },
    { label: "Cancel Cheque",           url: toRelUrl(engineer.cancelChequeUrl) },
  ]);

  let lightboxUrl = $state<string | null>(null);

  function statusStyle(status: string) {
    if (status === "approved") return "bg-green-50 text-green-600";
    if (status === "pending")  return "bg-amber-50 text-amber-600";
    if (status === "rejected") return "bg-red-50 text-red-500";
    if (status === "reupload") return "bg-purple-50 text-purple-600";
    return "bg-gray-100 text-gray-500";
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  const lbl = "text-[11px] font-semibold text-gray-400 uppercase tracking-wide";
  const val = "text-[13px] text-gray-800 mt-0.5";
  const sec = "text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3";
</script>

<!-- Lightbox -->
{#if lightboxUrl}
  <div class="fixed inset-0 z-60 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
      aria-label="Close lightbox"
      onclick={() => (lightboxUrl = null)}
    ></button>
    <img
      src={lightboxUrl}
      alt="Document"
      class="relative z-10 max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
    />
    <button
      onclick={() => (lightboxUrl = null)}
      class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
      aria-label="Close lightbox"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
{/if}

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col animate-in"
    role="dialog"
    aria-modal="true"
    aria-label="Engineer Details"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div class="flex items-center gap-3">
        <!-- Profile photo or initials avatar -->
        {#if profilePhoto}
          <button
            onclick={() => (lightboxUrl = profilePhoto)}
            class="w-12 h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer ring-2 ring-gray-100 hover:ring-[#0B182A] transition-all"
            aria-label="View profile photo"
          >
            <img
              src={profilePhoto}
              alt="Profile"
              class="w-full h-full object-cover"
              onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </button>
        {:else}
          <div class="w-12 h-12 rounded-xl bg-[#0B182A]/5 flex items-center justify-center shrink-0 text-[16px] font-bold text-[#0B182A]/40">
            {(engineer.userName ?? "?").charAt(0).toUpperCase()}
          </div>
        {/if}

        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A] leading-tight">{engineer.userName ?? "—"}</h2>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[12px] text-[#E87D1F] font-medium">{engineer.referenceId ?? engineer.id}</span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full {statusStyle(engineer.documentsStatus)}">
              {engineer.documentsStatus}
            </span>
          </div>
        </div>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div class="px-6 py-5 flex flex-col gap-5 overflow-y-auto">

      <!-- Contact -->
      <div>
        <p class={sec}>Contact</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-4">
          <div class="col-span-2">
            <p class={lbl}>Email</p>
            <p class={val}><MaskedContact value={engineer.userEmail} type="email" /></p>
          </div>
          <div>
            <p class={lbl}>Phone</p>
            <p class={val}><MaskedContact value={engineer.userPhone} type="phone" /></p>
          </div>
        </div>
      </div>

      <!-- Address -->
      <div class="border-t border-gray-100 pt-4">
        <p class={sec}>Address</p>
        <div class="grid grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <p class={lbl}>State</p>
            <p class={val}>{engineer.addressState || "—"}</p>
          </div>
          <div>
            <p class={lbl}>City</p>
            <p class={val}>{engineer.addressCity || "—"}</p>
          </div>
          <div>
            <p class={lbl}>Pincode</p>
            <p class={val}>{engineer.addressPincode || "—"}</p>
          </div>
          <div class="col-span-3">
            <p class={lbl}>Assigned State</p>
            <p class={val}>{engineer.assignedState || "—"}</p>
          </div>
        </div>
      </div>

      <!-- Bank -->
      {#if engineer.accountHolderName || engineer.bankAccountNumber || engineer.ifscCode}
        <div class="border-t border-gray-100 pt-4">
          <p class={sec}>Bank Details</p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-4">
            <div class="col-span-2">
              <p class={lbl}>Account Holder</p>
              <p class={val}>{engineer.accountHolderName || "—"}</p>
            </div>
            <div>
              <p class={lbl}>Account Number</p>
              <p class={val}>{engineer.bankAccountNumber || "—"}</p>
            </div>
            <div>
              <p class={lbl}>IFSC Code</p>
              <p class={val}>{engineer.ifscCode || "—"}</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Documents -->
      <div class="border-t border-gray-100 pt-4">
        <p class={sec}>Documents</p>
        <div class="grid grid-cols-2 gap-3">
          {#each docs as doc}
            <div class="flex flex-col gap-1.5">
              <span class="text-[11px] font-semibold text-gray-500">{doc.label}</span>
              {#if doc.url}
                <button
                  onclick={() => (lightboxUrl = doc.url)}
                  class="block w-full rounded-xl overflow-hidden border border-gray-200 hover:border-[#0B182A] transition-colors cursor-pointer group text-left"
                  aria-label="View {doc.label}"
                >
                  <img
                    src={doc.url}
                    alt={doc.label}
                    class="w-full h-28 object-cover group-hover:opacity-90 transition-opacity"
                    onerror={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      img.style.display = "none";
                      (img.nextElementSibling as HTMLElement)?.classList.remove("hidden");
                    }}
                  />
                  <div class="hidden h-28 items-center justify-center text-[11px] text-gray-400 bg-gray-50">
                    Click to view
                  </div>
                </button>
              {:else}
                <div class="h-28 rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-300">
                  Not uploaded
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Meta -->
      <div class="border-t border-gray-100 pt-4">
        <div class="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p class={lbl}>Registered</p>
            <p class={val}>{fmtDate(engineer.createdAt)}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-3 px-6 pb-5 pt-4 border-t border-gray-100 shrink-0">
      <button
        onclick={onClose}
        class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
      >
        Close
      </button>
      <button
        onclick={onEdit}
        class="flex items-center gap-2 px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
    </div>
  </div>
</div>

<style>
  .animate-in {
    animation: slideUp 0.18s ease-out both;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
</style>

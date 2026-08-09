<script lang="ts">
  import type { EngineerProfile } from "./queries";
  import { fileUrl } from "$lib/api/upload";

  interface Props {
    eng: EngineerProfile;
    onApprove: () => void;
    onReject: () => void;
    onClose: () => void;
  }

  let { eng, onApprove, onReject, onClose }: Props = $props();

  // Stored URLs are absolute (http://host/file/123). Extract the ID and
  // rebuild as a relative URL so requests go through the Vite proxy in dev
  // and a reverse proxy in production.
  function toRelativeFileUrl(stored: string | null): string | null {
    if (!stored) return null;
    const match = stored.match(/\/file\/(\d+)$/);
    return match ? fileUrl(match[1]) : stored;
  }

  let docs = $derived([
    { label: "Profile Photo",       url: toRelativeFileUrl(eng.profilePhotoUrl) },
    { label: "Aadhaar Card (Front)",url: toRelativeFileUrl(eng.aadhaarFrontUrl) },
    { label: "Aadhaar Card (Back)", url: toRelativeFileUrl(eng.aadhaarBackUrl) },
    { label: "PAN Card",            url: toRelativeFileUrl(eng.panCardUrl) },
    { label: "Driving Licence (Front)", url: toRelativeFileUrl(eng.dlFrontUrl) },
    { label: "Driving Licence (Back)",  url: toRelativeFileUrl(eng.dlBackUrl) },
    { label: "Cancel Cheque",       url: toRelativeFileUrl(eng.cancelChequeUrl) },
  ]);
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="flex items-start justify-between px-6 py-5 border-b border-gray-100">
      <div>
        <h3 class="text-[16px] font-semibold text-[#0B182A]">{eng.userName ?? "—"}</h3>
        <p class="text-[12px] text-[#E87D1F] font-medium mt-0.5">{eng.referenceId ?? eng.id}</p>
        {#if eng.userEmail}
          <p class="text-[12px] text-gray-400 mt-0.5">{eng.userEmail}</p>
        {/if}
      </div>
      <button
        onclick={onClose}
        class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-1 -mt-1 -mr-1"
        aria-label="Close"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Documents grid -->
    <div class="overflow-y-auto px-6 py-5 flex-1">
      <p class="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Uploaded Documents</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {#each docs as doc}
          <div class="flex flex-col gap-2">
            <span class="text-[11px] font-semibold text-gray-500">{doc.label}</span>
            {#if doc.url}
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                class="block rounded-xl overflow-hidden border border-gray-200 hover:border-[#0B182A] transition-colors group"
              >
                <img
                  src={doc.url}
                  alt={doc.label}
                  class="w-full h-32 object-cover group-hover:opacity-90 transition-opacity"
                  onerror={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    img.style.display = 'none';
                    img.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div class="hidden h-32 flex items-center justify-center text-[11px] text-gray-400 bg-gray-50">
                  Click to view
                </div>
              </a>
            {:else}
              <div class="h-32 rounded-xl border border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-300">
                Not uploaded
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Footer actions -->
    <div class="flex gap-2 px-6 py-4 border-t border-gray-100">
      <button
        onclick={onClose}
        class="px-4 py-2 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <div class="flex gap-2 ml-auto">
        <button
          onclick={onReject}
          class="px-5 py-2 text-[13px] font-semibold rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
        >
          Reject
        </button>
        <button
          onclick={onApprove}
          class="px-5 py-2 text-[13px] font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors cursor-pointer"
        >
          Approve
        </button>
      </div>
    </div>
  </div>
</div>

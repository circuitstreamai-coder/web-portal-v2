<script lang="ts">
  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    confirmClass?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    title,
    message,
    confirmLabel = "Confirm",
    confirmClass = "bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white hover:opacity-90",
    onConfirm,
    onCancel,
  }: Props = $props();
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <h3 class="text-[16px] font-semibold text-[#0B182A]">{title}</h3>
      <p class="text-[13px] text-gray-500">{message}</p>
    </div>

    <div class="flex gap-2 justify-end pt-1">
      <button
        onclick={onCancel}
        class="px-4 py-2 text-[13px] font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <button
        onclick={onConfirm}
        class="px-4 py-2 text-[13px] font-semibold rounded-lg transition-opacity cursor-pointer {confirmClass}"
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</div>

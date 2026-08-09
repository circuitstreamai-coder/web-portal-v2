<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    onclose: () => void;
    children: Snippet;
  }

  let { onclose, children }: Props = $props();
</script>

<div
  class="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0"
>
  <div>{@render children()}</div>
  <button
    onclick={onclose}
    class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
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

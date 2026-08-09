<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label?: string;
    maxWidth?: string;
    onclose: () => void;
    children: Snippet;
  }

  let { label, maxWidth = "max-w-lg", onclose, children }: Props = $props();
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 cursor-default"
    aria-label="Close modal"
    onclick={onclose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full {maxWidth} shadow-2xl max-h-[90vh] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
  >
    {@render children()}
  </div>
</div>

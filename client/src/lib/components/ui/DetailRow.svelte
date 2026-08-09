<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    children: Snippet;
  }

  let { label, children }: Props = $props();
</script>

<div class="flex justify-between items-center px-4 py-3">
  <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
    {label}
  </span>
  <span class="text-[13px] text-gray-700">{@render children()}</span>
</div>

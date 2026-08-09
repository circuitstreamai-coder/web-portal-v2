<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    error?: string;
    children: Snippet;
  }

  let { label, error, children }: Props = $props();
</script>

<label class="flex flex-col gap-1.5">
  <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
    {label}
  </span>
  {@render children()}
  {#if error}
    <span class="text-[11px] text-red-500">{error}</span>
  {/if}
</label>

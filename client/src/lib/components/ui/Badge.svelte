<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children: Snippet;
  }

  let { class: className = "", children }: Props = $props();
</script>

<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {className}">
  {@render children()}
</span>

<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div
  class="flex justify-end gap-2 px-6 pb-5 border-t border-gray-100 pt-4 shrink-0"
>
  {@render children()}
</div>

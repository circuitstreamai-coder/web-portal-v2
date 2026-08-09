<script lang="ts">
  interface Props {
    size?: string;
  }

  let { size = "w-4 h-4" }: Props = $props();
</script>

<div
  class="{size} border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"
></div>

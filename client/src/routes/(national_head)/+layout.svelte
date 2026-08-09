<script lang="ts">
  import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';

  let { children } = $props();
</script>

<DashboardLayout title="National Head Dashboard" role="national_head">
  {@render children()}
</DashboardLayout>

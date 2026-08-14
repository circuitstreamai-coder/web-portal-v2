<script lang="ts">
  import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
  let { children } = $props();
</script>

<DashboardLayout title="Asset Management" role="asset_manager">
  {@render children()}
</DashboardLayout>

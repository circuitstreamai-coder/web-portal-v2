<script lang="ts">
  import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';

  let { children } = $props();
</script>

<DashboardLayout title="Project Head Dashboard" role="project_head">
  {@render children()}
</DashboardLayout>

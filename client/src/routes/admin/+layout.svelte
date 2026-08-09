<script lang="ts">
  import { DashboardLayout } from "$lib/components/ui";
  let { children } = $props();
</script>

<DashboardLayout title="Admin Dashboard" role="super_admin">
  {@render children()}
</DashboardLayout>

<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	let { children } = $props();
</script>

<DashboardLayout title="State Planner Dashboard" role="state_planner">
	{@render children()}
</DashboardLayout>

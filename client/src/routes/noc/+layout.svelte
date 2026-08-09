<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	let { children } = $props();
</script>

<DashboardLayout title="NOC Dashboard" role="noc">
	{@render children()}
</DashboardLayout>

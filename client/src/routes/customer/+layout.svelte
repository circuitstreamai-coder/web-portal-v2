<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	let { children } = $props();
</script>

<DashboardLayout title="Customer Portal" role="customer">
	{@render children()}
</DashboardLayout>

<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	let { children } = $props();
</script>

<DashboardLayout title="Vendor Support Portal" role="vendor">
	{@render children()}
</DashboardLayout>

<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	let { children } = $props();
</script>

<DashboardLayout title="Engineer Portal" role="engineer">
	{@render children()}
</DashboardLayout>

<script lang="ts">
	import DashboardLayout from '$lib/components/ui/DashboardLayout.svelte';
	import type { Role } from '$lib/config/roles';

	let { data, children } = $props();
	const role = $derived((data.user?.role ?? 'engineer') as Role);
</script>

<DashboardLayout title="My Profile" {role}>
	{@render children()}
</DashboardLayout>

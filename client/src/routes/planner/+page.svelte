<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets } from '$lib/modules/data/tickets/queries';

	const user = $derived($authStore.user);

	let loading = $state(true);
	let activePlans = $state<number | null>(null);
	let pendingReview = $state<number | null>(null);
	let completed = $state<number | null>(null);

	onMount(async () => {
		try {
			const all = await fetchTickets();
			const mine = user
				? all.filter((t) => t.statePlannerId === user.id)
				: all;
			activePlans   = mine.filter((t) => ['open', 'assigned', 'accepted', 'in_progress', 'escalated_l2', 'escalated_l3', 'reopened'].includes(t.status)).length;
			pendingReview = mine.filter((t) => ['on_hold', 'pending_replacement', 'pending_validation'].includes(t.status)).length;
			completed     = mine.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
		} catch {
			toast.error('Failed to load dashboard data');
			activePlans   = 0;
			pendingReview = 0;
			completed     = 0;
		} finally {
			loading = false;
		}
	});

	function display(val: number | null): string {
		return val === null ? '—' : String(val);
	}
</script>

<svelte:head><title>Planner · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
		<h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
			Welcome, {user?.name ?? 'Planner'} 👋
		</h2>
		<p class="text-[14px] text-gray-500">Manage state-level project planning and allocations.</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		{#each [
			{ label: 'Active Plans',   value: display(activePlans),   color: 'text-amber-600' },
			{ label: 'Pending Review', value: display(pendingReview), color: 'text-blue-700' },
			{ label: 'Completed',      value: display(completed),     color: 'text-emerald-700' }
		] as stat}
			<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
				<p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
				<p class="text-[28px] font-bold {stat.color} {loading ? 'animate-pulse' : ''}">{stat.value}</p>
			</div>
		{/each}
	</div>
</div>

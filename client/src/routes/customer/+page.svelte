<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { restRequest } from '$lib/api/rest';
	import type { Ticket } from '$lib/modules/data/tickets/queries';

	const user = $derived($authStore.user);

	let tickets = $state<Ticket[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			tickets = await restRequest<Ticket[]>('/api/tickets');
		} catch {
			// non-critical — stats stay as '—'
		} finally {
			loading = false;
		}
	});

	const open = $derived(tickets.filter(t => t.status?.toLowerCase() === 'open').length);
	const inProgress = $derived(tickets.filter(t => t.status?.toLowerCase().replace(/ /g, '_') === 'in_progress').length);
	const resolved = $derived(tickets.filter(t => t.status?.toLowerCase() === 'resolved').length);
</script>

<svelte:head><title>Customer · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
		<h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
			Welcome, {user?.name ?? 'Customer'} 👋
		</h2>
		<p class="text-[14px] text-gray-500">Track your support tickets and project status here.</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		{#each [
			{ label: 'Open Tickets', value: loading ? '—' : open, color: 'text-blue-700' },
			{ label: 'In Progress', value: loading ? '—' : inProgress, color: 'text-amber-600' },
			{ label: 'Resolved', value: loading ? '—' : resolved, color: 'text-emerald-700' }
		] as stat}
			<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
				<p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
				<p class="text-[28px] font-bold {stat.color}">{stat.value}</p>
			</div>
		{/each}
	</div>
</div>

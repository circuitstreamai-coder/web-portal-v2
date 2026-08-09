<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets, type Ticket } from '$lib/modules/data/tickets/queries';

	const user = $derived($authStore.user);

	let tickets = $state<Ticket[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			tickets = await fetchTickets();
		} finally {
			loading = false;
		}
	});

	const today = new Date().toDateString();

	const activeAlerts = $derived(
		tickets.filter(t =>
			['open', 'escalated_l2', 'escalated_l3', 'reopened'].includes(t.status)
		).length
	);

	const monitoring = $derived(
		tickets.filter(t =>
			['assigned', 'accepted', 'in_progress', 'on_hold', 'pending_replacement', 'pending_validation'].includes(t.status)
		).length
	);

	const resolvedToday = $derived(
		tickets.filter(t =>
			['resolved', 'closed'].includes(t.status) &&
			new Date(t.createdAt).toDateString() === today
		).length
	);

	const stats = $derived([
		{ label: 'Active Alerts',   value: activeAlerts,  color: 'text-red-600' },
		{ label: 'Monitoring',      value: monitoring,    color: 'text-purple-700' },
		{ label: 'Resolved Today',  value: resolvedToday, color: 'text-emerald-700' },
	]);
</script>

<svelte:head><title>NOC · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
		<h2 class="text-[20px] font-bold text-[#0B182A] mb-1">
			NOC Console — {user?.name ?? 'Operator'} 👋
		</h2>
		<p class="text-[14px] text-gray-500">Monitor network operations and escalations.</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
		{#if loading}
			{#each [1, 2, 3] as _}
				<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
					<div class="h-3 w-24 bg-gray-200 rounded animate-pulse mb-3"></div>
					<div class="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
				</div>
			{/each}
		{:else}
			{#each stats as stat}
				<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
					<p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
					<p class="text-[28px] font-bold {stat.color}">{stat.value}</p>
				</div>
			{/each}
		{/if}
	</div>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets } from '$lib/modules/data/tickets/queries';

	const user = $derived($authStore.user);

	let loading = $state(true);
	let assignedCount = $state<number | null>(null);
	let inProgressCount = $state<number | null>(null);
	let resolvedCount = $state<number | null>(null);
	let escalatedCount = $state<number | null>(null);

	onMount(async () => {
		try {
			const all = await fetchTickets();
			const mine = user ? all.filter((t) => t.assignedEngineerId === user.id) : all;
			assignedCount  = mine.length;
			inProgressCount = mine.filter((t) => t.status === 'in_progress').length;
			resolvedCount  = mine.filter((t) => ['resolved', 'closed'].includes(t.status)).length;
			escalatedCount = all.filter((t) => t.escalationLevel === 'L3').length;
		} catch {
			assignedCount = inProgressCount = resolvedCount = escalatedCount = 0;
		} finally {
			loading = false;
		}
	});

	function display(v: number | null) { return v === null ? '—' : String(v); }
</script>

<svelte:head><title>Vendor Support · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
		<div class="flex items-center gap-3 mb-1">
			<h2 class="text-[20px] font-bold text-[#0B182A]">Welcome, {user?.name ?? 'Vendor'}</h2>
			<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700">Vendor Support</span>
		</div>
		<p class="text-[14px] text-gray-500">
			You handle L3 escalated tickets that require specialist vendor-level support.
		</p>
	</div>

	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
		{#each [
			{ label: 'Assigned to Me',       value: display(assignedCount),   color: 'text-blue-700'   },
			{ label: 'In Progress',          value: display(inProgressCount), color: 'text-amber-600'  },
			{ label: 'Resolved / Closed',    value: display(resolvedCount),   color: 'text-emerald-700'},
			{ label: 'L3 Escalations (All)', value: display(escalatedCount),  color: 'text-red-600'    },
		] as stat}
			<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
				<p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
				<p class="text-[28px] font-bold {stat.color} {loading ? 'animate-pulse' : ''}">{stat.value}</p>
			</div>
		{/each}
	</div>

	<div class="bg-teal-50 border border-teal-100 rounded-xl px-5 py-4">
		<p class="text-[13px] font-semibold text-teal-700 mb-1">Vendor Support Role</p>
		<p class="text-[13px] text-teal-600">
			As a Vendor Support specialist, you handle complex L3 escalations that require external vendor expertise.
			Your tickets are escalated by field engineers and L2 engineers when specialist hardware or configuration issues arise.
		</p>
	</div>
</div>

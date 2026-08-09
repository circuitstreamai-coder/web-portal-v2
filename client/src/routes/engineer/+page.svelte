<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets } from '$lib/modules/data/tickets/queries';

	const user = $derived($authStore.user);
	const isEscalationEngineer = $derived(user?.role === 'l2_engineer' || user?.role === 'l3_engineer');
	const escalationLabel = $derived(user?.role === 'l3_engineer' ? 'L3 Specialist' : 'L2 Engineer');

	let assignedCount = $state<number | null>(null);
	let inProgressCount = $state<number | null>(null);
	let resolvedCount = $state<number | null>(null);
	let escalatedToMeCount = $state<number | null>(null);

	onMount(async () => {
		try {
			const all = await fetchTickets();
			const mine = user ? all.filter((t) => t.assignedEngineerId === user.id) : all;
			assignedCount = mine.length;
			inProgressCount = mine.filter((t) => t.status === 'in_progress').length;
			resolvedCount = mine.filter((t) => t.status === 'resolved' || t.status === 'pending_validation').length;
			if (isEscalationEngineer) {
				const level = user?.role === 'l3_engineer' ? 'L3' : 'L2';
				escalatedToMeCount = all.filter((t) => t.escalationLevel === level).length;
			}
		} catch {
			assignedCount = 0;
			inProgressCount = 0;
			resolvedCount = 0;
			escalatedToMeCount = 0;
		}
	});

	function display(val: number | null): string {
		return val === null ? '—' : String(val);
	}
</script>

<svelte:head><title>{isEscalationEngineer ? escalationLabel : 'Engineer'} · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
		<div class="flex items-center gap-3 mb-1">
			<h2 class="text-[20px] font-bold text-[#0B182A]">
				Welcome, {user?.name ?? 'Engineer'}
			</h2>
			{#if isEscalationEngineer}
				<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {user?.role === 'l3_engineer' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}">
					{escalationLabel}
				</span>
			{/if}
		</div>
		<p class="text-[14px] text-gray-500">
			{#if isEscalationEngineer}
				You handle escalated tickets assigned to you for advanced support.
			{:else}
				View and manage your assigned tickets below.
			{/if}
		</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 {isEscalationEngineer ? 'lg:grid-cols-4' : ''} gap-4">
		{#each [
			{ label: 'Assigned to Me', value: display(assignedCount), color: 'text-blue-700' },
			{ label: 'In Progress', value: display(inProgressCount), color: 'text-amber-600' },
			{ label: 'Resolved / Pending Validation', value: display(resolvedCount), color: 'text-emerald-700' },
			...(isEscalationEngineer ? [{ label: `${escalationLabel} Escalations (System-Wide)`, value: display(escalatedToMeCount), color: 'text-red-600' }] : [])
		] as stat}
			<div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
				<p class="text-[13px] text-gray-500 mb-1">{stat.label}</p>
				<p class="text-[28px] font-bold {stat.color}">{stat.value}</p>
			</div>
		{/each}
	</div>

	{#if isEscalationEngineer}
		<div class="bg-orange-50 border border-orange-100 rounded-xl px-5 py-4">
			<p class="text-[13px] font-semibold text-orange-700 mb-1">Escalation Role</p>
			<p class="text-[13px] text-orange-600">
				As an {escalationLabel}, your ticket queue shows all tickets assigned to you via escalation.
				Use the Tickets tab to view and act on them. Escalated tickets are flagged with the
				<span class="font-semibold">{user?.role === 'l3_engineer' ? 'L3' : 'L2'}</span> escalation level.
			</p>
		</div>
	{/if}
</div>

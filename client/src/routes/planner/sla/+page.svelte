<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets, type Ticket } from '$lib/modules/data/tickets/queries';
	import Pagination from '$lib/components/Pagination.svelte';

	const user = $derived($authStore.user);

	let allTickets = $state<Ticket[]>([]);
	let loading    = $state(true);

	onMount(async () => {
		try {
			allTickets = await fetchTickets();
		} catch {
			toast.error('Failed to load SLA data');
		} finally {
			loading = false;
		}
	});

	// Filter to planner's state-assigned tickets
	const myTickets = $derived(user
		? allTickets.filter(t => t.statePlannerId === user.id)
		: allTickets
	);

	const withSLA = $derived(myTickets.filter(t => !!t.slaDeadline));

	function isResolved(s: string) { return s === 'resolved' || s === 'closed'; }

	function slaStatus(t: Ticket): 'on_track' | 'breaching' | 'breached' {
		if (isResolved(t.status)) return 'on_track';
		const diff = new Date(t.slaDeadline!).getTime() - Date.now();
		if (diff < 0) return 'breached';
		if (diff < 4 * 60 * 60 * 1000) return 'breaching';
		return 'on_track';
	}

	const breached  = $derived(withSLA.filter(t => slaStatus(t) === 'breached' && !isResolved(t.status)).length);
	const breaching = $derived(withSLA.filter(t => slaStatus(t) === 'breaching').length);
	const onTrack   = $derived(withSLA.filter(t => slaStatus(t) === 'on_track' && !isResolved(t.status)).length);
	const compliance = $derived(withSLA.length ? Math.round(((withSLA.length - breached) / withSLA.length) * 100) : 100);

	// Group by state
	const byState = $derived(() => {
		const map = new Map<string, { total: number; breached: number; onTrack: number }>();
		for (const t of withSLA) {
			const st = t.state?.trim() || 'Unknown';
			const row = map.get(st) ?? { total: 0, breached: 0, onTrack: 0 };
			row.total++;
			if (slaStatus(t) === 'breached' && !isResolved(t.status)) row.breached++;
			else row.onTrack++;
			map.set(st, row);
		}
		return Array.from(map.entries()).map(([state, v]) => ({ state, ...v })).sort((a, b) => b.breached - a.breached);
	});

	// Sorted tickets: breached first
	const sortedTickets = $derived(withSLA
		.filter(t => !isResolved(t.status))
		.sort((a, b) => new Date(a.slaDeadline!).getTime() - new Date(b.slaDeadline!).getTime())
	);

	const PAGE_SIZE = 15;
	let currentPage = $state(1);
	const totalPages   = $derived(Math.max(1, Math.ceil(sortedTickets.length / PAGE_SIZE)));
	const pagedTickets = $derived(sortedTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	function timeLeft(d: string) {
		const diff = new Date(d).getTime() - Date.now();
		if (diff < 0) return `Overdue ${fmt(-diff)}`;
		return `${fmt(diff)} left`;
	}

	function fmt(ms: number) {
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
	}

	function slaBadge(s: ReturnType<typeof slaStatus>) {
		if (s === 'breached')  return 'bg-red-50 text-red-600';
		if (s === 'breaching') return 'bg-orange-50 text-orange-600';
		return 'bg-green-50 text-green-600';
	}
</script>

<svelte:head><title>SLA View · Planner · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<div class="bg-white rounded-xl px-5 py-4 shadow border border-gray-100">
		<h2 class="text-[18px] font-semibold text-[#0B182A]">State-Level SLA Tracking</h2>
		<p class="text-[13px] text-gray-400 mt-0.5">SLA status for tickets under your state planning scope</p>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		{#each [
			{ label: 'Monitored Tickets', value: loading ? '…' : String(withSLA.length), color: 'text-[#0B182A]' },
			{ label: 'On Track',          value: loading ? '…' : String(onTrack),        color: 'text-green-600'  },
			{ label: 'Breaching Soon',    value: loading ? '…' : String(breaching),      color: 'text-orange-600' },
			{ label: 'Breached',          value: loading ? '…' : String(breached),       color: 'text-red-600'    },
		] as stat}
			<div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
				<p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
				<p class="text-[24px] font-bold {stat.color}">{stat.value}</p>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
		<!-- By State -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-[16px] font-semibold text-[#0B182A]">SLA by State</h3>
				<span class="text-[12px] font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
					{loading ? '…' : `${compliance}% Compliance`}
				</span>
			</div>
			{#if loading}
				<p class="text-[13px] text-gray-400">Loading…</p>
			{:else if byState().length === 0}
				<p class="text-[13px] text-gray-400">No SLA data available</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-gray-100">
								{#each ['STATE', 'TOTAL', 'ON TRACK', 'BREACHED'] as col}
									<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-2 px-3 whitespace-nowrap">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each byState() as row}
								<tr class="border-b border-gray-50 hover:bg-gray-50">
									<td class="py-2.5 px-3 text-[13px] font-medium text-gray-700">{row.state}</td>
									<td class="py-2.5 px-3 text-[13px]">{row.total}</td>
									<td class="py-2.5 px-3">
										<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">{row.onTrack}</span>
									</td>
									<td class="py-2.5 px-3">
										{#if row.breached > 0}
											<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{row.breached}</span>
										{:else}
											<span class="text-[11px] text-gray-300">0</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Ticket List -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">Active SLA Tickets (Sorted by Urgency)</h3>
			{#if loading}
				<p class="text-[13px] text-gray-400">Loading…</p>
			{:else if pagedTickets.length === 0}
				<div class="flex flex-col items-center gap-2 py-8">
					<Icons.CheckCircle size={24} stroke="#22c55e" />
					<p class="text-[13px] text-gray-400">No active SLA tickets</p>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each pagedTickets as t}
						{@const sl = slaStatus(t)}
						<div class="flex items-center gap-3 p-3 rounded-xl border {sl === 'breached' ? 'border-red-100 bg-red-50/30' : sl === 'breaching' ? 'border-orange-100 bg-orange-50/30' : 'border-gray-100'}">
							<div class="flex-1 min-w-0">
								<p class="text-[13px] font-semibold text-[#E87D1F]">{t.ticketNumber || t.id.slice(0,8)}</p>
								<p class="text-[12px] text-gray-600 truncate">{t.title}</p>
								<p class="text-[11px] text-gray-400">{t.state || '—'}</p>
							</div>
							<div class="text-right shrink-0">
								<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full {slaBadge(sl)}">
									{sl === 'breached' ? 'Breached' : sl === 'breaching' ? 'Breaching' : 'OK'}
								</span>
								<p class="text-[11px] text-gray-400 mt-1">{timeLeft(t.slaDeadline!)}</p>
							</div>
						</div>
					{/each}
				</div>
				<Pagination {currentPage} {totalPages} totalItems={sortedTickets.length} pageSize={PAGE_SIZE} itemLabel="tickets" {loading} onchange={(p) => (currentPage = p)} />
			{/if}
		</div>
	</div>
</div>

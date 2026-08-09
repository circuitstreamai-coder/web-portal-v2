<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { fetchTickets, type Ticket } from '$lib/modules/data/tickets/queries';
	import { fetchProjects, type Project } from '$lib/modules/data/projects/queries';
	import Pagination from '$lib/components/Pagination.svelte';

	let tickets  = $state<Ticket[]>([]);
	let projects = $state<Project[]>([]);
	let loading  = $state(true);
	let filterStatus = $state<'all' | 'on_track' | 'breaching' | 'breached'>('all');

	onMount(async () => {
		try {
			[tickets, projects] = await Promise.all([
				fetchTickets(),
				fetchProjects().catch(() => [] as Project[]),
			]);
		} catch {
			toast.error('Failed to load SLA data');
		} finally {
			loading = false;
		}
	});

	function projectName(id: string) { return projects.find(p => p.id === id)?.name ?? '—'; }

	function isResolved(s: string) { return s === 'resolved' || s === 'closed'; }

	function slaStatus(t: Ticket): 'no_sla' | 'on_track' | 'breaching' | 'breached' {
		if (!t.slaDeadline) return 'no_sla';
		if (isResolved(t.status)) return 'on_track';
		const diff = new Date(t.slaDeadline).getTime() - Date.now();
		if (diff < 0)          return 'breached';
		if (diff < 4 * 60 * 60 * 1000) return 'breaching'; // < 4 hours
		return 'on_track';
	}

	const ticketsWithSLA = $derived(tickets.filter(t => !!t.slaDeadline && !isResolved(t.status)));

	const onTrack   = $derived(ticketsWithSLA.filter(t => slaStatus(t) === 'on_track').length);
	const breaching = $derived(ticketsWithSLA.filter(t => slaStatus(t) === 'breaching').length);
	const breached  = $derived(ticketsWithSLA.filter(t => slaStatus(t) === 'breached').length);
	const compliance = $derived(ticketsWithSLA.length ? Math.round(((ticketsWithSLA.length - breached) / ticketsWithSLA.length) * 100) : 100);

	const filtered = $derived(() => {
		if (filterStatus === 'all') return ticketsWithSLA;
		return ticketsWithSLA.filter(t => slaStatus(t) === filterStatus);
	});

	const PAGE_SIZE = 20;
	let currentPage = $state(1);
	const totalPages   = $derived(Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
	const pagedTickets = $derived(filtered().sort((a, b) => new Date(a.slaDeadline!).getTime() - new Date(b.slaDeadline!).getTime())
		.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function timeLeft(d: string) {
		const diff = new Date(d).getTime() - Date.now();
		if (diff < 0) return `Overdue ${formatDuration(-diff)}`;
		return `${formatDuration(diff)} left`;
	}

	function formatDuration(ms: number): string {
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
		return `${h}h ${m}m`;
	}

	function slaBadge(s: ReturnType<typeof slaStatus>) {
		if (s === 'breached')  return 'bg-red-50 text-red-600 border border-red-100';
		if (s === 'breaching') return 'bg-orange-50 text-orange-600 border border-orange-100';
		return 'bg-green-50 text-green-600 border border-green-100';
	}

	function statusBadge(s: string) {
		const map: Record<string, string> = {
			open: 'bg-blue-50 text-blue-600', assigned: 'bg-indigo-50 text-indigo-600', accepted: 'bg-teal-50 text-teal-600',
			in_progress: 'bg-amber-50 text-amber-600', on_hold: 'bg-yellow-50 text-yellow-700',
			escalated_l2: 'bg-orange-50 text-orange-600', escalated_l3: 'bg-red-50 text-red-600',
		};
		return map[s?.toLowerCase().replace(/ /g, '_')] ?? 'bg-gray-100 text-gray-500';
	}
</script>

<svelte:head><title>SLA Board · NOC · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<div class="bg-white rounded-xl px-5 py-4 shadow border border-gray-100">
		<h2 class="text-[18px] font-semibold text-[#0B182A]">SLA Monitoring Board</h2>
		<p class="text-[13px] text-gray-400 mt-0.5">All active tickets with SLA deadlines, sorted by urgency</p>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		{#each [
			{ label: 'On Track',      value: loading ? '…' : String(onTrack),   color: 'text-green-600',  bg: 'bg-green-50' },
			{ label: 'Breaching Soon', value: loading ? '…' : String(breaching), color: 'text-orange-600', bg: 'bg-orange-50' },
			{ label: 'Breached',      value: loading ? '…' : String(breached),  color: 'text-red-600',    bg: 'bg-red-50' },
			{ label: 'SLA Compliance', value: loading ? '…' : `${compliance}%`, color: 'text-blue-700',   bg: 'bg-blue-50' },
		] as stat}
			<div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
				<p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
				<p class="text-[24px] font-bold {stat.color}">{stat.value}</p>
			</div>
		{/each}
	</div>

	<!-- Filter -->
	<div class="flex items-center gap-2 flex-wrap">
		{#each [
			{ id: 'all'       as const, label: 'All',           count: ticketsWithSLA.length },
			{ id: 'breached'  as const, label: 'Breached',      count: breached              },
			{ id: 'breaching' as const, label: 'Breaching Soon', count: breaching             },
			{ id: 'on_track'  as const, label: 'On Track',      count: onTrack               },
		] as tab}
			<button
				onclick={() => { filterStatus = tab.id; currentPage = 1; }}
				class="flex items-center gap-2 px-4 py-2 rounded-lg border text-[13px] font-medium cursor-pointer transition-all
					   {filterStatus === tab.id
					     ? tab.id === 'breached'  ? 'bg-red-600 text-white border-red-600'
					     : tab.id === 'breaching' ? 'bg-orange-500 text-white border-orange-500'
					     : tab.id === 'on_track'  ? 'bg-green-600 text-white border-green-600'
					     : 'bg-[#0B182A] text-white border-[#0B182A]'
					     : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}"
			>
				{tab.label}
				<span class="text-[11px] px-2 py-0.5 rounded-full {filterStatus === tab.id ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}">
					{loading ? '…' : tab.count}
				</span>
			</button>
		{/each}
	</div>

	<!-- Table -->
	<div class="bg-white rounded-2xl p-6 shadow">
		<div class="overflow-x-auto">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="border-b border-gray-100">
						{#each ['TICKET', 'PROJECT', 'ISSUE', 'STATUS', 'SLA DEADLINE', 'TIME LEFT', 'SLA STATUS'] as col}
							<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr><td colspan="7" class="py-12 text-center text-[13px] text-gray-400">Loading…</td></tr>
					{:else if filtered().length === 0}
						<tr>
							<td colspan="7" class="py-16 text-center">
								<div class="flex flex-col items-center gap-2">
									<Icons.CheckCircle size={24} stroke="#22c55e" />
									<p class="text-[13px] text-gray-400">No SLA issues in this category</p>
								</div>
							</td>
						</tr>
					{:else}
						{#each pagedTickets as t}
							{@const sl = slaStatus(t)}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors {sl === 'breached' ? 'bg-red-50/20' : sl === 'breaching' ? 'bg-orange-50/20' : ''}">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">{t.ticketNumber || t.id.slice(0,8)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-600">{projectName(t.projectId)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-700 max-w-[160px] truncate">{t.title}</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(t.status)}">{t.status}</span>
								</td>
								<td class="py-3 px-3 text-[12px] text-gray-500 whitespace-nowrap">{fmtDate(t.slaDeadline!)}</td>
								<td class="py-3 px-3 text-[12px] font-semibold whitespace-nowrap {sl === 'breached' ? 'text-red-600' : sl === 'breaching' ? 'text-orange-600' : 'text-gray-500'}">
									{timeLeft(t.slaDeadline!)}
								</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {slaBadge(sl)}">
										{sl === 'breached' ? 'Breached' : sl === 'breaching' ? 'Breaching Soon' : 'On Track'}
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<Pagination {currentPage} {totalPages} totalItems={filtered().length} pageSize={PAGE_SIZE} itemLabel="tickets" {loading} onchange={(p) => (currentPage = p)} />
	</div>
</div>

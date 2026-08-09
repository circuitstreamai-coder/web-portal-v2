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
	let filterProject = $state('');

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
		if (diff < 0) return 'breached';
		if (diff < 4 * 60 * 60 * 1000) return 'breaching';
		return 'on_track';
	}

	const filtered = $derived(filterProject ? tickets.filter(t => t.projectId === filterProject) : tickets);
	const withSLA  = $derived(filtered.filter(t => !!t.slaDeadline));
	const active   = $derived(withSLA.filter(t => !isResolved(t.status)));

	const breached  = $derived(active.filter(t => slaStatus(t) === 'breached').length);
	const breaching = $derived(active.filter(t => slaStatus(t) === 'breaching').length);
	const onTrack   = $derived(active.filter(t => slaStatus(t) === 'on_track').length);
	const compliance = $derived(withSLA.length ? Math.round(((withSLA.length - breached) / withSLA.length) * 100) : 100);

	// By project
	const byProject = $derived(() => {
		const map = new Map<string, { total: number; active: number; breached: number; compliance: number }>();
		for (const t of withSLA) {
			const k = t.projectId || 'Unknown';
			const row = map.get(k) ?? { total: 0, active: 0, breached: 0, compliance: 100 };
			row.total++;
			if (!isResolved(t.status)) row.active++;
			if (slaStatus(t) === 'breached') row.breached++;
			map.set(k, row);
		}
		const result = Array.from(map.entries()).map(([id, v]) => ({
			id, name: projectName(id), ...v,
			compliance: v.total ? Math.round(((v.total - v.breached) / v.total) * 100) : 100,
		}));
		return result.sort((a, b) => a.compliance - b.compliance);
	});

	// Urgent tickets (breached or breaching, sorted by SLA deadline)
	const urgentTickets = $derived(active
		.filter(t => slaStatus(t) !== 'on_track')
		.sort((a, b) => new Date(a.slaDeadline!).getTime() - new Date(b.slaDeadline!).getTime())
	);

	const PAGE_SIZE = 15;
	let currentPage = $state(1);
	const totalPages   = $derived(Math.max(1, Math.ceil(urgentTickets.length / PAGE_SIZE)));
	const pagedTickets = $derived(urgentTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

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

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	function exportCSV() {
		const header = 'Ticket #,Project,Status,State,SLA Deadline,SLA Status,Time Left';
		const rows = active.map(t => [
			t.ticketNumber, projectName(t.projectId), t.status, t.state,
			t.slaDeadline ?? '', slaStatus(t),
			t.slaDeadline ? timeLeft(t.slaDeadline) : '',
		].join(','));
		const a = document.createElement('a');
		a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
		a.download = 'sla-report.csv';
		a.click();
	}
</script>

<svelte:head><title>SLA Monitoring · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<div class="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">SLA Monitoring</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">Cross-project SLA compliance overview</p>
		</div>
		<div class="flex items-center gap-3">
			{#if projects.length > 0}
				<select bind:value={filterProject} class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none">
					<option value="">All Projects</option>
					{#each projects as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
			{/if}
			<button onclick={exportCSV} class="flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none hover:opacity-90">
				<Icons.Download size={14} />
				Export CSV
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		{#each [
			{ label: 'SLA Compliance',  value: loading ? '…' : `${compliance}%`, color: '#3b82f6' },
			{ label: 'On Track',        value: loading ? '…' : String(onTrack),  color: '#22c55e' },
			{ label: 'Breaching Soon',  value: loading ? '…' : String(breaching),color: '#f59e0b' },
			{ label: 'Breached',        value: loading ? '…' : String(breached), color: '#ef4444' },
		] as stat}
			<div class="bg-white rounded-2xl border border-gray-100 p-5">
				<div class="text-[26px] font-bold" style="color:{stat.color}">{stat.value}</div>
				<div class="text-[12px] text-gray-500 mt-1">{stat.label}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
		<!-- Per-Project SLA -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">SLA by Project</h3>
			{#if loading}
				<p class="text-[13px] text-gray-400">Loading…</p>
			{:else if byProject().length === 0}
				<p class="text-[13px] text-gray-400">No SLA data</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-gray-100">
								{#each ['PROJECT', 'ACTIVE', 'BREACHED', 'COMPLIANCE'] as col}
									<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-2 px-3 whitespace-nowrap">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each byProject() as row}
								<tr class="border-b border-gray-50 hover:bg-gray-50">
									<td class="py-2.5 px-3 text-[13px] font-medium text-gray-700">{row.name}</td>
									<td class="py-2.5 px-3 text-[13px]">{row.active}</td>
									<td class="py-2.5 px-3">
										{#if row.breached > 0}
											<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{row.breached}</span>
										{:else}
											<span class="text-[11px] text-gray-300">0</span>
										{/if}
									</td>
									<td class="py-2.5 px-3">
										<span class="text-[12px] font-semibold {row.compliance >= 90 ? 'text-green-600' : row.compliance >= 70 ? 'text-amber-600' : 'text-red-600'}">
											{row.compliance}%
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Urgent (breached/breaching) tickets -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">
				Urgent SLA Tickets
				{#if breached + breaching > 0}
					<span class="ml-2 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">{breached + breaching}</span>
				{/if}
			</h3>
			{#if loading}
				<p class="text-[13px] text-gray-400">Loading…</p>
			{:else if pagedTickets.length === 0}
				<div class="flex flex-col items-center gap-2 py-8">
					<Icons.CheckCircle size={24} stroke="#22c55e" />
					<p class="text-[13px] text-gray-400">No urgent SLA issues</p>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each pagedTickets as t}
						{@const sl = slaStatus(t)}
						<div class="flex items-center gap-3 p-3 rounded-xl border {sl === 'breached' ? 'border-red-100 bg-red-50/30' : 'border-orange-100 bg-orange-50/30'}">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-[13px] font-semibold text-[#E87D1F]">{t.ticketNumber || t.id.slice(0,8)}</span>
									<span class="text-[11px] text-gray-400">{projectName(t.projectId)}</span>
								</div>
								<p class="text-[12px] text-gray-600 truncate">{t.title}</p>
								<p class="text-[11px] text-gray-400">SLA: {fmtDate(t.slaDeadline!)}</p>
							</div>
							<div class="text-right shrink-0">
								<p class="text-[12px] font-semibold {sl === 'breached' ? 'text-red-600' : 'text-orange-600'}">{timeLeft(t.slaDeadline!)}</p>
								<p class="text-[11px] text-gray-400 mt-0.5">{t.state || '—'}</p>
							</div>
						</div>
					{/each}
				</div>
				<Pagination {currentPage} {totalPages} totalItems={urgentTickets.length} pageSize={PAGE_SIZE} itemLabel="tickets" {loading} onchange={(p) => (currentPage = p)} />
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { restRequest } from '$lib/api/rest';
	import type { Ticket } from '$lib/modules/data/tickets/queries';
	import type { Project } from '$lib/modules/data/projects/queries';

	let tickets  = $state<Ticket[]>([]);
	let projects = $state<Project[]>([]);
	let loading  = $state(true);
	let filterProject = $state('');

	onMount(async () => {
		try {
			[tickets, projects] = await Promise.all([
				restRequest<Ticket[]>('/api/tickets'),
				restRequest<Project[]>('/api/projects').catch(() => [] as Project[]),
			]);
		} catch {
			toast.error('Failed to load report data');
		} finally {
			loading = false;
		}
	});

	function projectName(id: string) {
		return projects.find((p) => p.id === id)?.name ?? id;
	}

	const filtered = $derived(filterProject ? tickets.filter((t) => t.projectId === filterProject) : tickets);

	function isResolved(s: string) { return s === 'resolved' || s === 'closed'; }
	function isBreached(t: Ticket) {
		if (!t.slaDeadline) return false;
		return !isResolved(t.status) && new Date(t.slaDeadline).getTime() < Date.now();
	}

	const total      = $derived(filtered.length);
	const resolved   = $derived(filtered.filter(t => isResolved(t.status)).length);
	const open       = $derived(filtered.filter(t => t.status === 'open').length);
	const breached   = $derived(filtered.filter(isBreached).length);
	const withSLA    = $derived(filtered.filter(t => !!t.slaDeadline));
	const slaComp    = $derived(withSLA.length ? Math.round(((withSLA.length - breached) / withSLA.length) * 100) : 100);

	// By project
	const byProject = $derived(() => {
		const map = new Map<string, { total: number; resolved: number; open: number; breached: number }>();
		for (const t of filtered) {
			const k = t.projectId || 'Unknown';
			const r = map.get(k) ?? { total: 0, resolved: 0, open: 0, breached: 0 };
			r.total++;
			if (isResolved(t.status)) r.resolved++;
			else r.open++;
			if (isBreached(t)) r.breached++;
			map.set(k, r);
		}
		return Array.from(map.entries())
			.map(([id, v]) => ({ id, name: projectName(id), ...v }))
			.sort((a, b) => b.total - a.total);
	});

	// Monthly (last 6 months)
	const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	const monthlyData = $derived(() => {
		const now = new Date();
		const months = Array.from({ length: 6 }, (_, i) => {
			const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
			return { month: MONTHS[d.getMonth()], opened: 0, resolved: 0 };
		});
		const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
		for (const t of filtered) {
			const created = new Date(t.createdAt).getTime();
			if (created < cutoff) continue;
			const mIdx = (new Date(t.createdAt).getFullYear() - now.getFullYear()) * 12
				+ new Date(t.createdAt).getMonth() - now.getMonth() + 5;
			if (mIdx < 0 || mIdx > 5) continue;
			months[mIdx].opened++;
			if (isResolved(t.status)) months[mIdx].resolved++;
		}
		return months;
	});

	const chartMax = $derived(Math.max(10, ...monthlyData().flatMap(d => [d.opened, d.resolved])));

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function statusBadge(s: string) {
		const map: Record<string, string> = {
			open: 'bg-blue-50 text-blue-600', assigned: 'bg-indigo-50 text-indigo-600', accepted: 'bg-teal-50 text-teal-600',
			in_progress: 'bg-amber-50 text-amber-600', pending_validation: 'bg-purple-50 text-purple-600',
			resolved: 'bg-green-50 text-green-600', closed: 'bg-gray-100 text-gray-500',
		};
		return map[s?.toLowerCase().replace(/ /g, '_')] ?? 'bg-gray-100 text-gray-500';
	}

	function exportCSV() {
		const header = 'Ticket #,Project,Status,Priority,SLA Deadline,Created At,Received At,Closed At';
		const rows = filtered.map(t =>
			[t.ticketNumber, projectName(t.projectId), t.status, t.priority, t.slaDeadline ?? '', t.createdAt, t.receivedAt ?? '', t.closedAt ?? ''].join(',')
		);
		const a = document.createElement('a');
		a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
		a.download = 'my-tickets-report.csv';
		a.click();
	}
</script>

<svelte:head><title>My Reports · Customer · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<!-- Header -->
	<div class="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">Project Reports</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">View ticket statistics for your projects</p>
		</div>
		<div class="flex items-center gap-3">
			{#if projects.length > 0}
				<select bind:value={filterProject} class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none">
					<option value="">All Projects</option>
					{#each projects as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			{/if}
			<button
				onclick={exportCSV}
				class="flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none"
			>
				<Icons.Download size={14} />
				Export CSV
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
		{#each [
			{ label: 'Total Tickets',   value: loading ? '…' : String(total),         color: '#0B182A' },
			{ label: 'Resolved',        value: loading ? '…' : String(resolved),       color: '#22c55e' },
			{ label: 'Open',            value: loading ? '…' : String(open),           color: '#3b82f6' },
			{ label: 'SLA Compliance',  value: loading ? '…' : `${slaComp}%`,          color: '#f59e0b' },
		] as stat}
			<div class="bg-white rounded-2xl border border-gray-100 p-5">
				<div class="text-[24px] font-bold" style="color: {stat.color};">{stat.value}</div>
				<div class="text-[12px] text-gray-500 mt-1">{stat.label}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
		<!-- Monthly Chart -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<h3 class="text-[16px] font-semibold text-[#0B182A] mb-5">Monthly Ticket Volume (Last 6 Months)</h3>
			<div class="flex gap-3 h-48">
				<div class="flex flex-col justify-between text-[11px] text-gray-400 pb-5">
					{#each [chartMax, Math.round(chartMax * 0.75), Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0] as lbl}
						<span>{lbl}</span>
					{/each}
				</div>
				<div class="flex-1 relative pb-5">
					<div class="absolute inset-0 bottom-5 flex flex-col justify-between">
						{#each [0,1,2,3,4] as _}<div class="border-b border-gray-100"></div>{/each}
					</div>
					<div class="absolute inset-0 pb-5 flex items-end justify-around">
						{#each monthlyData() as d}
							<div class="flex flex-col items-center gap-1">
								<div class="flex gap-1 items-end">
									<div class="w-5 bg-blue-500 rounded-t" style="height:{chartMax>0?(d.opened/chartMax)*160:0}px"></div>
									<div class="w-5 bg-green-500 rounded-t" style="height:{chartMax>0?(d.resolved/chartMax)*160:0}px"></div>
								</div>
								<span class="text-[11px] text-gray-400">{d.month}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
			<div class="flex gap-4 mt-1">
				<span class="flex items-center gap-1.5 text-[11px] text-gray-500"><span class="w-3 h-3 rounded-sm bg-blue-500"></span>Opened</span>
				<span class="flex items-center gap-1.5 text-[11px] text-gray-500"><span class="w-3 h-3 rounded-sm bg-green-500"></span>Resolved</span>
			</div>
		</div>

		<!-- By Project -->
		<div class="bg-white rounded-2xl p-6 border border-gray-100">
			<h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">Tickets by Project</h3>
			{#if loading}
				<p class="text-[13px] text-gray-400">Loading…</p>
			{:else if byProject().length === 0}
				<p class="text-[13px] text-gray-400">No ticket data available</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="border-b border-gray-100">
								{#each ['PROJECT', 'TOTAL', 'OPEN', 'RESOLVED', 'SLA BREACHES'] as col}
									<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-2 px-2 whitespace-nowrap">{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each byProject() as row}
								<tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
									<td class="py-2.5 px-2 text-[13px] font-medium text-gray-700">{row.name}</td>
									<td class="py-2.5 px-2 text-[13px] font-semibold">{row.total}</td>
									<td class="py-2.5 px-2 text-[13px] text-gray-600">{row.open}</td>
									<td class="py-2.5 px-2 text-[13px] text-gray-600">{row.resolved}</td>
									<td class="py-2.5 px-2">
										{#if row.breached > 0}
											<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{row.breached}</span>
										{:else}
											<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">0</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- Ticket list -->
	<div class="bg-white rounded-2xl p-6 border border-gray-100">
		<h3 class="text-[18px] font-semibold text-[#0B182A] mb-4">All Tickets</h3>
		{#if loading}
			<p class="text-center text-[13px] text-gray-400 py-8">Loading…</p>
		{:else if filtered.length === 0}
			<p class="text-center text-[13px] text-gray-400 py-8">No tickets</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-100">
							{#each ['TICKET #', 'PROJECT', 'ISSUE', 'STATUS', 'PRIORITY', 'SLA', 'CREATED'] as col}
								<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filtered.slice(0, 50) as t}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F]">{t.ticketNumber || t.id.slice(0,8)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-600">{projectName(t.projectId)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-700 max-w-[180px] truncate">{t.title}</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(t.status)}">{t.status}</span>
								</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full
										{t.priority === 'High' ? 'bg-red-50 text-red-500' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-600'}">
										{t.priority || '—'}
									</span>
								</td>
								<td class="py-3 px-3 text-[12px] {isBreached(t) ? 'text-red-600 font-semibold' : 'text-gray-400'}">
									{t.slaDeadline ? fmtDate(t.slaDeadline) : '—'}
								</td>
								<td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

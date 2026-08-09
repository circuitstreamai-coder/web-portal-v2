<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { restRequest } from '$lib/api/rest';
	import type { ReplacementRequest } from '$lib/api/replacements';

	let replacements = $state<ReplacementRequest[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			replacements = await restRequest<ReplacementRequest[]>('/api/replacements/my');
		} catch {
			try {
				const all = await restRequest<ReplacementRequest[]>('/api/replacements');
				replacements = all;
			} catch (err) {
				toast.error('Failed to load replacement requests');
			}
		} finally {
			loading = false;
		}
	});

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function statusBadge(s: string) {
		const map: Record<string, string> = {
			pending:    'bg-amber-50 text-amber-700',
			approved:   'bg-blue-50 text-blue-700',
			dispatched: 'bg-indigo-50 text-indigo-700',
			replaced:   'bg-green-50 text-green-700',
			rejected:   'bg-red-50 text-red-600',
		};
		return map[s] ?? 'bg-gray-100 text-gray-500';
	}

	function statusLabel(s: string) {
		const map: Record<string, string> = {
			pending:    'Requested',
			approved:   'Approved',
			dispatched: 'Dispatched',
			replaced:   'Replaced',
			rejected:   'Rejected',
		};
		return map[s] ?? s;
	}

	// Timeline steps
	const STEPS = ['pending', 'approved', 'dispatched', 'replaced'] as const;
	const STEP_LABELS: Record<string, string> = { pending: 'Requested', approved: 'Approved', dispatched: 'Dispatched', replaced: 'Replaced' };

	let selected = $state<ReplacementRequest | null>(null);
	const selectedStepIdx = $derived(
		selected
			? STEPS.indexOf((selected.status !== 'rejected' ? selected.status : 'pending') as typeof STEPS[number])
			: -1,
	);
</script>

<svelte:head><title>Device Replacements · Customer · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<div class="flex items-center justify-between bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">Device Replacements</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">Track the status of device replacement requests on your tickets</p>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
		{#each [
			{ label: 'Total Requests', value: replacements.length, color: 'text-[#0B182A]' },
			{ label: 'Pending',        value: replacements.filter(r => r.status === 'pending').length,  color: 'text-amber-600' },
			{ label: 'Dispatched',     value: replacements.filter(r => r.status === 'dispatched').length, color: 'text-indigo-600' },
			{ label: 'Completed',      value: replacements.filter(r => r.status === 'replaced').length, color: 'text-green-600' },
		] as stat}
			<div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
				<p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
				<p class="text-[24px] font-bold {stat.color}">{loading ? '—' : stat.value}</p>
			</div>
		{/each}
	</div>

	<!-- List -->
	<div class="bg-white rounded-2xl p-6 shadow">
		{#if loading}
			<div class="flex items-center justify-center py-16 text-[13px] text-gray-400 gap-2">
				<div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
				Loading…
			</div>
		{:else if replacements.length === 0}
			<div class="flex flex-col items-center gap-3 py-16">
				<div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
					<Icons.Cube size={22} stroke="#9ca3af" />
				</div>
				<p class="text-[13px] text-gray-400">No device replacement requests found</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-100">
							{#each ['TICKET', 'DEVICE TYPE', 'REASON', 'STATUS', 'PO NUMBER', 'REQUESTED', 'DETAILS'] as col}
								<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each replacements as r}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">{r.ticketNumber || r.ticketId.slice(0,8)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-700 font-medium">{r.deviceType}</td>
								<td class="py-3 px-3 text-[12px] text-gray-500 max-w-[200px] truncate">{r.reason}</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(r.status)}">
										{statusLabel(r.status)}
									</span>
								</td>
								<td class="py-3 px-3 text-[13px] text-gray-500">{r.poNumber ?? '—'}</td>
								<td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(r.requestedAt)}</td>
								<td class="py-3 px-3">
									<button
										onclick={() => (selected = r)}
										class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
										aria-label="View timeline"
									>
										<Icons.Eye size={15} />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<!-- Timeline Modal -->
{#if selected}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" aria-label="Close" onclick={() => (selected = null)}></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" tabindex="-1">
			<div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
				<div>
					<p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">{selected.ticketNumber || selected.ticketId.slice(0,8)}</p>
					<h2 class="text-[15px] font-semibold text-[#0B182A]">Replacement Status</h2>
				</div>
				<button onclick={() => (selected = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="px-6 py-5">
				<div class="flex items-center gap-3 p-3 rounded-xl bg-fuchsia-50 mb-5">
					<Icons.Cube size={18} stroke="#a21caf" />
					<div>
						<p class="text-[13px] font-semibold text-fuchsia-800">{selected.deviceType}</p>
						<p class="text-[11px] text-fuchsia-600 mt-0.5">{selected.reason}</p>
					</div>
				</div>
				<div class="flex flex-col gap-0">
					{#each STEPS as step, i}
						{@const done = i <= selectedStepIdx && selected.status !== 'rejected'}
						{@const active = i === selectedStepIdx && selected.status !== 'rejected'}
						<div class="flex gap-3 {i < STEPS.length - 1 ? 'pb-4' : ''}">
							<div class="flex flex-col items-center">
								<div class="w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 {done ? 'bg-fuchsia-600 border-fuchsia-600' : 'bg-white border-gray-200'}">
									{#if done}<Icons.Check size={12} stroke="white" />{:else}<span class="w-2 h-2 rounded-full bg-gray-300"></span>{/if}
								</div>
								{#if i < STEPS.length - 1}
									<div class="w-0.5 flex-1 mt-1 {done ? 'bg-fuchsia-300' : 'bg-gray-200'}"></div>
								{/if}
							</div>
							<div class="pt-0.5 pb-2">
								<p class="text-[13px] font-semibold {active ? 'text-fuchsia-700' : done ? 'text-gray-700' : 'text-gray-400'}">{STEP_LABELS[step]}</p>
								{#if step === 'approved' && selected.poNumber}
									<p class="text-[11px] text-gray-400 mt-0.5">PO: {selected.poNumber}</p>
								{/if}
							</div>
						</div>
					{/each}
					{#if selected.status === 'rejected'}
						<div class="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
							<Icons.XSquare size={14} stroke="#dc2626" />
							<p class="text-[12px] text-red-600 font-medium">Request rejected</p>
						</div>
					{/if}
				</div>
			</div>
			<div class="flex justify-end px-6 pb-5">
				<button onclick={() => (selected = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Close</button>
			</div>
		</div>
	</div>
{/if}

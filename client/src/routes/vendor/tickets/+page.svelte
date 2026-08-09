<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { authStore } from '$lib/stores/auth';
	import { fetchTickets, type Ticket } from '$lib/modules/data/tickets/queries';
	import { createTicketHistory, uploadTicketAttachment } from '$lib/modules/data/tickets/actions';
	import { updateTicketStatus } from '$lib/api/tickets';
	import { TICKET_STATUS_LABELS, type TicketStatus } from '$lib/config/roles';
	import { fetchProjects, type Project } from '$lib/modules/data/projects/queries';
	import ClosureChecklist from '$lib/modules/data/tickets/ClosureChecklist.svelte';
	import { queryVersion, invalidate } from '$lib/stores/query';
	import Pagination from '$lib/components/Pagination.svelte';

	const user = $derived($authStore.user);

	let allTickets   = $state<Ticket[]>([]);
	let projects     = $state<Project[]>([]);
	let loading      = $state(true);
	let activeTab    = $state<'assigned' | 'all_l3'>('assigned');

	const assignedTickets = $derived(user ? allTickets.filter((t) => t.assignedEngineerId === user.id) : allTickets);
	const l3Tickets       = $derived(allTickets.filter((t) => t.escalationLevel === 'L3'));
	const tickets         = $derived(activeTab === 'all_l3' ? l3Tickets : assignedTickets);

	let statusTicket = $state<Ticket | null>(null);
	let newStatus    = $state<TicketStatus>('in_progress');
	let remarks      = $state('');
	let statusSaving = $state(false);
	let uploadTicket = $state<Ticket | null>(null);
	let irFileInput  = $state<HTMLInputElement | null>(null);
	let siteImageInput = $state<HTMLInputElement | null>(null);
	let selectedIrFile  = $state<File | null>(null);
	let selectedSiteFiles = $state<File[]>([]);
	let uploadingIr = $state(false);
	let uploadingSite = $state(false);
	let checklistRefreshKey = $state(0);
	let lastSeenVersion = $state<number | null>(null);

	const PAGE_SIZE = 15;
	let currentPage = $state(1);
	const totalPages   = $derived(Math.max(1, Math.ceil(tickets.length / PAGE_SIZE)));
	const pagedTickets = $derived(tickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

	async function loadTickets() {
		allTickets = await fetchTickets();
	}

	onMount(async () => {
		try {
			const [, projs] = await Promise.all([
				loadTickets(),
				fetchProjects().catch(() => [] as Project[]),
			]);
			projects = projs;
		} catch {
			toast.error('Failed to load tickets');
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		const version = $queryVersion.tickets;
		if (lastSeenVersion === null) { lastSeenVersion = version; return; }
		if (version === lastSeenVersion) return;
		lastSeenVersion = version;
		void loadTickets().catch(() => toast.error('Failed to refresh'));
	});

	function projectName(id: string) {
		return projects.find((p) => p.id === id)?.name ?? '—';
	}

	function fmtDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function statusBadge(s: string) {
		const map: Record<string, string> = {
			open: 'bg-blue-50 text-blue-600', assigned: 'bg-indigo-50 text-indigo-600', accepted: 'bg-teal-50 text-teal-600',
			in_progress: 'bg-amber-50 text-amber-600', on_hold: 'bg-yellow-50 text-yellow-700',
			escalated_l3: 'bg-red-50 text-red-600', pending_validation: 'bg-purple-50 text-purple-600',
			resolved: 'bg-green-50 text-green-600', closed: 'bg-gray-100 text-gray-500',
		};
		return map[s?.toLowerCase().replace(/ /g, '_')] ?? 'bg-gray-100 text-gray-500';
	}

	function openStatus(t: Ticket) {
		statusTicket = t;
		newStatus    = 'in_progress';
		remarks      = '';
	}

	async function saveStatus() {
		if (!statusTicket) return;
		statusSaving = true;
		try {
			await createTicketHistory({ ticketId: statusTicket.id, status: newStatus, remarks: remarks.trim() || undefined, author: user?.id ?? 'vendor' });
			const updated = await updateTicketStatus(statusTicket.id, newStatus, remarks.trim() || undefined);
			allTickets = allTickets.map((t) => (t.id === updated.id ? { ...t, ...updated } : t));
			toast.success('Status updated');
			statusTicket = null;
			invalidate('tickets');
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			statusSaving = false;
		}
	}

	function openUpload(t: Ticket) {
		uploadTicket = t; selectedIrFile = null; selectedSiteFiles = []; checklistRefreshKey++;
	}

	async function submitIrUpload() {
		if (!uploadTicket || !selectedIrFile) return;
		uploadingIr = true;
		try {
			await uploadTicketAttachment({ ticketId: uploadTicket.id, file: selectedIrFile, type: 'ir_report', author: user?.id ?? 'vendor' });
			selectedIrFile = null; if (irFileInput) irFileInput.value = ''; checklistRefreshKey++;
			toast.success('IR uploaded');
		} catch (err) { toast.error(`Upload failed: ${(err as Error).message}`); }
		finally { uploadingIr = false; }
	}

	async function submitSiteImages() {
		if (!uploadTicket || selectedSiteFiles.length === 0) return;
		uploadingSite = true;
		try {
			await Promise.all(selectedSiteFiles.map((f) => uploadTicketAttachment({ ticketId: uploadTicket!.id, file: f, type: 'site_image', author: user?.id ?? 'vendor' })));
			selectedSiteFiles = []; if (siteImageInput) siteImageInput.value = ''; checklistRefreshKey++;
			toast.success('Site images uploaded');
		} catch (err) { toast.error(`Upload failed: ${(err as Error).message}`); }
		finally { uploadingSite = false; }
	}

	const fieldClass = 'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';
</script>

<svelte:head><title>Tickets · Vendor Support · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<!-- Tabs -->
	<div class="flex items-center gap-2 flex-wrap">
		{#each [
			{ id: 'assigned' as const, label: 'Assigned to Me', count: assignedTickets.length },
			{ id: 'all_l3'  as const, label: 'All L3 Escalations', count: l3Tickets.length },
		] as tab}
			<button
				onclick={() => { activeTab = tab.id; currentPage = 1; }}
				class="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-all
					   {activeTab === tab.id ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
			>
				{tab.label}
				<span class="text-[11px] px-2 py-0.5 rounded-full {activeTab === tab.id ? 'bg-white/15' : 'bg-gray-100 text-gray-500'}">
					{loading ? '…' : tab.count}
				</span>
			</button>
		{/each}
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
		{#each [
			{ label: 'Assigned',    value: tickets.filter(t => t.status === 'assigned').length,    color: 'text-indigo-600' },
			{ label: 'In Progress', value: tickets.filter(t => t.status === 'in_progress').length, color: 'text-amber-600'  },
			{ label: 'Resolved',    value: tickets.filter(t => t.status === 'resolved').length,    color: 'text-green-600'  },
			{ label: 'Total',       value: tickets.length,                                         color: 'text-[#0B182A]'  },
		] as stat}
			<div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
				<p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
				<p class="text-[24px] font-bold {stat.color}">{loading ? '—' : stat.value}</p>
			</div>
		{/each}
	</div>

	<!-- Table -->
	<div class="bg-white rounded-2xl p-6 shadow">
		<div class="flex items-center gap-3 mb-4">
			<h3 class="text-[18px] font-semibold text-[#0B182A]">
				{activeTab === 'all_l3' ? 'All L3 Escalated Tickets' : 'Assigned Tickets'}
			</h3>
			<span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{tickets.length} Total</span>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-sm border-collapse">
				<thead>
					<tr class="border-b border-gray-100">
						{#each ['TICKET', 'PROJECT', 'ISSUE', 'STATUS', 'PRIORITY', 'DATE', 'ACTIONS'] as col}
							<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr><td colspan="7" class="py-12 text-center text-[13px] text-gray-400">Loading…</td></tr>
					{:else if tickets.length === 0}
						<tr>
							<td colspan="7" class="py-16 text-center">
								<div class="flex flex-col items-center gap-2">
									<Icons.Ticket size={22} stroke="#9ca3af" />
									<p class="text-[13px] text-gray-400">No tickets</p>
								</div>
							</td>
						</tr>
					{:else}
						{#each pagedTickets as t}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">{t.ticketNumber || t.id.slice(0,8)}</td>
								<td class="py-3 px-3 text-[13px] text-gray-600">{projectName(t.projectId)}</td>
								<td class="py-3 px-3">
									<p class="text-[13px] font-medium text-gray-800 max-w-[180px] truncate">{t.title}</p>
									{#if t.description}<p class="text-[11px] text-gray-400 max-w-[180px] truncate">{t.description}</p>{/if}
								</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(t.status)}">
										{TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS] ?? t.status}
									</span>
								</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full
										{t.priority === 'High' ? 'bg-red-50 text-red-500' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-600'}">
										{t.priority || '—'}
									</span>
								</td>
								<td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
								<td class="py-3 px-3">
									{#if ['assigned', 'in_progress'].includes(t.status)}
										<div class="flex gap-1">
											<button
												onclick={() => openStatus(t)}
												class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-[#0B182A] text-white hover:opacity-80 transition-opacity cursor-pointer"
											>Update</button>
											<button
												onclick={() => openUpload(t)}
												class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
											>Upload</button>
										</div>
									{:else}
										<span class="text-[12px] text-gray-300">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<Pagination {currentPage} {totalPages} totalItems={tickets.length} pageSize={PAGE_SIZE} itemLabel="tickets" {loading} onchange={(p) => (currentPage = p)} />
	</div>
</div>

<!-- Update Status Modal -->
{#if statusTicket}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" aria-label="Close" onclick={() => (statusTicket = null)}></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" tabindex="-1">
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<h2 class="text-[15px] font-semibold text-[#0B182A]">Update Status</h2>
				<button onclick={() => (statusTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="px-6 py-5 flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					{#each ['in_progress', 'resolved'] as s}
						<button
							type="button"
							onclick={() => (newStatus = s as TicketStatus)}
							class="flex items-center gap-3 px-4 py-3 rounded-xl border text-[13px] font-medium transition-all cursor-pointer text-left
								   {newStatus === s ? 'bg-[#0B182A] border-[#0B182A] text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}"
						>
							<span class="w-5 h-5 rounded-full border-2 flex items-center justify-center {newStatus === s ? 'border-current' : 'border-gray-300'}">
								{#if newStatus === s}<span class="w-2.5 h-2.5 rounded-full bg-current"></span>{/if}
							</span>
							{TICKET_STATUS_LABELS[s as TicketStatus]}
						</button>
					{/each}
				</div>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Remarks</span>
					<textarea bind:value={remarks} placeholder="Describe work done…" rows="3" class="{fieldClass} resize-none"></textarea>
				</label>
			</div>
			<div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
				<button onclick={() => (statusTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Cancel</button>
				<button onclick={saveStatus} disabled={statusSaving} class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
					{statusSaving ? 'Saving…' : 'Update'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Upload Docs Modal -->
{#if uploadTicket}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" aria-label="Close" onclick={() => (uploadTicket = null)}></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-xl shadow-2xl" role="dialog" aria-modal="true" tabindex="-1">
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<h2 class="text-[15px] font-semibold text-[#0B182A]">Upload Resolution Documents</h2>
				<button onclick={() => (uploadTicket = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<div class="px-6 py-5 flex flex-col gap-5">
				<ClosureChecklist ticketId={uploadTicket.id} refreshKey={checklistRefreshKey} />
				<div class="grid grid-cols-2 gap-4">
					<div class="border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
						<p class="text-[13px] font-semibold text-[#0B182A]">IR Report</p>
						<label class="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#0B182A]">
							<Icons.File size={20} stroke="#6b7280" />
							<p class="text-[12px] text-gray-500">{selectedIrFile ? selectedIrFile.name : 'Select PDF/DOC'}</p>
							<input type="file" class="hidden" accept=".pdf,.doc,.docx" onchange={(e) => (selectedIrFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} bind:this={irFileInput} />
						</label>
						<button onclick={submitIrUpload} disabled={!selectedIrFile || uploadingIr} class="px-4 py-2 text-[12px] font-semibold text-white bg-[#0B182A] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
							{uploadingIr ? 'Uploading…' : 'Upload IR'}
						</button>
					</div>
					<div class="border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
						<p class="text-[13px] font-semibold text-[#0B182A]">Site Images</p>
						<label class="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#0B182A]">
							<Icons.CloudUpload size={20} stroke="#6b7280" />
							<p class="text-[12px] text-gray-500">{selectedSiteFiles.length > 0 ? `${selectedSiteFiles.length} file(s)` : 'Select images'}</p>
							<input type="file" class="hidden" accept="image/*" multiple onchange={(e) => (selectedSiteFiles = Array.from((e.currentTarget as HTMLInputElement).files ?? []))} bind:this={siteImageInput} />
						</label>
						<button onclick={submitSiteImages} disabled={selectedSiteFiles.length === 0 || uploadingSite} class="px-4 py-2 text-[12px] font-semibold text-white bg-[#E87D1F] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
							{uploadingSite ? 'Uploading…' : 'Upload Images'}
						</button>
					</div>
				</div>
				<div class="flex justify-end border-t border-gray-100 pt-3">
					<button onclick={() => (uploadTicket = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Done</button>
				</div>
			</div>
		</div>
	</div>
{/if}

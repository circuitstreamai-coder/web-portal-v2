<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { restRequest } from '$lib/api/rest';

	interface ConfigRecord {
		id: string;
		deviceName: string;
		deviceType: string;
		serialNumber: string | null;
		location: string | null;
		ipAddress: string | null;
		firmwareVersion: string | null;
		configState: 'configured' | 'pending' | 'needs_update' | 'decommissioned';
		notes: string | null;
		lastUpdated: string;
		createdAt: string;
	}

	let records     = $state<ConfigRecord[]>([]);
	let loading     = $state(true);
	let saving      = $state(false);
	let showForm    = $state(false);
	let editRecord  = $state<ConfigRecord | null>(null);
	let deleteTarget = $state<ConfigRecord | null>(null);
	let deleting    = $state(false);

	let searchQuery  = $state('');
	let filterState  = $state('');
	let filterType   = $state('');

	const filtered = $derived(() => {
		const q = searchQuery.trim().toLowerCase();
		return records.filter(r => {
			if (filterState && r.configState !== filterState) return false;
			if (filterType  && r.deviceType  !== filterType)  return false;
			if (q) return (
				r.deviceName.toLowerCase().includes(q) ||
				(r.serialNumber ?? '').toLowerCase().includes(q) ||
				(r.location ?? '').toLowerCase().includes(q) ||
				(r.ipAddress ?? '').toLowerCase().includes(q)
			);
			return true;
		});
	});

	const uniqueTypes = $derived([...new Set(records.map(r => r.deviceType).filter(Boolean))].sort());

	onMount(async () => {
		try {
			records = await restRequest<ConfigRecord[]>('/api/inventory/config-records');
		} catch {
			records = [];
		} finally {
			loading = false;
		}
	});

	let form = $state({
		deviceName: '',
		deviceType: '',
		serialNumber: '',
		location: '',
		ipAddress: '',
		firmwareVersion: '',
		configState: 'configured' as ConfigRecord['configState'],
		notes: '',
	});

	function openAdd() {
		editRecord = null;
		form = { deviceName: '', deviceType: '', serialNumber: '', location: '', ipAddress: '', firmwareVersion: '', configState: 'configured', notes: '' };
		showForm = true;
	}

	function openEdit(r: ConfigRecord) {
		editRecord = r;
		form = {
			deviceName: r.deviceName,
			deviceType: r.deviceType,
			serialNumber: r.serialNumber ?? '',
			location: r.location ?? '',
			ipAddress: r.ipAddress ?? '',
			firmwareVersion: r.firmwareVersion ?? '',
			configState: r.configState,
			notes: r.notes ?? '',
		};
		showForm = true;
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!form.deviceName.trim()) {
			toast.error('Device name is required');
			return;
		}
		saving = true;
		try {
			const body = {
				deviceName: form.deviceName.trim(),
				deviceType: form.deviceType.trim(),
				serialNumber: form.serialNumber || null,
				location: form.location || null,
				ipAddress: form.ipAddress || null,
				firmwareVersion: form.firmwareVersion || null,
				configState: form.configState,
				notes: form.notes || null,
				lastUpdated: new Date().toISOString(),
			};
			if (editRecord) {
				const updated = await restRequest<ConfigRecord>(`/api/inventory/config-records/${editRecord.id}`, {
					method: 'PATCH', body: JSON.stringify(body),
				});
				records = records.map(r => r.id === editRecord!.id ? { ...r, ...updated } : r);
				toast.success('Configuration record updated');
			} else {
				const created = await restRequest<ConfigRecord>('/api/inventory/config-records', {
					method: 'POST', body: JSON.stringify(body),
				});
				records = [created, ...records];
				toast.success('Configuration record added');
			}
			showForm = false;
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		deleting = true;
		try {
			await restRequest(`/api/inventory/config-records/${deleteTarget.id}`, { method: 'DELETE' });
			records = records.filter(r => r.id !== deleteTarget!.id);
			toast.success('Record deleted');
			deleteTarget = null;
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			deleting = false;
		}
	}

	const STATE_LABEL: Record<string, string> = { configured: 'Configured', pending: 'Pending', needs_update: 'Needs Update', decommissioned: 'Decommissioned' };
	const STATE_CLASS: Record<string, string> = {
		configured: 'bg-green-50 text-green-600',
		pending: 'bg-amber-50 text-amber-600',
		needs_update: 'bg-orange-50 text-orange-600',
		decommissioned: 'bg-gray-100 text-gray-500',
	};

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function exportCSV() {
		const header = 'Device,Type,Serial,Location,IP Address,Firmware,Config State,Last Updated,Notes';
		const rows = filtered().map(r => [
			r.deviceName, r.deviceType, r.serialNumber ?? '', r.location ?? '', r.ipAddress ?? '',
			r.firmwareVersion ?? '', r.configState, fmtDate(r.lastUpdated), (r.notes ?? '').replace(/,/g, ';'),
		].join(','));
		const a = document.createElement('a');
		a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
		a.download = 'config-records.csv';
		a.click();
	}

	const fieldClass = 'px-3 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';
</script>

<svelte:head><title>Config Records · Inventory · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<!-- Header -->
	<div class="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">Configuration Records</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">Track device configuration state, firmware, and network details</p>
		</div>
		<div class="flex gap-2">
			<button onclick={exportCSV} class="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 cursor-pointer hover:border-[#0B182A]">
				<Icons.Download size={14} /> Export
			</button>
			<button onclick={openAdd} class="flex items-center gap-1.5 px-4 py-2.5 bg-[#E87D1F] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none">
				<Icons.Plus size={14} strokeWidth={2.5} /> Add Record
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		{#each [
			{ label: 'Total Devices',    value: loading ? '…' : String(records.length),                                              color: '#0B182A' },
			{ label: 'Configured',       value: loading ? '…' : String(records.filter(r=>r.configState==='configured').length),      color: '#22c55e' },
			{ label: 'Needs Update',     value: loading ? '…' : String(records.filter(r=>r.configState==='needs_update').length),    color: '#f97316' },
			{ label: 'Decommissioned',   value: loading ? '…' : String(records.filter(r=>r.configState==='decommissioned').length),  color: '#6b7280' },
		] as stat}
			<div class="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
				<div class="text-[24px] font-bold" style="color:{stat.color}">{stat.value}</div>
				<div class="text-[12px] text-gray-500 mt-1">{stat.label}</div>
			</div>
		{/each}
	</div>

	<!-- Filters -->
	<div class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow">
		<div class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-80">
			<Icons.Search size={16} stroke="#9ca3af" />
			<input type="text" placeholder="Search device, serial, IP, location…" bind:value={searchQuery} class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400" />
		</div>
		<select bind:value={filterState} class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none">
			<option value="">All States</option>
			<option value="configured">Configured</option>
			<option value="pending">Pending</option>
			<option value="needs_update">Needs Update</option>
			<option value="decommissioned">Decommissioned</option>
		</select>
		{#if uniqueTypes.length > 0}
			<select bind:value={filterType} class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none">
				<option value="">All Types</option>
				{#each uniqueTypes as t}<option value={t}>{t}</option>{/each}
			</select>
		{/if}
	</div>

	<!-- Table -->
	<div class="bg-white rounded-2xl p-6 shadow">
		{#if loading}
			<div class="flex items-center justify-center py-16 text-[13px] text-gray-400 gap-2">
				<div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
				Loading…
			</div>
		{:else if filtered().length === 0}
			<div class="flex flex-col items-center gap-3 py-16">
				<Icons.Settings size={24} stroke="#9ca3af" />
				<p class="text-[13px] text-gray-400">{records.length === 0 ? 'No configuration records yet' : 'No records match your filters'}</p>
				<button onclick={openAdd} class="text-[13px] font-medium text-[#E87D1F] hover:underline cursor-pointer">Add first record</button>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-100">
							{#each ['DEVICE', 'TYPE', 'SERIAL', 'IP ADDRESS', 'FIRMWARE', 'CONFIG STATE', 'LAST UPDATED', 'ACTIONS'] as col}
								<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filtered() as r}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#0B182A]">{r.deviceName}</td>
								<td class="py-3 px-3 text-[13px] text-gray-600">{r.deviceType || '—'}</td>
								<td class="py-3 px-3 text-[12px] text-[#E87D1F] font-medium">{r.serialNumber ?? '—'}</td>
								<td class="py-3 px-3 text-[12px] text-gray-600 font-mono">{r.ipAddress ?? '—'}</td>
								<td class="py-3 px-3 text-[12px] text-gray-500">{r.firmwareVersion ?? '—'}</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {STATE_CLASS[r.configState] ?? 'bg-gray-100 text-gray-500'}">
										{STATE_LABEL[r.configState] ?? r.configState}
									</span>
								</td>
								<td class="py-3 px-3 text-[12px] text-gray-400">{fmtDate(r.lastUpdated)}</td>
								<td class="py-3 px-3">
									<div class="flex gap-1">
										<button onclick={() => openEdit(r)} class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors" aria-label="Edit">
											<Icons.Edit size={15} />
										</button>
										<button onclick={() => (deleteTarget = r)} class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
											<Icons.Trash size={15} />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<!-- Add/Edit Modal -->
{#if showForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" onclick={() => (showForm = false)} aria-label="Close"></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl" role="dialog" aria-modal="true">
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<h2 class="text-[15px] font-semibold text-[#0B182A]">{editRecord ? 'Edit' : 'Add'} Configuration Record</h2>
				<button onclick={() => (showForm = false)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleSave}>
				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Device Name *</span>
						<input type="text" bind:value={form.deviceName} placeholder="e.g. Core Switch 01" class={fieldClass} required />
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Device Type</span>
						<input type="text" bind:value={form.deviceType} placeholder="e.g. Router, Switch" class={fieldClass} />
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Serial Number</span>
						<input type="text" bind:value={form.serialNumber} placeholder="e.g. SN123456" class={fieldClass} />
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Location</span>
						<input type="text" bind:value={form.location} placeholder="e.g. Server Room A" class={fieldClass} />
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">IP Address</span>
						<input type="text" bind:value={form.ipAddress} placeholder="e.g. 192.168.1.1" class={fieldClass} />
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Firmware Version</span>
						<input type="text" bind:value={form.firmwareVersion} placeholder="e.g. v15.6.3M" class={fieldClass} />
					</label>
				</div>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Config State</span>
					<select bind:value={form.configState} class={fieldClass}>
						<option value="configured">Configured</option>
						<option value="pending">Pending</option>
						<option value="needs_update">Needs Update</option>
						<option value="decommissioned">Decommissioned</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</span>
					<textarea bind:value={form.notes} rows="2" placeholder="Configuration notes, VLAN assignments, etc." class="{fieldClass} resize-none"></textarea>
				</label>
				<div class="flex justify-end gap-3 pt-2 border-t border-gray-100">
					<button type="button" onclick={() => (showForm = false)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Cancel</button>
					<button type="submit" disabled={saving} class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
						{saving ? 'Saving…' : (editRecord ? 'Update' : 'Add')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation -->
{#if deleteTarget}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" onclick={() => (deleteTarget = null)} aria-label="Close"></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" role="dialog" aria-modal="true">
			<h3 class="text-[15px] font-semibold text-[#0B182A] mb-2">Delete Config Record</h3>
			<p class="text-[13px] text-gray-600 mb-5">Delete record for <strong>{deleteTarget.deviceName}</strong>? This cannot be undone.</p>
			<div class="flex justify-end gap-3">
				<button onclick={() => (deleteTarget = null)} class="px-4 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-lg cursor-pointer">Cancel</button>
				<button onclick={handleDelete} disabled={deleting} class="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer disabled:opacity-60">
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

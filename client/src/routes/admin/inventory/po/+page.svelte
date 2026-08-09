<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { restRequest } from '$lib/api/rest';

	interface PurchaseOrder {
		id: string;
		poNumber: string;
		supplierName: string;
		orderDate: string;
		expectedDelivery: string | null;
		status: 'pending' | 'partial' | 'received' | 'cancelled';
		totalAmount: number | null;
		notes: string | null;
		items: POItem[];
		createdAt: string;
	}

	interface POItem {
		id: string;
		itemName: string;
		quantity: number;
		unitPrice: number | null;
		receivedQty: number;
	}

	let orders    = $state<PurchaseOrder[]>([]);
	let loading   = $state(true);
	let saving    = $state(false);
	let showForm  = $state(false);
	let editOrder = $state<PurchaseOrder | null>(null);
	let deleteTarget = $state<PurchaseOrder | null>(null);
	let deleting  = $state(false);

	let filterStatus = $state('');
	let searchQuery  = $state('');

	const filtered = $derived(() => {
		const q = searchQuery.trim().toLowerCase();
		return orders.filter(o => {
			if (filterStatus && o.status !== filterStatus) return false;
			if (q) return o.poNumber.toLowerCase().includes(q) || o.supplierName.toLowerCase().includes(q);
			return true;
		});
	});

	onMount(async () => {
		try {
			orders = await restRequest<PurchaseOrder[]>('/api/inventory/purchase-orders');
		} catch {
			orders = [];
		} finally {
			loading = false;
		}
	});

	let form = $state({
		poNumber: '',
		supplierName: '',
		orderDate: '',
		expectedDelivery: '',
		status: 'pending' as PurchaseOrder['status'],
		totalAmount: '',
		notes: '',
	});

	function openAdd() {
		editOrder = null;
		form = { poNumber: '', supplierName: '', orderDate: new Date().toISOString().slice(0,10), expectedDelivery: '', status: 'pending', totalAmount: '', notes: '' };
		showForm = true;
	}

	function openEdit(o: PurchaseOrder) {
		editOrder = o;
		form = {
			poNumber: o.poNumber,
			supplierName: o.supplierName,
			orderDate: o.orderDate.slice(0,10),
			expectedDelivery: o.expectedDelivery?.slice(0,10) ?? '',
			status: o.status,
			totalAmount: o.totalAmount != null ? String(o.totalAmount) : '',
			notes: o.notes ?? '',
		};
		showForm = true;
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!form.poNumber.trim() || !form.supplierName.trim()) {
			toast.error('PO number and supplier are required');
			return;
		}
		saving = true;
		try {
			const body = {
				poNumber: form.poNumber.trim(),
				supplierName: form.supplierName.trim(),
				orderDate: form.orderDate,
				expectedDelivery: form.expectedDelivery || null,
				status: form.status,
				totalAmount: form.totalAmount ? Number(form.totalAmount) : null,
				notes: form.notes || null,
			};
			if (editOrder) {
				const updated = await restRequest<PurchaseOrder>(`/api/inventory/purchase-orders/${editOrder.id}`, {
					method: 'PATCH', body: JSON.stringify(body),
				});
				orders = orders.map(o => o.id === editOrder!.id ? { ...o, ...updated } : o);
				toast.success('Purchase order updated');
			} else {
				const created = await restRequest<PurchaseOrder>('/api/inventory/purchase-orders', {
					method: 'POST', body: JSON.stringify(body),
				});
				orders = [created, ...orders];
				toast.success('Purchase order created');
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
			await restRequest(`/api/inventory/purchase-orders/${deleteTarget.id}`, { method: 'DELETE' });
			orders = orders.filter(o => o.id !== deleteTarget!.id);
			toast.success('Purchase order deleted');
			deleteTarget = null;
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			deleting = false;
		}
	}

	const STATUS_LABEL: Record<string, string> = { pending: 'Pending', partial: 'Partial', received: 'Received', cancelled: 'Cancelled' };
	const STATUS_CLASS: Record<string, string> = {
		pending: 'bg-amber-50 text-amber-600',
		partial: 'bg-blue-50 text-blue-600',
		received: 'bg-green-50 text-green-600',
		cancelled: 'bg-gray-100 text-gray-500',
	};

	function fmtDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
	}

	function exportCSV() {
		const header = 'PO Number,Supplier,Order Date,Expected Delivery,Status,Total Amount,Notes';
		const rows = filtered().map(o => [
			o.poNumber, o.supplierName, fmtDate(o.orderDate), fmtDate(o.expectedDelivery),
			o.status, o.totalAmount ?? '', (o.notes ?? '').replace(/,/g, ';'),
		].join(','));
		const a = document.createElement('a');
		a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header, ...rows].join('\n'));
		a.download = 'purchase-orders.csv';
		a.click();
	}

	const fieldClass = 'px-3 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';
</script>

<svelte:head><title>Purchase Orders · Inventory · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<!-- Header -->
	<div class="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">Purchase Orders</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">Track inventory purchase orders and delivery status</p>
		</div>
		<div class="flex gap-2">
			<button onclick={exportCSV} class="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 cursor-pointer hover:border-[#0B182A]">
				<Icons.Download size={14} /> Export
			</button>
			<button onclick={openAdd} class="flex items-center gap-1.5 px-4 py-2.5 bg-[#E87D1F] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none">
				<Icons.Plus size={14} strokeWidth={2.5} /> New PO
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
		{#each [
			{ label: 'Total POs',  value: loading ? '…' : String(orders.length),                                    color: '#0B182A' },
			{ label: 'Pending',    value: loading ? '…' : String(orders.filter(o=>o.status==='pending').length),    color: '#E87D1F' },
			{ label: 'Partial',    value: loading ? '…' : String(orders.filter(o=>o.status==='partial').length),    color: '#3b82f6' },
			{ label: 'Received',   value: loading ? '…' : String(orders.filter(o=>o.status==='received').length),   color: '#22c55e' },
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
			<input type="text" placeholder="Search PO number, supplier…" bind:value={searchQuery} class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400" />
		</div>
		<select bind:value={filterStatus} class="px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 outline-none">
			<option value="">All Statuses</option>
			<option value="pending">Pending</option>
			<option value="partial">Partial</option>
			<option value="received">Received</option>
			<option value="cancelled">Cancelled</option>
		</select>
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
				<Icons.Cube size={24} stroke="#9ca3af" />
				<p class="text-[13px] text-gray-400">{orders.length === 0 ? 'No purchase orders yet' : 'No orders match your filters'}</p>
				<button onclick={openAdd} class="text-[13px] font-medium text-[#E87D1F] hover:underline cursor-pointer">Create first PO</button>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-100">
							{#each ['PO NUMBER', 'SUPPLIER', 'ORDER DATE', 'EXP. DELIVERY', 'STATUS', 'AMOUNT', 'ACTIONS'] as col}
								<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filtered() as o}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[13px] font-semibold text-[#0B182A]">{o.poNumber}</td>
								<td class="py-3 px-3 text-[13px] text-gray-700">{o.supplierName}</td>
								<td class="py-3 px-3 text-[12px] text-gray-500">{fmtDate(o.orderDate)}</td>
								<td class="py-3 px-3 text-[12px] text-gray-500">{fmtDate(o.expectedDelivery)}</td>
								<td class="py-3 px-3">
									<span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {STATUS_CLASS[o.status] ?? 'bg-gray-100 text-gray-500'}">
										{STATUS_LABEL[o.status] ?? o.status}
									</span>
								</td>
								<td class="py-3 px-3 text-[13px] text-gray-700">
									{o.totalAmount != null ? `₹${o.totalAmount.toLocaleString('en-IN')}` : '—'}
								</td>
								<td class="py-3 px-3">
									<div class="flex gap-1">
										<button onclick={() => openEdit(o)} class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors" aria-label="Edit">
											<Icons.Edit size={15} />
										</button>
										<button onclick={() => (deleteTarget = o)} class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
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
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-md shadow-2xl" role="dialog" aria-modal="true">
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<h2 class="text-[15px] font-semibold text-[#0B182A]">{editOrder ? 'Edit' : 'New'} Purchase Order</h2>
				<button onclick={() => (showForm = false)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleSave}>
				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">PO Number *</span>
						<input type="text" bind:value={form.poNumber} placeholder="e.g. PO-2024-001" class={fieldClass} required />
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</span>
						<select bind:value={form.status} class={fieldClass}>
							<option value="pending">Pending</option>
							<option value="partial">Partial</option>
							<option value="received">Received</option>
							<option value="cancelled">Cancelled</option>
						</select>
					</label>
				</div>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Supplier Name *</span>
					<input type="text" bind:value={form.supplierName} placeholder="e.g. Acme Supplies Ltd" class={fieldClass} required />
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Order Date</span>
						<input type="date" bind:value={form.orderDate} class={fieldClass} />
					</label>
					<label class="flex flex-col gap-1.5">
						<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Expected Delivery</span>
						<input type="date" bind:value={form.expectedDelivery} class={fieldClass} />
					</label>
				</div>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total Amount (₹)</span>
					<input type="number" min="0" step="0.01" bind:value={form.totalAmount} placeholder="e.g. 25000" class={fieldClass} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes</span>
					<textarea bind:value={form.notes} rows="2" placeholder="Additional notes…" class="{fieldClass} resize-none"></textarea>
				</label>
				<div class="flex justify-end gap-3 pt-2 border-t border-gray-100">
					<button type="button" onclick={() => (showForm = false)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Cancel</button>
					<button type="submit" disabled={saving} class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
						{saving ? 'Saving…' : (editOrder ? 'Update' : 'Create')}
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
			<h3 class="text-[15px] font-semibold text-[#0B182A] mb-2">Delete Purchase Order</h3>
			<p class="text-[13px] text-gray-600 mb-5">Delete PO <strong>{deleteTarget.poNumber}</strong>? This cannot be undone.</p>
			<div class="flex justify-end gap-3">
				<button onclick={() => (deleteTarget = null)} class="px-4 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-lg cursor-pointer">Cancel</button>
				<button onclick={handleDelete} disabled={deleting} class="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer disabled:opacity-60">
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import * as Icons from '$lib/icons';
	import { toast } from 'svelte-sonner';
	import { restRequest } from '$lib/api/rest';
	import { fetchTicketCategories, type TicketCategory } from '$lib/modules/data/tickets/queries';

	let categories = $state<TicketCategory[]>([]);
	let loading    = $state(true);
	let saving     = $state(false);
	let deleting   = $state<string | null>(null);

	let showForm = $state(false);
	let editId   = $state<string | null>(null);
	let form     = $state({ name: '', defaultPayout: '' });
	let errors   = $state<Record<string, string>>({});

	const CALL_TYPE_EXAMPLES = ['Router', 'Switch', 'LDD', 'New Installation', 'Configuration', 'Other'];

	onMount(async () => {
		try {
			categories = await fetchTicketCategories();
		} catch {
			toast.error('Failed to load call types');
		} finally {
			loading = false;
		}
	});

	function openAdd() {
		editId = null;
		form   = { name: '', defaultPayout: '' };
		errors = {};
		showForm = true;
	}

	function openEdit(c: TicketCategory) {
		editId = c.id;
		form   = { name: c.name, defaultPayout: String(c.defaultPayout ?? '') };
		errors = {};
		showForm = true;
	}

	function validate() {
		errors = {};
		if (!form.name.trim()) errors.name = 'Name is required';
		const p = Number(form.defaultPayout);
		if (form.defaultPayout !== '' && (isNaN(p) || p < 0)) errors.defaultPayout = 'Must be a positive number';
		return Object.keys(errors).length === 0;
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!validate()) return;
		saving = true;
		try {
			const body = {
				name: form.name.trim(),
				defaultPayout: form.defaultPayout !== '' ? Number(form.defaultPayout) : 0,
			};
			if (editId) {
				const updated = await restRequest<TicketCategory>(`/api/ticket-categories/${editId}`, {
					method: 'PATCH',
					body: JSON.stringify(body),
				});
				categories = categories.map(c => c.id === editId ? { ...c, ...updated } : c);
				toast.success('Call type updated');
			} else {
				const created = await restRequest<TicketCategory>('/api/ticket-categories', {
					method: 'POST',
					body: JSON.stringify(body),
				});
				categories = [created, ...categories];
				toast.success('Call type added');
			}
			showForm = false;
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			saving = false;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this call type? This cannot be undone.')) return;
		deleting = id;
		try {
			await restRequest(`/api/ticket-categories/${id}`, { method: 'DELETE' });
			categories = categories.filter(c => c.id !== id);
			toast.success('Deleted');
		} catch (err) {
			toast.error(`Failed: ${(err as Error).message}`);
		} finally {
			deleting = null;
		}
	}

	const fieldClass = 'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';
</script>

<svelte:head><title>Call Type Categories · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
	<!-- Header -->
	<div class="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl px-5 py-4 shadow">
		<div>
			<h2 class="text-[18px] font-semibold text-[#0B182A]">Call Type Categories</h2>
			<p class="text-[13px] text-gray-400 mt-0.5">Manage ticket call types and their default payout amounts</p>
		</div>
		<button
			onclick={openAdd}
			class="flex items-center gap-1.5 px-4 py-2.5 bg-[#E87D1F] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none"
		>
			<Icons.Plus size={14} strokeWidth={2.5} />
			Add Call Type
		</button>
	</div>

	<!-- Standard call types hint -->
	<div class="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3">
		<p class="text-[12px] font-semibold text-blue-700 mb-1">Standard TMS Call Types</p>
		<div class="flex flex-wrap gap-2">
			{#each CALL_TYPE_EXAMPLES as ex}
				<span class="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700">{ex}</span>
			{/each}
		</div>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-2xl p-6 shadow">
		{#if loading}
			<div class="flex items-center justify-center py-16 text-[13px] text-gray-400 gap-2">
				<div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
				Loading…
			</div>
		{:else if categories.length === 0}
			<div class="flex flex-col items-center gap-3 py-16">
				<Icons.Ticket size={24} stroke="#9ca3af" />
				<p class="text-[13px] text-gray-400">No call types configured yet</p>
				<button onclick={openAdd} class="text-[13px] font-medium text-[#E87D1F] hover:underline cursor-pointer">Add your first call type</button>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b border-gray-100">
							{#each ['NAME', 'DEFAULT PAYOUT', 'CREATED', 'ACTIONS'] as col}
								<th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each categories as c}
							<tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
								<td class="py-3 px-3 text-[14px] font-semibold text-[#0B182A]">{c.name}</td>
								<td class="py-3 px-3 text-[14px] font-semibold text-emerald-700">
									{c.defaultPayout ? `₹${c.defaultPayout.toLocaleString('en-IN')}` : '—'}
								</td>
								<td class="py-3 px-3 text-[12px] text-gray-400">
									{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '—'}
								</td>
								<td class="py-3 px-3">
									<div class="flex gap-1">
										<button
											onclick={() => openEdit(c)}
											class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors"
											aria-label="Edit"
										>
											<Icons.Edit size={15} />
										</button>
										<button
											onclick={() => handleDelete(c.id)}
											disabled={deleting === c.id}
											class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
											aria-label="Delete"
										>
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

<!-- Add / Edit Modal -->
{#if showForm}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-black/50 cursor-default" aria-label="Close" onclick={() => (showForm = false)}></button>
		<div class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" tabindex="-1">
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
				<h2 class="text-[15px] font-semibold text-[#0B182A]">{editId ? 'Edit' : 'Add'} Call Type</h2>
				<button onclick={() => (showForm = false)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>
			<form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleSave}>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Name <span class="text-red-400">*</span></span>
					<input type="text" placeholder="e.g. Router" bind:value={form.name} class={fieldClass} />
					{#if errors.name}<p class="text-[11px] text-red-500">{errors.name}</p>{/if}
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Default Payout (₹)</span>
					<input type="number" min="0" placeholder="e.g. 500" bind:value={form.defaultPayout} class={fieldClass} />
					{#if errors.defaultPayout}<p class="text-[11px] text-red-500">{errors.defaultPayout}</p>{/if}
				</label>
				<!-- Quick suggestions -->
				<div class="flex flex-col gap-1.5">
					<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Quick fill</span>
					<div class="flex flex-wrap gap-2">
						{#each CALL_TYPE_EXAMPLES as ex}
							<button type="button" onclick={() => (form.name = ex)} class="text-[11px] font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#0B182A] hover:text-[#0B182A] transition-colors cursor-pointer">
								{ex}
							</button>
						{/each}
					</div>
				</div>
				<div class="flex justify-end gap-3 pt-2 border-t border-gray-100">
					<button type="button" onclick={() => (showForm = false)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer">Cancel</button>
					<button type="submit" disabled={saving} class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 disabled:opacity-60 cursor-pointer">
						{saving ? 'Saving…' : (editId ? 'Update' : 'Add')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

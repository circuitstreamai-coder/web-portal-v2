<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { fetchPayoutRates, updatePayoutRate, type PayoutRate } from '$lib/api/payouts';
  import { createTicketCategory } from '$lib/modules/data/tickets/actions';
  import {
    fetchTicketCategories,
    type TicketCategory,
  } from '$lib/modules/data/tickets/queries';
  import Pagination from '$lib/components/Pagination.svelte';

  type PayoutRateRow = PayoutRate & { configured: boolean };

  // ── State ─────────────────────────────────────────────────────────────────

  let rates = $state<PayoutRateRow[]>([]);
  let categories = $state<TicketCategory[]>([]);
  let loading = $state(true);
  let creatingCategory = $state(false);
  let showCategoryForm = $state(false);

  // editing[categoryId] = draft amount string
  let editing = $state<Record<string, string>>({});
  let saving  = $state<Record<string, boolean>>({});
  let categoryErrors = $state<Record<string, string>>({});
  let categoryForm = $state({
    name: '',
    defaultPayout: '',
  });

  // ── Load ──────────────────────────────────────────────────────────────────

  onMount(loadRates);

  async function loadRates() {
    loading = true;
    try {
      const [rateRows, categoryRows] = await Promise.all([
        fetchPayoutRates(),
        fetchTicketCategories(),
      ]);
      categories = categoryRows;
      rates = mergeRates(rateRows, categoryRows);
    } catch (err) {
      toast.error(`Failed to load rates: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  }

  // ── Inline edit helpers ───────────────────────────────────────────────────

  function startEdit(r: PayoutRate) {
    editing = { ...editing, [r.categoryId]: String(r.amount) };
  }

  function cancelEdit(categoryId: string) {
    const next = { ...editing };
    delete next[categoryId];
    editing = next;
  }

  function openCategoryForm() {
    categoryErrors = {};
    categoryForm = {
      name: '',
      defaultPayout: '',
    };
    showCategoryForm = true;
  }

  function closeCategoryForm() {
    showCategoryForm = false;
    creatingCategory = false;
    categoryErrors = {};
  }

  function validateCategoryForm() {
    const errors: Record<string, string> = {};
    const trimmedName = categoryForm.name.trim();
    const defaultPayoutValue = String(categoryForm.defaultPayout ?? '').trim();
    const existingNames = new Set(categories.map((category) => category.name.trim().toLowerCase()));

    if (!trimmedName) {
      errors.name = 'Category name is required';
    } else if (existingNames.has(trimmedName.toLowerCase())) {
      errors.name = 'A category with this name already exists';
    }

    if (defaultPayoutValue) {
      const payout = Number(defaultPayoutValue);
      if (Number.isNaN(payout) || payout < 0) {
        errors.defaultPayout = 'Enter a valid non-negative amount';
      }
    }

    categoryErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleCreateCategory() {
    if (!validateCategoryForm()) return;

    creatingCategory = true;
    try {
      const trimmedName = categoryForm.name.trim();
      const defaultPayoutValue = String(categoryForm.defaultPayout ?? '').trim();
      const defaultPayout = defaultPayoutValue
        ? Number(defaultPayoutValue)
        : undefined;

      const created = await createTicketCategory({
        name: trimmedName,
        defaultPayout,
      });

      const nextCategories = [...categories, created];
      categories = nextCategories;
      rates = mergeRates(
        rates.filter((rate) => rate.configured),
        nextCategories,
      );
      closeCategoryForm();
      toast.success('Category created');
    } catch (err) {
      toast.error(`Failed to create category: ${(err as Error).message}`);
    } finally {
      creatingCategory = false;
    }
  }

  async function saveEdit(r: PayoutRate) {
    const raw = editing[r.categoryId];
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    saving = { ...saving, [r.categoryId]: true };
    try {
      const updated = await updatePayoutRate(r.categoryId, amount, r.currency || 'INR');
      rates = rates.map((x) =>
        x.categoryId === updated.categoryId
          ? {
              ...x,
              ...updated,
              categoryName: updated.categoryName || x.categoryName,
              callType: updated.callType || updated.categoryName || x.callType,
              amount,
              currency: updated.currency || x.currency || 'INR',
              configured: true,
            }
          : x,
      );
      cancelEdit(r.categoryId);
      toast.success('Rate updated');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      const next = { ...saving };
      delete next[r.categoryId];
      saving = next;
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages  = $derived(Math.max(1, Math.ceil(rates.length / PAGE_SIZE)));
  const pagedRates  = $derived(rates.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtCurrency(amount: number, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  }

  function mergeRates(rateRows: PayoutRate[], categoryRows: TicketCategory[]): PayoutRateRow[] {
    const ratesByCategory = new Map(rateRows.map((rate) => [rate.categoryId, rate]));

    return categoryRows.map((category) => {
      const rate = ratesByCategory.get(category.id);
      return {
        categoryId: category.id,
        categoryName: category.name,
        callType: rate?.callType || rate?.categoryName || category.name,
        amount: rate?.amount ?? category.defaultPayout ?? 0,
        currency: rate?.currency ?? 'INR',
        updatedBy: rate?.updatedBy,
        updatedAt: rate?.updatedAt,
        configured: !!rate,
      };
    });
  }

  const fieldClass =
    'px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';
</script>

<svelte:head><title>Payout Rates · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">

  <!-- Header -->
  <div class="flex flex-wrap items-center gap-3 bg-white rounded-xl px-5 py-4 shadow">
    <div>
      <h2 class="text-[18px] font-semibold text-[#0B182A]">Payout Rates</h2>
      <p class="text-[13px] text-gray-400 mt-0.5">Configure engineer payout rates per call type</p>
    </div>
    <button
      onclick={openCategoryForm}
      class="ml-auto flex items-center gap-1.5 px-3 py-2 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white rounded-lg text-[13px] font-semibold hover:opacity-90 transition-opacity cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      Add Category
    </button>
    <button
      onclick={loadRates}
      class="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:border-[#0B182A] transition-colors cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
      Refresh
    </button>
  </div>

  {#if showCategoryForm}
    <div class="bg-white rounded-2xl p-5 shadow border border-gray-100">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-[16px] font-semibold text-[#0B182A]">Add Call Type</h3>
          <p class="text-[13px] text-gray-400 mt-0.5">Create a new ticket category, then configure its payout rate below.</p>
        </div>
        <button
          onclick={closeCategoryForm}
          class="px-3 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] mt-5 items-start">
        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Category Name</span>
          <input
            type="text"
            class={fieldClass}
            placeholder="e.g. Router Installation"
            bind:value={categoryForm.name}
          />
          {#if categoryErrors.name}
            <span class="text-[11px] text-red-500">{categoryErrors.name}</span>
          {/if}
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Default Payout</span>
          <input
            type="number"
            min="0"
            step="0.01"
            class={fieldClass}
            placeholder="e.g. 500"
            bind:value={categoryForm.defaultPayout}
          />
          {#if categoryErrors.defaultPayout}
            <span class="text-[11px] text-red-500">{categoryErrors.defaultPayout}</span>
          {/if}
        </label>

        <div class="flex items-end h-full">
          <button
            onclick={handleCreateCategory}
            disabled={creatingCategory}
            class="w-full md:w-auto px-4 py-2.5 text-[13px] font-semibold text-white bg-[#E87D1F] hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-60"
          >
            {creatingCategory ? 'Creating…' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['CALL TYPE', 'CURRENT RATE', 'CURRENCY', 'LAST UPDATED BY', 'LAST UPDATED AT', 'ACTIONS'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan="6" class="py-12 text-center text-[13px] text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-gray-200 border-t-[#E87D1F] rounded-full animate-spin"></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if rates.length === 0}
            <tr>
              <td colspan="6" class="py-16 text-center">
                <p class="text-[13px] text-gray-400">
                  {categories.length === 0 ? 'No call types available' : 'No payout rates configured'}
                </p>
              </td>
            </tr>
          {:else}
            {#each pagedRates as r}
              {@const isEditing = r.categoryId in editing}
              {@const isSaving  = saving[r.categoryId]}
              <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td class="py-3 px-3">
                  <div>
                    <p class="text-[13px] font-semibold text-gray-800">{r.callType}</p>
                    <p class="text-[11px] text-gray-400">{r.categoryName}</p>
                  </div>
                </td>
                <td class="py-3 px-3">
                  {#if isEditing}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      class="{fieldClass} max-w-[120px]"
                      bind:value={editing[r.categoryId]}
                    />
                  {:else}
                    {#if r.configured}
                      <span class="text-[13px] font-semibold text-gray-800">{fmtCurrency(r.amount, r.currency)}</span>
                    {:else}
                      <div>
                        <span class="text-[13px] font-semibold text-amber-700">Not configured</span>
                        {#if r.amount > 0}
                          <p class="text-[11px] text-gray-400 mt-0.5">Suggested default: {fmtCurrency(r.amount, r.currency)}</p>
                        {/if}
                      </div>
                    {/if}
                  {/if}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{r.currency}</td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{r.updatedBy ?? '—'}</td>
                <td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(r.updatedAt)}</td>
                <td class="py-3 px-3">
                  {#if isEditing}
                    <div class="flex gap-1.5">
                      <button
                        onclick={() => saveEdit(r)}
                        disabled={isSaving}
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onclick={() => cancelEdit(r.categoryId)}
                        disabled={isSaving}
                        class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  {:else}
                    <button
                      onclick={() => startEdit(r)}
                      class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      {r.configured ? 'Edit' : 'Add Rate'}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={rates.length}
      pageSize={PAGE_SIZE}
      itemLabel="rates"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

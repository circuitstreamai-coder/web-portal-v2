  <script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { fetchPayouts, type PayoutRecord } from '$lib/api/payouts';
  import Pagination from '$lib/components/Pagination.svelte';

  // ── Filter state ──────────────────────────────────────────────────────────

  let filterEngineer = $state('');
  let filterFrom     = $state('');
  let filterTo       = $state('');
  let filterStatus   = $state('');

  // ── Data state ────────────────────────────────────────────────────────────

  let payouts   = $state<PayoutRecord[]>([]);
  let loading   = $state(true);
  let exporting = $state(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  onMount(loadPayouts);

  async function loadPayouts() {
    loading = true;
    try {
      payouts = await fetchPayouts({
        engineerName: filterEngineer.trim() || undefined,
        status:       filterStatus || undefined,
        from:         filterFrom   || undefined,
        to:           filterTo     || undefined,
      });
    } catch (err) {
      toast.error(`Failed to load payouts: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleExport() {
    exporting = true;
    try {
      const res = await fetch('/api/payouts/export', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text() || 'Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'payouts.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      exporting = false;
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => { filterEngineer; filterFrom; filterTo; filterStatus; currentPage = 1; });
  const totalPages   = $derived(Math.max(1, Math.ceil(payouts.length / PAGE_SIZE)));
  const pagedPayouts = $derived(payouts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtCurrency(amount: number, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  }

  function fmtDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      pending:  'bg-amber-50 text-amber-700',
      credited: 'bg-green-50 text-green-700',
      disputed: 'bg-red-50 text-red-600',
    };
    return map[s] ?? 'bg-gray-100 text-gray-500';
  }

  function statusLabel(s: string) {
    return s === 'credited' ? 'Credited' : s === 'disputed' ? 'Disputed' : 'Pending';
  }

  const inputClass =
    'px-3.5 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors bg-white';
</script>

<svelte:head><title>Payout Log · Admin · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">

  <!-- Header -->
  <div class="flex flex-wrap items-center gap-3 bg-white rounded-xl px-5 py-4 shadow">
    <div>
      <h2 class="text-[18px] font-semibold text-[#0B182A]">Payout Log</h2>
      <p class="text-[13px] text-gray-400 mt-0.5">Review all engineer payouts and manage disputes</p>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <button
        onclick={handleExport}
        disabled={exporting}
        class="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:border-[#0B182A] transition-colors cursor-pointer disabled:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        {exporting ? 'Exporting…' : 'Export Excel'}
      </button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="bg-white rounded-xl px-5 py-4 shadow flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1 min-w-[160px]">
      <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Engineer name</span>
      <input
        type="text"
        placeholder="Search engineer…"
        class="{inputClass}"
        bind:value={filterEngineer}
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">From</span>
      <input type="date" class="{inputClass}" bind:value={filterFrom} />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">To</span>
      <input type="date" class="{inputClass}" bind:value={filterTo} />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</span>
      <select class="{inputClass} cursor-pointer" bind:value={filterStatus}>
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="credited">Credited</option>
      </select>
    </label>
    <button
      onclick={loadPayouts}
      class="px-4 py-2 bg-[#0B182A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#162536] transition-colors cursor-pointer"
    >
      Apply
    </button>
    <button
      onclick={() => { filterEngineer = ''; filterFrom = ''; filterTo = ''; filterStatus = ''; loadPayouts(); }}
      class="px-4 py-2 border border-gray-200 text-[13px] text-gray-600 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
    >
      Clear
    </button>
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['TICKET ID', 'PAYOUT AMOUNT', 'STATUS'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan="3" class="py-12 text-center text-[13px] text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-gray-200 border-t-[#E87D1F] rounded-full animate-spin"></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if payouts.length === 0}
            <tr>
              <td colspan="3" class="py-16 text-center">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </div>
                  <p class="text-[13px] text-gray-400">No payout records found</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each pagedPayouts as p}
              <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">{p.ticketId}</td>
                <td class="py-3 px-3 text-[13px] font-semibold text-gray-800 whitespace-nowrap">
                  {fmtCurrency(p.payoutAmount, p.currency)}
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(p.status)}">
                    {statusLabel(p.status)}
                  </span>
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
      totalItems={payouts.length}
      pageSize={PAGE_SIZE}
      itemLabel="payouts"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

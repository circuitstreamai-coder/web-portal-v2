<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import { fetchPayouts, type PayoutRecord } from '$lib/api/payouts';
  import Pagination from '$lib/components/Pagination.svelte';

  // ── State ─────────────────────────────────────────────────────────────────

  const user = $derived($authStore.user);

  let payouts = $state<PayoutRecord[]>([]);
  let loading = $state(true);

  // ── Load ──────────────────────────────────────────────────────────────────

  onMount(async () => {
    if (!user) return;
    loading = true;
    try {
      payouts = (await fetchPayouts()).filter((payout) => payout.engineerId === user.id);
    } catch (err) {
      toast.error(`Failed to load earnings: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalEarned   = $derived(payouts.reduce((s, p) => s + p.payoutAmount, 0));
  const thisMonth     = $derived(() => {
    const now = new Date();
    return payouts
      .filter(p => {
        const d = new Date(p.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, p) => s + p.payoutAmount, 0);
  });
  const pending       = $derived(payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.payoutAmount, 0));
  const paidOut       = $derived(payouts.filter(p => p.status === 'credited').reduce((s, p) => s + p.payoutAmount, 0));

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  const totalPages   = $derived(Math.max(1, Math.ceil(payouts.length / PAGE_SIZE)));
  const pagedPayouts = $derived(payouts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtCurrency(amount: number, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  }

  function fmtDate(d: string) {
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
</script>

<svelte:head><title>My Earnings · Engineer · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">

  <!-- Header -->
  <div class="bg-white rounded-xl px-5 py-4 shadow">
    <h2 class="text-[18px] font-semibold text-[#0B182A]">My Earnings</h2>
    <p class="text-[13px] text-gray-400 mt-0.5">Your payout history and earnings summary</p>
  </div>

  <!-- Summary cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {#each [
      { label: 'Total Earned',  value: loading ? '—' : fmtCurrency(totalEarned),    color: 'text-[#0B182A]'  },
      { label: 'This Month',    value: loading ? '—' : fmtCurrency(thisMonth()),    color: 'text-blue-700'   },
      { label: 'Pending',       value: loading ? '—' : fmtCurrency(pending),        color: 'text-amber-700'  },
      { label: 'Paid Out',      value: loading ? '—' : fmtCurrency(paidOut),        color: 'text-green-700'  },
    ] as card}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{card.label}</p>
        <p class="text-[20px] font-bold {card.color} truncate">{card.value}</p>
      </div>
    {/each}
  </div>

  <!-- Payout history table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <h3 class="text-[15px] font-semibold text-[#0B182A] mb-4">Payout History</h3>
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
                  <p class="text-[13px] text-gray-400">No payout records yet</p>
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

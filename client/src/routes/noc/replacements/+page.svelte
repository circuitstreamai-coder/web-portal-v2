<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import {
    fetchReplacements,
    type ReplacementRequest,
  } from '$lib/api/replacements';
  import { approveReplacement, rejectReplacement } from '$lib/modules/data/replacements/actions';
  import { queryVersion } from '$lib/stores/query';
  import Pagination from '$lib/components/Pagination.svelte';

  // ── State ─────────────────────────────────────────────────────────────────

  let replacements = $state<ReplacementRequest[]>([]);
  let loading = $state(true);
  let filterStatus = $state('');

  // Acting on a row (approve / reject)
  let actingId = $state<string | null>(null);
  let lastSeenTicketsVersion = $state<number | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  onMount(async () => {
    await loadReplacements();
  });

  async function loadReplacements() {
    loading = true;
    try {
      replacements = await fetchReplacements(filterStatus || undefined);
    } catch (err) {
      toast.error(`Failed to load replacements: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const version = $queryVersion.tickets;
    if (lastSeenTicketsVersion === null) {
      lastSeenTicketsVersion = version;
      return;
    }
    if (version === lastSeenTicketsVersion) return;
    lastSeenTicketsVersion = version;
    void loadReplacements().catch(() => {
      toast.error('Failed to refresh replacements');
    });
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => { filterStatus; currentPage = 1; });
  const totalPages        = $derived(Math.max(1, Math.ceil(replacements.length / PAGE_SIZE)));
  const pagedReplacements = $derived(replacements.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  // ── Helpers ───────────────────────────────────────────────────────────────

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
      pending:    'Pending',
      approved:   'Approved',
      dispatched: 'Dispatched',
      replaced:   'Replaced',
      rejected:   'Rejected',
    };
    return map[s] ?? s;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleApprove(r: ReplacementRequest) {
    actingId = r.id;
    try {
      const updated = await approveReplacement(r.id);
      replacements = replacements.map((r) => (r.id === updated.id ? updated : r));
      toast.success('Replacement approved');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      actingId = null;
    }
  }

  async function handleReject(r: ReplacementRequest) {
    if (!confirm(`Reject replacement request for ${r.deviceType}?`)) return;
    actingId = r.id;
    try {
      const updated = await rejectReplacement(r.id);
      replacements = replacements.map((x) => (x.id === updated.id ? updated : x));
      toast.success('Replacement request rejected');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      actingId = null;
    }
  }
</script>

<svelte:head><title>Device Replacements · NOC · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">

  <!-- Header + filter -->
  <div class="flex flex-wrap items-center gap-3 bg-white rounded-xl px-5 py-4 shadow">
    <div>
      <h2 class="text-[18px] font-semibold text-[#0B182A]">Device Replacements</h2>
      <p class="text-[13px] text-gray-400 mt-0.5">Review and action engineer replacement requests</p>
    </div>
    <div class="ml-auto flex items-center gap-2">
      <select
        class="px-3.5 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors bg-white cursor-pointer"
        bind:value={filterStatus}
        onchange={loadReplacements}
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="dispatched">Dispatched</option>
        <option value="replaced">Replaced</option>
        <option value="rejected">Rejected</option>
      </select>
      <button
        onclick={loadReplacements}
        class="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:border-[#0B182A] transition-colors cursor-pointer"
        title="Refresh"
      >
        <Icons.Activity size={14} />
        Refresh
      </button>
    </div>
  </div>

  <!-- Stats strip -->
  <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
    {#each [
      { label: 'Pending',    value: replacements.filter(r => r.status === 'pending').length,    color: 'text-amber-700'  },
      { label: 'Approved',   value: replacements.filter(r => r.status === 'approved').length,   color: 'text-blue-700'   },
      { label: 'Dispatched', value: replacements.filter(r => r.status === 'dispatched').length, color: 'text-indigo-700' },
      { label: 'Replaced',   value: replacements.filter(r => r.status === 'replaced').length,   color: 'text-green-700'  },
      { label: 'Rejected',   value: replacements.filter(r => r.status === 'rejected').length,   color: 'text-red-600'    },
    ] as stat}
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-[12px] text-gray-400 mb-1">{stat.label}</p>
        <p class="text-[24px] font-bold {stat.color}">{loading ? '—' : stat.value}</p>
      </div>
    {/each}
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ['TICKET', 'ENGINEER', 'DEVICE TYPE', 'REASON', 'STATUS', 'REQUESTED', 'ACTIONS'] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan="7" class="py-12 text-center text-[13px] text-gray-400">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-gray-200 border-t-fuchsia-500 rounded-full animate-spin"></div>
                  Loading…
                </div>
              </td>
            </tr>
          {:else if replacements.length === 0}
            <tr>
              <td colspan="7" class="py-16 text-center">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                    <Icons.Cube size={22} stroke="#9ca3af" />
                  </div>
                  <p class="text-[13px] text-gray-400">No replacement requests</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each pagedReplacements as r}
              <tr class="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td class="py-3 px-3 text-[13px] font-semibold text-[#E87D1F] whitespace-nowrap">
                  {r.ticketNumber || r.ticketId.slice(0, 8)}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">
                  {r.engineerName || r.engineerId.slice(0, 8)}
                </td>
                <td class="py-3 px-3">
                  <span class="flex items-center gap-1.5 text-[13px] text-gray-700 font-medium whitespace-nowrap">
                    <Icons.Cube size={13} stroke="#6b7280" />
                    {r.deviceType}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <p class="text-[13px] text-gray-600 max-w-[220px] truncate" title={r.reason}>{r.reason}</p>
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(r.status)}">
                    {statusLabel(r.status)}
                  </span>
                  {#if r.poNumber}
                    <p class="text-[11px] text-gray-400 mt-1">PO: {r.poNumber}</p>
                  {/if}
                </td>
                <td class="py-3 px-3 text-[12px] text-gray-400 whitespace-nowrap">{fmtDate(r.requestedAt)}</td>
                <td class="py-3 px-3">
                  <div class="flex gap-1.5 flex-wrap">
                    {#if r.status === 'pending'}
                      <button
                        onclick={() => handleApprove(r)}
                        disabled={actingId === r.id}
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Icons.CheckCircle size={12} />
                        {actingId === r.id ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        onclick={() => handleReject(r)}
                        disabled={actingId === r.id}
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Icons.XSquare size={12} />
                        Reject
                      </button>
                    {:else if r.status === 'approved'}
                      <button
                        onclick={() => handleReject(r)}
                        disabled={actingId === r.id}
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <Icons.XSquare size={12} />
                        Reject
                      </button>
                    {:else}
                      <span class="text-[12px] text-gray-400">{statusLabel(r.status)}</span>
                    {/if}
                  </div>
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
      totalItems={replacements.length}
      pageSize={PAGE_SIZE}
      itemLabel="replacements"
      loading={loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

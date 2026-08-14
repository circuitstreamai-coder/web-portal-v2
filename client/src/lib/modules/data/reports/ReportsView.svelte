<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import { fetchTickets, type Ticket } from "$lib/modules/data/tickets/queries";
  import { fetchEngineerProfiles, type EngineerProfile } from "$lib/modules/data/engineers/queries";
  import { fetchPayouts, type PayoutRecord } from "$lib/api/payouts";

  interface Props {
    initialTab?: "tickets" | "engineers" | "payout";
  }

  let { initialTab = "tickets" }: Props = $props();

  let activeTab = $state<"tickets" | "engineers" | "payout">("tickets");

  // Sync activeTab when the prop changes (Svelte 5: don't init $state from prop directly)
  $effect(() => { activeTab = initialTab; });

  // ── Raw data ──────────────────────────────────────────────────────────────
  let loading = $state(true);
  let tickets = $state<Ticket[]>([]);
  let engineers = $state<EngineerProfile[]>([]);
  let payouts = $state<PayoutRecord[]>([]);

  onMount(async () => {
    try {
      [tickets, engineers, payouts] = await Promise.all([
        fetchTickets().catch(() => [] as Ticket[]),
        fetchEngineerProfiles().catch(() => [] as EngineerProfile[]),
        fetchPayouts().catch(() => [] as PayoutRecord[]),
      ]);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      loading = false;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function isResolved(status: string): boolean {
    return status === "resolved" || status === "closed";
  }

  function isBreached(t: Ticket): boolean {
    if (!t.slaDeadline) return false;
    return !isResolved(t.status) && new Date(t.slaDeadline).getTime() < Date.now();
  }

  // ── Ticket-tab derived stats ──────────────────────────────────────────────
  const totalTickets       = $derived(tickets.length);
  const resolvedTickets    = $derived(tickets.filter(t => isResolved(t.status)).length);
  const monitoredTickets   = $derived(tickets.filter(t => !!t.slaDeadline));
  const breachedTickets    = $derived(monitoredTickets.filter(isBreached));
  const slaCompliance      = $derived(
    monitoredTickets.length
      ? Math.round(((monitoredTickets.length - breachedTickets.length) / monitoredTickets.length) * 100)
      : 100,
  );
  const resolutionRate     = $derived(
    totalTickets ? Math.round((resolvedTickets / totalTickets) * 100) : 0,
  );

  // ── Monthly chart (last 8 months) ─────────────────────────────────────────
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const monthlyData = $derived((): Array<{ month: string; opened: number; resolved: number }> => {
    const now = new Date();
    const months: Array<{ month: string; opened: number; resolved: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: MONTH_LABELS[d.getMonth()], opened: 0, resolved: 0 });
    }
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 7, 1).getTime();
    for (const t of tickets) {
      const created = new Date(t.createdAt).getTime();
      if (created < cutoff) continue;
      const mIdx = (new Date(t.createdAt).getFullYear() - now.getFullYear()) * 12
        + new Date(t.createdAt).getMonth() - now.getMonth() + 7;
      if (mIdx < 0 || mIdx > 7) continue;
      months[mIdx].opened++;
      if (isResolved(t.status)) months[mIdx].resolved++;
    }
    return months;
  });

  const chartMax = $derived(Math.max(10, ...monthlyData().flatMap(d => [d.opened, d.resolved])));

  // ── Tickets by state ──────────────────────────────────────────────────────
  const stateRows = $derived((): Array<{
    state: string; total: number; open: number; resolved: number; breached: number;
  }> => {
    const map = new Map<string, { total: number; open: number; resolved: number; breached: number }>();
    for (const t of tickets) {
      const s = t.state?.trim() || "Unknown";
      const row = map.get(s) ?? { total: 0, open: 0, resolved: 0, breached: 0 };
      row.total++;
      if (isResolved(t.status)) row.resolved++;
      else row.open++;
      if (isBreached(t)) row.breached++;
      map.set(s, row);
    }
    return Array.from(map.entries())
      .map(([state, v]) => ({ state, ...v }))
      .sort((a, b) => b.total - a.total);
  });

  // ── Engineer-tab stats ─────────────────────────────────────────────────────
  const totalEngineers    = $derived(engineers.length);
  const approvedEngineers = $derived(engineers.filter(e => e.documentsStatus === "approved").length);
  const pendingEngineers  = $derived(engineers.filter(e => e.documentsStatus === "pending").length);
  const rejectedEngineers = $derived(engineers.filter(e => e.documentsStatus === "rejected").length);

  // ── Payout-tab stats ──────────────────────────────────────────────────────
  const totalPayout    = $derived(payouts.reduce((s, p) => s + p.payoutAmount, 0));
  const creditedPayout = $derived(payouts.filter(p => p.status === "credited").reduce((s, p) => s + p.payoutAmount, 0));
  const pendingPayout  = $derived(payouts.filter(p => p.status === "pending").reduce((s, p) => s + p.payoutAmount, 0));
  const disputedPayout = $derived(payouts.filter(p => p.status === "disputed").reduce((s, p) => s + p.payoutAmount, 0));

  const payoutByEngineer = $derived((): Array<{ name: string; count: number; amount: number }> => {
    const map = new Map<string, { name: string; count: number; amount: number }>();
    for (const p of payouts) {
      const key = p.engineerId;
      const row = map.get(key) ?? { name: p.engineerName ?? p.engineerId, count: 0, amount: 0 };
      row.count++;
      row.amount += p.payoutAmount;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  });

  // ── Tab counts ────────────────────────────────────────────────────────────
  const tabs = $derived([
    { id: "tickets" as const,   label: "Ticket Reports",  count: totalTickets },
    { id: "engineers" as const, label: "Engineer Reports", count: totalEngineers },
    { id: "payout" as const,    label: "Payout Report",   count: payouts.length },
  ]);

  function fmt(n: number): string {
    return n.toLocaleString("en-IN");
  }

  function fmtCurrency(n: number): string {
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    if (activeTab === "tickets") {
      const header = "Ticket #,Project,Status,State,Priority,SLA Deadline,Created At,Received At,Closed At";
      const rows = tickets.map(t =>
        [t.ticketNumber, t.projectId, t.status, t.state, t.priority, t.slaDeadline ?? "", t.createdAt, t.receivedAt ?? "", t.closedAt ?? ""].join(",")
      );
      download("tickets-report.csv", [header, ...rows].join("\n"));
    } else if (activeTab === "engineers") {
      const header = "Reference ID,Name,Email,State,Assigned State,Doc Status";
      const rows = engineers.map(e =>
        [e.referenceId ?? "", e.userName ?? "", e.userEmail ?? "", e.addressState ?? "", e.assignedState ?? "", e.documentsStatus].join(",")
      );
      download("engineers-report.csv", [header, ...rows].join("\n"));
    } else {
      const header = "Ticket #,Engineer,Call Type,Amount,Status,Created At";
      const rows = payouts.map(p =>
        [p.ticketNumber ?? p.ticketId, p.engineerName ?? p.engineerId, p.callType, p.payoutAmount, p.status, p.createdAt].join(",")
      );
      download("payouts-report.csv", [header, ...rows].join("\n"));
    }
  }

  function download(filename: string, content: string) {
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(content);
    a.download = filename;
    a.click();
  }
</script>

<div class="flex flex-col gap-5">
  <!-- Tabs -->
  <div class="flex items-center gap-2 flex-wrap">
    {#each tabs as tab}
      <button
        onclick={() => (activeTab = tab.id)}
        class="flex items-center gap-2 px-5 py-2.5 rounded-lg border text-[13px] font-medium cursor-pointer transition-all duration-150
               {activeTab === tab.id ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
      >
        {#if tab.id === "tickets"}
          <Icons.TicketCard size={14} />
        {:else if tab.id === "engineers"}
          <Icons.Person size={14} />
        {:else}
          <Icons.Dollar size={14} />
        {/if}
        {tab.label}
        <span class="text-[11px] px-2 py-0.5 rounded-full {activeTab === tab.id ? 'bg-white/15' : 'bg-gray-100 text-gray-500'}">
          {loading ? "…" : tab.count}
        </span>
      </button>
    {/each}
    <div class="flex-1"></div>
    <button
      onclick={exportCSV}
      class="flex items-center gap-1.5 px-4 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white text-[13px] font-semibold rounded-lg cursor-pointer border-none transition-opacity duration-150"
    >
      <Icons.Download size={14} />
      Export CSV
    </button>
  </div>

  <!-- ── TICKETS TAB ──────────────────────────────────────────────────────── -->
  {#if activeTab === "tickets"}
    <!-- Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
      {#each [
        { label: "Total Tickets",    value: loading ? "…" : fmt(totalTickets),    color: "#0B182A" },
        { label: "Resolved Tickets", value: loading ? "…" : fmt(resolvedTickets), color: "#22c55e" },
        { label: "SLA Compliance",   value: loading ? "…" : `${slaCompliance}%`,  color: "#3b82f6" },
        { label: "SLA Breaches",     value: loading ? "…" : fmt(breachedTickets.length), color: "#ef4444" },
      ] as stat}
        <div class="bg-white rounded-2xl border border-gray-100 relative overflow-hidden flex items-center gap-4 px-4 py-3.5 md:flex-col md:items-start md:gap-2 md:p-5">
          <div class="absolute top-0 left-0 bottom-0 w-1 md:hidden" style="background-color: {stat.color};"></div>
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background-color: {stat.color}20;">
            <Icons.TicketCard size={20} stroke={stat.color} />
          </div>
          <div class="flex-1 min-w-0 md:flex-none">
            <div class="text-[21px] md:text-[26px] font-bold text-[#0B182A] leading-tight">{stat.value}</div>
            <div class="text-[12px] text-gray-500">{stat.label}</div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Chart + Quick Insights -->
    <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <!-- Bar Chart -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h3 class="text-[16px] font-semibold text-[#0B182A]">Monthly Ticket Volume</h3>
            <p class="text-[12px] text-gray-400 mt-0.5">Last 8 months · Opened vs Resolved</p>
          </div>
          {#if !loading}
            <span class="px-3.5 py-1 rounded-full bg-green-50 text-green-600 text-[12px] font-medium">
              Peak: {Math.max(...monthlyData().map(d => d.opened))} opened
            </span>
          {/if}
        </div>

        <div class="flex gap-3 h-60">
          <div class="flex flex-col justify-between text-[11px] text-gray-400 pb-6">
            {#each [chartMax, Math.round(chartMax * 0.8), Math.round(chartMax * 0.6), Math.round(chartMax * 0.4), Math.round(chartMax * 0.2), 0] as label}
              <span>{label}</span>
            {/each}
          </div>
          <div class="flex-1 relative pb-6">
            <div class="absolute inset-0 bottom-6 flex flex-col justify-between">
              {#each [0, 1, 2, 3, 4, 5] as _}
                <div class="border-b border-gray-100"></div>
              {/each}
            </div>
            <div class="absolute inset-0 pb-6 flex items-end justify-around">
              {#if loading}
                {#each Array(8) as _}
                  <div class="flex flex-col items-center gap-1.5">
                    <div class="flex gap-1 items-end">
                      <div class="w-5 bg-gray-100 rounded-t animate-pulse" style="height: 60px;"></div>
                      <div class="w-5 bg-gray-100 rounded-t animate-pulse" style="height: 40px;"></div>
                    </div>
                    <span class="text-[11px] text-gray-300">—</span>
                  </div>
                {/each}
              {:else}
                {#each monthlyData() as d}
                  <div class="flex flex-col items-center gap-1.5">
                    <div class="flex gap-1 items-end">
                      <div class="w-5 bg-blue-500 rounded-t" style="height: {chartMax > 0 ? (d.opened / chartMax) * 200 : 0}px;"></div>
                      <div class="w-5 bg-green-500 rounded-t" style="height: {chartMax > 0 ? (d.resolved / chartMax) * 200 : 0}px;"></div>
                    </div>
                    <span class="text-[11px] text-gray-400">{d.month}</span>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex gap-4 mt-2">
          <span class="flex items-center gap-1.5 text-[11px] text-gray-500"><span class="w-3 h-3 rounded-sm bg-blue-500"></span>Opened</span>
          <span class="flex items-center gap-1.5 text-[11px] text-gray-500"><span class="w-3 h-3 rounded-sm bg-green-500"></span>Resolved</span>
        </div>
      </div>

      <!-- Quick Insights -->
      <div class="bg-white rounded-2xl p-5 border border-gray-100 flex flex-col">
        <h3 class="text-[16px] font-semibold text-[#0B182A]">Quick Insights</h3>
        <p class="text-[12px] text-gray-400 mb-4">Live operational stats</p>

        <div class="flex flex-col gap-3 flex-1">
          {#each [
            { label: "Resolution Rate",    sub: "Tickets resolved", value: loading ? "…" : `${resolutionRate}%`, icon: "check",  color: "#22c55e" },
            { label: "Active Engineers",   sub: "Docs approved",    value: loading ? "…" : fmt(approvedEngineers), icon: "users",  color: "#0B182A" },
            { label: "Breach Rate",        sub: "SLA breaches",     value: loading ? "…" : (monitoredTickets.length ? `${Math.round((breachedTickets.length / monitoredTickets.length) * 100)}%` : "0%"), icon: "alert", color: "#ef4444" },
            { label: "Total Payouts",      sub: "All time",         value: loading ? "…" : fmtCurrency(totalPayout), icon: "dollar", color: "#f59e0b" },
            { label: "Open Tickets",       sub: "Not yet resolved", value: loading ? "…" : fmt(totalTickets - resolvedTickets), icon: "ticket", color: "#3b82f6" },
          ] as insight}
            <div class="flex items-center gap-3 py-2">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background: {insight.color}20;">
                {#if insight.icon === "check"}
                  <Icons.Check size={16} stroke={insight.color} strokeWidth={2.5} />
                {:else if insight.icon === "users"}
                  <Icons.Users size={16} stroke={insight.color} />
                {:else if insight.icon === "alert"}
                  <Icons.AlertTriangle size={16} stroke={insight.color} />
                {:else if insight.icon === "dollar"}
                  <Icons.Dollar size={16} stroke={insight.color} />
                {:else}
                  <Icons.Ticket size={16} stroke={insight.color} />
                {/if}
              </div>
              <div class="flex-1">
                <div class="text-[13px] font-medium text-[#0B182A]">{insight.label}</div>
                <div class="text-[11px] text-gray-400">{insight.sub}</div>
              </div>
              <div class="text-[16px] font-bold text-[#0B182A]">{insight.value}</div>
            </div>
          {/each}
        </div>

        <div class="flex items-center justify-between bg-[#E87D1F] rounded-xl px-5 py-4 mt-3">
          <div>
            <div class="text-[12px] text-white/80">SLA Compliance</div>
            <div class="text-[24px] font-bold text-white">{loading ? "…" : `${slaCompliance}%`}</div>
          </div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" opacity="0.6">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Tickets by State -->
    <div class="bg-white rounded-2xl p-6 border border-gray-100">
      <div class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-3">
          <h3 class="text-[18px] font-semibold text-[#0B182A]">Tickets by State</h3>
          <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {loading ? "…" : stateRows().length} states
          </span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ["STATE", "TOTAL", "OPEN", "RESOLVED", "SLA BREACHES"] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if stateRows().length === 0}
              <tr><td colspan="5" class="py-10 text-center text-[13px] text-gray-400">No ticket data available</td></tr>
            {:else}
              {#each stateRows() as s}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="py-3 px-3 text-[13px] font-medium text-gray-700">{s.state}</td>
                  <td class="py-3 px-3 text-[13px] font-semibold text-gray-700">{s.total}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{s.open}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{s.resolved}</td>
                  <td class="py-3 px-3">
                    {#if s.breached > 0}
                      <span class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">{s.breached}</span>
                    {:else}
                      <span class="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">0</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  <!-- ── ENGINEERS TAB ───────────────────────────────────────────────────── -->
  {:else if activeTab === "engineers"}
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
      {#each [
        { label: "Total Engineers",    value: loading ? "…" : fmt(totalEngineers),    color: "#0B182A" },
        { label: "Docs Approved",      value: loading ? "…" : fmt(approvedEngineers), color: "#22c55e" },
        { label: "Docs Pending",       value: loading ? "…" : fmt(pendingEngineers),  color: "#f59e0b" },
        { label: "Docs Rejected",      value: loading ? "…" : fmt(rejectedEngineers), color: "#ef4444" },
      ] as stat}
        <div class="bg-white rounded-2xl border border-gray-100 relative overflow-hidden flex items-center gap-4 px-4 py-3.5 md:flex-col md:items-start md:gap-2 md:p-5">
          <div class="absolute top-0 left-0 bottom-0 w-1 md:hidden" style="background-color: {stat.color};"></div>
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background-color: {stat.color}20;">
            <Icons.Person size={20} stroke={stat.color} />
          </div>
          <div class="flex-1 min-w-0 md:flex-none">
            <div class="text-[21px] md:text-[26px] font-bold text-[#0B182A] leading-tight">{stat.value}</div>
            <div class="text-[12px] text-gray-500">{stat.label}</div>
          </div>
        </div>
      {/each}
    </div>

    <div class="bg-white rounded-2xl p-6 border border-gray-100">
      <h3 class="text-[18px] font-semibold text-[#0B182A] mb-4">All Engineers</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-gray-100">
              {#each ["REF ID", "NAME", "EMAIL", "ADDRESS STATE", "ASSIGNED STATE", "DOC STATUS"] as col}
                <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if loading}
              <tr><td colspan="6" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
            {:else if engineers.length === 0}
              <tr><td colspan="6" class="py-10 text-center text-[13px] text-gray-400">No engineers found</td></tr>
            {:else}
              {#each engineers as e}
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="py-3 px-3 text-[12px] font-mono text-gray-500">{e.referenceId ?? "—"}</td>
                  <td class="py-3 px-3 text-[13px] font-medium text-gray-700">{e.userName ?? "—"}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-500">{e.userEmail ?? "—"}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{e.addressState ?? "—"}</td>
                  <td class="py-3 px-3 text-[13px] text-gray-600">{e.assignedState ?? "—"}</td>
                  <td class="py-3 px-3">
                    <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full
                      {e.documentsStatus === 'approved' ? 'bg-green-50 text-green-700'
                      : e.documentsStatus === 'rejected' ? 'bg-red-50 text-red-600'
                      : e.documentsStatus === 'reupload' ? 'bg-orange-50 text-orange-600'
                      : 'bg-amber-50 text-amber-700'}">
                      {e.documentsStatus}
                    </span>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

  <!-- ── PAYOUT TAB ──────────────────────────────────────────────────────── -->
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
      {#each [
        { label: "Total Payout Value", value: loading ? "…" : fmtCurrency(totalPayout),    color: "#0B182A" },
        { label: "Credited",           value: loading ? "…" : fmtCurrency(creditedPayout), color: "#22c55e" },
        { label: "Pending",            value: loading ? "…" : fmtCurrency(pendingPayout),  color: "#f59e0b" },
        { label: "Disputed",           value: loading ? "…" : fmtCurrency(disputedPayout), color: "#ef4444" },
      ] as stat}
        <div class="bg-white rounded-2xl border border-gray-100 relative overflow-hidden flex items-center gap-4 px-4 py-3.5 md:flex-col md:items-start md:gap-2 md:p-5">
          <div class="absolute top-0 left-0 bottom-0 w-1 md:hidden" style="background-color: {stat.color};"></div>
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background-color: {stat.color}20;">
            <Icons.Dollar size={20} stroke={stat.color} />
          </div>
          <div class="flex-1 min-w-0 md:flex-none">
            <div class="text-[21px] md:text-[26px] font-bold text-[#0B182A] leading-tight">{stat.value}</div>
            <div class="text-[12px] text-gray-500">{stat.label}</div>
          </div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <!-- Top Engineers by Payout -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">Top Engineers by Payout</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-gray-100">
                {#each ["ENGINEER", "TICKETS", "TOTAL PAYOUT"] as col}
                  <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#if loading}
                <tr><td colspan="3" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
              {:else if payoutByEngineer().length === 0}
                <tr><td colspan="3" class="py-10 text-center text-[13px] text-gray-400">No payout data available</td></tr>
              {:else}
                {#each payoutByEngineer() as row}
                  <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-3 text-[13px] font-medium text-gray-700">{row.name}</td>
                    <td class="py-3 px-3 text-[13px] text-gray-600">{row.count}</td>
                    <td class="py-3 px-3 text-[13px] font-semibold text-[#0B182A]">{fmtCurrency(row.amount)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      <!-- All Payouts -->
      <div class="bg-white rounded-2xl p-6 border border-gray-100">
        <h3 class="text-[16px] font-semibold text-[#0B182A] mb-4">Recent Payouts</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-gray-100">
                {#each ["TICKET", "ENGINEER", "AMOUNT", "STATUS"] as col}
                  <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#if loading}
                <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">Loading…</td></tr>
              {:else if payouts.length === 0}
                <tr><td colspan="4" class="py-10 text-center text-[13px] text-gray-400">No payout records</td></tr>
              {:else}
                {#each payouts.slice(0, 20) as p}
                  <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-3 text-[12px] font-semibold text-[#E87D1F]">{p.ticketNumber ?? p.ticketId.slice(0, 8)}</td>
                    <td class="py-3 px-3 text-[13px] text-gray-600">{p.engineerName ?? "—"}</td>
                    <td class="py-3 px-3 text-[13px] font-semibold text-[#0B182A]">{fmtCurrency(p.payoutAmount)}</td>
                    <td class="py-3 px-3">
                      <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full
                        {p.status === 'credited' ? 'bg-green-50 text-green-700'
                        : p.status === 'disputed' ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-700'}">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>

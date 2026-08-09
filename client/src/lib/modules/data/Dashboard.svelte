<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { toast } from "svelte-sonner";
  import { fetchAdminDashboardData } from "$lib/api/admin";
  import { fetchTickets, type Ticket } from "$lib/modules/data/tickets/queries";

  let activeFilter = $state("All");
  const filters = ["All", "Open", "In Progress", "Resolved", "Closed"];

  let loading = $state(true);
  let activeEngineers = $state(0);
  let openProjects = $state(0);
  let allTickets = $state<Ticket[]>([]);

  onMount(async () => {
    try {
      const [dashData, tickets] = await Promise.all([
        fetchAdminDashboardData(),
        fetchTickets(),
      ]);
      activeEngineers = dashData.summary.activeEngineers;
      openProjects    = dashData.summary.openProjects;
      allTickets      = tickets;
    } catch (err) {
      toast.error(`Failed to load dashboard: ${(err as Error).message}`);
    } finally {
      loading = false;
    }
  });

  const openCount       = $derived(allTickets.filter(t => t.status === 'open' || t.status === 'reopened').length);
  const inProgressCount = $derived(allTickets.filter(t => ['assigned', 'accepted', 'in_progress', 'on_hold', 'pending_replacement', 'escalated_l2', 'escalated_l3', 'pending_validation'].includes(t.status)).length);
  const resolvedCount   = $derived(allTickets.filter(t => t.status === 'resolved').length);
  const closedCount     = $derived(allTickets.filter(t => t.status === 'closed').length);
  const totalCount      = $derived(allTickets.length);

  const resolutionRate = $derived(
    totalCount > 0
      ? ((resolvedCount + closedCount) / totalCount * 100).toFixed(1)
      : "0.0"
  );

  function fmt(n: number): string {
    return loading ? "—" : n.toLocaleString("en-IN");
  }

  const stats = $derived([
    { label: "Total Tickets",  value: fmt(totalCount),      color: "#0B182A", icon: "ticket"  },
    { label: "Open",           value: fmt(openCount),       color: "#3b82f6", icon: "open"    },
    { label: "In Progress",    value: fmt(inProgressCount), color: "#f59e0b", icon: "pending" },
    { label: "Resolved",       value: fmt(resolvedCount),   color: "#22c55e", icon: "resolved"},
    { label: "Closed",         value: fmt(closedCount),     color: "#6b7280", icon: "closed"  },
  ]);

  const donutData = $derived([
    { label: "Open",        value: openCount,       color: "#3b82f6" },
    { label: "In Progress", value: inProgressCount, color: "#E87D1F" },
    { label: "Resolved",    value: resolvedCount,   color: "#22c55e" },
    { label: "Closed",      value: closedCount,     color: "#9ca3af" },
  ]);

  const donutTotal = $derived(donutData.reduce((s, d) => s + d.value, 0));

  function getDonutPaths(data: typeof donutData, total: number) {
    const cx = 120, cy = 120, r = 90, strokeWidth = 32;
    const circumference = 2 * Math.PI * r;
    let offset = -circumference / 4;
    return data.map((d) => {
      const pct = total > 0 ? d.value / total : 0;
      const dashArray = `${pct * circumference} ${(1 - pct) * circumference}`;
      const path = { ...d, dashArray, offset, r, cx, cy, strokeWidth };
      offset += pct * circumference;
      return path;
    });
  }

  const donutPaths = $derived(getDonutPaths(donutData, donutTotal));

  const recentTickets = $derived(
    allTickets
      .filter(t => {
        if (activeFilter === "All")         return true;
        if (activeFilter === "Open")        return t.status === "open" || t.status === "reopened";
        if (activeFilter === "In Progress") return ["assigned","accepted","in_progress","on_hold","pending_replacement","escalated_l2","escalated_l3","pending_validation"].includes(t.status);
        if (activeFilter === "Resolved")    return t.status === "resolved";
        if (activeFilter === "Closed")      return t.status === "closed";
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
  );

  function statusBadge(status: string): string {
    const map: Record<string, string> = {
      open: "bg-blue-50 text-blue-600",
      assigned: "bg-indigo-50 text-indigo-600",
      accepted: "bg-teal-50 text-teal-600",
      in_progress: "bg-amber-50 text-amber-600",
      on_hold: "bg-yellow-50 text-yellow-700",
      pending_replacement: "bg-fuchsia-50 text-fuchsia-700",
      escalated_l2: "bg-orange-50 text-orange-600",
      escalated_l3: "bg-red-50 text-red-600",
      pending_validation: "bg-purple-50 text-purple-600",
      resolved: "bg-green-50 text-green-600",
      closed: "bg-gray-100 text-gray-500",
      reopened: "bg-cyan-50 text-cyan-700",
    };
    return map[status] ?? "bg-gray-100 text-gray-500";
  }

  function statusLabel(status: string): string {
    return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function priorityBadge(p: string): string {
    if (p === "High")   return "bg-red-50 text-red-500";
    if (p === "Medium") return "bg-amber-50 text-amber-500";
    return "bg-green-50 text-green-600";
  }

  function slaLabel(t: Ticket): string {
    if (!t.slaDeadline) return "On Track";
    return new Date(t.slaDeadline) < new Date() ? "Breached" : "On Track";
  }

  function fmtDate(d: string): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB");
  }
</script>

<div class="flex flex-col gap-6">
  <!-- Stat Cards Row -->
  <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
    {#each stats as stat}
      <div
        class="bg-white rounded-2xl shadow border border-amber-50 relative overflow-hidden
               flex items-center gap-4 px-4 py-3.5
               sm:flex-col sm:items-start sm:gap-1 sm:p-5"
      >
        <div
          class="absolute top-0 left-0 bottom-0 w-1 sm:hidden"
          style="background-color: {stat.color};"
        ></div>

        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 sm:mb-1"
          style="background-color: {stat.color}18;"
        >
          {#if stat.icon === "ticket"}
            <Icons.TicketCard size={20} stroke={stat.color} />
          {:else if stat.icon === "open"}
            <Icons.Activity size={20} stroke={stat.color} />
          {:else if stat.icon === "pending"}
            <Icons.Clock size={20} stroke={stat.color} />
          {:else if stat.icon === "resolved"}
            <Icons.CheckCircle size={20} stroke={stat.color} />
          {:else if stat.icon === "closed"}
            <Icons.XSquare size={20} stroke={stat.color} />
          {/if}
        </div>

        <div class="flex-1 min-w-0 sm:flex-none">
          <div class="text-[21px] sm:text-[22px] font-bold text-[#0B182A] leading-tight {loading ? 'animate-pulse' : ''}">
            {stat.value}
          </div>
          <div class="text-[12px] sm:text-[13px] text-gray-400">{stat.label}</div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Middle Section: Donut Chart + Metrics -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Donut Chart Card -->
    <div class="bg-white rounded-2xl p-6 border-amber-50 shadow">
      <div class="flex justify-between items-start mb-5">
        <div>
          <h3 class="text-base font-semibold text-[#0B182A]">
            Ticket Status Distribution
          </h3>
          <p class="text-[12px] text-gray-400 mt-0.5">
            All-time breakdown
          </p>
        </div>
      </div>

      <div class="flex justify-center py-2.5">
        {#if loading}
          <div class="w-60 h-60 rounded-full bg-gray-100 animate-pulse"></div>
        {:else}
          <svg width="240" height="240" viewBox="0 0 240 240">
            {#each donutPaths as path}
              <circle
                cx={path.cx}
                cy={path.cy}
                r={path.r}
                fill="none"
                stroke={path.color}
                stroke-width={path.strokeWidth}
                stroke-dasharray={path.dashArray}
                stroke-dashoffset={-path.offset}
                stroke-linecap="butt"
              />
            {/each}
            <text x="120" y="112" text-anchor="middle" font-size="32" font-weight="700" fill="#0B182A">
              {donutTotal.toLocaleString("en-IN")}
            </text>
            <text x="120" y="136" text-anchor="middle" font-size="13" fill="#9ca3af">Total</text>
          </svg>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-3 mt-4">
        {#each donutData as d}
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {d.color};"></span>
            <span class="text-[13px] text-gray-500">{d.label}</span>
            <span class="text-[14px] font-semibold text-[#0B182A] ml-auto">{d.value}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Metrics Cards -->
    <div class="flex flex-col gap-3.5">
      <div class="bg-white rounded-2xl px-5 py-4.5 border-amber-50 shadow flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-10.5 h-10.5 rounded-[10px] bg-blue-100 flex items-center justify-center shrink-0">
            <Icons.Person size={20} stroke="#3b82f6" />
          </div>
          <div>
            <p class="text-[13px] text-gray-500 mb-0.5">Active Engineers</p>
            <p class="text-[20px] font-bold text-[#0B182A]">
              {loading ? "—" : activeEngineers}
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl px-5 py-4.5 border-amber-50 shadow flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-10.5 h-10.5 rounded-[10px] bg-amber-100 flex items-center justify-center shrink-0">
            <Icons.Folder size={20} stroke="#f59e0b" />
          </div>
          <div>
            <p class="text-[13px] text-gray-500 mb-0.5">Open Projects</p>
            <p class="text-[20px] font-bold text-[#0B182A]">
              {loading ? "—" : openProjects}
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl px-5 py-4.5 border-amber-50 shadow flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-10.5 h-10.5 rounded-[10px] bg-green-100 flex items-center justify-center shrink-0">
            <Icons.CheckCircle size={20} stroke="#22c55e" />
          </div>
          <div>
            <p class="text-[13px] text-gray-500 mb-0.5">Resolution Rate</p>
            <p class="text-[20px] font-bold text-green-500">
              {loading ? "—" : `${resolutionRate}%`}
            </p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl px-5 py-4.5 border-amber-50 shadow flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <div class="w-10.5 h-10.5 rounded-[10px] bg-purple-100 flex items-center justify-center shrink-0">
            <Icons.AlertTriangle size={20} stroke="#7c3aed" />
          </div>
          <div>
            <p class="text-[13px] text-gray-500 mb-0.5">In Progress</p>
            <p class="text-[20px] font-bold text-purple-600">
              {loading ? "—" : inProgressCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Tickets -->
  <div class="bg-white rounded-2xl p-6 border-amber-50 shadow">
    <div class="flex justify-between items-start mb-5 flex-wrap gap-4">
      <div>
        <h3 class="text-[18px] font-semibold text-[#0B182A]">Recent Tickets</h3>
        <p class="text-[12px] text-gray-400 mt-0.5">Latest support requests</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        {#each filters as f}
          <button
            onclick={() => (activeFilter = f)}
            class="px-4 py-1.5 rounded-full border text-[12px] cursor-pointer transition-all duration-150
                   {activeFilter === f
              ? 'bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white border-[#0B182A]'
              : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
          >{f}</button>
        {/each}
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["TICKET ID", "ISSUE", "SLA", "STATE", "STATUS", "PRIORITY", "DATE"] as col}
              <th class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr><td colspan="7" class="py-12 text-center text-[13px] text-gray-400">Loading…</td></tr>
          {:else if recentTickets.length === 0}
            <tr><td colspan="7" class="py-12 text-center text-[13px] text-gray-400">No tickets found</td></tr>
          {:else}
            {#each recentTickets as ticket}
              <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td class="py-3 px-3 text-[#E87D1F] font-medium text-[13px] whitespace-nowrap">
                  {ticket.ticketNumber || ticket.id.slice(0, 8)}
                </td>
                <td class="py-3 px-3">
                  <div class="text-[13px] text-gray-700 font-medium max-w-40 truncate">{ticket.title}</div>
                  {#if ticket.author}<div class="text-[11px] text-gray-400">{ticket.author}</div>{/if}
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full
                    {slaLabel(ticket) === 'Breached' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}">
                    {slaLabel(ticket)}
                  </span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600">{ticket.state || "—"}</td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {statusBadge(ticket.status)}">
                    {statusLabel(ticket.status)}
                  </span>
                </td>
                <td class="py-3 px-3">
                  <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full {priorityBadge(ticket.priority)}">
                    {ticket.priority || "—"}
                  </span>
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-600 whitespace-nowrap">{fmtDate(ticket.createdAt)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
      <span class="text-[13px] text-gray-500">
        Showing <strong>{recentTickets.length}</strong> of {totalCount} tickets
      </span>
    </div>
  </div>
</div>

<script lang="ts">
  import ReportsView from "$lib/modules/data/reports/ReportsView.svelte";
</script>

<svelte:head>
  <title>Payouts · National Head · Innoserve Techsol</title>
</svelte:head>

<div class="flex flex-col gap-5">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <h2 class="text-[18px] font-semibold text-[#0B182A]">Payout Log</h2>
    <p class="text-[13px] text-gray-500 mt-1">
      Read-only payout visibility for national oversight. Delete actions remain
      unavailable for this role.
    </p>
  </div>

  <ReportsView initialTab="payout" />
</div>

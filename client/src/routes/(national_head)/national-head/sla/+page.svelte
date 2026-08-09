<script lang="ts">
  import ReportsView from "$lib/modules/data/reports/ReportsView.svelte";
</script>

<svelte:head
  ><title>SLA Overview · National Head · Innoserve Techsol</title></svelte:head
>

<div class="flex flex-col gap-5">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <h2 class="text-[18px] font-semibold text-[#0B182A]">SLA Overview</h2>
    <p class="text-[13px] text-gray-500 mt-1">
      Full SLA visibility across projects and states, using the same reporting
      surface available to admin roles.
    </p>
  </div>

  <ReportsView initialTab="tickets" />
</div>

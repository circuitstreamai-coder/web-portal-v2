<script lang="ts">
  import * as Icons from '$lib/icons';
  import { fetchClosureEligibility, type ClosureEligibility } from '$lib/api/ticket-closure';

  interface Props {
    ticketId: string;
    refreshKey?: number;
    onLoaded?: (eligibility: ClosureEligibility) => void;
  }

  let { ticketId, refreshKey = 0, onLoaded }: Props = $props();

  let loading = $state(true);
  let eligibility = $state<ClosureEligibility>({
    eligible: false,
    checks: {
      correct_status: false,
      ir_uploaded: false,
      site_image_uploaded: false,
      rca_complete: false,
    },
    reasons: [],
  });

  async function loadChecklist() {
    loading = true;
    try {
      eligibility = await fetchClosureEligibility(ticketId);
      onLoaded?.(eligibility);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    ticketId;
    refreshKey;
    void loadChecklist();
  });

  function itemTone(kind: 'green' | 'amber', done: boolean): string {
    if (done) return 'bg-green-50 border-green-200 text-green-700';
    return kind === 'green'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-amber-50 border-amber-200 text-amber-700';
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <h3 class="text-[14px] font-semibold text-[#0B182A]">Closure Checklist</h3>
    {#if loading}
      <span class="text-[11px] text-gray-400">Checking…</span>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-2">
    {#each [
      { key: 'correct_status',      label: 'Ticket status is resolved',  missingTone: 'amber' },
      { key: 'ir_uploaded',         label: 'IR Report uploaded',         missingTone: 'green' },
      { key: 'site_image_uploaded', label: 'Site image(s) uploaded',     missingTone: 'green' },
      { key: 'rca_complete',        label: 'RCA documented',             missingTone: 'amber' },
    ] as item}
      <div class="flex items-center gap-3 px-4 py-3 rounded-xl border {itemTone(item.missingTone as 'green' | 'amber', eligibility.checks[item.key as keyof typeof eligibility.checks])}">
        {#if eligibility.checks[item.key as keyof typeof eligibility.checks]}
          <Icons.CheckCircle size={16} />
        {:else}
          <Icons.AlertTriangle size={16} />
        {/if}
        <span class="text-[13px] font-medium">{item.label}</span>
      </div>
    {/each}
  </div>

  {#if !loading && !eligibility.eligible}
    <div class="flex flex-col gap-1">
      <p class="text-[12px] text-gray-500">Complete the checklist above to enable closure.</p>
      {#if eligibility.reasons.length > 0}
        <p class="text-[12px] text-red-600">{eligibility.reasons.join(' • ')}</p>
      {/if}
    </div>
  {/if}
</div>

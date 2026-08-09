<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { fetchRca, submitRca, updateRca, type RcaRecord, type RcaInput } from '$lib/api/rca';

  // ── Props ─────────────────────────────────────────────────────────────────

  interface Props {
    ticketId: string;
    ticketStatus: string;
    /** Current user's role */
    role: string;
    /** Called after a successful submit or update — use to refresh ClosureChecklist */
    onRcaSaved?: () => void;
  }

  let { ticketId, ticketStatus, role, onRcaSaved }: Props = $props();

  // ── State ─────────────────────────────────────────────────────────────────

  let rca       = $state<RcaRecord | null>(null);
  let loading   = $state(true);
  let editing   = $state(false);
  let submitting = $state(false);
  let form      = $state<RcaInput>({ rootCause: '', actionTaken: '', preventionMeasure: '' });
  let errors    = $state<Record<string, string>>({});

  // ── Permissions ───────────────────────────────────────────────────────────

  const NOC_ROLE     = 'noc';
  const VIEWER_ROLES = new Set(['noc', 'project_head', 'super_admin', 'national_head']);

  const canDocument = $derived(role === NOC_ROLE);
  const canView     = $derived(VIEWER_ROLES.has(role));

  const normalizedStatus = $derived(ticketStatus?.toLowerCase().replace(/\s+/g, '_') ?? '');
  const statusAllows     = $derived(
    normalizedStatus === 'resolved' || normalizedStatus === 'pending_validation',
  );

  const showForm = $derived(canDocument && statusAllows && (!rca || editing));
  const showView = $derived(canView && !!rca && !editing);

  // ── Fetch on ticketId change ───────────────────────────────────────────────

  $effect(() => {
    const tid = ticketId;
    loading   = true;
    rca       = null;
    editing   = false;
    errors    = {};
    fetchRca(tid)
      .then((r) => { rca = r; })
      .catch(() => {})
      .finally(() => { loading = false; });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function startEdit() {
    if (!rca) return;
    form   = { rootCause: rca.rootCause, actionTaken: rca.actionTaken, preventionMeasure: rca.preventionMeasure ?? '' };
    errors = {};
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    errors  = {};
  }

  function validate(): boolean {
    errors = {};
    if (!form.rootCause.trim())   errors.rootCause   = 'Root Cause is required';
    if (!form.actionTaken.trim()) errors.actionTaken = 'Action Taken is required';
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    submitting = true;
    try {
      const input: RcaInput = {
        rootCause:         form.rootCause.trim(),
        actionTaken:       form.actionTaken.trim(),
        preventionMeasure: form.preventionMeasure?.trim() || undefined,
      };
      rca     = rca ? await updateRca(ticketId, input) : await submitRca(ticketId, input);
      editing = false;
      toast.success('RCA saved');
      onRcaSaved?.();
    } catch (err) {
      toast.error(`Failed to save RCA: ${(err as Error).message}`);
    } finally {
      submitting = false;
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const taClass =
    'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white resize-none';
  const labelTextClass = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide';
</script>

{#if loading}
  <div class="py-3 flex items-center gap-2 text-[12px] text-gray-400">
    <div class="w-3.5 h-3.5 border-2 border-gray-200 border-t-fuchsia-500 rounded-full animate-spin shrink-0"></div>
    Loading RCA…
  </div>

{:else if showForm}
  <!-- ── RCA Form ──────────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h4 class="text-[13px] font-semibold text-[#0B182A]">Root Cause Analysis</h4>
      {#if editing}
        <button
          onclick={cancelEdit}
          class="text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
        >
          Cancel
        </button>
      {:else}
        <span class="text-[11px] text-amber-600 font-medium">Required before closure</span>
      {/if}
    </div>

    <label class="flex flex-col gap-1.5">
      <span class={labelTextClass}>Root Cause <span class="text-red-400">*</span></span>
      <textarea
        rows="3"
        placeholder="Describe the root cause of the issue…"
        class="{taClass} {errors.rootCause ? 'border-red-300' : ''}"
        bind:value={form.rootCause}
      ></textarea>
      {#if errors.rootCause}<span class="text-[11px] text-red-500">{errors.rootCause}</span>{/if}
    </label>

    <label class="flex flex-col gap-1.5">
      <span class={labelTextClass}>Action Taken <span class="text-red-400">*</span></span>
      <textarea
        rows="3"
        placeholder="Describe what was done to resolve the issue…"
        class="{taClass} {errors.actionTaken ? 'border-red-300' : ''}"
        bind:value={form.actionTaken}
      ></textarea>
      {#if errors.actionTaken}<span class="text-[11px] text-red-500">{errors.actionTaken}</span>{/if}
    </label>

    <label class="flex flex-col gap-1.5">
      <span class={labelTextClass}>Prevention Measure <span class="text-gray-300 font-normal">optional</span></span>
      <textarea
        rows="2"
        placeholder="Steps to prevent recurrence…"
        class={taClass}
        bind:value={form.preventionMeasure}
      ></textarea>
    </label>

    <button
      onclick={handleSubmit}
      disabled={submitting}
      class="w-full py-2.5 text-[13px] font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
    >
      {submitting ? 'Saving…' : rca ? 'Update RCA' : 'Submit RCA'}
    </button>
  </div>

{:else if showView}
  <!-- ── Read-only View ────────────────────────────────────────────────────── -->
  <div class="rounded-xl border border-gray-200 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-fuchsia-50 border-b border-fuchsia-100">
      <div class="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a21caf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <h4 class="text-[13px] font-semibold text-fuchsia-900">Root Cause Analysis</h4>
      </div>
      {#if canDocument}
        <button
          onclick={startEdit}
          class="flex items-center gap-1 text-[11px] font-semibold text-fuchsia-700 hover:text-fuchsia-900 cursor-pointer transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      {/if}
    </div>

    <div class="px-4 py-4 flex flex-col gap-4">
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Root Cause</p>
        <p class="text-[13px] text-gray-700 leading-relaxed">{rca!.rootCause}</p>
      </div>
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Action Taken</p>
        <p class="text-[13px] text-gray-700 leading-relaxed">{rca!.actionTaken}</p>
      </div>
      <div>
        <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Prevention Measure</p>
        <p class="text-[13px] {rca!.preventionMeasure ? 'text-gray-700' : 'text-gray-400 italic'} leading-relaxed">
          {rca!.preventionMeasure || 'Not specified'}
        </p>
      </div>
      {#if rca!.documentedAt}
        <p class="text-[11px] text-gray-400 border-t border-gray-100 pt-3 mt-1">
          Documented by
          <span class="font-medium text-gray-500">{rca!.documentedByName ?? rca!.documentedBy}</span>
          on {fmtDate(rca!.documentedAt)}
        </p>
      {/if}
    </div>
  </div>
{/if}

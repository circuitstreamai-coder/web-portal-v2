<script lang="ts">
  import { onMount } from 'svelte';
  import * as Icons from '$lib/icons';
  import { toast } from 'svelte-sonner';
  import { fetchAvailability, type AvailabilitySlot } from '$lib/modules/data/availability/queries';
  import { createAvailabilitySlot, deleteAvailabilitySlot } from '$lib/modules/data/availability/actions';
  import { queryVersion } from '$lib/stores/query';

  const fieldClass =
    'px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white';

  // ── Date helpers ──────────────────────────────────────────────────────────

  function toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function fmtTime(t: string): string {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function fmtDateLabel(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  const TODAY_ISO = toIso(new Date());
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── State ─────────────────────────────────────────────────────────────────

  let slots = $state<AvailabilitySlot[]>([]);
  let loading = $state(true);
  let viewDate = $state(startOfMonth(new Date()));
  let lastSeenVersion = $state<number | null>(null);

  let modalDate = $state<string | null>(null);
  let form = $state({ startTime: '09:00', endTime: '17:00', notes: '' });
  let formError = $state('');
  let saving = $state(false);
  let deletingId = $state<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadSlots() {
    slots = await fetchAvailability();
  }

  onMount(async () => {
    try {
      await loadSlots();
    } catch (err) {
      toast.error('Failed to load availability');
    } finally {
      loading = false;
    }
  });

  $effect(() => {
    const version = $queryVersion.availability;
    if (lastSeenVersion === null) {
      lastSeenVersion = version;
      return;
    }
    if (version === lastSeenVersion) return;
    lastSeenVersion = version;
    void loadSlots().catch(() => toast.error('Failed to refresh availability'));
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const monthLabel = $derived(viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));

  const slotsByDate = $derived.by(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    for (const s of slots) {
      (map[s.date] ??= []).push(s);
    }
    for (const key in map) {
      map[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  });

  const upcomingDates = $derived(Object.keys(slotsByDate).sort());

  type DayCell = { date: Date; iso: string; inMonth: boolean; isPast: boolean; isToday: boolean };

  const calendarDays = $derived.by((): DayCell[] => {
    const first = startOfMonth(viewDate);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    const days: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toIso(d);
      days.push({
        date: d,
        iso,
        inMonth: d.getMonth() === viewDate.getMonth(),
        isPast: iso < TODAY_ISO,
        isToday: iso === TODAY_ISO,
      });
    }
    return days;
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  function prevMonth() {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  }

  function nextMonth() {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  }

  function goToday() {
    viewDate = startOfMonth(new Date());
  }

  // ── Add / delete slot ────────────────────────────────────────────────────

  function openAddModal(iso: string) {
    modalDate = iso;
    form = { startTime: '09:00', endTime: '17:00', notes: '' };
    formError = '';
  }

  async function submitSlot() {
    if (!modalDate) return;
    if (!form.startTime || !form.endTime) {
      formError = 'Start and end time are required';
      return;
    }
    if (form.startTime >= form.endTime) {
      formError = 'Start time must be before end time';
      return;
    }
    formError = '';
    saving = true;
    try {
      await createAvailabilitySlot({
        date: modalDate,
        startTime: form.startTime,
        endTime: form.endTime,
        notes: form.notes.trim() || undefined,
      });
      toast.success('Availability added');
      modalDate = null;
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      saving = false;
    }
  }

  async function removeSlot(id: string) {
    deletingId = id;
    try {
      await deleteAvailabilitySlot(id);
      toast.success('Availability removed');
    } catch (err) {
      toast.error(`Failed: ${(err as Error).message}`);
    } finally {
      deletingId = null;
    }
  }
</script>

<svelte:head><title>My Availability · Engineer · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5">
  <div>
    <h2 class="text-[18px] font-semibold text-[#0B182A]">My Availability</h2>
    <p class="text-[13px] text-gray-400 mt-0.5">Mark the dates and time slots you're available for site visits</p>
  </div>

  <!-- Calendar -->
  <div class="bg-white rounded-2xl p-6 shadow max-w-xl">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-2">
        <button
          onclick={prevMonth}
          class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Previous month"
        >
          <Icons.ChevronLeft size={16} />
        </button>
        <h3 class="text-[15px] font-semibold text-[#0B182A] w-40 text-center">{monthLabel}</h3>
        <button
          onclick={nextMonth}
          class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0B182A] hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Next month"
        >
          <Icons.ChevronRight size={16} />
        </button>
      </div>
      <button
        onclick={goToday}
        class="px-3.5 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded-lg hover:border-[#0B182A] transition-colors cursor-pointer"
      >
        Today
      </button>
    </div>

    {#if loading}
      <div class="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-400">
        <div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
        Loading…
      </div>
    {:else}
      <div class="grid grid-cols-7 gap-1.5">
        {#each WEEKDAYS as wd}
          <div class="text-center text-[11px] font-semibold text-gray-400 tracking-wide py-2">{wd}</div>
        {/each}

        {#each calendarDays as cell}
          {@const daySlots = slotsByDate[cell.iso] ?? []}
          <button
            type="button"
            disabled={cell.isPast}
            onclick={() => openAddModal(cell.iso)}
            aria-label="Add availability for {fmtDateLabel(cell.iso)}{daySlots.length ? ` (${daySlots.length} slot${daySlots.length > 1 ? 's' : ''})` : ''}"
            data-date={cell.iso}
            class="relative flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl border text-[13px] transition-colors
                   {cell.isPast
                     ? 'border-transparent text-gray-300 cursor-not-allowed'
                     : 'cursor-pointer border-gray-100 hover:border-[#0B182A] hover:bg-gray-50'}
                   {!cell.inMonth && !cell.isPast ? 'text-gray-300' : ''}
                   {cell.isToday ? 'border-[#E87D1F] bg-orange-50/50' : ''}"
          >
            <span class="font-medium {cell.isToday ? 'text-[#E87D1F] font-bold' : ''}">
              {cell.date.getDate()}
            </span>
            {#if daySlots.length > 0}
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#0B182A] text-white leading-none">
                {daySlots.length}
              </span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-4 mt-4 text-[11px] text-gray-400">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#0B182A]"></span> Has availability</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-[#E87D1F]"></span> Today</span>
        <span>Click any upcoming date to add a slot</span>
      </div>
    {/if}
  </div>

  <!-- Upcoming availability list -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">Upcoming Availability</h3>
      <span class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{slots.length} Total</span>
    </div>

    {#if loading}
      <div class="flex items-center justify-center gap-2 py-8 text-[13px] text-gray-400">
        <div class="w-4 h-4 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
        Loading…
      </div>
    {:else if upcomingDates.length === 0}
      <div class="flex flex-col items-center gap-2 py-14">
        <div class="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
          <Icons.Clock size={22} stroke="#9ca3af" />
        </div>
        <p class="text-[13px] text-gray-400">No availability marked yet</p>
        <button
          onclick={() => openAddModal(TODAY_ISO)}
          class="mt-1 flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Icons.Plus size={13} /> Add Availability
        </button>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each upcomingDates as dateIso}
          <div class="border border-gray-100 rounded-xl p-4">
            <div class="flex items-center justify-between mb-2.5">
              <p class="text-[13px] font-semibold text-[#0B182A]">{fmtDateLabel(dateIso)}</p>
              <button
                onclick={() => openAddModal(dateIso)}
                class="flex items-center gap-1 text-[11px] font-semibold text-[#E87D1F] hover:underline cursor-pointer"
              >
                <Icons.Plus size={12} /> Add slot
              </button>
            </div>
            <div class="flex flex-col gap-2">
              {#each slotsByDate[dateIso] as slot}
                <div class="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-gray-50/60">
                  <div class="flex items-center gap-2.5">
                    <Icons.Clock size={14} stroke="#6b7280" />
                    <span class="text-[13px] text-gray-700 font-medium">{fmtTime(slot.startTime)} – {fmtTime(slot.endTime)}</span>
                    {#if slot.notes}
                      <span class="text-[12px] text-gray-400 truncate max-w-[220px]">— {slot.notes}</span>
                    {/if}
                  </div>
                  <button
                    onclick={() => removeSlot(slot.id)}
                    disabled={deletingId === slot.id}
                    class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                    aria-label="Remove slot"
                  >
                    <Icons.Trash size={13} />
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ── Add Availability Modal ─────────────────────────────────────────────── -->
{#if modalDate}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (modalDate = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Add Availability"
      tabindex="-1"
    >
      <div class="flex items-start justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <p class="text-[11px] font-semibold text-[#E87D1F] mb-0.5">{fmtDateLabel(modalDate)}</p>
          <h2 class="text-[15px] font-semibold text-[#0B182A]">Add Availability</h2>
        </div>
        <button onclick={() => (modalDate = null)} class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
          <Icons.X size={16} />
        </button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Start Time</span>
            <input type="time" bind:value={form.startTime} class={fieldClass} />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">End Time</span>
            <input type="time" bind:value={form.endTime} class={fieldClass} />
          </label>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Notes (optional)</span>
          <textarea
            bind:value={form.notes}
            placeholder="e.g. Preferred for nearby sites only…"
            rows="2"
            class="{fieldClass} resize-none"
          ></textarea>
        </label>

        {#if formError}
          <p class="text-[12px] text-red-600">{formError}</p>
        {/if}
      </div>

      <div class="flex justify-end gap-3 px-6 pb-5 border-t border-gray-100 pt-4">
        <button onclick={() => (modalDate = null)} class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer">
          Cancel
        </button>
        <button
          onclick={submitSlot}
          disabled={saving}
          class="px-5 py-2.5 text-[13px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Add Slot'}
        </button>
      </div>
    </div>
  </div>
{/if}

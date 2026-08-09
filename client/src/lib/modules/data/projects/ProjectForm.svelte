<script lang="ts">
  import { onMount } from "svelte";
  import * as Icons from "$lib/icons";
  import { fetchCustomers, type Customer } from "$lib/modules/data/customers/queries";

  interface ProjectFormData {
    customerId?: string;
    name?: string;
    location?: string;
    sla?: string;
    status?: string;
    tags?: string[];
  }

  let {
    mode = "add",
    data = null,
    onSave,
    onClose,
  }: {
    mode?: "add" | "edit";
    data?: ProjectFormData | null;
    onSave: (form: Record<string, unknown>) => void;
    onClose: () => void;
  } = $props();

  const allTags = ["Hardware", "Networking", "Software", "Electrical", "Deployment"];

  let customers = $state<Customer[]>([]);
  let loadingCustomers = $state(false);

  onMount(async () => {
    loadingCustomers = true;
    try {
      const all = await fetchCustomers();
      customers = all.filter((c) => c.status === 'active');
    } catch {
      // non-critical — dropdown falls back to empty
    } finally {
      loadingCustomers = false;
    }
  });

  let form = $state({
    customerId: "",
    name: "",
    location: "",
    sla: "4h Response",
    status: "Active",
    tags: [] as string[],
  });

  $effect(() => {
    form.customerId = (data?.customerId as string) ?? "";
    form.name       = (data?.name as string) ?? "";
    form.location   = (data?.location as string) ?? "";
    form.sla        = (data?.sla as string) ?? "4h Response";
    form.status     = (data?.status as string) ?? "Active";
    form.tags       = (data?.tags as string[]) ? [...(data!.tags as string[])] : [];
  });

  let errors = $state<Record<string, string>>({});

  function toggleTag(tag: string) {
    if (form.tags.includes(tag)) {
      form.tags = form.tags.filter((t) => t !== tag);
    } else {
      form.tags = [...form.tags, tag];
    }
  }

  function validate() {
    errors = {};
    if (!form.name.trim()) errors.name = "Project name is required";
    else if (form.name.trim().length < 2) errors.name = "Project name must be at least 2 characters";
    if (!form.customerId) errors.customerId = "Customer is required";
    if (!form.location.trim()) errors.location = "Location is required";
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate()) return;
    onSave({ ...form });
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <!-- Modal -->
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label={mode === "add" ? "Add Project" : "Edit Project"}
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">
          {mode === "add" ? "Add Project" : "Edit Project"}
        </h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {mode === "add" ? "Create a new project entry" : "Update the project details below"}
        </p>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <form class="px-6 py-5 flex flex-col gap-4 overflow-y-auto" onsubmit={handleSubmit}>
      <!-- Project Name -->
      <label class={labelClass}>
        <span class={labelTextClass}>Project Name <span class="text-red-400">*</span></span>
        <input
          type="text"
          placeholder="e.g. ATM Deployment"
          class="{fieldClass} {errors.name ? 'border-red-400 focus:border-red-400' : ''}"
          bind:value={form.name}
        />
        {#if errors.name}<span class={errorClass}>{errors.name}</span>{/if}
      </label>

      <!-- Customer dropdown -->
      <label class={labelClass}>
        <span class={labelTextClass}>Customer <span class="text-red-400">*</span></span>
        {#if loadingCustomers}
          <div class="px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-400 bg-gray-50">Loading customers…</div>
        {:else if customers.length === 0}
          <div class="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[13px] text-amber-700">No active customers available</div>
        {:else}
          <select class="{fieldClass} {errors.customerId ? 'border-red-400 focus:border-red-400' : ''}" bind:value={form.customerId}>
            <option value="">— Select Customer —</option>
            {#each customers as c}
              <option value={c.id}>{c.companyName}</option>
            {/each}
          </select>
        {/if}
        {#if errors.customerId}<span class={errorClass}>{errors.customerId}</span>{/if}
      </label>

      <!-- Row: Location + SLA -->
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Location <span class="text-red-400">*</span></span>
          <input
            type="text"
            placeholder="e.g. Kerala"
            class="{fieldClass} {errors.location ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.location}
          />
          {#if errors.location}<span class={errorClass}>{errors.location}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>SLA Response</span>
          <select class={fieldClass} bind:value={form.sla}>
            <option value="2h Response">2h Response</option>
            <option value="3h Response">3h Response</option>
            <option value="4h Response">4h Response</option>
            <option value="8h Response">8h Response</option>
          </select>
        </label>
      </div>

      <!-- Status -->
      <label class={labelClass}>
        <span class={labelTextClass}>Status</span>
        <select class={fieldClass} bind:value={form.status}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </label>

      <!-- Tags -->
      <div class={labelClass}>
        <span class={labelTextClass}>Tags</span>
        <div class="flex flex-wrap gap-2 mt-1">
          {#each allTags as tag}
            <button
              type="button"
              onclick={() => toggleTag(tag)}
              class="px-3.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all cursor-pointer
                     {form.tags.includes(tag)
                       ? 'bg-[#0B182A] text-white border-[#0B182A]'
                       : 'bg-white text-gray-500 border-gray-200 hover:border-[#0B182A]'}"
            >
              {tag}
            </button>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
        <button
          type="button"
          onclick={onClose}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loadingCustomers || customers.length === 0}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[#E87D1F] hover:bg-[#d06a10] rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mode === "add" ? "Add Project" : "Save Changes"}
        </button>
      </div>
    </form>
  </div>
</div>

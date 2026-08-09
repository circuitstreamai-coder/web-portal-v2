<script lang="ts">
  import { untrack } from "svelte";
  import type { EngineerProfile } from "./queries";
  import { lookupPincode } from "$lib/utils/pincode";
  import MaskedContact from "$lib/components/MaskedContact.svelte";

  const INDIAN_STATES = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
    "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
    "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
    "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
    "Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi (NCT)",
    "Chandigarh","Puducherry","Ladakh","Jammu & Kashmir","Lakshadweep",
    "Dadra & Nagar Haveli and Daman & Diu","Andaman & Nicobar Islands",
  ];

  let {
    data = null,
    onSave,
    onClose,
  }: {
    data?: EngineerProfile | null;
    onSave: (form: Record<string, string>) => void;
    onClose: () => void;
  } = $props();

  let form = $state(untrack(() => ({
    userName:          data?.userName          ?? "",
    userPhone:         data?.userPhone         ?? "",
    addressState:      data?.addressState      ?? "",
    addressCity:       data?.addressCity       ?? "",
    addressPincode:    data?.addressPincode    ?? "",
    assignedState:     data?.assignedState     ?? "",
    bankAccountNumber: data?.bankAccountNumber ?? "",
    ifscCode:          data?.ifscCode          ?? "",
    accountHolderName: data?.accountHolderName ?? "",
  })));

  let errors = $state<Record<string, string>>({});
  let pincodeLoading = $state(false);

  async function handlePincodeInput(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    pincodeLoading = true;
    try {
      const result = await lookupPincode(pincode);
      if (result) {
        form.addressState = result.state;
        form.addressCity = result.city;
      }
    } finally {
      pincodeLoading = false;
    }
  }

  function validate() {
    errors = {};

    // Full name: required, letters/spaces/dots/hyphens/apostrophes, 2–60 chars
    const name = form.userName.trim();
    if (!name) errors.userName = "Full name is required";
    else if (!/^[A-Za-z\s.\-']+$/.test(name)) errors.userName = "Name must contain only letters";
    else if (name.length < 2 || name.length > 60) errors.userName = "Name must be between 2 and 60 characters";

    // Phone: if provided, 10-digit Indian mobile (starts 6–9)
    const phone = form.userPhone.trim();
    if (phone && !/^[6-9]\d{9}$/.test(phone))
      errors.userPhone = "Enter a valid 10-digit mobile number starting with 6–9";

    // City: if provided, letters/spaces/dots/hyphens only
    const city = form.addressCity.trim();
    if (city && !/^[A-Za-z\s.\-]+$/.test(city))
      errors.addressCity = "City must contain only letters";

    // Pincode: if provided, 6 digits, no leading zero
    const pin = form.addressPincode.trim();
    if (pin && !/^[1-9]\d{5}$/.test(pin))
      errors.addressPincode = "Enter a valid 6-digit pincode";

    // Account holder name: if provided, letters only
    const holderName = form.accountHolderName.trim();
    if (holderName && !/^[A-Za-z\s.\-']+$/.test(holderName))
      errors.accountHolderName = "Name must contain only letters";

    // Bank account number: if provided, 9–18 digits
    const acc = form.bankAccountNumber.trim();
    if (acc && !/^\d{9,18}$/.test(acc))
      errors.bankAccountNumber = "Enter a valid account number (9–18 digits)";

    // IFSC: if provided, 4 letters + 0 + 6 alphanumeric
    const ifsc = form.ifscCode.trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))
      errors.ifscCode = "Enter a valid IFSC code (e.g. SBIN0001234)";

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
  const sectionClass = "text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 mt-1";
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
    aria-label="Edit Engineer"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">Edit Engineer</h2>
        <p class="text-[12px] text-gray-400 mt-0.5">Update the engineer's profile details</p>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <form class="px-6 py-5 flex flex-col gap-4 overflow-y-auto" onsubmit={handleSubmit}>

      <!-- Personal -->
      <p class={sectionClass}>Personal Info</p>
      <div class="grid grid-cols-2 gap-4">
        <label class="{labelClass} col-span-2">
          <span class={labelTextClass}>Full Name <span class="text-red-400">*</span></span>
          <input type="text" placeholder="e.g. Rajesh Kumar"
            class="{fieldClass} {errors.userName ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.userName} />
          {#if errors.userName}<span class={errorClass}>{errors.userName}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Email</span>
          <p class="{fieldClass} bg-gray-50 text-gray-500">
            <MaskedContact value={data?.userEmail} type="email" />
          </p>
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Phone</span>
          <input type="tel" placeholder="e.g. 9876543210" maxlength="10"
            class="{fieldClass} {errors.userPhone ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.userPhone} />
          {#if errors.userPhone}<span class={errorClass}>{errors.userPhone}</span>{/if}
        </label>
      </div>

      <!-- Address -->
      <p class={sectionClass}>Address</p>
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>State</span>
          <select class={fieldClass} bind:value={form.addressState}>
            <option value="">— Select State —</option>
            {#each INDIAN_STATES as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>City</span>
          <input type="text" placeholder="e.g. Mumbai"
            class="{fieldClass} {errors.addressCity ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.addressCity}
            oninput={(e) => { const el = e.target as HTMLInputElement; el.value = el.value.replace(/[^A-Za-z\s.\-']/g, ""); form.addressCity = el.value; }} />
          {#if errors.addressCity}<span class={errorClass}>{errors.addressCity}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Pincode</span>
          <div class="relative">
            <input type="text" placeholder="e.g. 400001" maxlength="6"
              class="{fieldClass} {errors.addressPincode ? 'border-red-400 focus:border-red-400' : ''}"
              bind:value={form.addressPincode}
              oninput={(e) => handlePincodeInput((e.currentTarget as HTMLInputElement).value)} />
            {#if pincodeLoading}
              <div class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
            {/if}
          </div>
          <p class="text-[11px] text-blue-500">Enter 6-digit pincode to auto-fill state & city</p>
          {#if errors.addressPincode}<span class={errorClass}>{errors.addressPincode}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Assigned State</span>
          <select class={fieldClass} bind:value={form.assignedState}>
            <option value="">— Select State —</option>
            {#each INDIAN_STATES as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Bank -->
      <p class={sectionClass}>Bank Details</p>
      <div class="grid grid-cols-2 gap-4">
        <label class="{labelClass} col-span-2">
          <span class={labelTextClass}>Account Holder Name</span>
          <input type="text" placeholder="e.g. Rajesh Kumar"
            class="{fieldClass} {errors.accountHolderName ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.accountHolderName} />
          {#if errors.accountHolderName}<span class={errorClass}>{errors.accountHolderName}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Account Number</span>
          <input type="text" placeholder="e.g. 1234567890" maxlength="18"
            class="{fieldClass} {errors.bankAccountNumber ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.bankAccountNumber} />
          {#if errors.bankAccountNumber}<span class={errorClass}>{errors.bankAccountNumber}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>IFSC Code</span>
          <input type="text" placeholder="e.g. SBIN0001234" maxlength="11"
            class="{fieldClass} {errors.ifscCode ? 'border-red-400 focus:border-red-400' : ''}"
            bind:value={form.ifscCode}
            oninput={(e) => { const el = e.target as HTMLInputElement; el.value = el.value.toUpperCase(); form.ifscCode = el.value; }} />
          {#if errors.ifscCode}<span class={errorClass}>{errors.ifscCode}</span>{/if}
        </label>
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
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
        >
          Save Changes
        </button>
      </div>
    </form>
  </div>
</div>

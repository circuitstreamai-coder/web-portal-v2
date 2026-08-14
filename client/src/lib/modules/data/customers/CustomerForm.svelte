<script lang="ts">
  import { type Customer } from "./queries";
  import { lookupPincode } from "$lib/utils/pincode";

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
    mode = "add",
    data = null,
    onSave,
    onClose,
  }: {
    mode?: "add" | "edit";
    data?: Customer | null;
    onSave: (form: Record<string, string>) => Promise<void>;
    onClose: () => void;
  } = $props();

  let form = $state({
    company: "",
    contact: "",
    email: "",
    phone: "",
    addressState: "",
    addressCity: "",
    addressPincode: "",
    secondaryContactName: "",
    secondaryContactEmail: "",
    secondaryContactPhone: "",
  });

  $effect(() => {
    form.company              = data?.companyName ?? "";
    form.contact              = data?.contactPersonName ?? "";
    form.email                = data?.email ?? "";
    form.phone                = data?.phone ?? "";
    form.addressState         = data?.addressState ?? "";
    form.addressCity          = data?.addressCity ?? "";
    form.addressPincode       = data?.addressPincode ?? "";
    form.secondaryContactName = data?.secondaryContactName ?? "";
    form.secondaryContactEmail= data?.secondaryContactEmail ?? "";
    form.secondaryContactPhone= data?.secondaryContactPhone ?? "";
  });

  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
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
  let emailCheckStatus = $state<"idle" | "checking" | "taken" | "ok">("idle");
  let secEmailCheckStatus = $state<"idle" | "checking" | "taken" | "ok">("idle");

  async function checkEmail(field: "primary" | "secondary") {
    const email = field === "primary"
      ? form.email.trim()
      : form.secondaryContactEmail.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (field === "primary") emailCheckStatus = "idle";
      else secEmailCheckStatus = "idle";
      return;
    }

    // In edit mode skip check if email hasn't changed from original
    const originalEmail = field === "primary"
      ? (data?.email ?? "")
      : (data?.secondaryContactEmail ?? "");
    if (mode === "edit" && email.toLowerCase() === originalEmail.trim().toLowerCase()) {
      if (field === "primary") emailCheckStatus = "idle";
      else secEmailCheckStatus = "idle";
      return;
    }

    if (field === "primary") emailCheckStatus = "checking";
    else secEmailCheckStatus = "checking";

    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, flow: "customer" }),
      });
      const result = await res.json();
      if (field === "primary") {
        emailCheckStatus = result.exists ? "taken" : "ok";
        if (result.exists) errors.email = "Email is already in use";
        else delete errors.email;
      } else {
        secEmailCheckStatus = result.exists ? "taken" : "ok";
        if (result.exists) errors.secondaryContactEmail = "Email is already in use";
        else delete errors.secondaryContactEmail;
      }
    } catch {
      if (field === "primary") emailCheckStatus = "idle";
      else secEmailCheckStatus = "idle";
    }
  }

  function validate() {
    errors = {};

    // Company name: required, no digits
    const company = form.company.trim();
    if (!company) errors.company = "Company name is required";
    else if (/\d/.test(company)) errors.company = "Company name must not contain numbers";

    // Contact person: required, letters/spaces/dots/hyphens/apostrophes only
    const contact = form.contact.trim();
    if (!contact) errors.contact = "Contact person name is required";
    else if (!/^[A-Za-z\s.\-']+$/.test(contact)) errors.contact = "Name must contain only letters";

    // A primary email is required because every customer receives portal access.
    if (!form.email.trim())
      errors.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errors.email = "Enter a valid email address";
    else if (emailCheckStatus === "taken")
      errors.email = "Email is already in use";

    // Primary phone: required, 10-digit Indian mobile (starts 6–9)
    const phone = form.phone.trim();
    if (!phone) errors.phone = "Phone number is required";
    else if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = "Enter a valid 10-digit mobile number starting with 6–9";

    // State required
    if (!form.addressState) errors.addressState = "State is required";

    // City: if provided, letters/spaces/dots/hyphens only
    const city = form.addressCity.trim();
    if (city && !/^[A-Za-z\s.\-]+$/.test(city)) errors.addressCity = "City must contain only letters";

    // Pincode: if provided, exactly 6 digits, no leading zero
    const pin = form.addressPincode.trim();
    if (pin && !/^[1-9]\d{5}$/.test(pin)) errors.addressPincode = "Enter a valid 6-digit pincode";

    // Secondary contact name: if provided, letters only
    const secName = form.secondaryContactName.trim();
    if (secName && !/^[A-Za-z\s.\-']+$/.test(secName))
      errors.secondaryContactName = "Name must contain only letters";

    // Secondary email: if provided, valid format; also guard duplicate check result
    if (form.secondaryContactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondaryContactEmail.trim()))
      errors.secondaryContactEmail = "Enter a valid email address";
    else if (secEmailCheckStatus === "taken")
      errors.secondaryContactEmail = "Email is already in use";

    // Secondary phone: if provided, 10-digit Indian mobile
    const secPhone = form.secondaryContactPhone.trim();
    if (secPhone && !/^[6-9]\d{9}$/.test(secPhone))
      errors.secondaryContactPhone = "Enter a valid 10-digit mobile number starting with 6–9";

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate() || saving) return;
    saving = true;
    try {
      await onSave({ ...form });
    } finally {
      saving = false;
    }
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] focus:ring-2 focus:ring-[#0B182A]/10 transition-all w-full bg-white disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "flex flex-col gap-1.5";
  const labelTextClass =
    "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-0.5";
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
    aria-label="Close modal"
    onclick={saving ? undefined : onClose}
  ></button>
  <!-- Modal -->
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col animate-in"
    role="dialog"
    aria-modal="true"
    aria-label={mode === "add" ? "Add Customer" : "Edit Customer"}
    tabindex="-1"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
    >
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">
          {mode === "add" ? "Add Customer" : "Edit Customer"}
        </h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {mode === "add"
            ? "Register a new customer to the portal"
            : "Update the customer details below"}
        </p>
      </div>
      <button
        onclick={onClose}
        disabled={saving}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:scale-95 transition-all text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Close"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" /><line
            x1="6"
            y1="6"
            x2="18"
            y2="18"
          />
        </svg>
      </button>
    </div>

    <!-- Body -->
    <form
      class="px-6 py-5 flex flex-col gap-4 overflow-y-auto"
      onsubmit={handleSubmit}
    >
      <!-- Section: Primary Contact -->
      <p
        class="text-[11px] font-bold text-gray-400 uppercase tracking-widest -mb-1"
      >
        Primary Contact
      </p>

      <!-- Company Name -->
      <label class={labelClass}>
        <span class={labelTextClass}
          >Company Name <span class="text-red-400">*</span></span
        >
        <input
          type="text"
          placeholder="e.g. HDFC Bank"
          class="{fieldClass} {errors.company
            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
            : ''}"
          bind:value={form.company}
          disabled={saving}
        />
        {#if errors.company}<span class={errorClass}>{errors.company}</span
          >{/if}
      </label>

      <!-- Contact Person -->
      <label class={labelClass}>
        <span class={labelTextClass}
          >Contact Person <span class="text-red-400">*</span></span
        >
        <input
          type="text"
          placeholder="e.g. Arun Kumar"
          class="{fieldClass} {errors.contact
            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
            : ''}"
          bind:value={form.contact}
          disabled={saving}
        />
        {#if errors.contact}<span class={errorClass}>{errors.contact}</span
          >{/if}
      </label>

      <!-- Row: Email + Phone -->
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Email <span class="text-red-400">*</span></span>
          <div class="relative">
            <input
              type="email"
              placeholder="e.g. arun@hdfc.com"
              class="{fieldClass} {errors.email || emailCheckStatus === 'taken'
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
                : emailCheckStatus === 'ok' ? 'border-green-400' : ''}"
              bind:value={form.email}
              required
              disabled={saving}
              onblur={() => checkEmail("primary")}
              oninput={() => { emailCheckStatus = "idle"; delete errors.email; }}
            />
            {#if emailCheckStatus === "checking"}
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Checking…</span>
            {:else if emailCheckStatus === "ok"}
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-green-600">Available</span>
            {/if}
          </div>
          {#if errors.email}<span class={errorClass}>{errors.email}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}
            >Phone <span class="text-red-400">*</span></span
          >
          <input
            type="tel"
            placeholder="e.g. 9876543210"
            class="{fieldClass} {errors.phone
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
              : ''}"
            bind:value={form.phone}
            maxlength="10"
            disabled={saving}
          />
          {#if errors.phone}<span class={errorClass}>{errors.phone}</span>{/if}
        </label>
      </div>

      <!-- Section: Address -->
      <p
        class="text-[11px] font-bold text-gray-400 uppercase tracking-widest -mb-1"
      >
        Address
      </p>

      <!-- Row: State + City -->
      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}
            >State <span class="text-red-400">*</span></span
          >
          <select
            class="{fieldClass} {errors.addressState
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
              : ''}"
            bind:value={form.addressState}
            disabled={saving}
          >
            <option value="">— Select State —</option>
            {#each INDIAN_STATES as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
          {#if errors.addressState}<span class={errorClass}
              >{errors.addressState}</span
            >{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>City</span>
          <input
            type="text"
            placeholder="e.g. Kochi"
            class="{fieldClass} {errors.addressCity
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
              : ''}"
            bind:value={form.addressCity}
            disabled={saving}
          />
          {#if errors.addressCity}<span class={errorClass}>{errors.addressCity}</span>{/if}
        </label>
      </div>

      <!-- Pincode -->
      <label class={labelClass}>
        <span class={labelTextClass}>Pincode</span>
        <div class="relative">
          <input
            type="text"
            placeholder="e.g. 682001"
            class="{fieldClass} {errors.addressPincode
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
              : ''}"
            bind:value={form.addressPincode}
            maxlength="6"
            disabled={saving}
            oninput={(e) => handlePincodeInput((e.currentTarget as HTMLInputElement).value)}
          />
          {#if pincodeLoading}
            <div class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
          {/if}
        </div>
        <p class="text-[11px] text-blue-500">Enter 6-digit pincode to auto-fill state & city</p>
        {#if errors.addressPincode}<span class={errorClass}>{errors.addressPincode}</span>{/if}
      </label>

      <!-- Section: Secondary Contact -->
      <p
        class="text-[11px] font-bold text-gray-400 uppercase tracking-widest -mb-1"
      >
        Secondary Contact <span class="normal-case font-normal">(optional)</span
        >
      </p>

      <label class={labelClass}>
        <span class={labelTextClass}>Name</span>
        <input
          type="text"
          placeholder="e.g. Priya Nair"
          class="{fieldClass} {errors.secondaryContactName
            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
            : ''}"
          bind:value={form.secondaryContactName}
          disabled={saving}
        />
        {#if errors.secondaryContactName}<span class={errorClass}>{errors.secondaryContactName}</span>{/if}
      </label>

      <div class="grid grid-cols-2 gap-4">
        <label class={labelClass}>
          <span class={labelTextClass}>Email</span>
          <div class="relative">
            <input
              type="email"
              placeholder="e.g. priya@hdfc.com"
              class="{fieldClass} {errors.secondaryContactEmail || secEmailCheckStatus === 'taken'
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
                : secEmailCheckStatus === 'ok' ? 'border-green-400' : ''}"
              bind:value={form.secondaryContactEmail}
              disabled={saving}
              onblur={() => checkEmail("secondary")}
              oninput={() => { secEmailCheckStatus = "idle"; delete errors.secondaryContactEmail; }}
            />
            {#if secEmailCheckStatus === "checking"}
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">Checking…</span>
            {:else if secEmailCheckStatus === "ok"}
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-green-600">Available</span>
            {/if}
          </div>
          {#if errors.secondaryContactEmail}<span class={errorClass}>{errors.secondaryContactEmail}</span>{/if}
        </label>
        <label class={labelClass}>
          <span class={labelTextClass}>Phone</span>
          <input
            type="text"
            placeholder="e.g. 9876543210"
            class="{fieldClass} {errors.secondaryContactPhone
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
              : ''}"
            bind:value={form.secondaryContactPhone}
            maxlength="10"
            disabled={saving}
          />
          {#if errors.secondaryContactPhone}<span class={errorClass}>{errors.secondaryContactPhone}</span>{/if}
        </label>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
        <button
          type="button"
          onclick={onClose}
          disabled={saving}
          class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          class="relative flex items-center justify-center gap-2 px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg
                 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer
                 disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100
                 min-w-[120px]"
        >
          {#if saving}
            <!-- Spinner -->
            <svg
              class="animate-spin h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              ></path>
            </svg>
            {mode === "add" ? "Adding…" : "Saving…"}
          {:else}
            {mode === "add" ? "Add Customer" : "Save Changes"}
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .animate-in {
    animation: slideUp 0.18s ease-out both;
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>

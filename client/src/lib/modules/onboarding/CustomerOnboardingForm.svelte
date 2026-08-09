<script lang="ts">
  import { toast } from "svelte-sonner";
  import { submitCustomerOnboarding } from "./customer-api";
  import PhoneOtpVerifier from "./PhoneOtpVerifier.svelte";
  import { lookupPincode } from "$lib/utils/pincode";
  import Logo from "$lib/ui/Logo.svelte";

  const STEPS = [
    { title: "Business Details", subtitle: "Company & primary contact" },
    { title: "Secondary Contact", subtitle: "Optional additional contact" },
    { title: "Review & Submit", subtitle: "Confirm and submit" },
  ];

  const INDIAN_STATES = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Delhi (NCT)",
    "Chandigarh",
    "Puducherry",
    "Ladakh",
    "Jammu & Kashmir",
    "Lakshadweep",
    "Dadra & Nagar Haveli and Daman & Diu",
    "Andaman & Nicobar Islands",
  ];

  let currentStep = $state(0);
  let isSubmitted = $state(false);
  let isSubmitting = $state(false);
  let referenceId = $state("");
  let termsAccepted = $state(false);
  let hasSecondaryContact = $state(false);
  // Phone is verified before the form wizard is shown
  let phoneGateCleared = $state(false);
  let pincodeLoading = $state(false);

  async function handlePincodeInput(pincode: string) {
    if (!/^\d{6}$/.test(pincode)) return;
    pincodeLoading = true;
    try {
      const result = await lookupPincode(pincode);
      if (result) {
        form.state = result.state;
        form.city = result.city;
      }
    } finally {
      pincodeLoading = false;
    }
  }

  let form = $state({
    // Business Details
    customerName: "",
    companyName: "",
    contactPersonName: "",
    email: "",
    phone: "",
    state: "",
    city: "",
    pincode: "",

    // Secondary Contact
    secondaryName: "",
    secondaryEmail: "",
    secondaryPhone: "",
  });

  let errors = $state<Record<string, string>>({});

  function validateStep(step: number): boolean {
    errors = {};
    switch (step) {
      case 0:
        if (!form.customerName.trim())
          errors.customerName = "Customer name is required";
        if (!form.companyName.trim())
          errors.companyName = "Company name is required";
        if (!form.contactPersonName.trim())
          errors.contactPersonName = "Contact person name is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
          errors.email = "Enter valid email address";
        if (!form.state) errors.state = "Please select your state";
        if (!form.city.trim()) errors.city = "City is required";
        if (!/^\d{6}$/.test(form.pincode))
          errors.pincode = "Enter valid 6-digit pincode";
        break;
      case 1:
        if (hasSecondaryContact) {
          if (!form.secondaryName.trim())
            errors.secondaryName = "Secondary contact name is required";
          if (
            form.secondaryEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondaryEmail)
          )
            errors.secondaryEmail = "Enter valid email address";
          if (form.secondaryPhone && !/^[6-9]\d{9}$/.test(form.secondaryPhone))
            errors.secondaryPhone = "Enter valid 10-digit mobile number";
        }
        break;
    }
    return Object.keys(errors).length === 0;
  }

  function nextStep() {
    if (validateStep(currentStep)) {
      currentStep = Math.min(currentStep + 1, STEPS.length - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function prevStep() {
    currentStep = Math.max(currentStep - 1, 0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    isSubmitting = true;
    try {
      const result = await submitCustomerOnboarding({
        customerName: form.customerName,
        companyName: form.companyName,
        contactPersonName: form.contactPersonName,
        email: form.email,
        phone: form.phone,
        state: form.state,
        city: form.city,
        pincode: form.pincode,
        secondaryName: hasSecondaryContact ? form.secondaryName : undefined,
        secondaryEmail: hasSecondaryContact ? form.secondaryEmail : undefined,
        secondaryPhone: hasSecondaryContact ? form.secondaryPhone : undefined,
      });
      referenceId = result.referenceId;
      isSubmitted = true;
      toast.success("Registration submitted successfully!");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Submission failed. Please try again.",
      );
    } finally {
      isSubmitting = false;
    }
  }

  const inputClass =
    "w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors bg-white";
  const labelTextClass =
    "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errorClass = "text-[11px] text-red-500 mt-1";
  const selectClass =
    "w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors bg-white";
</script>

<div class="min-h-screen bg-stone-100 py-8 px-4">
  <!-- Header -->
  <div class="text-center mb-8">
    <div class="inline-flex items-center justify-center mb-4">
      <Logo height={48} />
    </div>
    <h1 class="text-2xl md:text-3xl font-bold text-[#0B182A] mb-1.5">
      Customer Onboarding
    </h1>
    <p class="text-gray-600 text-[13px]">
      Register your business to access our service management platform
    </p>
    <a
      href="/auth"
      class="inline-flex items-center gap-1.5 mt-3 text-[12px] text-gray-500 hover:text-[#0B182A] transition-colors"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Login
    </a>
  </div>

  {#if isSubmitted}
    <!-- Success State -->
    <div class="max-w-xl mx-auto">
      <div class="bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div
          class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style="background-color:#dcfce7"
        >
          <svg
            class="w-8 h-8 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">
          Registration Submitted!
        </h2>
        <p class="text-gray-500 text-[13px] mb-6">
          Thank you, <strong>{form.contactPersonName}</strong> from
          <strong>{form.companyName}</strong>. Your account registration is
          pending approval by our admin team.
        </p>
        <div class="bg-gray-50 rounded-xl p-4 mb-6">
          <p class="text-[11px] text-gray-500 uppercase tracking-wide mb-1">
            Reference ID
          </p>
          <p class="text-base font-bold text-[#0B182A] font-mono">
            {referenceId}
          </p>
          <p class="text-[11px] text-gray-400 mt-1">
            Save this for tracking your registration
          </p>
        </div>
        <div class="text-left bg-blue-50 rounded-xl p-4 space-y-3">
          <p
            class="text-[11px] font-semibold text-gray-700 uppercase tracking-wide"
          >
            What happens next?
          </p>
          {#each ["Your registration will be reviewed by a Super Admin", `Login credentials will be sent to ${form.email} upon approval`, "You'll be able to raise tickets, track SLA, and view reports", "Data is retained securely for 2 years if the account becomes inactive"] as step, i}
            <div class="flex items-start gap-3">
              <span
                class="w-5 h-5 rounded-full text-white text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold"
                style="background-color:#E87D1F">{i + 1}</span
              >
              <p class="text-[13px] text-gray-600">{step}</p>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if !phoneGateCleared}
    <!-- ── Phone Verification Gate ── -->
    <PhoneOtpVerifier
      flow="customer"
      onVerified={(email) => {
        form.email = email;
        phoneGateCleared = true;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
    <p class="text-center text-[11px] text-gray-500 mt-6 pb-4">
      Having trouble? Contact support at <span class="text-gray-600"
        >support@innoserve.in</span
      >
    </p>
  {:else}
    <div class="max-w-3xl mx-auto">
      <!-- Step Progress -->
      <div class="bg-white shadow-sm border border-gray-200 rounded-2xl p-4 mb-5">
        <div class="flex items-center">
          {#each STEPS as step, i}
            <div
              class="flex items-center {i < STEPS.length - 1 ? 'flex-1' : ''}"
            >
              <div class="flex flex-col items-center">
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[13px] flex-shrink-0 transition-colors"
                  class:bg-green-500={i < currentStep}
                  class:text-white={i <= currentStep}
                  style={i === currentStep
                    ? "background-color:#E87D1F"
                    : i < currentStep
                      ? ""
                      : "background-color:#e5e7eb"}
                >
                  {#if i < currentStep}
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  {:else}
                    <span class={i > currentStep ? "text-gray-400" : ""}
                      >{i + 1}</span
                    >
                  {/if}
                </div>
                <span
                  class="text-[10px] mt-1 hidden md:block whitespace-nowrap font-medium"
                  style={i === currentStep
                    ? "color:#E87D1F"
                    : i < currentStep
                      ? "color:#16a34a"
                      : "color:#9ca3af"}>{step.title}</span
                >
              </div>
              {#if i < STEPS.length - 1}
                <div
                  class="flex-1 h-px mx-2"
                  style={i < currentStep
                    ? "background-color:#16a34a"
                    : "background-color:#e5e7eb"}
                ></div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="mt-2.5 md:hidden text-center">
          <span class="text-[13px] font-medium" style="color:#E87D1F"
            >{STEPS[currentStep].title}</span
          >
          <span class="text-gray-500 text-[13px]">
            · Step {currentStep + 1} of {STEPS.length}</span
          >
        </div>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
        <!-- Card Header -->
        <div class="bg-[linear-gradient(to_right,#0B182A,#021E44)] px-6 py-4">
          <h2 class="text-[15px] font-semibold text-white">
            {STEPS[currentStep].title}
          </h2>
          <p class="text-gray-400 text-[12px] mt-0.5">
            {STEPS[currentStep].subtitle}
          </p>
        </div>

        <div class="p-6 md:p-8">
          <!-- ── Step 0: Business Details ── -->
          {#if currentStep === 0}
            <div class="flex flex-col gap-5">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}
                    >Customer Name <span class="text-red-400">*</span></span
                  >
                  <input
                    type="text"
                    bind:value={form.customerName}
                    class="{inputClass} {errors.customerName
                      ? 'border-red-300'
                      : ''}"
                    placeholder="e.g. Rajesh Kumar"
                  />
                  {#if errors.customerName}<span class={errorClass}
                      >{errors.customerName}</span
                    >{/if}
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}
                    >Company Name <span class="text-red-400">*</span></span
                  >
                  <input
                    type="text"
                    bind:value={form.companyName}
                    class="{inputClass} {errors.companyName
                      ? 'border-red-300'
                      : ''}"
                    placeholder="e.g. Acme Pvt Ltd"
                  />
                  {#if errors.companyName}<span class={errorClass}
                      >{errors.companyName}</span
                    >{/if}
                </label>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >Contact Person Name <span class="text-red-400">*</span></span
                >
                <input
                  type="text"
                  bind:value={form.contactPersonName}
                  class="{inputClass} {errors.contactPersonName
                    ? 'border-red-300'
                    : ''}"
                  placeholder="Primary point of contact"
                />
                {#if errors.contactPersonName}<span class={errorClass}
                    >{errors.contactPersonName}</span
                  >{/if}
              </label>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <span class={labelTextClass}>Email ID</span>
                  <div class="flex items-center gap-2.5 px-3.5 py-2.5 border border-green-200 bg-green-50 rounded-lg">
                    <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span class="text-[13px] font-medium text-green-800">{form.email}</span>
                    <span class="ml-auto text-[11px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Verified</span>
                  </div>
                </div>
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}>Phone Number</span>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-medium select-none">+91</span>
                    <input
                      type="tel"
                      bind:value={form.phone}
                      class="{inputClass} {errors.phone ? 'border-red-300' : ''} pl-11"
                      placeholder="9876543210"
                      maxlength="10"
                    />
                  </div>
                  {#if errors.phone}<span class={errorClass}>{errors.phone}</span>{/if}
                </label>
              </div>

              <!-- Address -->
              <div>
                <p class="{labelTextClass} mb-2.5">
                  Address <span class="text-red-400">*</span>
                </p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>State</span>
                    <select
                      bind:value={form.state}
                      class="{selectClass} {errors.state
                        ? 'border-red-300'
                        : ''}"
                    >
                      <option value="">Select State</option>
                      {#each INDIAN_STATES as s}
                        <option value={s}>{s}</option>
                      {/each}
                    </select>
                    {#if errors.state}<span class={errorClass}
                        >{errors.state}</span
                      >{/if}
                  </label>
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>City</span>
                    <input
                      type="text"
                      bind:value={form.city}
                      class="{inputClass} {errors.city ? 'border-red-300' : ''}"
                      placeholder="Enter city"
                    />
                    {#if errors.city}<span class={errorClass}
                        >{errors.city}</span
                      >{/if}
                  </label>
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>Pincode</span>
                    <div class="relative">
                      <input
                        type="text"
                        bind:value={form.pincode}
                        class="{inputClass} {errors.pincode ? 'border-red-300' : ''}"
                        placeholder="6-digit pincode"
                        maxlength="6"
                        oninput={(e) => handlePincodeInput((e.currentTarget as HTMLInputElement).value)}
                      />
                      {#if pincodeLoading}
                        <div class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
                      {/if}
                    </div>
                    <p class="text-[11px] text-blue-500">Enter 6-digit pincode to auto-fill state & city</p>
                    {#if errors.pincode}<span class={errorClass}>{errors.pincode}</span>{/if}
                  </label>
                </div>
              </div>
            </div>

            <!-- ── Step 1: Secondary Contact ── -->
          {:else if currentStep === 1}
            <div class="flex flex-col gap-5">
              <!-- Toggle -->
              <div class="bg-gray-50 rounded-xl p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-[13px] font-semibold text-gray-800">
                      Add Secondary Contact
                    </p>
                    <p class="text-[12px] text-gray-500 mt-0.5">
                      Optional — provide an alternate contact person for your
                      account
                    </p>
                  </div>
                  <label
                    class="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      bind:checked={hasSecondaryContact}
                      class="sr-only peer"
                    />
                    <div
                      class="w-10 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all"
                      style={hasSecondaryContact
                        ? "background-color:#E87D1F"
                        : "background-color:#d1d5db"}
                    ></div>
                  </label>
                </div>
              </div>

              {#if hasSecondaryContact}
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}
                    >Contact Name <span class="text-red-400">*</span></span
                  >
                  <input
                    type="text"
                    bind:value={form.secondaryName}
                    class="{inputClass} {errors.secondaryName
                      ? 'border-red-300'
                      : ''}"
                    placeholder="Secondary contact full name"
                  />
                  {#if errors.secondaryName}<span class={errorClass}
                      >{errors.secondaryName}</span
                    >{/if}
                </label>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>Email ID</span>
                    <input
                      type="email"
                      bind:value={form.secondaryEmail}
                      class="{inputClass} {errors.secondaryEmail
                        ? 'border-red-300'
                        : ''}"
                      placeholder="secondary@company.com"
                    />
                    {#if errors.secondaryEmail}<span class={errorClass}
                        >{errors.secondaryEmail}</span
                      >{/if}
                  </label>
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>Phone Number</span>
                    <div class="relative">
                      <span
                        class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-medium select-none"
                        >+91</span
                      >
                      <input
                        type="tel"
                        bind:value={form.secondaryPhone}
                        class="{inputClass} {errors.secondaryPhone
                          ? 'border-red-300'
                          : ''} pl-11"
                        placeholder="9876543210"
                        maxlength="10"
                      />
                    </div>
                    {#if errors.secondaryPhone}<span class={errorClass}
                        >{errors.secondaryPhone}</span
                      >{/if}
                  </label>
                </div>
              {:else}
                <div
                  class="flex flex-col items-center justify-center py-10 text-center"
                >
                  <div
                    class="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3"
                  >
                    <svg
                      class="w-7 h-7 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <p class="text-[13px] text-gray-500">
                    No secondary contact added
                  </p>
                  <p class="text-[12px] text-gray-400 mt-1">
                    Toggle the switch above to add one
                  </p>
                </div>
              {/if}
            </div>

            <!-- ── Step 2: Review & Submit ── -->
          {:else if currentStep === 2}
            <div class="flex flex-col gap-5">
              <p class="text-[13px] text-gray-500">
                Review your information before submitting. Use the Edit links to
                make changes.
              </p>

              <!-- Business Details Review -->
              <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div
                  class="bg-gray-50 px-4 py-2.5 flex items-center justify-between"
                >
                  <span class="text-[12px] font-semibold text-gray-700"
                    >Business Details</span
                  >
                  <button
                    onclick={() => {
                      currentStep = 0;
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    class="text-[12px] font-medium hover:underline"
                    style="color:#E87D1F">Edit</button
                  >
                </div>
                <div class="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Customer Name
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.customerName || "—"}
                    </p>
                  </div>
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Company Name
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.companyName || "—"}
                    </p>
                  </div>
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Contact Person
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.contactPersonName || "—"}
                    </p>
                  </div>
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Phone
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.phone ? "+91 " + form.phone : "—"}
                    </p>
                  </div>
                  <div class="col-span-2">
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Email
                    </p>
                    <div class="flex items-center gap-2 mt-0.5">
                      <p class="text-[13px] text-gray-900">{form.email || "—"}</p>
                      {#if form.email}<span class="text-[10px] font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">Verified</span>{/if}
                    </div>
                  </div>
                  <div class="col-span-2">
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Address
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {[form.city, form.state, form.pincode]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Secondary Contact Review -->
              <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div
                  class="bg-gray-50 px-4 py-2.5 flex items-center justify-between"
                >
                  <span class="text-[12px] font-semibold text-gray-700"
                    >Secondary Contact</span
                  >
                  <button
                    onclick={() => {
                      currentStep = 1;
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    class="text-[12px] font-medium hover:underline"
                    style="color:#E87D1F">Edit</button
                  >
                </div>
                <div class="p-4">
                  {#if hasSecondaryContact && form.secondaryName}
                    <div class="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p
                          class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                        >
                          Name
                        </p>
                        <p class="text-[13px] text-gray-900 mt-0.5">
                          {form.secondaryName}
                        </p>
                      </div>
                      <div>
                        <p
                          class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                        >
                          Phone
                        </p>
                        <p class="text-[13px] text-gray-900 mt-0.5">
                          {form.secondaryPhone
                            ? "+91 " + form.secondaryPhone
                            : "—"}
                        </p>
                      </div>
                      <div class="col-span-2">
                        <p
                          class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                        >
                          Email
                        </p>
                        <p class="text-[13px] text-gray-900 mt-0.5">
                          {form.secondaryEmail || "—"}
                        </p>
                      </div>
                    </div>
                  {:else}
                    <p class="text-[13px] text-gray-400">
                      No secondary contact added
                    </p>
                  {/if}
                </div>
              </div>

              <!-- Declaration -->
              <div class="bg-gray-50 rounded-xl p-4">
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <label class="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={termsAccepted}
                    class="mt-0.5 w-4 h-4 rounded flex-shrink-0"
                    style="accent-color:#E87D1F"
                  />
                  <span class="text-[12px] text-gray-600 leading-relaxed">
                    I confirm that the information provided is accurate and I am
                    authorized to register this company on the InnoServe
                    platform. I agree to the terms of service.
                  </span>
                </label>
              </div>
            </div>
          {/if}

          <!-- Navigation Buttons -->
          <div
            class="flex items-center justify-between mt-8 pt-5 border-t border-gray-100"
          >
            <button
              onclick={prevStep}
              disabled={currentStep === 0}
              class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            <span class="text-[11px] text-gray-400"
              >Step {currentStep + 1} of {STEPS.length}</span
            >
            {#if currentStep < STEPS.length - 1}
              <button
                onclick={nextStep}
                class="px-5 py-2.5 text-[13px] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                style="background-color:#E87D1F"
              >
                Next →
              </button>
            {:else}
              <button
                onclick={handleSubmit}
                disabled={!termsAccepted || isSubmitting}
                class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {#if isSubmitting}
                  <svg
                    class="w-3.5 h-3.5 animate-spin"
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
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Submitting…
                {:else}
                  Submit Registration
                {/if}
              </button>
            {/if}
          </div>
        </div>
      </div>

      <p class="text-center text-[11px] text-gray-500 mt-6 pb-4">
        Having trouble? Contact support at <span class="text-gray-700"
          >support@innoserve.in</span
        >
      </p>
    </div>
  {/if}
</div>

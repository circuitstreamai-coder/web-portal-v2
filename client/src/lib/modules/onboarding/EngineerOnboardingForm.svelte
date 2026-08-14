<script lang="ts">
  import { toast } from "svelte-sonner";
  import { submitEngineerOnboarding } from "./engineer-api";
  import PhoneOtpVerifier from "./PhoneOtpVerifier.svelte";
  import { lookupPincode } from "$lib/utils/pincode";
  import Logo from "$lib/ui/Logo.svelte";

  const STEPS = [
    { title: "Basic Details", subtitle: "Personal information & address" },
    { title: "KYC Documents", subtitle: "Identity verification" },
    { title: "Bank Details", subtitle: "Payment information" },
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
  let phoneGateCleared = $state(false);
  let verificationToken = $state("");
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
    fullName: "",
    phone: "",
    email: "",
    state: "",
    city: "",
    pincode: "",
    profilePhoto: null as File | null,
    profilePhotoPreview: "",
    aadhaarFront: null as File | null,
    aadhaarBack: null as File | null,
    panFile: null as File | null,
    dlFront: null as File | null,
    dlBack: null as File | null,
    accountHolderName: "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifsc: "",
    cancelChequeFile: null as File | null,
  });

  let errors = $state<Record<string, string>>({});

  // ── File validation helper ──────────────────────────────────────────────────
  const ALLOWED_DOC_TYPES = ["image/jpeg", "image/png", "application/pdf"];
  const MAX_DOC_MB = 5;
  const MAX_PHOTO_MB = 2;

  function validateFile(
    file: File | null,
    label: string,
    opts: { required?: boolean; maxMB?: number; types?: string[] } = {},
  ): string | null {
    const {
      required = true,
      maxMB = MAX_DOC_MB,
      types = ALLOWED_DOC_TYPES,
    } = opts;
    if (!file) return required ? `${label} is required` : null;
    if (!types.includes(file.type))
      return `${label}: only ${types.map((t) => t.split("/")[1].toUpperCase()).join(", ")} files are allowed`;
    if (file.size > maxMB * 1024 * 1024)
      return `${label}: file size must be under ${maxMB}MB`;
    return null;
  }

  // ── Per-step validation ─────────────────────────────────────────────────────
  function validateStep(step: number): boolean {
    errors = {};

    if (step === 0) {
      // Full Name — letters, spaces, dots, apostrophes, hyphens; 2–60 chars
      const name = form.fullName.trim();
      if (!name) {
        errors.fullName = "Full name is required";
      } else if (!/^[A-Za-z\s.\-']+$/.test(name)) {
        errors.fullName =
          "Name must contain only letters, spaces, dots, apostrophes or hyphens";
      } else if (name.length < 2 || name.length > 60) {
        errors.fullName = "Name must be between 2 and 60 characters";
      } else if (/\s{2,}/.test(name)) {
        errors.fullName = "Name must not contain consecutive spaces";
      }

      // Phone — 10 digits, starts with 6–9 (Indian mobile)
      const phone = form.phone.trim();
      if (!phone) {
        errors.phone = "Phone number is required";
      } else if (!/^\d+$/.test(phone)) {
        errors.phone = "Phone number must contain only digits";
      } else if (!/^[6-9]\d{9}$/.test(phone)) {
        errors.phone =
          "Enter a valid 10-digit Indian mobile number (must start with 6, 7, 8 or 9)";
      }

      // Email (already pre-filled & verified, but guard anyway)
      const email = form.email.trim();
      if (!email) {
        errors.email = "Email address is required";
      } else if (
        !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)
      ) {
        errors.email = "Enter a valid email address (e.g. name@example.com)";
      }

      // State
      if (!form.state) {
        errors.state = "Please select your state";
      }

      // City — letters, spaces, dots, hyphens; 2–50 chars
      const city = form.city.trim();
      if (!city) {
        errors.city = "City is required";
      } else if (!/^[A-Za-z\s.\-]+$/.test(city)) {
        errors.city =
          "City name must contain only letters, spaces, dots or hyphens";
      } else if (city.length < 2 || city.length > 50) {
        errors.city = "City name must be between 2 and 50 characters";
      }

      // Pincode — 6 digits, must not start with 0
      const pin = form.pincode.trim();
      if (!pin) {
        errors.pincode = "Pincode is required";
      } else if (!/^\d+$/.test(pin)) {
        errors.pincode = "Pincode must contain only digits";
      } else if (!/^[1-9]\d{5}$/.test(pin)) {
        errors.pincode =
          "Enter a valid 6-digit pincode (must not start with 0)";
      }

      // Profile photo (optional — validate only if provided)
      if (form.profilePhoto) {
        const photoErr = validateFile(form.profilePhoto, "Profile photo", {
          required: false,
          maxMB: MAX_PHOTO_MB,
          types: ["image/jpeg", "image/png"],
        });
        if (photoErr) errors.profilePhoto = photoErr;
      }
    }

    if (step === 1) {
      const aadhaarFrontErr = validateFile(
        form.aadhaarFront,
        "Aadhaar card (front)",
      );
      if (aadhaarFrontErr) errors.aadhaarFront = aadhaarFrontErr;

      const aadhaarBackErr = validateFile(
        form.aadhaarBack,
        "Aadhaar card (back)",
      );
      if (aadhaarBackErr) errors.aadhaarBack = aadhaarBackErr;

      const panErr = validateFile(form.panFile, "PAN card");
      if (panErr) errors.panFile = panErr;

      const dlFrontErr = validateFile(form.dlFront, "Driving license (front)");
      if (dlFrontErr) errors.dlFront = dlFrontErr;

      const dlBackErr = validateFile(form.dlBack, "Driving license (back)");
      if (dlBackErr) errors.dlBack = dlBackErr;
    }

    if (step === 2) {
      // Account holder name — letters, spaces, dots, apostrophes, hyphens
      const holderName = form.accountHolderName.trim();
      if (!holderName) {
        errors.accountHolderName = "Account holder name is required";
      } else if (!/^[A-Za-z\s.\-']+$/.test(holderName)) {
        errors.accountHolderName =
          "Name must contain only letters, spaces, dots, apostrophes or hyphens";
      } else if (holderName.length < 2 || holderName.length > 80) {
        errors.accountHolderName = "Name must be between 2 and 80 characters";
      }

      // Account number — digits only, 9–18 digits
      const accNum = form.accountNumber.trim();
      if (!accNum) {
        errors.accountNumber = "Account number is required";
      } else if (!/^\d+$/.test(accNum)) {
        errors.accountNumber = "Account number must contain only digits";
      } else if (accNum.length < 9 || accNum.length > 18) {
        errors.accountNumber = "Account number must be between 9 and 18 digits";
      }

      // Confirm account number
      const confirmNum = form.confirmAccountNumber.trim();
      if (!confirmNum) {
        errors.confirmAccountNumber = "Please confirm your account number";
      } else if (form.accountNumber !== form.confirmAccountNumber) {
        errors.confirmAccountNumber = "Account numbers do not match";
      }

      // IFSC — 4 uppercase letters + literal "0" + 6 uppercase alphanumeric
      const ifsc = form.ifsc.trim();
      if (!ifsc) {
        errors.ifsc = "IFSC code is required";
      } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        errors.ifsc =
          "Enter a valid IFSC code (e.g. SBIN0001234): 4 letters, digit 0, 6 alphanumeric";
      }

      // Cancelled cheque
      const chequeErr = validateFile(
        form.cancelChequeFile,
        "Cancelled cheque / passbook",
      );
      if (chequeErr) errors.cancelChequeFile = chequeErr;
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
      const result = await submitEngineerOnboarding({
        verificationToken,
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        state: form.state,
        city: form.city,
        pincode: form.pincode,
        profilePhoto: form.profilePhoto ?? undefined,
        aadhaarFront: form.aadhaarFront!,
        aadhaarBack: form.aadhaarBack!,
        panFile: form.panFile!,
        dlFront: form.dlFront!,
        dlBack: form.dlBack!,
        accountHolderName: form.accountHolderName,
        accountNumber: form.accountNumber,
        ifsc: form.ifsc,
        cancelChequeFile: form.cancelChequeFile!,
      });
      referenceId = result.referenceId;
      isSubmitted = true;
      toast.success("Application submitted successfully!");
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
      Engineer Onboarding
    </h1>
    <p class="text-gray-600 text-[13px]">
      Complete the form below to register as a field engineer
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
          Application Submitted!
        </h2>
        <p class="text-gray-500 text-[13px] mb-6">
          Thank you, <strong>{form.fullName}</strong>. Your onboarding
          application has been received and is pending review.
        </p>
        <div class="bg-gray-50 rounded-xl p-4 mb-6">
          <p class="text-[11px] text-gray-500 uppercase tracking-wide mb-1">
            Reference ID
          </p>
          <p class="text-base font-bold text-[#0B182A] font-mono">
            {referenceId}
          </p>
          <p class="text-[11px] text-gray-400 mt-1">
            Save this for tracking your application
          </p>
        </div>
        <div class="text-left bg-blue-50 rounded-xl p-4 space-y-3">
          <p
            class="text-[11px] font-semibold text-gray-700 uppercase tracking-wide"
          >
            What happens next?
          </p>
          {#each ["Your documents will be reviewed within 2–3 business days", `Login credentials will be sent to ${form.email}`, "You'll receive a confirmation email once your account is activated"] as step, i}
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
      flow="engineer"
      onVerified={(email, token) => {
        form.email = email;
        verificationToken = token;
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
      <div
        class="bg-white shadow-sm border border-gray-200 rounded-2xl p-4 mb-5"
      >
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
          <!-- ── Step 0: Basic Details ── -->
          {#if currentStep === 0}
            <div class="flex flex-col gap-5">
              <!-- Profile Photo -->
              <div
                class="flex flex-col items-center gap-3 pb-5 border-b border-gray-100"
              >
                <div
                  class="w-20 h-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border-2 border-dashed border-gray-300"
                >
                  {#if form.profilePhotoPreview}
                    <img
                      src={form.profilePhotoPreview}
                      alt="Profile preview"
                      class="w-full h-full object-cover"
                    />
                  {:else}
                    <svg
                      class="w-9 h-9 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  {/if}
                </div>
                <div class="text-center">
                  <label
                    for="profilePhotoInput"
                    class="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    {form.profilePhoto
                      ? "Change Photo"
                      : "Upload Profile Photo"}
                  </label>
                  <input
                    type="file"
                    id="profilePhotoInput"
                    class="hidden"
                    accept="image/jpeg,image/png"
                    onchange={(e) => {
                      const f =
                        (e.target as HTMLInputElement).files?.[0] ?? null;
                      form.profilePhoto = f;
                      if (f) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          form.profilePhotoPreview = ev.target
                            ?.result as string;
                        };
                        reader.readAsDataURL(f);
                      } else {
                        form.profilePhotoPreview = "";
                      }
                    }}
                  />
                  <p class="text-[11px] text-gray-400 mt-1">
                    Optional · JPG, PNG up to 2MB
                  </p>
                  {#if errors.profilePhoto}
                    <p class={errorClass}>{errors.profilePhoto}</p>
                  {/if}
                </div>
              </div>

              <!-- Name & Phone -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}>
                    Full Name <span class="text-red-400">*</span>
                  </span>
                  <input
                    type="text"
                    bind:value={form.fullName}
                    class="{inputClass} {errors.fullName
                      ? 'border-red-300'
                      : ''}"
                    placeholder="Enter your full name"
                    oninput={(e) => {
                      // Strip digits and most special chars live while typing
                      const el = e.target as HTMLInputElement;
                      el.value = el.value.replace(/[^A-Za-z\s.\-']/g, "");
                      form.fullName = el.value;
                    }}
                  />
                  {#if errors.fullName}
                    <span class={errorClass}>{errors.fullName}</span>
                  {/if}
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}>
                    Phone Number <span class="text-red-400">*</span>
                  </span>
                  <div class="relative">
                    <span
                      class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-medium select-none"
                      >+91</span
                    >
                    <input
                      type="tel"
                      bind:value={form.phone}
                      class="{inputClass} {errors.phone
                        ? 'border-red-300'
                        : ''} pl-11"
                      placeholder="9876543210"
                      maxlength="10"
                      oninput={(e) => {
                        const el = e.target as HTMLInputElement;
                        el.value = el.value.replace(/\D/g, "");
                        form.phone = el.value;
                      }}
                    />
                  </div>
                  {#if errors.phone}
                    <span class={errorClass}>{errors.phone}</span>
                  {/if}
                </label>
              </div>

              <!-- Email (pre-verified, read-only display) -->
              <div class="flex flex-col gap-1.5">
                <span class={labelTextClass}>Email ID</span>
                <div
                  class="flex items-center gap-2.5 px-3.5 py-2.5 border border-green-200 bg-green-50 rounded-lg"
                >
                  <svg
                    class="w-4 h-4 text-green-500 shrink-0"
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
                  <span class="text-[13px] font-medium text-green-800"
                    >{form.email}</span
                  >
                  <span
                    class="ml-auto text-[11px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full"
                    >Verified</span
                  >
                </div>
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
                    {#if errors.state}
                      <span class={errorClass}>{errors.state}</span>
                    {/if}
                  </label>
                  <label class="flex flex-col gap-1.5">
                    <span class={labelTextClass}>City</span>
                    <input
                      type="text"
                      bind:value={form.city}
                      class="{inputClass} {errors.city ? 'border-red-300' : ''}"
                      placeholder="Enter city"
                      oninput={(e) => {
                        const el = e.target as HTMLInputElement;
                        el.value = el.value.replace(/[^A-Za-z\s.\-]/g, "");
                        form.city = el.value;
                      }}
                    />
                    {#if errors.city}
                      <span class={errorClass}>{errors.city}</span>
                    {/if}
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
                        oninput={(e) => {
                          const el = e.target as HTMLInputElement;
                          el.value = el.value.replace(/\D/g, "");
                          form.pincode = el.value;
                          handlePincodeInput(el.value);
                        }}
                      />
                      {#if pincodeLoading}
                        <div class="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
                      {/if}
                    </div>
                    {#if errors.pincode}
                      <span class={errorClass}>{errors.pincode}</span>
                    {/if}
                  </label>
                </div>
              </div>
            </div>

            <!-- ── Step 1: KYC Documents ── -->
          {:else if currentStep === 1}
            <div class="flex flex-col gap-5">
              <div class="bg-blue-50 rounded-xl p-3.5 flex gap-3">
                <svg
                  class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p class="text-[12px] text-blue-700">
                  Upload clear, readable copies. Accepted formats: JPG, PNG, PDF
                  — max 5MB each. All documents are securely stored with
                  restricted access.
                </p>
              </div>

              <!-- Aadhaar -->
              <div class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >Aadhaar Card <span class="text-red-400">*</span></span
                >
                <div class="grid grid-cols-2 gap-3">
                  <!-- Aadhaar Front -->
                  <div class="flex flex-col gap-1">
                    <span class="text-[11px] text-gray-500 font-medium"
                      >Front Side</span
                    >
                    <label for="aadhaarFrontInput" class="cursor-pointer">
                      <div
                        class="border-2 border-dashed rounded-xl p-4 text-center transition-all"
                        class:border-green-400={form.aadhaarFront}
                        class:bg-green-50={form.aadhaarFront}
                        style={!form.aadhaarFront && errors.aadhaarFront
                          ? "border-color:#fca5a5;background:#fef2f2"
                          : !form.aadhaarFront
                            ? "border-color:#e5e7eb;background:#f9fafb"
                            : ""}
                      >
                        {#if form.aadhaarFront}
                          <svg
                            class="w-5 h-5 text-green-500 mx-auto mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            class="text-[11px] font-medium text-green-700 truncate px-1"
                          >
                            {form.aadhaarFront.name}
                          </p>
                          <p class="text-[10px] text-green-500 mt-0.5">
                            Click to replace
                          </p>
                        {:else}
                          <svg
                            class="w-6 h-6 text-gray-300 mx-auto mb-1.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="1.5"
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p class="text-[12px] font-medium text-gray-600">
                            Upload Front
                          </p>
                          <p class="text-[10px] text-gray-400 mt-0.5">
                            JPG, PNG, PDF · 5MB
                          </p>
                        {/if}
                      </div>
                    </label>
                    <input
                      type="file"
                      id="aadhaarFrontInput"
                      class="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onchange={(e) => {
                        const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                        form.aadhaarFront = f;
                        if (f) delete errors.aadhaarFront;
                      }}
                    />
                    {#if errors.aadhaarFront}<span class={errorClass}
                        >{errors.aadhaarFront}</span
                      >{/if}
                  </div>
                  <!-- Aadhaar Back -->
                  <div class="flex flex-col gap-1">
                    <span class="text-[11px] text-gray-500 font-medium"
                      >Back Side</span
                    >
                    <label for="aadhaarBackInput" class="cursor-pointer">
                      <div
                        class="border-2 border-dashed rounded-xl p-4 text-center transition-all"
                        class:border-green-400={form.aadhaarBack}
                        class:bg-green-50={form.aadhaarBack}
                        style={!form.aadhaarBack && errors.aadhaarBack
                          ? "border-color:#fca5a5;background:#fef2f2"
                          : !form.aadhaarBack
                            ? "border-color:#e5e7eb;background:#f9fafb"
                            : ""}
                      >
                        {#if form.aadhaarBack}
                          <svg
                            class="w-5 h-5 text-green-500 mx-auto mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            class="text-[11px] font-medium text-green-700 truncate px-1"
                          >
                            {form.aadhaarBack.name}
                          </p>
                          <p class="text-[10px] text-green-500 mt-0.5">
                            Click to replace
                          </p>
                        {:else}
                          <svg
                            class="w-6 h-6 text-gray-300 mx-auto mb-1.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="1.5"
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p class="text-[12px] font-medium text-gray-600">
                            Upload Back
                          </p>
                          <p class="text-[10px] text-gray-400 mt-0.5">
                            JPG, PNG, PDF · 5MB
                          </p>
                        {/if}
                      </div>
                    </label>
                    <input
                      type="file"
                      id="aadhaarBackInput"
                      class="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onchange={(e) => {
                        const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                        form.aadhaarBack = f;
                        if (f) delete errors.aadhaarBack;
                      }}
                    />
                    {#if errors.aadhaarBack}<span class={errorClass}
                        >{errors.aadhaarBack}</span
                      >{/if}
                  </div>
                </div>
              </div>

              <!-- PAN Card -->
              <div class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >PAN Card <span class="text-red-400">*</span></span
                >
                <label for="panInput" class="cursor-pointer">
                  <div
                    class="border-2 border-dashed rounded-xl p-5 text-center transition-all"
                    class:border-green-400={form.panFile}
                    class:bg-green-50={form.panFile}
                    style={!form.panFile && errors.panFile
                      ? "border-color:#fca5a5;background:#fef2f2"
                      : !form.panFile
                        ? "border-color:#e5e7eb;background:#f9fafb"
                        : ""}
                  >
                    {#if form.panFile}
                      <div class="flex items-center justify-center gap-2">
                        <svg
                          class="w-5 h-5 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p class="text-[13px] font-medium text-green-700">
                          {form.panFile.name}
                        </p>
                      </div>
                      <p class="text-[11px] text-green-500 mt-1">
                        Click to replace
                      </p>
                    {:else}
                      <svg
                        class="w-7 h-7 text-gray-300 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p class="text-[13px] font-medium text-gray-600">
                        Click to upload PAN Card
                      </p>
                      <p class="text-[11px] text-gray-400 mt-1">
                        JPG, PNG, PDF · Max 5MB
                      </p>
                    {/if}
                  </div>
                </label>
                <input
                  type="file"
                  id="panInput"
                  class="hidden"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onchange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                    form.panFile = f;
                    if (f) delete errors.panFile;
                  }}
                />
                {#if errors.panFile}
                  <span class={errorClass}>{errors.panFile}</span>
                {/if}
              </div>

              <!-- Driving License -->
              <div class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >Driving License <span class="text-red-400">*</span></span
                >
                <div class="grid grid-cols-2 gap-3">
                  <!-- DL Front -->
                  <div class="flex flex-col gap-1">
                    <span class="text-[11px] text-gray-500 font-medium"
                      >Front Side</span
                    >
                    <label for="dlFrontInput" class="cursor-pointer">
                      <div
                        class="border-2 border-dashed rounded-xl p-4 text-center transition-all"
                        class:border-green-400={form.dlFront}
                        class:bg-green-50={form.dlFront}
                        style={!form.dlFront && errors.dlFront
                          ? "border-color:#fca5a5;background:#fef2f2"
                          : !form.dlFront
                            ? "border-color:#e5e7eb;background:#f9fafb"
                            : ""}
                      >
                        {#if form.dlFront}
                          <svg
                            class="w-5 h-5 text-green-500 mx-auto mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            class="text-[11px] font-medium text-green-700 truncate px-1"
                          >
                            {form.dlFront.name}
                          </p>
                          <p class="text-[10px] text-green-500 mt-0.5">
                            Click to replace
                          </p>
                        {:else}
                          <svg
                            class="w-6 h-6 text-gray-300 mx-auto mb-1.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="1.5"
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p class="text-[12px] font-medium text-gray-600">
                            Upload Front
                          </p>
                          <p class="text-[10px] text-gray-400 mt-0.5">
                            JPG, PNG, PDF · 5MB
                          </p>
                        {/if}
                      </div>
                    </label>
                    <input
                      type="file"
                      id="dlFrontInput"
                      class="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onchange={(e) => {
                        const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                        form.dlFront = f;
                        if (f) delete errors.dlFront;
                      }}
                    />
                    {#if errors.dlFront}<span class={errorClass}
                        >{errors.dlFront}</span
                      >{/if}
                  </div>
                  <!-- DL Back -->
                  <div class="flex flex-col gap-1">
                    <span class="text-[11px] text-gray-500 font-medium"
                      >Back Side</span
                    >
                    <label for="dlBackInput" class="cursor-pointer">
                      <div
                        class="border-2 border-dashed rounded-xl p-4 text-center transition-all"
                        class:border-green-400={form.dlBack}
                        class:bg-green-50={form.dlBack}
                        style={!form.dlBack && errors.dlBack
                          ? "border-color:#fca5a5;background:#fef2f2"
                          : !form.dlBack
                            ? "border-color:#e5e7eb;background:#f9fafb"
                            : ""}
                      >
                        {#if form.dlBack}
                          <svg
                            class="w-5 h-5 text-green-500 mx-auto mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p
                            class="text-[11px] font-medium text-green-700 truncate px-1"
                          >
                            {form.dlBack.name}
                          </p>
                          <p class="text-[10px] text-green-500 mt-0.5">
                            Click to replace
                          </p>
                        {:else}
                          <svg
                            class="w-6 h-6 text-gray-300 mx-auto mb-1.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="1.5"
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          <p class="text-[12px] font-medium text-gray-600">
                            Upload Back
                          </p>
                          <p class="text-[10px] text-gray-400 mt-0.5">
                            JPG, PNG, PDF · 5MB
                          </p>
                        {/if}
                      </div>
                    </label>
                    <input
                      type="file"
                      id="dlBackInput"
                      class="hidden"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onchange={(e) => {
                        const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                        form.dlBack = f;
                        if (f) delete errors.dlBack;
                      }}
                    />
                    {#if errors.dlBack}<span class={errorClass}
                        >{errors.dlBack}</span
                      >{/if}
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Step 2: Bank Details ── -->
          {:else if currentStep === 2}
            <div class="flex flex-col gap-5">
              <div class="bg-amber-50 rounded-xl p-3.5 flex gap-3">
                <svg
                  class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <p class="text-[12px] text-amber-700">
                  Bank details are encrypted and stored securely. Used for
                  payment processing only.
                </p>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >Account Holder Name <span class="text-red-400">*</span></span
                >
                <input
                  type="text"
                  bind:value={form.accountHolderName}
                  class="{inputClass} {errors.accountHolderName
                    ? 'border-red-300'
                    : ''}"
                  placeholder="Name as on bank account"
                  oninput={(e) => {
                    const el = e.target as HTMLInputElement;
                    el.value = el.value.replace(/[^A-Za-z\s.\-']/g, "");
                    form.accountHolderName = el.value;
                  }}
                />
                {#if errors.accountHolderName}
                  <span class={errorClass}>{errors.accountHolderName}</span>
                {/if}
              </label>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}
                    >Bank Account Number <span class="text-red-400">*</span
                    ></span
                  >
                  <input
                    type="text"
                    bind:value={form.accountNumber}
                    class="{inputClass} {errors.accountNumber
                      ? 'border-red-300'
                      : ''}"
                    placeholder="Enter account number"
                    maxlength="18"
                    oninput={(e) => {
                      const el = e.target as HTMLInputElement;
                      el.value = el.value.replace(/\D/g, "");
                      form.accountNumber = el.value;
                    }}
                    onpaste={(e) => e.preventDefault()}
                    ondrop={(e) => e.preventDefault()}
                    autocomplete="off"
                  />
                  {#if errors.accountNumber}
                    <span class={errorClass}>{errors.accountNumber}</span>
                  {/if}
                </label>
                <label class="flex flex-col gap-1.5">
                  <span class={labelTextClass}
                    >Confirm Account Number<span class="text-red-400">*</span
                    ></span
                  >
                  <input
                    type="text"
                    bind:value={form.confirmAccountNumber}
                    class="{inputClass} {errors.confirmAccountNumber
                      ? 'border-red-300'
                      : ''}"
                    placeholder="Re-enter account number"
                    maxlength="18"
                    oninput={(e) => {
                      const el = e.target as HTMLInputElement;
                      el.value = el.value.replace(/\D/g, "");
                      form.confirmAccountNumber = el.value;
                    }}
                    onpaste={(e) => e.preventDefault()}
                    ondrop={(e) => e.preventDefault()}
                    autocomplete="off"
                  />
                  {#if errors.confirmAccountNumber}
                    <span class={errorClass}>{errors.confirmAccountNumber}</span
                    >
                  {/if}
                </label>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >IFSC Code <span class="text-red-400">*</span></span
                >
                <input
                  type="text"
                  bind:value={form.ifsc}
                  class="{inputClass} {errors.ifsc
                    ? 'border-red-300'
                    : ''} uppercase"
                  placeholder="e.g., SBIN0001234"
                  maxlength="11"
                  oninput={(e) => {
                    const el = e.target as HTMLInputElement;
                    // Allow only letters and digits, force uppercase
                    el.value = el.value
                      .replace(/[^A-Za-z0-9]/g, "")
                      .toUpperCase();
                    form.ifsc = el.value;
                  }}
                />
                {#if errors.ifsc}
                  <span class={errorClass}>{errors.ifsc}</span>
                {/if}
              </label>

              <!-- Cancelled Cheque -->
              <div class="flex flex-col gap-1.5">
                <span class={labelTextClass}
                  >Cancelled Cheque / Passbook Scan <span class="text-red-400"
                    >*</span
                  ></span
                >
                <label for="cancelChequeInput" class="cursor-pointer">
                  <div
                    class="border-2 border-dashed rounded-xl p-5 text-center transition-all"
                    class:border-green-400={form.cancelChequeFile}
                    class:bg-green-50={form.cancelChequeFile}
                    style={!form.cancelChequeFile && errors.cancelChequeFile
                      ? "border-color:#fca5a5;background:#fef2f2"
                      : !form.cancelChequeFile
                        ? "border-color:#e5e7eb;background:#f9fafb"
                        : ""}
                  >
                    {#if form.cancelChequeFile}
                      <div class="flex items-center justify-center gap-2">
                        <svg
                          class="w-5 h-5 text-green-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p class="text-[13px] font-medium text-green-700">
                          {form.cancelChequeFile.name}
                        </p>
                      </div>
                      <p class="text-[11px] text-green-500 mt-1">
                        Click to replace
                      </p>
                    {:else}
                      <svg
                        class="w-7 h-7 text-gray-300 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p class="text-[13px] font-medium text-gray-600">
                        Upload Cancelled Cheque or Passbook
                      </p>
                      <p class="text-[11px] text-gray-400 mt-1">
                        JPG, PNG, PDF · Max 5MB
                      </p>
                    {/if}
                  </div>
                </label>
                <input
                  type="file"
                  id="cancelChequeInput"
                  class="hidden"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onchange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                    form.cancelChequeFile = f;
                    if (f) delete errors.cancelChequeFile;
                  }}
                />
                {#if errors.cancelChequeFile}
                  <span class={errorClass}>{errors.cancelChequeFile}</span>
                {/if}
              </div>
            </div>

            <!-- ── Step 3: Review & Submit ── -->
          {:else if currentStep === 3}
            <div class="flex flex-col gap-5">
              <p class="text-[13px] text-gray-500">
                Review your information before submitting. Use the Edit links to
                make changes.
              </p>

              <!-- Basic Details Review -->
              <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div
                  class="bg-gray-50 px-4 py-2.5 flex items-center justify-between"
                >
                  <span class="text-[12px] font-semibold text-gray-700"
                    >Basic Details</span
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
                      Full Name
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.fullName || "—"}
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
                      <p class="text-[13px] text-gray-900">
                        {form.email || "—"}
                      </p>
                      {#if form.email}
                        <span
                          class="text-[10px] font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full"
                          >Verified</span
                        >
                      {/if}
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

              <!-- KYC Review -->
              <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div
                  class="bg-gray-50 px-4 py-2.5 flex items-center justify-between"
                >
                  <span class="text-[12px] font-semibold text-gray-700"
                    >KYC Documents</span
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
                <div class="p-4 space-y-2">
                  {#each [{ label: "Aadhaar Card (Front)", file: form.aadhaarFront }, { label: "Aadhaar Card (Back)", file: form.aadhaarBack }, { label: "PAN Card", file: form.panFile }, { label: "Driving License (Front)", file: form.dlFront }, { label: "Driving License (Back)", file: form.dlBack }] as doc}
                    <div class="flex items-center gap-2.5">
                      <svg
                        class="w-4 h-4 flex-shrink-0 {doc.file
                          ? 'text-green-500'
                          : 'text-red-400'}"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d={doc.file
                            ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            : "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"}
                        />
                      </svg>
                      <span class="text-[13px] text-gray-700">
                        {doc.label}:
                        <span
                          class="font-medium {doc.file
                            ? 'text-green-600'
                            : 'text-red-500'}"
                        >
                          {doc.file?.name ?? "Not uploaded"}
                        </span>
                      </span>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Bank Review -->
              <div class="border border-gray-100 rounded-xl overflow-hidden">
                <div
                  class="bg-gray-50 px-4 py-2.5 flex items-center justify-between"
                >
                  <span class="text-[12px] font-semibold text-gray-700"
                    >Bank Details</span
                  >
                  <button
                    onclick={() => {
                      currentStep = 2;
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    class="text-[12px] font-medium hover:underline"
                    style="color:#E87D1F">Edit</button
                  >
                </div>
                <div class="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  <div class="col-span-2">
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Account Holder
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5">
                      {form.accountHolderName || "—"}
                    </p>
                  </div>
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Account Number
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5 font-mono">
                      {form.accountNumber
                        ? "••••••" + form.accountNumber.slice(-4)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      IFSC Code
                    </p>
                    <p class="text-[13px] text-gray-900 mt-0.5 font-mono">
                      {form.ifsc || "—"}
                    </p>
                  </div>
                  <div class="col-span-2">
                    <p
                      class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                    >
                      Cancel Cheque
                    </p>
                    <p
                      class="text-[13px] mt-0.5 {form.cancelChequeFile
                        ? 'text-green-600'
                        : 'text-red-500'}"
                    >
                      {form.cancelChequeFile?.name ?? "Not uploaded"}
                    </p>
                  </div>
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
                    I hereby declare that all information provided is true and
                    accurate to the best of my knowledge. I understand that
                    submitting false information may result in rejection or
                    termination of my application.
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
                  Submit Application
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

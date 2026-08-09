<script lang="ts">
  import { toast } from "svelte-sonner";
  import { gqlRequest } from "$lib/api/graphql";
  import { uploadFile } from "$lib/api/upload";
  import { invalidate } from "$lib/stores/query";

  interface Props {
    engineerId: string;
    engineerName: string;
    referenceId: string;
    onClose: () => void;
    onDone?: () => void;
  }

  let { engineerId, engineerName, referenceId, onClose, onDone }: Props = $props();

  const UPDATE_ENGINEER_DOCUMENTS = `
    mutation UpdateEngineerDocuments($input: UpdateEngineerDocumentsInput!) {
      updateEngineerDocuments(input: $input) {
        id
        documentsStatus
      }
    }
  `;

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
  const MAX_DOC_MB = 5;
  const MAX_PHOTO_MB = 2;

  let form = $state({
    profilePhoto: null as File | null,
    aadhaarFront: null as File | null,
    aadhaarBack: null as File | null,
    panFile: null as File | null,
    dlFront: null as File | null,
    dlBack: null as File | null,
    cancelChequeFile: null as File | null,
  });

  let errors = $state<Record<string, string>>({});
  let isSubmitting = $state(false);
  let uploadProgress = $state<string | null>(null);

  function validateFileField(file: File | null, key: string, label: string, required = true, maxMB = MAX_DOC_MB) {
    if (!file) {
      if (required) errors[key] = `${label} is required`;
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors[key] = `${label}: only JPG, PNG, PDF allowed`;
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      errors[key] = `${label}: max ${maxMB}MB`;
    }
  }

  function validate(): boolean {
    errors = {};
    validateFileField(form.aadhaarFront, "aadhaarFront", "Aadhaar Card (Front)");
    validateFileField(form.aadhaarBack, "aadhaarBack", "Aadhaar Card (Back)");
    validateFileField(form.panFile, "panFile", "PAN Card");
    validateFileField(form.dlFront, "dlFront", "Driving License (Front)");
    validateFileField(form.dlBack, "dlBack", "Driving License (Back)");
    validateFileField(form.cancelChequeFile, "cancelChequeFile", "Cancelled Cheque");
    if (form.profilePhoto) {
      validateFileField(form.profilePhoto, "profilePhoto", "Profile Photo", false, MAX_PHOTO_MB);
    }
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    isSubmitting = true;
    uploadProgress = "Uploading documents…";
    try {
      const [aadhaarFrontId, aadhaarBackId, panFileId, dlFrontId, dlBackId, cancelChequeId, profilePhotoId] =
        await Promise.all([
          uploadFile(form.aadhaarFront!),
          uploadFile(form.aadhaarBack!),
          uploadFile(form.panFile!),
          uploadFile(form.dlFront!),
          uploadFile(form.dlBack!),
          uploadFile(form.cancelChequeFile!),
          form.profilePhoto ? uploadFile(form.profilePhoto) : Promise.resolve(undefined),
        ]);

      uploadProgress = "Saving…";

      const input: Record<string, unknown> = {
        id: engineerId,
        aadhaarFrontUrl: `/file/${aadhaarFrontId}`,
        aadhaarBackUrl: `/file/${aadhaarBackId}`,
        panCardUrl: `/file/${panFileId}`,
        dlFrontUrl: `/file/${dlFrontId}`,
        dlBackUrl: `/file/${dlBackId}`,
        cancelChequeUrl: `/file/${cancelChequeId}`,
      };
      if (profilePhotoId !== undefined) {
        input.profilePhotoUrl = `/file/${profilePhotoId}`;
      }

      await gqlRequest(UPDATE_ENGINEER_DOCUMENTS, { input });
      invalidate("engineers");
      toast.success(`Documents uploaded for ${engineerName}`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      isSubmitting = false;
      uploadProgress = null;
    }
  }

  const lbl = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const errCls = "text-[11px] text-red-500 mt-0.5";

  interface DocSlot { key: keyof typeof form; label: string; side?: string }
  const aadhaarSlots: DocSlot[] = [
    { key: "aadhaarFront", label: "Aadhaar Card", side: "Front Side" },
    { key: "aadhaarBack",  label: "Aadhaar Card", side: "Back Side" },
  ];
  const dlSlots: DocSlot[] = [
    { key: "dlFront", label: "Driving License", side: "Front Side" },
    { key: "dlBack",  label: "Driving License", side: "Back Side" },
  ];
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <button
    type="button"
    class="absolute inset-0 bg-black/50 cursor-default"
    aria-label="Close modal"
    onclick={onClose}
  ></button>
  <div
    class="relative z-10 bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-label="Upload Documents"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">Upload KYC Documents</h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {engineerName} · <span class="text-[#E87D1F] font-medium">{referenceId}</span>
        </p>
      </div>
      <button
        onclick={onClose}
        class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
        aria-label="Close"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div class="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

      <!-- Profile Photo (optional) -->
      <div class="flex flex-col gap-1.5">
        <span class={lbl}>Profile Photo <span class="text-gray-400 font-normal normal-case">(optional)</span></span>
        <label
          class="flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                 {errors.profilePhoto ? 'border-red-300 bg-red-50' : form.profilePhoto ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
        >
          <svg class="w-5 h-5 {form.profilePhoto ? 'text-green-500' : 'text-gray-400'} shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if form.profilePhoto}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            {/if}
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium {form.profilePhoto ? 'text-green-700' : 'text-gray-700'} truncate">
              {form.profilePhoto ? form.profilePhoto.name : "Upload profile photo"}
            </p>
            <p class="text-[11px] text-gray-400 mt-0.5">JPG, PNG up to 2 MB</p>
          </div>
          <input
            type="file"
            class="hidden"
            accept="image/jpeg,image/png"
            onchange={(e) => {
              form.profilePhoto = (e.target as HTMLInputElement).files?.[0] ?? null;
              delete errors.profilePhoto;
            }}
          />
        </label>
        {#if errors.profilePhoto}<span class={errCls}>{errors.profilePhoto}</span>{/if}
      </div>

      <!-- Aadhaar Card -->
      <div class="flex flex-col gap-1.5">
        <span class={lbl}>Aadhaar Card <span class="text-red-400">*</span></span>
        <div class="grid grid-cols-2 gap-3">
          {#each aadhaarSlots as slot}
            {@const file = form[slot.key] as File | null}
            {@const hasErr = !!errors[slot.key]}
            <div class="flex flex-col gap-1">
              <span class="text-[11px] text-gray-500 font-medium">{slot.side}</span>
              <label
                class="flex flex-col items-center gap-2 px-3 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                       {hasErr ? 'border-red-300 bg-red-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
              >
                {#if file}
                  <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-[11px] font-medium text-green-700 truncate w-full text-center px-1">{file.name}</p>
                  <p class="text-[10px] text-green-500">Click to replace</p>
                {:else}
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p class="text-[11px] font-medium text-gray-600">Upload {slot.side}</p>
                  <p class="text-[10px] text-gray-400">JPG, PNG, PDF · 5MB</p>
                {/if}
                <input
                  type="file"
                  class="hidden"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onchange={(e) => {
                    (form as Record<string, unknown>)[slot.key] = (e.target as HTMLInputElement).files?.[0] ?? null;
                    delete errors[slot.key];
                  }}
                />
              </label>
              {#if errors[slot.key]}<span class={errCls}>{errors[slot.key]}</span>{/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- PAN Card -->
      <div class="flex flex-col gap-1.5">
        <span class={lbl}>PAN Card <span class="text-red-400">*</span></span>
        <label
          class="flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                 {errors.panFile ? 'border-red-300 bg-red-50' : form.panFile ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
        >
          <svg class="w-5 h-5 {form.panFile ? 'text-green-500' : 'text-gray-400'} shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if form.panFile}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            {/if}
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium {form.panFile ? 'text-green-700' : 'text-gray-700'} truncate">
              {form.panFile ? form.panFile.name : "No file chosen"}
            </p>
            <p class="text-[11px] text-gray-400 mt-0.5">JPG, PNG, PDF up to 5 MB</p>
          </div>
          <input
            type="file"
            class="hidden"
            accept=".jpg,.jpeg,.png,.pdf"
            onchange={(e) => { form.panFile = (e.target as HTMLInputElement).files?.[0] ?? null; delete errors.panFile; }}
          />
        </label>
        {#if errors.panFile}<span class={errCls}>{errors.panFile}</span>{/if}
      </div>

      <!-- Driving License -->
      <div class="flex flex-col gap-1.5">
        <span class={lbl}>Driving License <span class="text-red-400">*</span></span>
        <div class="grid grid-cols-2 gap-3">
          {#each dlSlots as slot}
            {@const file = form[slot.key] as File | null}
            {@const hasErr = !!errors[slot.key]}
            <div class="flex flex-col gap-1">
              <span class="text-[11px] text-gray-500 font-medium">{slot.side}</span>
              <label
                class="flex flex-col items-center gap-2 px-3 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                       {hasErr ? 'border-red-300 bg-red-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
              >
                {#if file}
                  <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-[11px] font-medium text-green-700 truncate w-full text-center px-1">{file.name}</p>
                  <p class="text-[10px] text-green-500">Click to replace</p>
                {:else}
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p class="text-[11px] font-medium text-gray-600">Upload {slot.side}</p>
                  <p class="text-[10px] text-gray-400">JPG, PNG, PDF · 5MB</p>
                {/if}
                <input
                  type="file"
                  class="hidden"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onchange={(e) => {
                    (form as Record<string, unknown>)[slot.key] = (e.target as HTMLInputElement).files?.[0] ?? null;
                    delete errors[slot.key];
                  }}
                />
              </label>
              {#if errors[slot.key]}<span class={errCls}>{errors[slot.key]}</span>{/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Cancelled Cheque -->
      <div class="flex flex-col gap-1.5">
        <span class={lbl}>Cancelled Cheque / Passbook <span class="text-red-400">*</span></span>
        <label
          class="flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                 {errors.cancelChequeFile ? 'border-red-300 bg-red-50' : form.cancelChequeFile ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
        >
          <svg class="w-5 h-5 {form.cancelChequeFile ? 'text-green-500' : 'text-gray-400'} shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if form.cancelChequeFile}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            {/if}
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-[12px] font-medium {form.cancelChequeFile ? 'text-green-700' : 'text-gray-700'} truncate">
              {form.cancelChequeFile ? form.cancelChequeFile.name : "No file chosen"}
            </p>
            <p class="text-[11px] text-gray-400 mt-0.5">JPG, PNG, PDF up to 5 MB</p>
          </div>
          <input
            type="file"
            class="hidden"
            accept=".jpg,.jpeg,.png,.pdf"
            onchange={(e) => { form.cancelChequeFile = (e.target as HTMLInputElement).files?.[0] ?? null; delete errors.cancelChequeFile; }}
          />
        </label>
        {#if errors.cancelChequeFile}<span class={errCls}>{errors.cancelChequeFile}</span>{/if}
      </div>

    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
      <button
        onclick={onClose}
        disabled={isSubmitting}
        class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer disabled:opacity-40"
      >
        Cancel
      </button>
      <button
        onclick={handleSubmit}
        disabled={isSubmitting}
        class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 flex items-center gap-2"
      >
        {#if isSubmitting}
          <div class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          {uploadProgress ?? "Uploading…"}
        {:else}
          Upload Documents
        {/if}
      </button>
    </div>
  </div>
</div>

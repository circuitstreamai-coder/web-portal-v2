<script lang="ts">
  import * as XLSX from "xlsx";
  import { toast } from "svelte-sonner";
  import { gqlRequest } from "$lib/api/graphql";
  import { invalidate } from "$lib/stores/query";
  import AdminUploadDocumentsModal from "./AdminUploadDocumentsModal.svelte";

  let { onClose }: { onClose: () => void } = $props();

  const INDIAN_STATES = [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
    "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
    "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
    "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
    "Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi (NCT)",
    "Chandigarh","Puducherry","Ladakh","Jammu & Kashmir","Lakshadweep",
    "Dadra & Nagar Haveli and Daman & Diu","Andaman & Nicobar Islands",
  ];

  type Phase = "upload" | "preview" | "processing" | "results";

  interface ParsedRow {
    rowNum: number;
    fullName: string;
    email: string;
    phone: string;
    state: string;
    city: string;
    pincode: string;
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
    errors: string[];
  }

  interface BulkSuccess {
    id: string;
    referenceId: string;
    email: string;
  }

  interface BulkResult {
    success: BulkSuccess[];
    failed: Array<{ row: number; email: string | null; reason: string }>;
  }

  const BULK_CREATE_ENGINEERS = `
    mutation BulkCreateEngineers($engineers: [BulkEngineerInput!]!) {
      bulkCreateEngineers(engineers: $engineers) {
        success { id referenceId email }
        failed { row email reason }
      }
    }
  `;

  let phase = $state<Phase>("upload");
  let parsedRows = $state<ParsedRow[]>([]);
  let result = $state<BulkResult | null>(null);
  let isDragging = $state(false);

  // For uploading docs after bulk create
  let uploadDocsFor = $state<BulkSuccess | null>(null);
  // Track which engineers have had docs uploaded this session
  let docsUploaded = $state(new Set<string>());

  const validRows = $derived(parsedRows.filter((r) => r.errors.length === 0));
  const invalidRows = $derived(parsedRows.filter((r) => r.errors.length > 0));

  function validateRow(raw: Record<string, string>, rowNum: number): ParsedRow {
    const get = (key: string) => (raw[key] ?? "").toString().trim();

    const fullName = get("Full Name");
    const email = get("Email");
    const phone = get("Phone");
    const state = get("State");
    const city = get("City");
    const pincode = get("Pincode");
    const accountHolderName = get("Account Holder Name");
    const accountNumber = get("Account Number");
    const ifsc = get("IFSC Code").toUpperCase();

    const errors: string[] = [];

    if (!fullName) errors.push("Full Name is required");
    else if (!/^[A-Za-z\s.\-']+$/.test(fullName)) errors.push("Full Name: letters/spaces/dots/hyphens only");
    else if (fullName.length < 2 || fullName.length > 60) errors.push("Full Name: 2–60 characters");

    if (!email) errors.push("Email is required");
    else if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) errors.push("Email: invalid format");

    if (!phone) errors.push("Phone is required");
    else if (!/^[6-9]\d{9}$/.test(phone)) errors.push("Phone: valid 10-digit Indian mobile");

    if (!state) errors.push("State is required");
    else if (!INDIAN_STATES.includes(state)) errors.push(`State: "${state}" is not a valid Indian state`);

    if (!city) errors.push("City is required");
    else if (!/^[A-Za-z\s.\-]+$/.test(city)) errors.push("City: letters/spaces/dots/hyphens only");
    else if (city.length < 2 || city.length > 50) errors.push("City: 2–50 characters");

    if (!pincode) errors.push("Pincode is required");
    else if (!/^[1-9]\d{5}$/.test(pincode)) errors.push("Pincode: valid 6-digit pincode");

    if (accountHolderName) {
      if (!/^[A-Za-z\s.\-']+$/.test(accountHolderName)) errors.push("Account Holder Name: letters only");
      else if (accountHolderName.length < 2 || accountHolderName.length > 80) errors.push("Account Holder Name: 2–80 characters");
    }

    if (accountNumber && !/^\d{9,18}$/.test(accountNumber)) {
      errors.push("Account Number: 9–18 digits");
    }

    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      errors.push("IFSC Code: invalid format (e.g. SBIN0001234)");
    }

    return { rowNum, fullName, email, phone, state, city, pincode, accountHolderName, accountNumber, ifsc, errors };
  }

  function parseFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Please upload a .xlsx or .xls file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

        if (rows.length === 0) {
          toast.error("The file is empty or has no data rows");
          return;
        }

        if (rows.length > 500) {
          toast.error("Maximum 500 engineers per upload");
          return;
        }

        // First pass: field-level validation
        const validated = rows.map((row, i) => validateRow(row, i + 2));

        // Second pass: detect duplicates within the file
        const seenEmails = new Map<string, number>(); // email → first rowNum
        const seenPhones = new Map<string, number>(); // phone → first rowNum

        parsedRows = validated.map((row) => {
          if (row.errors.length > 0) return row;

          const emailKey = row.email.toLowerCase();
          const phoneKey = row.phone;
          const dupeErrors: string[] = [];

          if (seenEmails.has(emailKey)) {
            dupeErrors.push(`Duplicate email — same as row ${seenEmails.get(emailKey)}`);
          } else {
            seenEmails.set(emailKey, row.rowNum);
          }

          if (seenPhones.has(phoneKey)) {
            dupeErrors.push(`Duplicate phone — same as row ${seenPhones.get(phoneKey)}`);
          } else {
            seenPhones.set(phoneKey, row.rowNum);
          }

          return dupeErrors.length > 0 ? { ...row, errors: dupeErrors } : row;
        });

        phase = "preview";
      } catch {
        toast.error("Failed to parse file. Please use the provided template.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) parseFile(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) parseFile(file);
  }

  function downloadTemplate() {
    const headers = [
      "Full Name",
      "Email",
      "Phone",
      "State",
      "City",
      "Pincode",
      "Account Holder Name",
      "Account Number",
      "IFSC Code",
    ];
    const example = [
      "Rajesh Kumar",
      "rajesh@example.com",
      "9876543210",
      "Maharashtra",
      "Mumbai",
      "400001",
      "Rajesh Kumar",
      "123456789012",
      "SBIN0001234",
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, ws, "Engineers");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "engineers_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (validRows.length === 0) return;
    phase = "processing";

    try {
      const input = validRows.map((r) => ({
        fullName: r.fullName,
        email: r.email,
        phone: r.phone,
        state: r.state,
        city: r.city,
        pincode: r.pincode,
        accountHolderName: r.accountHolderName || undefined,
        accountNumber: r.accountNumber || undefined,
        ifsc: r.ifsc || undefined,
      }));

      const data = await gqlRequest<{ bulkCreateEngineers: BulkResult }>(
        BULK_CREATE_ENGINEERS,
        { engineers: input },
      );

      result = data.bulkCreateEngineers;
      phase = "results";

      if (result.success.length > 0) {
        invalidate("engineers");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      phase = "preview";
    }
  }

  function handleDocsDone(engId: string) {
    docsUploaded = new Set([...docsUploaded, engId]);
  }
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
    aria-label="Bulk Upload Engineers"
    tabindex="-1"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
      <div>
        <h2 class="text-[16px] font-semibold text-[#0B182A]">Bulk Upload Engineers</h2>
        <p class="text-[12px] text-gray-400 mt-0.5">
          {#if phase === "upload"}
            Download the template, fill in engineer details, and upload
          {:else if phase === "preview"}
            Review parsed data before uploading
          {:else if phase === "processing"}
            Creating engineer accounts…
          {:else}
            Upload complete
          {/if}
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
    <div class="overflow-y-auto flex-1 px-6 py-5">

      <!-- Phase: Upload -->
      {#if phase === "upload"}
        <div class="flex flex-col gap-5">
          <!-- Template download -->
          <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
            <svg class="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="flex-1">
              <p class="text-[13px] font-semibold text-blue-800">Step 1: Download the template</p>
              <p class="text-[12px] text-blue-600 mt-0.5">
                Fill in engineer details in the Excel file. Required columns: Full Name, Email, Phone, State, City, Pincode.
                Bank details are optional. Each email and phone must be unique.
              </p>
              <button
                onclick={downloadTemplate}
                class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[12px] font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Template (.xlsx)
              </button>
            </div>
          </div>

          <!-- File drop zone -->
          <div>
            <p class="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 2: Upload filled file</p>
            <label
              class="flex flex-col items-center gap-3 px-6 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                     {isDragging ? 'border-[#0B182A] bg-gray-50' : 'border-gray-200 hover:border-[#0B182A] bg-gray-50'}"
              ondragover={(e) => { e.preventDefault(); isDragging = true; }}
              ondragleave={() => (isDragging = false)}
              ondrop={handleDrop}
            >
              <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div class="text-center">
                <p class="text-[13px] font-semibold text-gray-600">Drag & drop your Excel file here</p>
                <p class="text-[12px] text-gray-400 mt-0.5">or click to browse · .xlsx or .xls · max 500 rows</p>
              </div>
              <input type="file" class="hidden" accept=".xlsx,.xls" onchange={handleFileInput} />
            </label>
          </div>
        </div>

      <!-- Phase: Preview -->
      {:else if phase === "preview"}
        <div class="flex flex-col gap-4">
          <!-- Summary chips -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[12px] font-semibold text-gray-700">{parsedRows.length} rows parsed</span>
            {#if validRows.length > 0}
              <span class="px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-full">
                {validRows.length} ready
              </span>
            {/if}
            {#if invalidRows.length > 0}
              <span class="px-2 py-0.5 bg-red-50 text-red-600 text-[11px] font-semibold rounded-full">
                {invalidRows.length} errors
              </span>
            {/if}
          </div>

          <!-- Table -->
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <div class="overflow-x-auto max-h-96">
              <table class="w-full text-[12px]">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500 w-8">#</th>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500">Full Name</th>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500">Email</th>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500">Phone</th>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500">State</th>
                    <th class="px-3 py-2.5 text-left font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {#each parsedRows as row}
                    <tr class="{row.errors.length > 0 ? 'bg-red-50' : 'bg-white'} hover:bg-gray-50 transition-colors">
                      <td class="px-3 py-2.5 text-gray-400">{row.rowNum}</td>
                      <td class="px-3 py-2.5 text-gray-700 max-w-32 truncate">{row.fullName || "—"}</td>
                      <td class="px-3 py-2.5 text-gray-600 max-w-40 truncate">{row.email || "—"}</td>
                      <td class="px-3 py-2.5 text-gray-600">{row.phone || "—"}</td>
                      <td class="px-3 py-2.5 text-gray-600 max-w-28 truncate">{row.state || "—"}</td>
                      <td class="px-3 py-2.5">
                        {#if row.errors.length === 0}
                          <span class="flex items-center gap-1 text-green-600 font-semibold">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                            Ready
                          </span>
                        {:else}
                          <span
                            class="text-red-500 font-semibold cursor-help"
                            title={row.errors.join("\n")}
                          >
                            {row.errors.length} error{row.errors.length > 1 ? "s" : ""}
                          </span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          {#if invalidRows.length > 0}
            <div class="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <p class="text-[12px] font-semibold text-amber-700">
                {invalidRows.length} row{invalidRows.length > 1 ? "s" : ""} with errors will be skipped.
                Hover the error count to see details.
              </p>
            </div>
          {/if}
        </div>

      <!-- Phase: Processing -->
      {:else if phase === "processing"}
        <div class="flex flex-col items-center justify-center py-12 gap-4">
          <div class="w-10 h-10 border-4 border-gray-200 border-t-[#0B182A] rounded-full animate-spin"></div>
          <p class="text-[13px] text-gray-500">Creating {validRows.length} engineer account{validRows.length > 1 ? "s" : ""}…</p>
        </div>

      <!-- Phase: Results -->
      {:else if phase === "results" && result}
        <div class="flex flex-col gap-4">
          <!-- Summary cards -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center gap-3">
              <svg class="w-6 h-6 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="text-[20px] font-bold text-green-700">{result.success.length}</p>
                <p class="text-[12px] text-green-600">Created successfully</p>
              </div>
            </div>
            <div class="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
              <svg class="w-6 h-6 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="text-[20px] font-bold text-red-500">{result.failed.length}</p>
                <p class="text-[12px] text-red-400">Failed</p>
              </div>
            </div>
          </div>

          <!-- Failed rows -->
          {#if result.failed.length > 0}
            <div>
              <p class="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Failed rows</p>
              <div class="border border-red-100 rounded-xl overflow-hidden">
                <table class="w-full text-[12px]">
                  <thead class="bg-red-50">
                    <tr>
                      <th class="px-3 py-2 text-left font-semibold text-red-600 w-12">Row</th>
                      <th class="px-3 py-2 text-left font-semibold text-red-600">Email</th>
                      <th class="px-3 py-2 text-left font-semibold text-red-600">Reason</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-red-50">
                    {#each result.failed as f}
                      <tr class="bg-white">
                        <td class="px-3 py-2 text-gray-500">{f.row}</td>
                        <td class="px-3 py-2 text-gray-600">{f.email ?? "—"}</td>
                        <td class="px-3 py-2 text-red-500">{f.reason}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}

          <!-- Successfully created engineers: upload docs -->
          {#if result.success.length > 0}
            <div>
              <div class="flex items-center justify-between mb-2">
                <p class="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Upload KYC Documents</p>
                <span class="text-[11px] text-gray-400">
                  {docsUploaded.size}/{result.success.length} done
                </span>
              </div>
              <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
                <p class="text-[12px] text-blue-700 font-medium">
                  Engineers created with pending document status. Upload KYC documents for each engineer below, or do it later from the engineers list.
                </p>
              </div>
              <div class="flex flex-col gap-2 max-h-56 overflow-y-auto">
                {#each result.success as eng}
                  {@const done = docsUploaded.has(eng.id)}
                  <div class="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-lg">
                    <div class="flex flex-col">
                      <span class="text-[13px] font-medium text-[#0B182A]">{eng.email}</span>
                      <span class="text-[11px] text-[#E87D1F] font-medium">{eng.referenceId}</span>
                    </div>
                    {#if done}
                      <span class="flex items-center gap-1 text-[12px] text-green-600 font-semibold">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        Docs uploaded
                      </span>
                    {:else}
                      <button
                        onclick={() => (uploadDocsFor = eng)}
                        class="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-[#0B182A] text-[#0B182A] hover:bg-[#0B182A] hover:text-white transition-colors cursor-pointer"
                      >
                        Upload Docs
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
      {#if phase === "upload"}
        <div></div>
        <button
          onclick={onClose}
          class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      {:else if phase === "preview"}
        <button
          onclick={() => { phase = "upload"; parsedRows = []; }}
          class="px-4 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
        >
          Back
        </button>
        <button
          onclick={handleUpload}
          disabled={validRows.length === 0}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Upload {validRows.length} engineer{validRows.length !== 1 ? "s" : ""}
        </button>
      {:else if phase === "processing"}
        <div></div>
        <div></div>
      {:else}
        <div></div>
        <button
          onclick={onClose}
          class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          Done
        </button>
      {/if}
    </div>
  </div>
</div>

<!-- Document upload sub-modal -->
{#if uploadDocsFor}
  {@const eng = uploadDocsFor}
  <AdminUploadDocumentsModal
    engineerId={eng.id}
    engineerName={eng.email}
    referenceId={eng.referenceId}
    onClose={() => (uploadDocsFor = null)}
    onDone={() => handleDocsDone(eng.id)}
  />
{/if}

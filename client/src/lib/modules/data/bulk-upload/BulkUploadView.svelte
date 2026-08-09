<script>
  import * as Icons from "$lib/icons";

  const uploads = [
    { file: "tickets_batch1.xlsx", size: "2.4 MB", by: "Anandhu", records: "842 rows", date: "12 Mar 2026, 10:24 AM", status: "Success" },
    { file: "tickets_batch2.csv", size: "2 MB", by: "Arun", records: "310 rows", date: "11 Mar 2026, 02:15 PM", status: "Failed" },
    { file: "tickets_batch1.xlsx", size: "2.4 MB", by: "Anandhu", records: "842 rows", date: "12 Mar 2026, 10:24 AM", status: "Success" },
    { file: "tickets_batch2.csv", size: "2 MB", by: "Arun", records: "310 rows", date: "11 Mar 2026, 02:15 PM", status: "Failed" },
  ];
</script>

<div class="flex flex-col gap-6">
  <!-- Upload Section -->
  <div class="grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-6">
    <!-- Upload Area -->
    <div class="bg-white rounded-2xl p-6 shadow">
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-base font-semibold text-[#0B182A]">Upload Excel File</h3>
          <p class="text-xs text-gray-400 mt-0.5">Drag and drop or browse to select your file</p>
        </div>
        <div class="flex gap-2">
          <span class="px-4 py-1.5 rounded-md text-xs font-semibold border border-green-200 bg-green-50 text-green-600 flex items-center gap-1.5">
            <Icons.Check size={14} stroke="#22c55e" strokeWidth={2.5} />
            .xlsx
          </span>
          <span class="px-4 py-1.5 rounded-md text-xs font-semibold border border-green-200 bg-green-50 text-green-600 flex items-center gap-1.5">
            <Icons.Check size={14} stroke="#22c55e" strokeWidth={2.5} />
            .CSV
          </span>
        </div>
      </div>

      <div class="mt-4 border-2 border-dashed border-[#b0d4c8] rounded-xl py-12 px-5 text-center bg-[#f6faf9]">
        <div class="flex flex-col items-center gap-2">
          <div class="mb-2 w-20 h-20 rounded-full bg-[#e8f4f0] flex items-center justify-center">
            <Icons.CloudUpload size={40} stroke="#3b8a7a" strokeWidth={1.5} />
          </div>
          <p class="text-sm text-gray-700"><strong>Drag & Drop Excel file here</strong></p>
          <p class="text-xs text-gray-400">
            or <span class="text-[#3b8a7a] font-medium cursor-pointer hover:underline">click to browse</span> from your computer
          </p>
          <button class="mt-3 px-8 py-3 bg-[#e87d1f] hover:bg-[#d06a10] text-white border-none rounded-lg text-sm font-medium cursor-pointer font-[Poppins] flex items-center gap-2">
            <Icons.Upload size={16} />
            Browse File
          </button>
        </div>
      </div>

      <div class="flex justify-center gap-8 mt-4 text-xs text-gray-500">
        <span>Accepted : <strong>.xlsx , .csv</strong></span>
        <span>Maxmum Size : <strong>10 MB</strong></span>
        <span>Maxmum Rows : <strong>5000</strong></span>
      </div>
    </div>

    <!-- Instructions Card -->
    <div class="bg-white rounded-2xl p-6 border border-[#f0f0f0]">
      <h3 class="text-base font-semibold text-[#0B182A]">Upload Instructions</h3>
      <p class="text-xs text-gray-400 mt-0.5 mb-5">Follow these steps to upload tickets</p>

      <div class="flex flex-col gap-4 mb-5">
        {#each [
          { step: 1, title: "Download the Sample Template", desc: "Get the pre-formatted Excel template with all required column headers." },
          { step: 2, title: "Fill Required Ticket Fields", desc: "Complete all mandatory columns: Customer, Service Type, SLA, State, and Agent." },
          { step: 3, title: "Upload the Completed File", desc: "Drag & drop or browse to upload your filled Excel file for processing." },
          { step: 4, title: "Review Upload Status", desc: "Check the upload history below for success, errors, or processing status." },
        ] as s}
          <div class="flex gap-3 items-start">
            <div class="w-7 h-7 rounded-full bg-[#e87d1f] text-white flex items-center justify-center text-[13px] font-semibold shrink-0">{s.step}</div>
            <div>
              <p class="text-[13px] font-semibold text-[#0B182A]">{s.title}</p>
              <p class="text-[11px] text-gray-400 mt-0.5 leading-snug">{s.desc}</p>
            </div>
          </div>
        {/each}
      </div>

      <button class="w-full py-3 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 text-white border-none rounded-lg text-sm font-medium cursor-pointer font-[Poppins] flex items-center justify-center gap-2 mb-4 transition-opacity duration-150">
        <Icons.Download size={16} />
        Download Template
      </button>

      <div class="pt-4 border-t border-[#f0f0f0]">
        <p class="text-[13px] font-semibold text-[#0B182A] mb-2">Required Fields</p>
        <div class="grid grid-cols-2 gap-1.5 text-xs text-gray-500">
          {#each ["Customer", "Service Type", "SLA Priority", "State", "Assigned Agent", "Description"] as field}
            <span class="flex items-center gap-1.5">
              <Icons.Check size={14} stroke="#22c55e" strokeWidth={2.5} />
              {field}
            </span>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Upload History -->
  <div class="bg-white rounded-2xl p-6 border border-[#f0f0f0]">
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-semibold text-[#0B182A]">Upload History</h3>
        <span class="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">48 uploads</span>
      </div>
      <div class="flex gap-2">
        <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">
          <Icons.Filter size={14} />
          Filter
        </button>
        <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">
          <Icons.Download size={14} />
          Export
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="bg-[#f0f5fa] rounded-lg">
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide first:rounded-l-lg">FILE NAME</th>
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide">UPLOADED BY</th>
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide">RECORDS</th>
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide">DATE & TIME</th>
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide">STATUS</th>
          <th class="text-left py-3 px-4 text-xs font-semibold text-[#0B182A] uppercase tracking-wide last:rounded-r-lg">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        {#each uploads as u}
          <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td class="py-3.5 px-4">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center {u.status === 'Success' ? 'bg-green-50' : 'bg-red-50'}">
                  <Icons.File size={18} stroke={u.status === "Success" ? "#22c55e" : "#ef4444"} />
                </div>
                <div>
                  <div class="font-medium text-gray-800">{u.file}</div>
                  <div class="text-[11px] text-gray-400">{u.size}</div>
                </div>
              </div>
            </td>
            <td class="py-3.5 px-4 text-gray-600">{u.by}</td>
            <td class="py-3.5 px-4 text-gray-600">{u.records}</td>
            <td class="py-3.5 px-4 text-gray-600">{u.date}</td>
            <td class="py-3.5 px-4">
              <span class={u.status === "Success" ? "px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-600" : "px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-500"}>
                {u.status}
              </span>
            </td>
            <td class="py-3.5 px-4">
              <div class="flex gap-2">
                <button aria-label="View upload details" class="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent">
                  <Icons.Eye size={18} />
                </button>
                <button aria-label="Edit upload" class="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent">
                  <Icons.Edit size={18} />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    </div>

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-[#f0f0f0] mt-2 gap-3">
      <span class="text-[13px] text-gray-500">Showing <strong>1–2</strong> of 24 Uploads</span>
      <div class="flex gap-1 items-center">
        <button disabled class="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 border border-gray-200 rounded-lg bg-white cursor-not-allowed">
          <Icons.ChevronLeft size={14} />
          Previous
        </button>
        <button class="px-3 py-1.5 text-sm text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] border border-[#0B182A] rounded-lg cursor-pointer">1</button>
        <button class="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">2</button>
        <button class="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">3</button>
        <button class="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">120</button>
        <button class="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 cursor-pointer">
          Next
          <Icons.ChevronRight size={14} />
        </button>
      </div>
    </div>
  </div>
</div>

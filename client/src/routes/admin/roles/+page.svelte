<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    fetchEngineerProfiles,
    type EngineerProfile,
  } from "$lib/modules/data/engineers/queries";
  import {
    fetchRoles,
    fetchUserRoles,
    createUserRole,
    type Role as RoleRecord,
    type UserRole,
  } from "$lib/api/roles";
  import { ROLE_LABELS, type Role as RoleName } from "$lib/config/roles";
  import Pagination from "$lib/components/Pagination.svelte";
  import { Search, X } from "$lib/icons";

  // ── State ──────────────────────────────────────────────────────────────────

  let engineers = $state<EngineerProfile[]>([]);
  let roles = $state<RoleRecord[]>([]);
  let userRoles = $state<UserRole[]>([]);
  let loading = $state(true);
  let search = $state("");

  // Modal state
  let selectedEng = $state<EngineerProfile | null>(null);
  let selectedRoleId = $state("");
  let selectedState = $state("");
  let submitting = $state(false);

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
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
  ];

  const selectedRoleName = $derived(
    roles.find((r) => r.id === selectedRoleId)?.name ?? "",
  );
  const isStatePlanner = $derived(selectedRoleName === "state_planner");

  // Roles that can be assigned (excludes super_admin and customer)
  const ASSIGNABLE: RoleName[] = [
    "project_head",
    "state_planner",
    "noc",
    "national_head",
    "engineer",
    "l2_engineer",
    "l3_engineer",
  ];

  const assignableRoles = $derived(
    roles.filter((r) => ASSIGNABLE.includes(r.name as RoleName)),
  );

  const filteredEngineers = $derived(
    engineers.filter((e) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (e.userName ?? "").toLowerCase().includes(q) ||
        (e.userEmail ?? "").toLowerCase().includes(q) ||
        (e.referenceId ?? "").toLowerCase().includes(q) ||
        (e.addressState ?? "").toLowerCase().includes(q)
      );
    }),
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  let currentPage = $state(1);
  $effect(() => {
    search;
    currentPage = 1;
  });
  const totalPages = $derived(
    Math.max(1, Math.ceil(filteredEngineers.length / PAGE_SIZE)),
  );
  const pagedEngineers = $derived(
    filteredEngineers.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE,
    ),
  );

  // userId → most-recently-assigned role label
  const userRoleMap = $derived(
    userRoles.reduce<Record<string, string>>((acc, ur) => {
      const role = roles.find((r) => r.id === ur.roleId);
      if (role)
        acc[ur.userId] = ROLE_LABELS[role.name as RoleName] ?? role.name;
      return acc;
    }, {}),
  );

  onMount(async () => {
    try {
      [engineers, roles, userRoles] = await Promise.all([
        fetchEngineerProfiles(),
        fetchRoles(),
        fetchUserRoles(),
      ]);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      loading = false;
    }
  });

  function openModal(eng: EngineerProfile) {
    selectedEng = eng;
    selectedRoleId = "";
    selectedState = "";
  }

  async function handleAssign(e: Event) {
    e.preventDefault();
    if (!selectedEng || !selectedRoleId) return;
    submitting = true;
    try {
      await createUserRole({
        userId: selectedEng.userId,
        roleId: selectedRoleId,
        author: "admin",
        state: isStatePlanner ? selectedState || undefined : undefined,
      });
      const roleName = roles.find((r) => r.id === selectedRoleId)?.name ?? "";
      const label = ROLE_LABELS[roleName as RoleName] ?? roleName;
      const stateNote =
        isStatePlanner && selectedState ? ` (${selectedState})` : "";
      toast.success(
        `${selectedEng.userName ?? selectedEng.referenceId} assigned as ${label}${stateNote}`,
      );

      // ── Update local state so the table reflects the new role immediately ──
      const newUserRole: UserRole = {
        userId: selectedEng.userId,
        roleId: selectedRoleId,
        author: "admin",
        state: isStatePlanner ? selectedState || undefined : undefined,
        createdAt: new Date().toISOString(),
      };
      userRoles = [
        ...userRoles.filter((ur) => ur.userId !== selectedEng!.userId),
        newUserRole,
      ];

      selectedEng = null;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      submitting = false;
    }
  }

  function docStatusStyle(status: string) {
    if (status === "approved") return "bg-green-50 text-green-600";
    if (status === "pending") return "bg-amber-50 text-amber-600";
    if (status === "rejected") return "bg-red-50 text-red-500";
    return "bg-gray-100 text-gray-500";
  }

  function location(eng: EngineerProfile): string {
    return (
      [eng.addressCity, eng.addressState].filter(Boolean).join(", ") || "—"
    );
  }

  const fieldClass =
    "px-3.5 py-2.5 border border-gray-200 rounded-lg text-[13px] text-gray-700 outline-none focus:border-[#0B182A] transition-colors w-full bg-white";
</script>

<svelte:head
  ><title>Role Assignment · Admin · Innoserve Techsol</title></svelte:head
>

<div class="flex flex-col gap-5">
  <!-- Filter bar -->
  <div
    class="flex items-center gap-3 flex-wrap bg-white rounded-xl px-5 py-4 shadow"
  >
    <div
      class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg flex-1 max-w-xs"
    >
      <Search size={16} stroke="#9ca3af" />
      <input
        type="text"
        placeholder="Search by name, email, state…"
        class="text-[13px] outline-none border-none w-full text-gray-600 placeholder:text-gray-400"
        bind:value={search}
      />
    </div>
    <span class="text-[12px] text-gray-400 ml-auto"
      >{filteredEngineers.length} engineers</span
    >
  </div>

  <!-- Table -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <div class="flex items-center gap-3 mb-4">
      <h3 class="text-[18px] font-semibold text-[#0B182A]">
        Engineer Role Assignment
      </h3>
      <span
        class="text-[12px] text-gray-500 bg-gray-100 px-3 py-1 rounded-full"
      >
        {engineers.filter((e) => e.documentsStatus === "approved").length} Approved
      </span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b border-gray-100">
            {#each ["ENGINEER", "ID", "EMAIL", "LOCATION", "DOC STATUS", "ROLE", "ACTION"] as col}
              <th
                class="text-left text-[11px] font-semibold text-gray-400 tracking-wide py-3 px-3 whitespace-nowrap"
                >{col}</th
              >
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr
              ><td
                colspan="7"
                class="py-10 text-center text-[13px] text-gray-400">Loading…</td
              ></tr
            >
          {:else if filteredEngineers.length === 0}
            <tr
              ><td
                colspan="7"
                class="py-10 text-center text-[13px] text-gray-400"
                >No engineers found</td
              ></tr
            >
          {:else}
            {#each pagedEngineers as eng}
              <tr
                class="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td class="py-3 px-3">
                  <p class="text-[13px] font-semibold text-[#0B182A]">
                    {eng.userName ?? "—"}
                  </p>
                </td>
                <td
                  class="py-3 px-3 text-[12px] text-[#E87D1F] font-medium whitespace-nowrap"
                >
                  {eng.referenceId ?? eng.id.slice(0, 8)}
                </td>
                <td class="py-3 px-3 text-[13px] text-gray-500"
                  >{eng.userEmail ?? "—"}</td
                >
                <td
                  class="py-3 px-3 text-[13px] text-gray-500 whitespace-nowrap"
                  >{location(eng)}</td
                >
                <td class="py-3 px-3">
                  <span
                    class="text-[11px] font-semibold px-2.5 py-1 rounded-full {docStatusStyle(
                      eng.documentsStatus,
                    )}"
                  >
                    {eng.documentsStatus}
                  </span>
                </td>
                <td class="py-3 px-3">
                  {#if eng.userId && userRoleMap[eng.userId]}
                    <span
                      class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600"
                    >
                      {userRoleMap[eng.userId]}
                    </span>
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
                <td class="py-3 px-3">
                  {#if eng.documentsStatus === "approved" && eng.userId}
                    <button
                      onclick={() => openModal(eng)}
                      class="px-3 py-1.5 text-[12px] font-semibold text-white bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Assign Role
                    </button>
                  {:else}
                    <span class="text-[12px] text-gray-300">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    <Pagination
      {currentPage}
      {totalPages}
      totalItems={filteredEngineers.length}
      pageSize={PAGE_SIZE}
      itemLabel="engineers"
      {loading}
      onchange={(p) => (currentPage = p)}
    />
  </div>
</div>

<!-- Assign Role Modal -->
{#if selectedEng}
  {@const eng = selectedEng}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/50 cursor-default"
      aria-label="Close modal"
      onclick={() => (selectedEng = null)}
    ></button>
    <div
      class="relative z-10 bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Assign Role"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-gray-100"
      >
        <div>
          <h2 class="text-[16px] font-semibold text-[#0B182A]">Assign Role</h2>
          <p class="text-[12px] text-gray-400 mt-0.5">
            {eng.userName ?? eng.referenceId ?? eng.id}
          </p>
        </div>
        <button
          onclick={() => (selectedEng = null)}
          class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <!-- Form -->
      <form class="px-6 py-5 flex flex-col gap-4" onsubmit={handleAssign}>
        <!-- Engineer info strip -->
        <div class="bg-gray-50 rounded-lg px-4 py-3 flex flex-col gap-1">
          <span
            class="text-[11px] text-gray-400 uppercase tracking-wide font-semibold"
            >Engineer</span
          >
          <span class="text-[13px] font-medium text-[#0B182A]"
            >{eng.userName ?? "—"}</span
          >
          <span class="text-[12px] text-gray-400">{eng.userEmail ?? "—"}</span>
          <span class="text-[11px] text-[#E87D1F] font-medium"
            >{eng.referenceId ?? ""}</span
          >
        </div>

        <!-- Role selector -->
        <label class="flex flex-col gap-1.5">
          <span
            class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
          >
            Role <span class="text-red-400">*</span>
          </span>
          {#if assignableRoles.length === 0}
            <p class="text-[13px] text-gray-400 italic">
              No roles available — check backend
            </p>
          {:else}
            <select class={fieldClass} bind:value={selectedRoleId} required>
              <option value="">— Select a role —</option>
              {#each assignableRoles as role}
                <option value={role.id}>
                  {ROLE_LABELS[role.name as RoleName] ?? role.name}
                </option>
              {/each}
            </select>
          {/if}
        </label>

        <!-- State selector (only for State Planner) -->
        {#if isStatePlanner}
          <label class="flex flex-col gap-1.5">
            <span
              class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
            >
              Assigned State <span class="text-red-400">*</span>
            </span>
            <select
              class={fieldClass}
              bind:value={selectedState}
              required={isStatePlanner}
            >
              <option value="">— Select a state —</option>
              {#each INDIAN_STATES as state}
                <option value={state}>{state}</option>
              {/each}
            </select>
          </label>
        {/if}

        <!-- Footer -->
        <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-1">
          <button
            type="button"
            onclick={() => (selectedEng = null)}
            class="px-5 py-2.5 text-[13px] text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting ||
              !selectedRoleId ||
              (isStatePlanner && !selectedState)}
            class="px-5 py-2.5 text-[13px] text-white font-semibold bg-[linear-gradient(to_bottom,#0B182A,#021E44)] rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60"
          >
            {submitting ? "Assigning…" : "Assign Role"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

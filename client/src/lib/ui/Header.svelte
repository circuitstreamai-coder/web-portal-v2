<script lang="ts">
  import { page } from "$app/state";
  import { toggleMobileSidebar } from "../stores/app.js";
  import { authStore } from "../stores/auth.js";
  import * as Icons from "$lib/icons";

  const pageTitles: Record<string, string> = {
    dashboard: "Dashboard",
    tickets: "Tickets",
    "bulk-upload": "Bulk Upload",
    customers: "Customers",
    projects: "Projects",
    engineers: "Engineers",
    inventory: "Inventory",
    reports: "Reports",
  };

  const currentPage = $derived(
    page.url.pathname.replace("/data", "").replace(/^\//, "") || "dashboard",
  );

  const currentUser = $derived($authStore.user);
  const displayName = $derived(currentUser?.name ?? "User");

  let showDropdown = $state(false);

  async function handleLogout() {
    showDropdown = false;
    await authStore.logout();
  }
</script>

<header
  class="flex items-center justify-between px-4 md:px-8 py-4 shadow
         bg-[linear-gradient(to_right,#0B182A,#021E44)] md:bg-none md:bg-white"
>
  <!-- Hamburger button — mobile only -->
  <button
    class="md:hidden mr-3 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors shrink-0"
    onclick={toggleMobileSidebar}
    aria-label="Open sidebar"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  </button>

  <h1 class="text-[18px] md:text-[22px] font-semibold text-white md:text-[#0B182A] flex-1">
    {pageTitles[currentPage] || "Dashboard"}
  </h1>

  <div class="flex items-center gap-2 md:gap-4">
    <span class="hidden md:inline text-[14px] text-[#0B182A] font-normal">
      Welcome Back, <strong class="font-semibold">{displayName}</strong>
    </span>

    <!-- Notification Bell -->
    <button
      class="relative w-9 h-9 md:w-10 md:h-10 rounded-[10px] flex items-center justify-center cursor-pointer
             transition-all duration-150 ease-in-out
             border border-white/20 bg-white/10 hover:bg-white/20
             md:border-gray-200 md:bg-white md:hover:bg-white md:hover:border-[#0B182A]"
    >
      <Icons.Bell size={18} stroke="#0B182A" />
      <span
        class="absolute top-2 right-2 md:right-2.5 w-2 h-2 rounded-full bg-[#E87D1F] border-2 border-white/30 md:border-white"
      ></span>
    </button>

    <!-- User Avatar -->
    <div class="relative">
      <button
        class="w-9 h-9 md:w-10 md:h-10 rounded-full overflow-hidden border-2 border-white/40 md:border-gray-200 cursor-pointer p-0 bg-transparent"
        onclick={() => (showDropdown = !showDropdown)}
      >
        <img
          src="https://ui-avatars.com/api/?name={encodeURIComponent(displayName)}&background=E87D1F&color=fff&size=36&font-size=0.4&bold=true"
          alt="User"
          class="w-full h-full object-cover block"
        />
      </button>

      {#if showDropdown}
        <div
          class="absolute top-12 right-0 bg-white border border-gray-200 rounded-[10px] p-1.5 min-w-45 shadow-[0_10px_30px_rgba(0,0,0,0.12)] z-50"
        >
          <button
            class="flex items-center gap-2.5 w-full px-3 py-2.5 border-none bg-transparent rounded-md text-[13px] text-gray-700 cursor-pointer transition-colors duration-150 hover:bg-gray-100"
            onclick={() => {
              showDropdown = false;
            }}
          >
            <Icons.Person size={16} />
            Profile
          </button>
          <button
            class="flex items-center gap-2.5 w-full px-3 py-2.5 border-none bg-transparent rounded-md text-[13px] text-gray-700 cursor-pointer transition-colors duration-150 hover:bg-gray-100"
            onclick={() => {
              showDropdown = false;
            }}
          >
            <Icons.Settings size={16} />
            Settings
          </button>
          <hr class="border-none border-t border-gray-200 my-1" />
          <button
            class="flex items-center gap-2.5 w-full px-3 py-2.5 border-none bg-transparent rounded-md text-[13px] text-red-600 cursor-pointer transition-colors duration-150 hover:bg-gray-100"
            onclick={handleLogout}
          >
            <Icons.LogOut size={16} />
            Logout
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  /* Bell icon: override hardcoded stroke to white on mobile dark header */
  @media (max-width: 767px) {
    header :global(svg) {
      stroke: white;
    }
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { sidebarCollapsed, toggleSidebar, mobileOpen, closeMobileSidebar } from "../stores/app.js";
  import * as Icons from "$lib/icons";
  import Logo from "$lib/ui/Logo.svelte";

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "tickets", label: "Tickets", icon: "tickets" },
    { id: "bulk-upload", label: "Bulk Upload", icon: "upload" },
    { id: "customers", label: "Customers", icon: "customers" },
    { id: "projects", label: "Projects", icon: "projects" },
    { id: "engineers", label: "Engineers", icon: "engineers" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "reports", label: "Reports", icon: "reports" },
  ];

  const navigateTo = (pageId: string) => {
    goto(`/data/${pageId === "dashboard" ? "" : pageId}`);
    closeMobileSidebar();
  };

  const currentPage = $derived(
    page.url.pathname.replace("/data", "").replace(/^\//, "") || "dashboard",
  );

  // Show full content (labels) when desktop expanded OR mobile open
  const showLabels = $derived(!$sidebarCollapsed || $mobileOpen);
</script>

<aside
  class="fixed top-0 left-0 h-screen flex flex-col z-50
         transition-[width,transform] duration-300 ease-in-out overflow-visible
         w-64
         {$sidebarCollapsed ? 'md:w-17.5' : 'md:w-55'}
         {$mobileOpen ? 'translate-x-0' : '-translate-x-full'}
         md:translate-x-0"
  style="background: linear-gradient(to bottom, #0B182A, #021E44);"
>
  <!-- Logo Area -->
  <div class="px-4 py-5 border-b border-white/8 min-h-20 flex items-center">
    {#if showLabels}
      <div class="flex items-center gap-2.5 whitespace-nowrap overflow-hidden">
        <div class="shrink-0">
          <Logo height={36} />
        </div>
        <div class="flex flex-col leading-[1.15]">
          <span class="text-[14px] font-bold text-white tracking-[1px]">
            INNO<span class="text-[#E87D1F]">SERVE</span>
          </span>
          <span class="text-[14px] font-bold text-white tracking-[1px]"
            >TECHSOL</span
          >
          <span class="text-[7px] text-white/60 tracking-[0.5px] mt-0.5">
            YOUR SUCCESS IS <span class="text-[#E87D1F]">OUR GOAL</span>
          </span>
        </div>
      </div>
    {:else}
      <div class="flex items-center justify-center w-full">
        <Logo height={32} />
      </div>
    {/if}
  </div>

  <!-- Desktop Toggle Button — overlaps sidebar edge, hidden on mobile -->
  <button
    onclick={toggleSidebar}
    class="hidden md:flex absolute top-20.5 -right-3.5 w-7 h-7 rounded-full border-2 border-[#F5F6FA] items-center justify-center cursor-pointer z-101 shadow transition-all duration-200 ease-in-out hover:scale-110"
    style="background: linear-gradient(to bottom, #0B182A, #021E44);"
  >
    {#if $sidebarCollapsed}
      <Icons.ChevronRight size={16} stroke="white" strokeWidth={2.5} />
    {:else}
      <Icons.ChevronLeft size={16} stroke="white" strokeWidth={2.5} />
    {/if}
  </button>

  <!-- Navigation -->
  <nav
    class="flex flex-col flex-1 px-2.5 py-4 gap-0.5 overflow-y-auto overflow-x-hidden"
  >
    {#each menuItems as item}
      <button
        onclick={() => navigateTo(item.id)}
        title={!showLabels ? item.label : ""}
        class="flex items-center rounded-lg border-none cursor-pointer
                 text-[14px] font-normal whitespace-nowrap overflow-hidden w-full
               transition-all duration-200 ease-in-out
               {!showLabels
          ? 'justify-center p-3'
          : 'gap-3 px-3.5 py-3 text-left'}
               {currentPage === item.id
          ? 'bg-[#E87D1F] text-white font-medium'
          : 'bg-transparent text-white/65 hover:text-white hover:bg-white/8'}"
      >
        <!-- Icon -->
        <span class="shrink-0 flex items-center justify-center w-5 h-5">
          {#if item.icon === "dashboard"}
            <Icons.Grid />
          {:else if item.icon === "tickets"}
            <Icons.Ticket />
          {:else if item.icon === "upload"}
            <Icons.Upload />
          {:else if item.icon === "customers"}
            <Icons.Users />
          {:else if item.icon === "projects"}
            <Icons.Folder />
          {:else if item.icon === "engineers"}
            <Icons.Spanner />
          {:else if item.icon === "inventory"}
            <Icons.Cube />
          {:else if item.icon === "reports"}
            <Icons.Graph />
          {/if}
        </span>

        {#if showLabels}
          <span class="overflow-hidden text-ellipsis">{item.label}</span>
        {/if}
      </button>
    {/each}
  </nav>
</aside>

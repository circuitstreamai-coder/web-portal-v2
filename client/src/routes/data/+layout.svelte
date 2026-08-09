<script lang="ts">
  import "../layout.css";
  import Sidebar from "$lib/ui/Sidebar.svelte";
  import Header from "$lib/ui/Header.svelte";
  import {
    sidebarCollapsed,
    mobileOpen,
    closeMobileSidebar,
  } from "$lib/stores/app";
  import { afterNavigate } from "$app/navigation";

  let { children } = $props();

  let mainEl: HTMLElement;

  afterNavigate(() => {
    mainEl?.scrollTo({ top: 0 });
  });
</script>

<svelte:head><title>Innoserve Techsol</title></svelte:head>

<!-- Mobile overlay backdrop -->
{#if $mobileOpen}
  <button
    type="button"
    class="fixed inset-0 bg-black/50 z-40 md:hidden cursor-default"
    aria-label="Close sidebar"
    onclick={closeMobileSidebar}
  ></button>
{/if}

<Sidebar />

<!-- Main content area — offset by sidebar width on desktop -->
<div
  class="flex flex-col h-screen transition-[margin-left] duration-300 bg-[#0B182A] md:bg-stone-100
         {$sidebarCollapsed ? 'md:ml-17.5' : 'md:ml-55'}"
>
  <Header />
  <main
    bind:this={mainEl}
    class="flex-1 px-4 md:px-8 pb-8 overflow-y-auto bg-stone-100 mt-2"
  >
    {@render children()}
  </main>
</div>

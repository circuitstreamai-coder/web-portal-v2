<script lang="ts">
  import type { Snippet } from "svelte";
  import { authStore } from "$lib/stores/auth";
  import { page } from "$app/state";
  import type { Role } from "$lib/config/roles";
  import { ROLE_LABELS, ROLE_BADGE_COLORS } from "$lib/config/roles";
  import { notifications, unreadCount } from "$lib/stores/notifications";
  import Logo from "$lib/ui/Logo.svelte";
  import SlaBreachPoller from "$lib/components/SlaBreachPoller.svelte";

  interface NavItem {
    label: string;
    href: string;
    icon: string;
  }

  interface Props {
    /** Label shown in the header */
    title: string;
    /** Used to tint the role badge and pick nav items */
    role: Role;
    children: Snippet;
  }

  let { title, role, children }: Props = $props();

  // Backend-generated notification links point at a generic `/tickets/:id`
  // path, but there is no such route — each role has its own tickets list
  // (e.g. `/engineer/tickets`) and shows ticket detail via an in-page modal,
  // not a dedicated detail page. Redirect those to the current user's
  // role-scoped tickets list instead of hitting a 404.
  const ROLE_TICKETS_PATH: Record<Role, string> = {
    super_admin:  "/admin/tickets",
    national_head:"/national-head/tickets",
    engineer:     "/engineer/tickets",
    l2_engineer:  "/engineer/tickets",
    l3_engineer:  "/engineer/tickets",
    customer:     "/customer/tickets",
    noc:          "/noc/tickets",
    state_planner:"/planner/tickets",
    project_head: "/project-head/tickets",
    vendor:       "/vendor/tickets",
    asset_manager:"/inventory",
  };

  function resolveNotificationHref(href: string): string {
    if (/^\/tickets\//.test(href)) {
      return ROLE_TICKETS_PATH[role] ?? href;
    }
    return href;
  }

  const NAV: Record<Role, NavItem[]> = {
    super_admin: [
      { label: "Dashboard",   href: "/admin",                   icon: "home"    },
      { label: "Customers",   href: "/admin/customers",          icon: "users"   },
      { label: "Engineers",   href: "/admin/engineers",          icon: "hardhat" },
      { label: "Projects",    href: "/admin/projects",           icon: "folder"  },
      { label: "Tickets",     href: "/admin/tickets",            icon: "ticket"  },
      { label: "Inventory",   href: "/admin/inventory",          icon: "cube"    },
      { label: "SLA",         href: "/admin/sla",                icon: "shield"  },
      { label: "Call Types",  href: "/admin/categories",         icon: "tag"     },
      { label: "Roles",       href: "/admin/roles",              icon: "key"     },
      { label: "Payout Rates",href: "/admin/payouts/rates",      icon: "dollar"  },
      { label: "Payout Log",  href: "/admin/payouts/log",        icon: "chart"   },
    ],
    national_head: [
      { label: "Dashboard", href: "/national-head/dashboard", icon: "home"    },
      { label: "Customers", href: "/national-head/customers",  icon: "users"   },
      { label: "Engineers", href: "/national-head/engineers",  icon: "hardhat" },
      { label: "Projects",  href: "/national-head/projects",   icon: "folder"  },
      { label: "Tickets",   href: "/national-head/tickets",    icon: "ticket"  },
      { label: "Payouts",   href: "/national-head/payouts",    icon: "dollar"  },
    ],
    engineer: [
      { label: "Dashboard",    href: "/engineer",             icon: "home"     },
      { label: "Tickets",      href: "/engineer/tickets",     icon: "ticket"   },
      { label: "Availability", href: "/engineer/availability",icon: "calendar" },
      { label: "Earnings",     href: "/engineer/earnings",    icon: "dollar"   },
    ],
    l2_engineer: [
      { label: "Dashboard",    href: "/engineer",             icon: "home"     },
      { label: "Tickets",      href: "/engineer/tickets",     icon: "ticket"   },
      { label: "Availability", href: "/engineer/availability",icon: "calendar" },
      { label: "Earnings",     href: "/engineer/earnings",    icon: "dollar"   },
    ],
    l3_engineer: [
      { label: "Dashboard",    href: "/engineer",             icon: "home"     },
      { label: "Tickets",      href: "/engineer/tickets",     icon: "ticket"   },
      { label: "Availability", href: "/engineer/availability",icon: "calendar" },
      { label: "Earnings",     href: "/engineer/earnings",    icon: "dollar"   },
    ],
    customer: [
      { label: "Dashboard",    href: "/customer",               icon: "home"   },
      { label: "Projects",     href: "/customer/projects",      icon: "folder" },
      { label: "Tickets",      href: "/customer/tickets",       icon: "ticket" },
      { label: "Reports",      href: "/customer/reports",       icon: "chart"  },
      { label: "Replacements", href: "/customer/replacements",  icon: "cube"   },
    ],
    noc: [
      { label: "Dashboard",   href: "/noc",              icon: "home"   },
      { label: "Tickets",     href: "/noc/tickets",      icon: "ticket" },
      { label: "SLA Board",   href: "/noc/sla",          icon: "shield" },
      { label: "Replacements",href: "/noc/replacements", icon: "cube"   },
      { label: "Inventory",   href: "/noc/inventory",    icon: "cube"   },
    ],
    state_planner: [
      { label: "Dashboard", href: "/planner",        icon: "home"   },
      { label: "Tickets",   href: "/planner/tickets", icon: "ticket" },
      { label: "SLA",       href: "/planner/sla",     icon: "shield" },
    ],
    project_head: [
      { label: "Dashboard", href: "/project-head/dashboard", icon: "home"    },
      { label: "Tickets",   href: "/project-head/tickets",   icon: "ticket"  },
      { label: "Team",      href: "/project-head/team",      icon: "hardhat" },
      { label: "Customers", href: "/project-head/customers", icon: "users"   },
      { label: "SLA",       href: "/project-head/sla",       icon: "shield"  },
    ],
    vendor: [
      { label: "Dashboard", href: "/vendor",         icon: "home"   },
      { label: "Tickets",   href: "/vendor/tickets", icon: "ticket" },
    ],
    asset_manager: [
      { label: "Inventory", href: "/inventory", icon: "cube" },
    ],
  };

  let navItems = $derived(NAV[role] ?? []);
  let currentPath = $derived(page.url.pathname);
  const exactMatchRoutes = new Set([
    "/admin",
    "/engineer",
    "/customer",
    "/noc",
    "/planner",
    "/vendor",
    "/project",
    "/project-head/dashboard",
    "/national-head/dashboard",
  ]);

  function matchesRoute(href: string): boolean {
    if (exactMatchRoutes.has(href)) {
      return currentPath === href;
    }
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }

  const activeHref = $derived(
    [...navItems]
      .filter((item) => matchesRoute(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "",
  );

  function isActive(href: string): boolean {
    return href === activeHref;
  }

  let sidebarOpen = $state(false);
  let showDropdown = $state(false);
  let showNotifications = $state(false);
  const user = $derived($authStore.user);
  const initials = $derived(
    user?.name
      ?.split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?",
  );

  async function handleLogout() {
    showDropdown = false;
    await authStore.logout();
  }

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-dropdown]")) showDropdown = false;
    if (!target.closest("[data-notif]")) showNotifications = false;
  }
</script>

<svelte:window onclick={handleWindowClick} />

<!-- SLA breach poller — only for roles that monitor SLA -->
{#if role === 'super_admin' || role === 'noc' || role === 'state_planner' || role === 'project_head'}
  <SlaBreachPoller
    enabled={true}
    slaHref={role === 'super_admin' ? '/admin/sla' : role === 'noc' ? '/noc/sla' : role === 'state_planner' ? '/planner/sla' : '/project-head/sla'}
  />
{/if}

<div class="flex min-h-screen bg-stone-100">
  <!-- ── Mobile sidebar backdrop ──────────────────────────────────────── -->
  {#if sidebarOpen}
    <button
      type="button"
      class="fixed inset-0 z-30 bg-black/40 lg:hidden cursor-default"
      aria-label="Close sidebar"
      onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}

  <!-- ── Sidebar ───────────────────────────────────────────────────────── -->
  <aside
    class="fixed inset-y-0 left-0 z-40 flex flex-col w-60 bg-[#0B182A] text-white
		       transition-transform duration-200
		       {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0"
  >
    <!-- Logo -->
    <div
      class="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 shrink-0"
    >
      <Logo height={36} />

      <div class="flex flex-col leading-none">
        <span class="text-[12px] font-bold tracking-[1px]"
          >INNO<span class="text-[#E87D1F]">SERVE</span></span
        >
        <span class="text-[12px] font-bold tracking-[1px]">TECHSOL</span>
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
      {#each navItems as item}
        <a
          href={item.href}
          onclick={() => (sidebarOpen = false)}
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors
					       {isActive(item.href)
            ? 'bg-[#E87D1F] text-white'
            : 'text-white/60 hover:text-white hover:bg-white/8'}"
        >
          <!-- Icon -->
          {#if item.icon === "home"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
              /><polyline points="9 22 9 12 15 12 15 22" /></svg
            >
          {:else if item.icon === "users"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle
                cx="9"
                cy="7"
                r="4"
              /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path
                d="M16 3.13a4 4 0 0 1 0 7.75"
              /></svg
            >
          {:else if item.icon === "hardhat"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"
              /><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path
                d="M4 15v-3a8 8 0 0 1 16 0v3"
              /></svg
            >
          {:else if item.icon === "folder"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
              /></svg
            >
          {:else if item.icon === "ticket"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"
              /></svg
            >
          {:else if item.icon === "chart"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 20V10" /><path d="M18 20V4" /><path
                d="M6 20v-4"
              /></svg
            >
          {:else if item.icon === "shield"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path
                d="m9 12 2 2 4-4"
              /></svg
            >
          {:else if item.icon === "dollar"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><line x1="12" y1="2" x2="12" y2="22" /><path
                d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
              /></svg
            >
          {:else if item.icon === "cube"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
              /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line
                x1="12"
                y1="22.08"
                x2="12"
                y2="12"
              /></svg
            >
          {:else if item.icon === "key"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="7.5" cy="15.5" r="5.5" /><path
                d="M21 2l-9.6 9.6"
              /><path d="M15.5 7.5l3 3L22 7l-3-3" /></svg
            >
          {:else if item.icon === "package"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          {:else if item.icon === "settings"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          {:else if item.icon === "tag"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          {:else if item.icon === "calendar"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {/if}
          {item.label}
        </a>
      {/each}
    </nav>

    <!-- User info at bottom -->
    <div class="px-4 py-4 border-t border-white/10 shrink-0">
      <div class="flex items-center gap-3">
        {#if user?.avatarFileId}
          <img
            src={`/file/${user.avatarFileId}`}
            alt="Avatar"
            class="w-8 h-8 rounded-full object-cover shrink-0"
          />
        {:else}
          <div
            class="w-8 h-8 rounded-full bg-[#E87D1F] flex items-center justify-center text-[11px] font-bold shrink-0"
          >
            {initials}
          </div>
        {/if}
        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold truncate">{user?.name ?? "—"}</p>
          <p class="text-[11px] text-white/40 truncate">{ROLE_LABELS[role]}</p>
        </div>
      </div>
    </div>
  </aside>

  <!-- ── Main area (offset by sidebar width on desktop) ───────────────── -->
  <div class="flex flex-col flex-1 lg:pl-60 min-w-0">
    <!-- ── Top bar ──────────────────────────────────────────────────── -->
    <header
      class="sticky top-0 z-20 flex items-center justify-between px-4 md:px-6 h-16
			       bg-white border-b border-gray-200 shadow-sm shrink-0"
    >
      <!-- Mobile hamburger + page title -->
      <div class="flex items-center gap-3">
        <button
          onclick={() => (sidebarOpen = !sidebarOpen)}
          class="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 class="text-[16px] font-semibold text-[#0B182A]">{title}</h1>
      </div>

      <!-- Right: role badge + notifications + user menu -->
      <div class="flex items-center gap-3">
        <span
          class="hidden sm:inline-flex px-3 py-1 rounded-full text-[11px] font-semibold tracking-[0.5px] {ROLE_BADGE_COLORS[
            role
          ]}"
        >
          {ROLE_LABELS[role]}
        </span>

        <!-- Notifications bell -->
        <div class="relative" data-notif>
          <button
            onclick={() => (showNotifications = !showNotifications)}
            class="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
            aria-expanded={showNotifications}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {#if $unreadCount > 0}
              <span
                class="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#E87D1F] text-white text-[9px] font-bold flex items-center justify-center leading-none"
              >
                {$unreadCount > 9 ? "9+" : $unreadCount}
              </span>
            {/if}
          </button>

          {#if showNotifications}
            <div
              class="absolute top-11 right-0 w-80 bg-white border border-gray-200 rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden"
            >
              <!-- Header -->
              <div
                class="flex items-center justify-between px-4 py-3 border-b border-gray-100"
              >
                <span class="text-[13px] font-semibold text-[#0B182A]"
                  >Notifications</span
                >
                {#if $unreadCount > 0}
                  <button
                    onclick={() => notifications.markAllRead()}
                    class="text-[11px] text-[#E87D1F] font-medium hover:underline"
                    >Mark all read</button
                  >
                {/if}
              </div>
              <!-- List -->
              <div class="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {#if $notifications.length === 0}
                  <div class="px-4 py-8 text-center">
                    <svg
                      class="mx-auto mb-2 text-gray-300"
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <p class="text-[12px] text-gray-400">
                      No notifications yet
                    </p>
                  </div>
                {:else}
                  {#each $notifications as n (n.id)}
                    <div
                      class="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer {n.read
                        ? 'opacity-60'
                        : ''}"
                      role="button"
                      tabindex="0"
                      onclick={() => {
                        notifications.markRead(n.id);
                        if (n.href) window.location.href = resolveNotificationHref(n.href);
                      }}
                      onkeydown={(e) =>
                        e.key === "Enter" && notifications.markRead(n.id)}
                    >
                      <!-- Type dot -->
                      <div
                        class="mt-1 w-2 h-2 rounded-full shrink-0 {n.type ===
                        'success'
                          ? 'bg-emerald-500'
                          : n.type === 'error'
                            ? 'bg-red-500'
                            : n.type === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'}"
                      ></div>
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-[13px] font-medium text-[#0B182A] leading-snug"
                        >
                          {n.title}
                        </p>
                        {#if n.message}
                          <p
                            class="text-[11px] text-gray-500 mt-0.5 line-clamp-2"
                          >
                            {n.message}
                          </p>
                        {/if}
                        <p class="text-[10px] text-gray-400 mt-1">
                          {n.createdAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {#if !n.read}
                        <div
                          class="w-1.5 h-1.5 rounded-full bg-[#E87D1F] shrink-0 mt-1.5"
                        ></div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Avatar dropdown -->
        <div class="relative" data-dropdown>
          <button
            onclick={() => (showDropdown = !showDropdown)}
            class="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-[13px] font-bold
						       bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 transition-opacity"
            aria-label="User menu"
            aria-expanded={showDropdown}
          >
            {#if user?.avatarFileId}
              <img
                src={`/file/${user.avatarFileId}`}
                alt="Avatar"
                class="w-full h-full object-cover"
              />
            {:else}
              {initials}
            {/if}
          </button>

          {#if showDropdown}
            <div
              class="absolute top-11 right-0 w-52 bg-white border border-gray-200 rounded-[10px] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] z-50"
            >
              <div class="px-3 py-2 border-b border-gray-100 mb-1">
                <p class="text-[13px] font-semibold text-[#0B182A] truncate">
                  {user?.name ?? "—"}
                </p>
                <p class="text-[11px] text-gray-500 truncate">
                  {user?.email ?? "—"}
                </p>
              </div>
              <a
                href="/profile"
                onclick={() => (showDropdown = false)}
                class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-md text-[13px] text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle
                    cx="12"
                    cy="7"
                    r="4"
                  />
                </svg>
                My Profile
              </a>
              <button
                class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-md text-[13px] text-red-600 hover:bg-gray-100 transition-colors"
                onclick={handleLogout}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    <!-- ── Page content ─────────────────────────────────────────────── -->
    <main class="flex-1 px-4 md:px-8 py-6 max-w-7xl mx-auto w-full">
      {@render children()}
    </main>
  </div>
</div>

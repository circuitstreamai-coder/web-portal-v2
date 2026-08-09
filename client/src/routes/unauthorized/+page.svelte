<script lang="ts">
  import { goto } from "$app/navigation";
  import { authStore } from "$lib/stores/auth";
  import { redirectAfterLogin } from "$lib/auth/redirectAfterLogin";

  const user = $derived($authStore.user);

  function goToDashboard() {
    if (user?.role) {
      goto(redirectAfterLogin(user.role));
    } else {
      goto("/login");
    }
  }
</script>

<svelte:head><title>Unauthorized · Innoserve Techsol</title></svelte:head>

<div class="min-h-screen flex items-center justify-center bg-[#faf9f6] p-6">
  <div class="w-full max-w-md text-center">
    <!-- Icon -->
    <div
      class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center"
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#dc2626"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>

    <h1 class="text-[26px] font-bold text-[#0B182A] mb-2">Access Denied</h1>
    <p class="text-[14px] text-gray-500 mb-8">
      You don't have permission to view this page.<br />
      Please contact your administrator if you believe this is an error.
    </p>

    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <button
        onclick={goToDashboard}
        class="px-6 py-3 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white rounded-lg
				       text-[14px] font-semibold tracking-[0.5px] hover:opacity-90 transition-opacity"
      >
        Go to My Dashboard
      </button>
      <button
        onclick={() => authStore.logout()}
        class="px-6 py-3 bg-[#ededed] text-[#333] rounded-lg
				       text-[14px] font-semibold hover:bg-[#e3e3e3] transition-colors"
      >
        Logout
      </button>
    </div>
  </div>
</div>

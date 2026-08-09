<svelte:head>
  <title>No Connection — Innoserve</title>
</svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
  <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  </div>

  <h1 class="text-2xl font-semibold text-[#0B182A] mb-2">You're offline</h1>
  <p class="text-gray-500 text-sm max-w-xs mb-8">
    No internet connection detected. Check your network and try again.
  </p>

  <button
    onclick={() => location.reload()}
    class="px-6 py-2.5 bg-[linear-gradient(to_bottom,#0B182A,#021E44)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
  >
    Try again
  </button>
</div>

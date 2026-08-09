<script lang="ts">
  import { restRequest } from '$lib/api/rest';
  import Logo from '$lib/ui/Logo.svelte';

  // ── State ─────────────────────────────────────────────────────────────────

  let email      = $state('');
  let emailError = $state('');
  let loading    = $state(false);
  let sent       = $state(false);

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    emailError = '';
    if (!email.trim()) { emailError = 'Email is required'; return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      emailError = 'Enter a valid email address';
      return false;
    }
    return true;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    try {
      await restRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // Always show success regardless of response to prevent email enumeration
    } finally {
      loading = false;
      sent = true;
    }
  }
</script>

<svelte:head><title>Forgot Password · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col md:flex-row min-h-screen w-full">

  <!-- ── Left brand panel ─────────────────────────────────────────────────── -->
  <div class="hidden md:flex flex-[0_0_45%] bg-[linear-gradient(135deg,#0f2b3d_0%,#183e58_40%,#1a3a52_100%)] items-end px-12.5 py-15 relative overflow-hidden">
    <div class="absolute top-[-50%] right-[-30%] w-[80%] h-[150%] rounded-[50%] bg-[radial-gradient(circle,rgba(255,255,255,0.03)_0%,transparent_70%)]"></div>
    <div class="absolute bottom-[30%] -left-15 w-50 h-50 rounded-full border border-white/5"></div>
    <div class="absolute top-[20%] -right-10 w-35 h-35 rounded-full border border-[#E87D1F]/10"></div>
    <div class="relative z-10">
      <p class="text-[32px] font-normal text-white leading-[1.35] italic">
        <em>Secure your<br />account.<br />We'll get you<br />back in.</em>
      </p>
      <p class="mt-6 text-white/40 text-[13px] tracking-[0.5px]">Innoserve Techsol · Ticket Management</p>
    </div>
  </div>

  <!-- ── Right form panel ─────────────────────────────────────────────────── -->
  <div class="flex-1 md:flex-[0_0_55%] flex items-center justify-center bg-[#faf9f6] p-6 md:p-10">
    <div class="w-full max-w-100">

      <!-- Logo -->
      <div class="flex justify-center mb-10">
        <Logo />
      </div>

      <h2 class="text-center text-[22px] font-bold text-[#0B182A] mb-2 tracking-[1px]">FORGOT PASSWORD</h2>
      <p class="text-center text-[13px] text-gray-400 mb-9">
        Enter your registered email and we'll send you a reset link.
      </p>

      {#if sent}
        <!-- ── Success state ────────────────────────────────────────────── -->
        <div class="flex flex-col items-center gap-5 py-4">
          <div class="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.43 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.64a16 16 0 0 0 6.45 6.45l.91-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <div class="text-center">
            <p class="text-[15px] font-semibold text-[#0B182A] mb-2">Check your inbox</p>
            <p class="text-[13px] text-gray-500 leading-relaxed max-w-[280px]">
              If this email is registered, you will receive a reset link shortly.
            </p>
          </div>
          <a
            href="/login"
            class="mt-2 text-[13px] font-medium text-[#E87D1F] hover:underline"
          >
            ← Back to Login
          </a>
        </div>

      {:else}
        <!-- ── Form ────────────────────────────────────────────────────── -->
        <form onsubmit={handleSubmit} class="flex flex-col gap-5" novalidate>
          <div class="flex flex-col gap-1.5">
            <input
              type="email"
              placeholder="E-mail address"
              autocomplete="email"
              class="w-full py-3.5 px-4.5 bg-[#ededed] rounded-lg text-sm text-[#333] outline-none transition-all duration-200
                     placeholder:text-[#999] focus:bg-[#e3e3e3] focus:shadow-[0_0_0_2px_rgba(24,62,88,0.15)]
                     border {emailError ? 'border-red-400 focus:shadow-[0_0_0_2px_rgba(239,68,68,0.2)]' : 'border-transparent'}"
              bind:value={email}
            />
            {#if emailError}
              <p class="text-red-500 text-[12px] leading-none">{emailError}</p>
            {/if}
          </div>

          <button
            type="submit"
            disabled={loading}
            class="w-full py-3.5 rounded-xl text-sm font-bold tracking-[1.5px] uppercase text-white
                   bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 active:scale-[0.99]
                   transition-all duration-150 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>

          <p class="text-center text-[13px]">
            <a href="/login" class="text-[#E87D1F] font-medium hover:underline">← Back to Login</a>
          </p>
        </form>
      {/if}

    </div>
  </div>
</div>

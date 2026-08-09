<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { restRequest, ApiError } from '$lib/api/rest';
  import Logo from '$lib/ui/Logo.svelte';

  // ── State ─────────────────────────────────────────────────────────────────

  let token       = $state('');
  let newPassword = $state('');
  let confirmPwd  = $state('');
  let showNew     = $state(false);
  let showConfirm = $state(false);
  let loading     = $state(false);
  let done        = $state(false);
  let linkExpired = $state(false);
  let errors      = $state<Record<string, string>>({});

  // ── Read token from URL, redirect if missing ──────────────────────────────

  onMount(() => {
    const t = page.url.searchParams.get('token');
    if (!t) {
      goto('/forgot-password', { replaceState: true });
      return;
    }
    token = t;
  });

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    errors = {};
    if (!newPassword) {
      errors.newPassword = 'Password is required';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(newPassword)) {
      errors.newPassword = 'Must contain at least one uppercase letter';
    } else if (!/[0-9]/.test(newPassword)) {
      errors.newPassword = 'Must contain at least one number';
    }
    if (!confirmPwd) {
      errors.confirmPwd = 'Please confirm your password';
    } else if (newPassword !== confirmPwd) {
      errors.confirmPwd = 'Passwords do not match';
    }
    return Object.keys(errors).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;
    loading = true;
    linkExpired = false;
    try {
      await restRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      done = true;
      // Auto-redirect to /login after 3 seconds
      setTimeout(() => goto('/login', { replaceState: true }), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        linkExpired = true;
      } else {
        errors.form = `Something went wrong. Please try again.`;
      }
    } finally {
      loading = false;
    }
  }

  // ── Password strength indicator ───────────────────────────────────────────

  const strengthChecks = $derived([
    { label: 'At least 8 characters',    pass: newPassword.length >= 8          },
    { label: 'One uppercase letter',      pass: /[A-Z]/.test(newPassword)        },
    { label: 'One number',                pass: /[0-9]/.test(newPassword)        },
    { label: 'Passwords match',           pass: !!newPassword && newPassword === confirmPwd },
  ]);

  const strengthScore = $derived(strengthChecks.filter(c => c.pass).length);
</script>

<svelte:head><title>Reset Password · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col md:flex-row min-h-screen w-full">

  <!-- ── Left brand panel ─────────────────────────────────────────────────── -->
  <div class="hidden md:flex flex-[0_0_45%] bg-[linear-gradient(135deg,#0f2b3d_0%,#183e58_40%,#1a3a52_100%)] items-end px-12.5 py-15 relative overflow-hidden">
    <div class="absolute top-[-50%] right-[-30%] w-[80%] h-[150%] rounded-[50%] bg-[radial-gradient(circle,rgba(255,255,255,0.03)_0%,transparent_70%)]"></div>
    <div class="absolute bottom-[30%] -left-15 w-50 h-50 rounded-full border border-white/5"></div>
    <div class="absolute top-[20%] -right-10 w-35 h-35 rounded-full border border-[#E87D1F]/10"></div>
    <div class="relative z-10">
      <p class="text-[32px] font-normal text-white leading-[1.35] italic">
        <em>Choose a strong<br />password to keep<br />your account safe.</em>
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

      <h2 class="text-center text-[22px] font-bold text-[#0B182A] mb-2 tracking-[1px]">RESET PASSWORD</h2>
      <p class="text-center text-[13px] text-gray-400 mb-9">Enter and confirm your new password below.</p>

      {#if done}
        <!-- ── Success ─────────────────────────────────────────────────── -->
        <div class="flex flex-col items-center gap-5 py-4">
          <div class="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="text-center">
            <p class="text-[15px] font-semibold text-[#0B182A] mb-2">Password updated successfully.</p>
            <p class="text-[13px] text-gray-500 leading-relaxed">Redirecting you to the login page…</p>
          </div>
          <a href="/login" class="text-[13px] font-medium text-[#E87D1F] hover:underline">Go to Login now →</a>
        </div>

      {:else}
        <!-- ── Expired link banner ─────────────────────────────────────── -->
        {#if linkExpired}
          <div class="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px] leading-relaxed">
            This reset link has expired or is invalid. Please
            <a href="/forgot-password" class="font-semibold underline">request a new one</a>.
          </div>
        {/if}

        {#if errors.form}
          <div class="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px] text-center">
            {errors.form}
          </div>
        {/if}

        <!-- ── Form ────────────────────────────────────────────────────── -->
        <form onsubmit={handleSubmit} class="flex flex-col gap-5" novalidate>

          <!-- New Password -->
          <div class="flex flex-col gap-1.5">
            <div class="relative">
              <input
                type={showNew ? 'text' : 'password'}
                placeholder="New Password"
                autocomplete="new-password"
                class="w-full py-3.5 px-4.5 pr-12 bg-[#ededed] rounded-lg text-sm text-[#333] outline-none transition-all duration-200
                       placeholder:text-[#999] focus:bg-[#e3e3e3] focus:shadow-[0_0_0_2px_rgba(24,62,88,0.15)]
                       border {errors.newPassword ? 'border-red-400' : 'border-transparent'}"
                bind:value={newPassword}
              />
              <button
                type="button"
                onclick={() => (showNew = !showNew)}
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555] transition-colors"
                aria-label={showNew ? 'Hide password' : 'Show password'}
              >
                {#if showNew}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {/if}
              </button>
            </div>
            {#if errors.newPassword}
              <p class="text-red-500 text-[12px] leading-none">{errors.newPassword}</p>
            {/if}
          </div>

          <!-- Confirm Password -->
          <div class="flex flex-col gap-1.5">
            <div class="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm New Password"
                autocomplete="new-password"
                class="w-full py-3.5 px-4.5 pr-12 bg-[#ededed] rounded-lg text-sm text-[#333] outline-none transition-all duration-200
                       placeholder:text-[#999] focus:bg-[#e3e3e3] focus:shadow-[0_0_0_2px_rgba(24,62,88,0.15)]
                       border {errors.confirmPwd ? 'border-red-400' : 'border-transparent'}"
                bind:value={confirmPwd}
              />
              <button
                type="button"
                onclick={() => (showConfirm = !showConfirm)}
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555] transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {#if showConfirm}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                {:else}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {/if}
              </button>
            </div>
            {#if errors.confirmPwd}
              <p class="text-red-500 text-[12px] leading-none">{errors.confirmPwd}</p>
            {/if}
          </div>

          <!-- Strength checklist -->
          {#if newPassword || confirmPwd}
            <div class="flex flex-col gap-1.5 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
              {#each strengthChecks as check}
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded-full flex items-center justify-center shrink-0
                              {check.pass ? 'bg-green-100' : 'bg-gray-200'}">
                    {#if check.pass}
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {:else}
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    {/if}
                  </div>
                  <span class="text-[12px] {check.pass ? 'text-green-700' : 'text-gray-400'}">{check.label}</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Strength bar -->
          {#if newPassword}
            <div class="flex gap-1">
              {#each [1,2,3,4] as step}
                <div class="h-1 flex-1 rounded-full transition-colors {step <= strengthScore
                  ? strengthScore <= 1 ? 'bg-red-400'
                  : strengthScore <= 2 ? 'bg-amber-400'
                  : strengthScore <= 3 ? 'bg-blue-400'
                  : 'bg-green-500'
                  : 'bg-gray-200'}"></div>
              {/each}
            </div>
          {/if}

          <button
            type="submit"
            disabled={loading || strengthScore < 4}
            class="w-full py-3.5 rounded-xl text-sm font-bold tracking-[1.5px] uppercase text-white
                   bg-[linear-gradient(to_bottom,#0B182A,#021E44)] hover:opacity-90 active:scale-[0.99]
                   transition-all duration-150 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>

          <p class="text-center text-[13px]">
            <a href="/login" class="text-[#E87D1F] font-medium hover:underline">← Back to Login</a>
          </p>
        </form>
      {/if}

    </div>
  </div>
</div>

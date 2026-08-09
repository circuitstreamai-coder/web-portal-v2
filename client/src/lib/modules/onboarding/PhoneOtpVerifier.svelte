<script lang="ts">
  let {
    onVerified,
    flow,
  }: {
    onVerified: (email: string) => void;
    flow: "customer" | "engineer";
  } = $props();

  let email = $state("");
  let otp = $state("");
  let error = $state("");
  let otpSent = $state(false);
  let isSending = $state(false);
  let isVerifying = $state(false);
  let resendCooldown = $state(0);

  let cooldownInterval: ReturnType<typeof setInterval> | null = null;

  const isValidEmail = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  $effect(() => {
    return () => {
      if (cooldownInterval) clearInterval(cooldownInterval);
    };
  });

  function startCooldown() {
    resendCooldown = 30;
    cooldownInterval = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) {
        clearInterval(cooldownInterval!);
        cooldownInterval = null;
      }
    }, 1000);
  }

  async function sendOtp() {
    if (!isValidEmail) return;
    error = "";
    isSending = true;
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, flow }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Failed to send OTP.");
      otpSent = true;
      startCooldown();
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : "Failed to send OTP. Please try again.";
    } finally {
      isSending = false;
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) return;
    error = "";
    isVerifying = true;
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Invalid OTP.");
      onVerified(email);
    } catch {
      error = "Invalid or expired OTP. Please try again.";
      otp = "";
    } finally {
      isVerifying = false;
    }
  }

  function handleResend() {
    if (resendCooldown > 0) return;
    otpSent = false;
    otp = "";
    error = "";
    if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }
  }
</script>

<div class="max-w-md mx-auto">
  <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">

    <!-- Card header -->
    <div class="bg-[linear-gradient(to_right,#0B182A,#021E44)] px-6 py-5">
      <div class="flex items-center gap-2.5 mb-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background-color:#E87D1F">
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
        </div>
        <div>
          <p class="text-white text-[14px] font-semibold">Email Verification</p>
          <p class="text-gray-400 text-[11px]">
            {otpSent ? `OTP sent to ${email}` : "Verify your email address to continue"}
          </p>
        </div>
      </div>

      <!-- Step indicators -->
      <div class="flex items-center gap-2 mt-1">
        <div class="flex items-center gap-1.5">
          <div
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={!otpSent ? "background-color:#E87D1F; color:white" : "background-color:#4ade80; color:white"}
          >
            {#if otpSent}
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
              </svg>
            {:else}1{/if}
          </div>
          <span class="text-[11px]" style={!otpSent ? "color:#E87D1F" : "color:#4ade80"}>Enter email</span>
        </div>
        <div class="flex-1 h-px bg-white/20 mx-1"></div>
        <div class="flex items-center gap-1.5">
          <div
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={otpSent ? "background-color:#E87D1F; color:white" : "background-color:rgba(255,255,255,0.15); color:rgba(255,255,255,0.4)"}
          >2</div>
          <span class="text-[11px]" style={otpSent ? "color:#E87D1F" : "color:rgba(255,255,255,0.4)"}>Enter OTP</span>
        </div>
      </div>
    </div>

    <div class="p-6">
      {#if !otpSent}
        <!-- ── Step 1: Enter Email ── -->
        <div class="flex flex-col gap-4">
          <div>
            <label for="gate-email" class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Email Address <span class="text-red-400">*</span>
            </label>
            <input
              id="gate-email"
              type="email"
              bind:value={email}
              placeholder="you@example.com"
              class="w-full px-3.5 py-2.5 text-[13px] text-gray-700 border rounded-lg outline-none focus:border-[#0B182A] transition-colors"
              class:border-red-300={!!error}
              class:border-gray-200={!error}
              onkeydown={(e) => e.key === "Enter" && sendOtp()}
            />
            {#if error}<p class="text-[11px] text-red-500 mt-1.5">{error}</p>{/if}
          </div>

          <p class="text-[12px] text-gray-400">
            A 6-digit OTP will be sent to this email address.
          </p>

          <button
            type="button"
            onclick={sendOtp}
            disabled={isSending || !isValidEmail}
            class="w-full py-3 text-[14px] font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style="background: linear-gradient(to bottom, #0B182A, #021E44)"
          >
            {#if isSending}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Sending OTP…
            {:else}
              Send OTP →
            {/if}
          </button>
        </div>

      {:else}
        <!-- ── Step 2: Enter OTP ── -->
        <div class="flex flex-col gap-4">
          <div class="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center gap-3">
            <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p class="text-[12px] text-blue-700">
              OTP sent to <strong>{email}</strong>. Check your inbox (and spam folder).
            </p>
          </div>

          <div>
            <label for="gate-otp" class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              One-Time Password <span class="text-red-400">*</span>
            </label>
            <input
              id="gate-otp"
              type="text"
              inputmode="numeric"
              bind:value={otp}
              maxlength="6"
              placeholder="------"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-[22px] text-center text-gray-800 font-mono tracking-[0.5em] outline-none focus:border-[#0B182A] transition-colors"
              onkeydown={(e) => e.key === "Enter" && verifyOtp()}
            />
            {#if error}<p class="text-[11px] text-red-500 mt-1.5 text-center">{error}</p>{/if}
          </div>

          <button
            type="button"
            onclick={verifyOtp}
            disabled={isVerifying || otp.length !== 6}
            class="w-full py-3 text-[14px] font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style="background-color:#E87D1F"
          >
            {#if isVerifying}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Verifying…
            {:else}
              Verify & Continue →
            {/if}
          </button>

          <div class="flex items-center justify-between pt-1">
            <button
              type="button"
              onclick={() => { otpSent = false; otp = ""; error = ""; }}
              class="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Change email
            </button>
            <button
              type="button"
              onclick={handleResend}
              disabled={resendCooldown > 0}
              class="text-[12px] font-medium transition-colors disabled:cursor-default"
              style={resendCooldown > 0 ? "color:#9ca3af" : "color:#E87D1F"}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

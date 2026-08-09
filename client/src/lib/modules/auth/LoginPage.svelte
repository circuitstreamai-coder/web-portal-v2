<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Logo from '$lib/ui/Logo.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { authStore } from '$lib/stores/auth';
	import { redirectAfterLogin } from '$lib/auth/redirectAfterLogin';
	import { authLogin, ApiError } from '$lib/utils/api';

	// ── Form state ─────────────────────────────────────────────────────────

	let email = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	let showPassword = $state(false);
	let loading = $state(false);

	// ── Validation errors ──────────────────────────────────────────────────

	let emailError = $state('');
	let passwordError = $state('');
	let formError = $state('');

	// ── Helpers ────────────────────────────────────────────────────────────

	function validateEmail(v: string) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
	}

	function validate(): boolean {
		emailError = '';
		passwordError = '';
		formError = '';

		let valid = true;

		if (!email.trim()) {
			emailError = 'Email is required';
			valid = false;
		} else if (!validateEmail(email.trim())) {
			emailError = 'Enter a valid email address';
			valid = false;
		}

		if (!password) {
			passwordError = 'Password is required';
			valid = false;
		} else if (password.length < 2) {
			passwordError = 'Password is too short';
			valid = false;
		}

		return valid;
	}

	// ── Submit ─────────────────────────────────────────────────────────────

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!validate()) return;

		loading = true;
		formError = '';

		try {
			const { user } = await authLogin({
				email: email.trim().toLowerCase(),
				password,
				rememberMe
			});

			authStore.setUser(user);
			toast.success(`Welcome back, ${user.name}!`);

			const destination = redirectAfterLogin(user.role);
			goto(destination);
		} catch (err) {
			if (err instanceof ApiError) {
				if (err.status === 401 || err.status === 403) {
					formError = 'Invalid email or password.';
				} else if (err.status >= 500) {
					formError = 'Server error. Please try again later.';
				} else {
					formError = err.message;
				}
			} else {
				formError = 'Unable to connect. Check your internet connection.';
			}
			toast.error(formError);
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col md:flex-row min-h-screen w-full">
	<!-- ── Left panel ──────────────────────────────────────────────────── -->
	<div
		class="hidden md:flex flex-[0_0_45%] bg-[linear-gradient(135deg,#0f2b3d_0%,#183e58_40%,#1a3a52_100%)] items-end px-12.5 py-15 relative overflow-hidden"
	>
		<!-- Radial glow -->
		<div
			class="absolute top-[-50%] right-[-30%] w-[80%] h-[150%] rounded-[50%] bg-[radial-gradient(circle,rgba(255,255,255,0.03)_0%,transparent_70%)]"
		></div>

		<!-- Decorative circles -->
		<div
			class="absolute bottom-[30%] -left-15 w-50 h-50 rounded-full border border-white/5"
		></div>
		<div
			class="absolute top-[20%] -right-10 w-35 h-35 rounded-full border border-[#E87D1F]/10"
		></div>

		<div class="relative z-10">
			<p class="text-[32px] font-normal text-white leading-[1.35] italic">
				<em>
					Welcome.<br />
					Start your journey<br />
					now with our<br />
					management<br />
					system!
				</em>
			</p>
			<p class="mt-6 text-white/40 text-[13px] tracking-[0.5px]">
				Innoserve Techsol · Ticket Management
			</p>
		</div>
	</div>

	<!-- ── Right panel — form ─────────────────────────────────────────── -->
	<div class="flex-1 md:flex-[0_0_55%] flex items-center justify-center bg-[#faf9f6] p-6 md:p-10">
		<div class="w-full max-w-100">
			<!-- Logo -->
			<div class="flex justify-center mb-10">
				<Logo />
			</div>

			<h2 class="text-center text-[22px] font-bold text-[#0B182A] mb-9 tracking-[1px]">LOGIN</h2>

			<!-- Global form error -->
			{#if formError}
				<div
					class="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px] text-center"
				>
					{formError}
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="flex flex-col gap-5" novalidate>
				<!-- Email -->
				<Input
					type="email"
					id="email"
					name="email"
					placeholder="E-mail"
					autocomplete="email"
					required
					bind:value={email}
					error={emailError}
				/>

				<!-- Password with show/hide -->
				<div class="flex flex-col gap-1.5 w-full">
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							id="password"
							name="password"
							placeholder="Password"
							autocomplete="current-password"
							required
							bind:value={password}
							class="w-full py-3.5 px-4.5 pr-12 bg-[#ededed] rounded-lg text-sm text-[#333] outline-none
							       transition-all duration-200 placeholder:text-[#999]
							       focus:bg-[#e3e3e3] focus:shadow-[0_0_0_2px_rgba(24,62,88,0.15)]
							       border {passwordError
								? 'border-red-400 focus:shadow-[0_0_0_2px_rgba(239,68,68,0.2)]'
								: 'border-transparent'}"
						/>
						<!-- Toggle visibility -->
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555] transition-colors"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<!-- Eye-off -->
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
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
									<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
									<line x1="1" y1="1" x2="23" y2="23" />
								</svg>
							{:else}
								<!-- Eye -->
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
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							{/if}
						</button>
					</div>
					{#if passwordError}
						<p class="text-red-500 text-[12px] leading-none">{passwordError}</p>
					{/if}
				</div>

				<!-- Remember me + forgot password -->
				<div class="flex items-center justify-between">
					<label class="flex items-center gap-2 cursor-pointer text-[13px] text-[#666]">
						<input
							type="checkbox"
							bind:checked={rememberMe}
							class="w-4 h-4 rounded-[3px] accent-[#0B182A]"
						/>
						<span>Remember me</span>
					</label>
					<a href="/forgot-password" class="text-[13px] text-[#E87D1F] font-medium hover:underline">
						Forgot Password?
					</a>
				</div>

				<!-- Submit -->
				<Button type="submit" {loading} class="mt-2">
					{loading ? 'Signing in…' : 'LOGIN'}
				</Button>
			</form>

			<!-- Registration links -->
			<div class="mt-8 pt-6 border-t border-gray-200">
				<p class="text-center text-[12px] text-gray-400 mb-3 uppercase tracking-wide font-medium">New to InnoServe?</p>
				<div class="flex flex-col gap-2.5">
					<a
						href="/customer/register"
						class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-gray-200 text-[13px] font-medium text-[#0B182A] hover:bg-gray-50 hover:border-gray-300 transition-colors"
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
							<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
						</svg>
						Register as Customer
					</a>
					<a
						href="/onboarding/engineer"
						class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-gray-200 text-[13px] font-medium text-[#0B182A] hover:bg-gray-50 hover:border-gray-300 transition-colors"
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>
							<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>
							<path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
						</svg>
						Register as Engineer
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

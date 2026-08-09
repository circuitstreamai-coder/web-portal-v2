<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { authStore } from '$lib/stores/auth';
  import type { User } from '$lib/stores/auth';
  import { ApiError, restRequest } from '$lib/api/rest';

  // ── State ─────────────────────────────────────────────────────────────────

  const user = $derived($authStore.user);

  // ── Edit Profile ──────────────────────────────────────────────────────────

  let editName       = $state('');
  let editEmail      = $state('');
  let avatarFile     = $state<File | null>(null);
  let avatarPreview  = $state<string | null>(null);
  let profileErrors  = $state<Record<string, string>>({});
  let profileSaving  = $state(false);

  $effect(() => {
    editName  = user?.name  ?? '';
    editEmail = user?.email ?? '';
  });

  function onAvatarChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file  = input.files?.[0] ?? null;
    avatarFile  = file;
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { avatarPreview = reader.result as string; };
      reader.readAsDataURL(file);
    } else {
      avatarPreview = null;
    }
  }

  function validateProfile(): boolean {
    profileErrors = {};
    if (!editName.trim())  profileErrors.name  = 'Name is required';
    if (!editEmail.trim()) profileErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail))
      profileErrors.email = 'Invalid email address';
    return Object.keys(profileErrors).length === 0;
  }

  async function handleSaveProfile(e: Event) {
    e.preventDefault();
    if (!validateProfile()) return;
    profileSaving = true;
    try {
      let body: FormData | string;
      let headers: Record<string, string> | undefined;

      if (avatarFile) {
        const fd = new FormData();
        fd.append('name',   editName.trim());
        fd.append('email',  editEmail.trim());
        fd.append('avatar', avatarFile);
        body = fd;
      } else {
        body    = JSON.stringify({ name: editName.trim(), email: editEmail.trim() });
        headers = { 'Content-Type': 'application/json' };
      }

      const { user: updated } = await restRequest<{ user: User }>('/api/users/me', { method: 'PATCH', body, headers });
      if (user) authStore.setUser({ ...user, ...updated });
      avatarFile    = null;
      avatarPreview = null;
      toast.success('Profile updated');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        profileErrors.email = 'Email already in use';
      } else {
        toast.error(`Failed: ${(err as Error).message}`);
      }
    } finally {
      profileSaving = false;
    }
  }

  let currentPassword = $state('');
  let newPassword     = $state('');
  let confirmPwd      = $state('');
  let showCurrent     = $state(false);
  let showNew         = $state(false);
  let showConfirm     = $state(false);
  let errors          = $state<Record<string, string>>({});
  let submitting      = $state(false);
  let successMsg      = $state('');

  // ── Strength ──────────────────────────────────────────────────────────────

  const strengthChecks = $derived([
    { label: 'At least 8 characters',    pass: newPassword.length >= 8          },
    { label: 'One uppercase letter',      pass: /[A-Z]/.test(newPassword)        },
    { label: 'One number',                pass: /[0-9]/.test(newPassword)        },
    { label: 'Passwords match',           pass: !!newPassword && newPassword === confirmPwd },
  ]);

  const strengthScore = $derived(strengthChecks.filter(c => c.pass).length);

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): boolean {
    errors = {};
    if (!currentPassword) errors.currentPassword = 'Current password is required';
    if (!newPassword) {
      errors.newPassword = 'New password is required';
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

  async function handleChangePassword(e: Event) {
    e.preventDefault();
    if (!validate()) return;
    submitting = true;
    successMsg = '';
    try {
      await restRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      successMsg      = 'Password changed successfully.';
      currentPassword = '';
      newPassword     = '';
      confirmPwd      = '';
      errors          = {};
      toast.success('Password changed successfully');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        errors.currentPassword = 'Current password is incorrect';
      } else {
        toast.error(`Failed: ${(err as Error).message}`);
      }
    } finally {
      submitting = false;
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full py-3 px-4 pr-11 border rounded-lg text-[13px] text-gray-700 outline-none transition-colors bg-white
     ${hasError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-[#0B182A]'}`;

  const labelTextClass = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide';
  const errorClass     = 'text-[11px] text-red-500';
</script>

<svelte:head><title>My Profile · Innoserve Techsol</title></svelte:head>

<div class="flex flex-col gap-5 max-w-2xl">

  <!-- Edit Profile card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <h2 class="text-[18px] font-semibold text-[#0B182A] mb-1">Profile</h2>
    <p class="text-[13px] text-gray-400 mb-6">Update your name, email, and avatar.</p>

    <form onsubmit={handleSaveProfile} class="flex flex-col gap-4" novalidate>
      <!-- Avatar -->
      <div class="flex items-center gap-4">
        <div class="relative shrink-0">
          {#if avatarPreview}
            <img src={avatarPreview} alt="Avatar preview" class="w-16 h-16 rounded-full object-cover" />
          {:else if user?.avatarFileId}
            <img src={`/file/${user.avatarFileId}`} alt="Avatar" class="w-16 h-16 rounded-full object-cover" />
          {:else}
            <div class="w-16 h-16 rounded-full bg-[#E87D1F] flex items-center justify-center text-white text-[18px] font-bold">
              {user?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'}
            </div>
          {/if}
          <label
            for="avatar-upload"
            class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0B182A] flex items-center justify-center cursor-pointer hover:bg-[#162536] transition-colors"
            title="Change avatar"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </label>
          <input id="avatar-upload" type="file" accept="image/*" class="hidden" onchange={onAvatarChange} />
        </div>
        <div class="flex flex-col">
          <p class="text-[13px] font-medium text-[#0B182A]">{user?.name ?? '—'}</p>
          <p class="text-[12px] text-gray-400">{user?.email ?? '—'}</p>
          <span class="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#0B182A]/10 text-[#0B182A] w-fit">
            {user?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—'}
          </span>
        </div>
      </div>

      <!-- Name -->
      <div class="flex flex-col gap-1.5">
        <label for="edit-name" class={labelTextClass}>Name</label>
        <input
          id="edit-name"
          type="text"
          placeholder="Your full name"
          class={inputClass(!!profileErrors.name)}
          bind:value={editName}
        />
        {#if profileErrors.name}<span class={errorClass}>{profileErrors.name}</span>{/if}
      </div>

      <!-- Email -->
      <div class="flex flex-col gap-1.5">
        <label for="edit-email" class={labelTextClass}>Email</label>
        <input
          id="edit-email"
          type="email"
          placeholder="your@email.com"
          class={inputClass(!!profileErrors.email)}
          bind:value={editEmail}
        />
        {#if profileErrors.email}<span class={errorClass}>{profileErrors.email}</span>{/if}
      </div>

      <div class="flex justify-end pt-1">
        <button
          type="submit"
          disabled={profileSaving}
          class="px-6 py-2.5 text-[13px] font-semibold text-white bg-[#0B182A] hover:bg-[#162536] rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {profileSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  </div>

  <!-- Change Password card -->
  <div class="bg-white rounded-2xl p-6 shadow">
    <h3 class="text-[16px] font-semibold text-[#0B182A] mb-1">Change Password</h3>
    <p class="text-[13px] text-gray-400 mb-6">Update your password. You'll stay logged in after changing it.</p>

    {#if successMsg}
      <div class="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <p class="text-[13px] text-green-700 font-medium">{successMsg}</p>
      </div>
    {/if}

    <form onsubmit={handleChangePassword} class="flex flex-col gap-4" novalidate>

      <!-- Current Password -->
      <div class="flex flex-col gap-1.5">
        <label for="current-pw" class={labelTextClass}>Current Password</label>
        <div class="relative">
          <input
            id="current-pw"
            type={showCurrent ? 'text' : 'password'}
            placeholder="Your current password"
            autocomplete="current-password"
            class={inputClass(!!errors.currentPassword)}
            bind:value={currentPassword}
          />
          <button
            type="button"
            onclick={() => (showCurrent = !showCurrent)}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={showCurrent ? 'Hide' : 'Show'}
          >
            {#if showCurrent}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>
        {#if errors.currentPassword}<span class={errorClass}>{errors.currentPassword}</span>{/if}
      </div>

      <!-- New Password -->
      <div class="flex flex-col gap-1.5">
        <label for="new-pw" class={labelTextClass}>New Password</label>
        <div class="relative">
          <input
            id="new-pw"
            type={showNew ? 'text' : 'password'}
            placeholder="New password"
            autocomplete="new-password"
            class={inputClass(!!errors.newPassword)}
            bind:value={newPassword}
          />
          <button
            type="button"
            onclick={() => (showNew = !showNew)}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={showNew ? 'Hide' : 'Show'}
          >
            {#if showNew}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>
        {#if errors.newPassword}<span class={errorClass}>{errors.newPassword}</span>{/if}
      </div>

      <!-- Confirm New Password -->
      <div class="flex flex-col gap-1.5">
        <label for="confirm-pw" class={labelTextClass}>Confirm New Password</label>
        <div class="relative">
          <input
            id="confirm-pw"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirm new password"
            autocomplete="new-password"
            class={inputClass(!!errors.confirmPwd)}
            bind:value={confirmPwd}
          />
          <button
            type="button"
            onclick={() => (showConfirm = !showConfirm)}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={showConfirm ? 'Hide' : 'Show'}
          >
            {#if showConfirm}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>
        {#if errors.confirmPwd}<span class={errorClass}>{errors.confirmPwd}</span>{/if}
      </div>

      <!-- Strength indicator -->
      {#if newPassword || confirmPwd}
        <div class="flex flex-col gap-2 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
          <div class="flex gap-1 mb-1">
            {#each [1,2,3,4] as step}
              <div class="h-1 flex-1 rounded-full transition-colors {step <= strengthScore
                ? strengthScore <= 1 ? 'bg-red-400'
                : strengthScore <= 2 ? 'bg-amber-400'
                : strengthScore <= 3 ? 'bg-blue-400'
                : 'bg-green-500'
                : 'bg-gray-200'}"></div>
            {/each}
          </div>
          {#each strengthChecks as check}
            <div class="flex items-center gap-2">
              <div class="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0
                          {check.pass ? 'bg-green-100' : 'bg-gray-200'}">
                {#if check.pass}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {:else}
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                {/if}
              </div>
              <span class="text-[12px] {check.pass ? 'text-green-700' : 'text-gray-400'}">{check.label}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex justify-end pt-2">
        <button
          type="submit"
          disabled={submitting || strengthScore < 4}
          class="px-6 py-2.5 text-[13px] font-semibold text-white bg-[#0B182A] hover:bg-[#162536] rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  </div>
</div>

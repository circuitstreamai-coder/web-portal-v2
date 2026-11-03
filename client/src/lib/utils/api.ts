import { restRequest, ApiError } from '$lib/api/rest';
import { getSupabaseClient, isSupabaseConfigured } from '$lib/supabase/client';
import { browser } from '$app/environment';

export { ApiError };

// ── Types ──────────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: import('$lib/stores/auth').User;
  token?: string;
}

const AUTH_MODE_KEY = 'portal_auth_mode';

function usesLegacySession(): boolean {
  return browser && localStorage.getItem(AUTH_MODE_KEY) === 'legacy';
}

async function legacyRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
    ...init,
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.message ?? body.error ?? message;
    } catch {
      // Keep the HTTP status text for non-JSON failures.
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function authLogin(input: LoginInput): Promise<LoginResponse> {
  const isEmail = input.email.includes('@');
  if (isSupabaseConfigured() && isEmail) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (!error) {
      if (browser) localStorage.removeItem(AUTH_MODE_KEY);
      const user = await restRequest<import('$lib/stores/auth').User>('/api/auth/me');
      return { user };
    }

    // During the legacy-to-Supabase transition, canonical portal accounts may
    // exist only in the server database. Try that account store before showing
    // the original Supabase authentication failure.
    try {
      const result = await legacyRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (browser) localStorage.setItem(AUTH_MODE_KEY, 'legacy');
      return result;
    } catch {
      throw new ApiError(error.message, error.status ?? 401);
    }
  }

  if (isSupabaseConfigured()) {
    const result = await legacyRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (browser) localStorage.setItem(AUTH_MODE_KEY, 'legacy');
    return result;
  }

  return restRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function authLogout(): Promise<void> {
  if (usesLegacySession()) {
    try {
      await legacyRequest<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem(AUTH_MODE_KEY);
    }
    return;
  }
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new ApiError(error.message, error.status ?? 500);
    return;
  }
  await restRequest<void>('/api/auth/logout', { method: 'POST' });
}

export async function authMe(): Promise<import('$lib/stores/auth').User> {
  if (usesLegacySession()) {
    const response = await legacyRequest<{ user: import('$lib/stores/auth').User }>('/api/auth/me');
    return response.user;
  }
  return restRequest<import('$lib/stores/auth').User>('/api/auth/me');
}

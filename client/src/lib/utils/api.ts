import { restRequest, ApiError } from '$lib/api/rest';
import { getSupabaseClient, isSupabaseConfigured } from '$lib/supabase/client';

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

// ── Functions ──────────────────────────────────────────────────────────────

export async function authLogin(input: LoginInput): Promise<LoginResponse> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) throw new ApiError(error.message, error.status ?? 401);
    const user = await restRequest<import('$lib/stores/auth').User>('/api/auth/me');
    return { user };
  }

  return restRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function authLogout(): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new ApiError(error.message, error.status ?? 500);
    return;
  }
  await restRequest<void>('/api/auth/logout', { method: 'POST' });
}

export async function authMe(): Promise<import('$lib/stores/auth').User> {
  return restRequest<import('$lib/stores/auth').User>('/api/auth/me');
}

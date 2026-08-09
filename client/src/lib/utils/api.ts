import { restRequest, ApiError } from '$lib/api/rest';

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
  return restRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function authLogout(): Promise<void> {
  await restRequest<void>('/api/auth/logout', { method: 'POST' });
}

export async function authMe(): Promise<import('$lib/stores/auth').User> {
  return restRequest<import('$lib/stores/auth').User>('/api/auth/me');
}
